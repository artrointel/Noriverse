import { balance } from './outpost.ts';
import { fullscreenTriangle, linkWebGL2Program } from './webgl2-program.ts';

const { albedoFloor, wallResponse, gain } = balance.indirect;

const seed = `#version 300 es
precision highp float;
uniform sampler2D uMaterial, uLight, uWalls;
uniform vec2 uSize;
out vec4 result;
void main() {
  vec2 uv = gl_FragCoord.xy / uSize;
  vec3 direct = texture(uLight, uv).rgb;
  vec3 surface = mix(vec3(${albedoFloor.toFixed(3)}), texture(uMaterial, uv).rgb, ${(1 - albedoFloor).toFixed(3)});
  result = vec4(direct * surface, texture(uWalls, uv).a);
}`;

const cascade = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D uSeed, uUpper;
uniform vec2 uSize, uRange;
uniform ivec2 uProbes, uUpperProbes;
uniform int uTiles, uCount, uUpperTiles;
uniform float uSpacing;
uniform bool uMerge;
out vec4 result;

vec4 upperSample(ivec2 probe, int ray) {
  ivec2 tile = ivec2(ray % uUpperTiles, ray / uUpperTiles);
  return texelFetch(uUpper, clamp(probe, ivec2(0), uUpperProbes - 1) + tile * uUpperProbes, 0);
}

vec4 longerInterval(vec2 origin, int ray) {
  vec2 grid = origin / (uSpacing * 2.0) - 0.5;
  ivec2 cell = ivec2(floor(grid));
  vec2 f = fract(grid);
  vec4 sum = vec4(0.0);
  for (int i = 0; i < 4; ++i) {
    int child = ray * 4 + i;
    vec4 row0 = mix(upperSample(cell, child), upperSample(cell + ivec2(1, 0), child), f.x);
    vec4 row1 = mix(upperSample(cell + ivec2(0, 1), child), upperSample(cell + 1, child), f.x);
    sum += mix(row0, row1, f.y);
  }
  return sum * 0.25;
}

void main() {
  ivec2 pixel = ivec2(gl_FragCoord.xy);
  ivec2 tile = pixel / uProbes;
  int ray = tile.x + tile.y * uTiles;
  vec2 origin = min((vec2(pixel % uProbes) + 0.5) * uSpacing, uSize - 0.5);
  float angle = (float(ray) + 0.5) * 6.2831853 / float(uCount);
  vec2 direction = vec2(cos(angle), sin(angle));
  vec4 current = texture(uSeed, origin / uSize);
  vec3 light = vec3(0.0);
  float transmission = 1.0;
  if (current.a > 0.5) { result = vec4(0.0); return; }
  if (uRange.x > 1.0) current = texture(uSeed, (origin + direction * (uRange.x - 0.6)) / uSize);
  // Unit-length steps catch slender occluders even in the longest interval.
  for (int step = 0; step < 86; ++step) {
    float distance = uRange.x + float(step);
    if (distance >= uRange.y) break;
    vec2 point = origin + direction * distance;
    if (any(lessThan(point, vec2(0.0))) || any(greaterThanEqual(point, uSize))) { transmission = 0.0; break; }
    vec4 hit = texture(uSeed, point / uSize);
    float falloff = 1.0 / (1.0 + distance * 0.055);
    if (hit.a > 0.5) {
      light += (max(current.rgb, hit.rgb * 0.60)) * (0.52 * falloff);
      transmission = 0.0;
      break;
    }
    light += hit.rgb * (0.065 * falloff * transmission);
    transmission *= 0.976;
    current = hit;
  }
  if (uMerge && transmission > 0.0) {
    vec4 longer = longerInterval(origin, ray);
    light += transmission * longer.rgb;
    transmission *= longer.a;
  }
  result = vec4(light, transmission);
}`;

const average = `#version 300 es
precision highp float;
uniform sampler2D uRadiance;
uniform ivec2 uProbes;
out vec4 result;
void main() {
  ivec2 probe = ivec2(gl_FragCoord.xy);
  vec3 total = vec3(0.0);
  for (int ray = 0; ray < 8; ++ray) {
    total += texelFetch(uRadiance, probe + ivec2(ray % 4, ray / 4) * uProbes, 0).rgb;
  }
  result = vec4(total * 0.125, 1.0);
}`;

const resolve = `#version 300 es
precision highp float;
uniform sampler2D uSeed, uRadiance;
uniform vec2 uSize;
uniform float uSpacing;
uniform ivec2 uProbes;
out vec4 result;

