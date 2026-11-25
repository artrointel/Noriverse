import type { Box } from './outpost.ts';
import type { ShadowDraw } from './shadow.ts';

const vertexSource = `
attribute vec2 aCorner;
uniform vec2 uOrigin;
uniform vec4 uAxes;
uniform vec3 uDistance;
uniform vec4 uDrawBounds;
uniform vec2 uScreen;
varying mediump vec2 vLocal;
varying mediump float vDistance;

void main() {
  vec2 local = uDrawBounds.xy + aCorner * uDrawBounds.zw;
  vec2 floor = uOrigin + uAxes.xy * local.x + uAxes.zw * local.y;
  vec2 clip = (floor / uScreen) * vec2(2.0, -2.0) + vec2(-1.0, 1.0);
  gl_Position = vec4(clip, 0.0, 1.0);
  vLocal = local;
  vDistance = clamp(dot(local, uDistance.xy) + uDistance.z, 0.0, 1.0);
}`;

const fragmentSource = `
precision mediump float;
uniform sampler2D uAtlas;
uniform vec4 uBounds;
uniform vec4 uBrush;
uniform vec3 uCrossfade;
uniform vec4 uAttachmentBounds;
uniform vec4 uAttachmentX;
uniform vec4 uAttachmentY;
varying vec2 vLocal;
varying float vDistance;

float alphaAt(vec2 uv, vec4 bounds) {
  vec2 halfTexel = uBrush.xy * 0.5;
  vec2 lo = bounds.xy;
  vec2 hi = lo + bounds.zw;
  vec2 inside = step(lo, uv) * step(uv, hi);
  return texture2D(uAtlas, clamp(uv, lo + halfTexel, hi - halfTexel)).a * inside.x * inside.y;
}

float shadowAlpha(vec2 local, vec2 radius, vec4 bounds) {
  if (min(local.x, local.y) < 0.0 || max(local.x, local.y) > 1.0) return 0.0;
  vec2 uv = bounds.xy + local * bounds.zw;
  float alpha = alphaAt(uv, bounds) * 0.56;
  alpha += alphaAt(uv + vec2(radius.x, 0.0), bounds) * 0.11;
  alpha += alphaAt(uv - vec2(radius.x, 0.0), bounds) * 0.11;
  alpha += alphaAt(uv + vec2(0.0, radius.y), bounds) * 0.11;
  alpha += alphaAt(uv - vec2(0.0, radius.y), bounds) * 0.11;
  return alpha;
}

float attachedAlpha(float base, vec2 local, vec2 radius, float reflected) {
  if (uAttachmentBounds.z == 0.0) return base;
  vec3 samplePoint = vec3(local, 1.0);
  vec2 part = vec2(dot(samplePoint, uAttachmentX.xyz), dot(samplePoint, uAttachmentY.xyz));
  part += reflected * vec2(uAttachmentX.w, uAttachmentY.w);
  return base + (1.0 - base) * shadowAlpha(part, radius, uAttachmentBounds);
}

void main() {
  vec2 radius = uBrush.xy * uBrush.z * (0.6 + vDistance * 1.05);
  float alpha = attachedAlpha(shadowAlpha(vLocal, radius, uBounds), vLocal, radius, 0.0);
  if (uCrossfade.z > 0.0) {
    float across = vLocal.x - uCrossfade.x;
    vec2 reflected = vec2(uCrossfade.x - across, vLocal.y - uCrossfade.y * across);
    float mirror = attachedAlpha(shadowAlpha(reflected, radius, uBounds), vLocal, radius, 1.0);
    alpha = mix(alpha, mirror, uCrossfade.z);
  }
  alpha *= uBrush.w;
  gl_FragColor = vec4(vec3(0.008, 0.035, 0.086) * alpha, alpha);
}`;

const uniformNames = ['uOrigin', 'uAxes', 'uDistance', 'uDrawBounds', 'uBounds', 'uScreen', 'uBrush', 'uAtlas', 'uCrossfade',
  'uAttachmentBounds', 'uAttachmentX', 'uAttachmentY'] as const;
const fullDrawBounds = [0, 0, 1, 1] as const;

function compile(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
  gl.deleteShader(shader);
}

function prepare(gl: WebGLRenderingContext) {
  const vertex = compile(gl, gl.VERTEX_SHADER, vertexSource);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = vertex && fragment ? gl.createProgram() : null;
  if (program && vertex && fragment) {
    gl.attachShader(program, vertex); gl.attachShader(program, fragment); gl.linkProgram(program);
  }
  if (vertex) gl.deleteShader(vertex);
  if (fragment) gl.deleteShader(fragment);
  if (!program) return;
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) { gl.deleteProgram(program); return; }
  const quad = gl.createBuffer();
  if (!quad) { gl.deleteProgram(program); return; }
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
  const locations = Object.fromEntries(uniformNames.map(name => [name, gl.getUniformLocation(program, name)])) as
    Record<typeof uniformNames[number], WebGLUniformLocation | null>;
  return { program, quad, locations, corner: gl.getAttribLocation(program, 'aCorner'),
    atlas: new WeakMap<ShadowDraw['source'], { texture: WebGLTexture; w: number; h: number }>(),
    textures: new Set<WebGLTexture>() };
}