void main() {
  // Canvas uploads use top-down rows, while the default framebuffer uses bottom-up coordinates.
  vec2 point = vec2(gl_FragCoord.x, uSize.y - gl_FragCoord.y);
  vec4 own = texture(uSeed, point / uSize);
  vec2 grid = point / uSpacing - 0.5;
  vec2 f = fract(grid);
  ivec2 cell = ivec2(floor(grid));
  vec3 energy = vec3(0.0);
  float weight = 0.0;
  for (int n = 0; n < 4; ++n) {
    ivec2 corner = ivec2(n % 2, n / 2);
    ivec2 probe = clamp(cell + corner, ivec2(0), uProbes - 1);
    vec2 center = min((vec2(probe) + 0.5) * uSpacing, uSize - 0.5);
    if (texture(uSeed, mix(point, center, 0.33) / uSize).a > 0.5 ||
        texture(uSeed, mix(point, center, 0.67) / uSize).a > 0.5 || texture(uSeed, center / uSize).a > 0.5) continue;
    vec2 w = mix(1.0 - f, f, vec2(corner));
    float influence = w.x * w.y;
    weight += influence;
    energy += influence * texelFetch(uRadiance, probe, 0).rgb;
  }
  vec3 diffuse = weight > 0.001 ? energy / weight : vec3(0.0);
  vec3 reflected = diffuse * 1.45 + own.rgb * mix(0.13, ${wallResponse.toFixed(3)}, own.a);
  result = vec4(1.0 - exp(-${gain.toFixed(3)} * reflected), 1.0);
}`;

export const indirectSize = { width: 128, height: 72 };

export function createRadianceRenderer() {
  const canvas = document.createElement('canvas');
  const { width, height } = indirectSize;
  canvas.width = width;
  canvas.height = height;
  const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, powerPreference: 'high-performance' });
  if (!gl) return;
  let resources = initialize(gl);
  let gpuMs: number | undefined;
  let frame = 0;
  const pending: WebGLQuery[] = [];
  const lose = (event: Event) => { event.preventDefault(); resources = undefined; pending.length = 0; gpuMs = undefined; };
  const restore = () => { resources = initialize(gl); };
  canvas.addEventListener('webglcontextlost', lose);
  canvas.addEventListener('webglcontextrestored', restore);

  return {
    paint(material: HTMLCanvasElement, light: HTMLCanvasElement, walls: HTMLCanvasElement, cascades: boolean, span: number) {
      const r = resources;
      if (!r || gl.isContextLost()) return;
      const { timer, inputs, seedTarget, layers, diffuseTarget, programs } = r;
      let query: WebGLQuery | null = null;
      if (timer) {
        if (gl.getParameter(timer.GPU_DISJOINT_EXT)) {
          for (const item of pending.splice(0)) gl.deleteQuery(item);
          gpuMs = undefined;
        } else if (pending.length && gl.getQueryParameter(pending[0], gl.QUERY_RESULT_AVAILABLE)) {
          const done = pending.shift()!;
          const elapsed = gl.getQueryParameter(done, gl.QUERY_RESULT) / 1e6 as number;
          gl.deleteQuery(done);
          gpuMs = gpuMs === undefined ? elapsed : gpuMs * 0.70 + elapsed * 0.30;
        }
        if (frame++ % 5 === 0 && pending.length < 3) {
          query = gl.createQuery();
          if (query) gl.beginQuery(timer.TIME_ELAPSED_EXT, query);
        }
      }
      const bind = (slot: number, texture: WebGLTexture) => {
        gl.activeTexture(gl.TEXTURE0 + slot);
        gl.bindTexture(gl.TEXTURE_2D, texture);
      };
      const begin = (p: Program, target: Target | null) => {
        gl.bindFramebuffer(gl.FRAMEBUFFER, target?.framebuffer ?? null);
        gl.viewport(0, 0, target?.width ?? width, target?.height ?? height);
        gl.useProgram(p.program);
        gl.uniform2f(p.uniform('uSize'), width, height);
      };
      [material, light, walls].forEach((source, i) => {
        bind(i, inputs[i]);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      });
      const source = programs[0];
      begin(source, seedTarget);
      gl.uniform1i(source.uniform('uMaterial'), 0);
      gl.uniform1i(source.uniform('uLight'), 1);
      gl.uniform1i(source.uniform('uWalls'), 2);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      bind(0, seedTarget.texture);
      const ray = programs[1], reach = (width / 160) / span;
      for (let i = cascades ? layers.length - 1 : 0; i >= 0; i--) {
        const layer = layers[i];
        const upper = cascades ? layers[i + 1] : undefined;
        begin(ray, layer.target);
        gl.uniform1i(ray.uniform('uSeed'), 0);
        gl.uniform2i(ray.uniform('uProbes'), layer.columns, layer.rows);
        gl.uniform1i(ray.uniform('uTiles'), layer.tiles);
        gl.uniform1i(ray.uniform('uCount'), layer.count);
        gl.uniform1f(ray.uniform('uSpacing'), layer.spacing);
        gl.uniform2f(ray.uniform('uRange'), layer.near * reach, (cascades ? layer.far : 24) * reach);
        gl.uniform1i(ray.uniform('uMerge'), Number(!!upper));
        bind(1, (upper?.target ?? seedTarget).texture);
        gl.uniform1i(ray.uniform('uUpper'), 1);
        if (upper) {
          gl.uniform2i(ray.uniform('uUpperProbes'), upper.columns, upper.rows);
          gl.uniform1i(ray.uniform('uUpperTiles'), upper.tiles);
        }
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      const integrate = programs[2], final = programs[3], base = layers[0];
      begin(integrate, diffuseTarget);
      bind(1, base.target.texture);
      gl.uniform1i(integrate.uniform('uRadiance'), 1);
      gl.uniform2i(integrate.uniform('uProbes'), base.columns, base.rows);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      begin(final, null);
      bind(1, diffuseTarget.texture);
      gl.uniform1i(final.uniform('uSeed'), 0);
      gl.uniform1i(final.uniform('uRadiance'), 1);
      gl.uniform2i(final.uniform('uProbes'), base.columns, base.rows);
      gl.uniform1f(final.uniform('uSpacing'), base.spacing);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (query && timer) { gl.endQuery(timer.TIME_ELAPSED_EXT); pending.push(query); }
      return canvas;
    },
    timing() { return { supported: !!resources?.timer, ms: gpuMs }; },
    resetTiming() {
      for (const query of pending.splice(0)) gl.deleteQuery(query);
      gpuMs = undefined;
      frame = 0;
    },
    dispose() {
      canvas.removeEventListener('webglcontextlost', lose);
      canvas.removeEventListener('webglcontextrestored', restore);
      for (const query of pending.splice(0)) gl.deleteQuery(query);
      resources?.dispose();
    },
  };
}

type Program = ReturnType<typeof linkWebGL2Program>;
type Target = { framebuffer: WebGLFramebuffer; texture: WebGLTexture; width: number; height: number };

function initialize(gl: WebGL2RenderingContext) {
  const textures: WebGLTexture[] = [], buffers: WebGLFramebuffer[] = [], programs: Program[] = [];
  const dispose = () => {
    for (const p of programs) gl.deleteProgram(p.program);
    for (const texture of textures) gl.deleteTexture(texture);
    for (const framebuffer of buffers) gl.deleteFramebuffer(framebuffer);
  };
  const texture = (filter: number) => {
    const result = gl.createTexture();
    if (!result) throw new Error('WebGL texture allocation failed');
    textures.push(result);
    gl.bindTexture(gl.TEXTURE_2D, result);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return result;
  };
  const target = (width: number, height: number, halfFloat = false): Target => {
    const image = texture(gl.NEAREST);
    gl.texImage2D(gl.TEXTURE_2D, 0, halfFloat ? gl.RGBA16F : gl.RGBA8, width, height, 0, gl.RGBA, halfFloat ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE, null);
    const framebuffer = gl.createFramebuffer();
    if (!framebuffer) throw new Error('WebGL framebuffer allocation failed');
    buffers.push(framebuffer);
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, image, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('WebGL framebuffer incomplete');
    return { texture: image, framebuffer, width, height };
  };
  try {
    const timer = gl.getExtension('EXT_disjoint_timer_query_webgl2') as { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null;
    const halfFloat = !!gl.getExtension('EXT_color_buffer_float');
    const { width, height } = indirectSize;
    for (const pass of [seed, cascade, average, resolve]) programs.push(linkWebGL2Program(gl, fullscreenTriangle, pass));
    const inputs = [texture(gl.LINEAR), texture(gl.LINEAR), texture(gl.NEAREST)];
    const seedTarget = target(width, height);
    const layers = [[4, 4, 8, .65, 9], [8, 8, 32, 9, 31], [16, 16, 128, 31, 86]].map(([spacing, tiles, count, near, far]) => {
      const columns = Math.ceil(width / spacing), rows = Math.ceil(height / spacing);
      return { spacing, tiles, count, near, far, columns, rows, target: target(columns * tiles, rows * count / tiles, halfFloat) };
    });
    const diffuseTarget = target(layers[0].columns, layers[0].rows, halfFloat);
    return { inputs, seedTarget, layers, diffuseTarget, programs, timer, dispose };
  } catch {
    dispose();
  }
}