export function createShadowShader() {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl', { alpha: true, antialias: false, depth: false, premultipliedAlpha: true, powerPreference: 'low-power' });
  if (!gl) return;
  const context = gl;
  let resources = prepare(context);
  const lost = (event: Event) => { event.preventDefault(); resources = undefined; };
  const restored = () => { resources = prepare(context); };
  canvas.addEventListener('webglcontextlost', lost);
  canvas.addEventListener('webglcontextrestored', restored);

  function textureFor(source: ShadowDraw['source'], state: NonNullable<typeof resources>) {
    const cached = state.atlas.get(source);
    if (cached) { context.bindTexture(context.TEXTURE_2D, cached.texture); return cached; }
    const w = 'naturalWidth' in source ? source.naturalWidth : source.width;
    const h = 'naturalHeight' in source ? source.naturalHeight : source.height;
    const texture = w > 0 && h > 0 ? context.createTexture() : null;
    if (!texture) return;
    context.bindTexture(context.TEXTURE_2D, texture);
    context.texParameteri(context.TEXTURE_2D, context.TEXTURE_MIN_FILTER, context.LINEAR);
    context.texParameteri(context.TEXTURE_2D, context.TEXTURE_MAG_FILTER, context.LINEAR);
    context.texParameteri(context.TEXTURE_2D, context.TEXTURE_WRAP_S, context.CLAMP_TO_EDGE);
    context.texParameteri(context.TEXTURE_2D, context.TEXTURE_WRAP_T, context.CLAMP_TO_EDGE);
    try { context.texImage2D(context.TEXTURE_2D, 0, context.RGBA, context.RGBA, context.UNSIGNED_BYTE, source); }
    catch { context.deleteTexture(texture); return; }
    const atlas = { texture, w, h };
    state.atlas.set(source, atlas);
    state.textures.add(texture);
    return atlas;
  }

  return {
    paint(draws: ShadowDraw[], width: number, height: number, view: Box) {
      const state = resources;
      if (!state || context.isContextLost() || !width || !height) return;
      // A single small GPU layer is enough for soft edges even at high display density.
      const density = Math.min(1, 1280 / width);
      const w = Math.max(1, Math.round(width * density)), h = Math.max(1, Math.round(height * density));
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;
      const gl = context;
      gl.viewport(0, 0, w, h);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(state.program); gl.bindBuffer(gl.ARRAY_BUFFER, state.quad);
      gl.enableVertexAttribArray(state.corner); gl.vertexAttribPointer(state.corner, 2, gl.FLOAT, false, 0, 0);
      const u = state.locations;
      gl.activeTexture(gl.TEXTURE0); gl.uniform1i(u.uAtlas, 0); gl.uniform2f(u.uScreen, view.width, view.height);
      for (const draw of draws) {
        const texture = textureFor(draw.source, state);
        if (!texture) return;
        const { frame, attachment, footprint: { origin, horizontal, vertical, distance, crossfade } } = draw;
        gl.uniform2f(u.uOrigin, origin.x, origin.y);
        gl.uniform4f(u.uAxes, horizontal.x, horizontal.y, vertical.x, vertical.y);
        gl.uniform3f(u.uDistance, ...distance);
        gl.uniform4f(u.uDrawBounds, ...(attachment?.placement.bounds ?? crossfade?.bounds ?? fullDrawBounds));
        gl.uniform3f(u.uCrossfade, crossfade?.anchorX ?? 0, crossfade?.shear ?? 0, crossfade?.weight ?? 0);
        gl.uniform4f(u.uBounds, frame.x / texture.w, frame.y / texture.h, frame.w / texture.w, frame.h / texture.h);
        gl.uniform4f(u.uBrush, 1 / texture.w, 1 / texture.h, draw.softness, draw.opacity);
        if (attachment) {
          const { frame, placement: { origin: a, reflectedOrigin: b, horizontal: h, vertical: v } } = attachment;
          const det = h.x * v.y - h.y * v.x;
          const x = v.y / det, xy = -v.x / det, yx = -h.y / det, y = h.x / det;
          gl.uniform4f(u.uAttachmentX, x, xy, -x * a.x - xy * a.y, x * (a.x - b.x) + xy * (a.y - b.y));
          gl.uniform4f(u.uAttachmentY, yx, y, -yx * a.x - y * a.y, yx * (a.x - b.x) + y * (a.y - b.y));
          gl.uniform4f(u.uAttachmentBounds, frame.x / texture.w, frame.y / texture.h, frame.w / texture.w, frame.h / texture.h);
        } else gl.uniform4f(u.uAttachmentBounds, 0, 0, 0, 0);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
      return gl.isContextLost() ? undefined : canvas;
    },
    dispose() {
      canvas.removeEventListener('webglcontextlost', lost);
      canvas.removeEventListener('webglcontextrestored', restored);
      if (!resources) return;
      for (const texture of resources.textures) context.deleteTexture(texture);
      context.deleteProgram(resources.program);
      context.deleteBuffer(resources.quad);
      resources = undefined;
    },
  };
}
