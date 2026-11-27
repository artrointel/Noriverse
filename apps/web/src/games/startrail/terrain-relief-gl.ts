import type { Box } from './outpost.ts';
import type { Light } from './visibility.ts';
import { fullscreenTriangle, linkWebGL2Program } from './webgl2-program.ts';
import { usesSoftwareWebGL } from './webgl-context.ts';

const fragment = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D uNormals;
uniform vec2 uStart;
uniform vec2 uLight;
uniform vec3 uCone;
uniform vec3 uFalloff;
uniform vec3 uRaster;
out vec4 result;

void main() {
  vec2 position = uStart + vec2(gl_FragCoord.x, uRaster.y - gl_FragCoord.y);
  vec4 packedNormal = texelFetch(uNormals, ivec2(position), 0);
  vec2 delta = uLight - position * uRaster.x;
  float reach = length(delta);
  if (packedNormal.a == 0.0 || reach >= uFalloff.x) { result = vec4(0.0); return; }
  float spread = 1.0;
  if (uCone.z > -1.5) {
    float facing = dot(-delta, uCone.xy) / (reach > 0.0 ? reach : 1.0);
    spread = clamp((facing - uCone.z) / (1.0 - uCone.z), 0.0, 1.0);
  }
  vec3 surface = vec3((packedNormal.xy * 255.0 - 128.0) / 127.0, packedNormal.z - 1.0);
  vec3 light = vec3(delta, uFalloff.y);
  float diffuse = dot(surface, light) * inversesqrt(dot(light, light));
  float alpha = min(0.72, abs(diffuse) * (1.0 - reach / uFalloff.x) * spread * uFalloff.z) * packedNormal.a * uRaster.z;
  result = vec4(vec3(diffuse > 0.0 ? alpha : 0.0), alpha);
}`;

export function createReliefShader(normals: ImageData, scale: number, contrast: number) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  const gl = canvas.getContext('webgl2', { alpha: true, antialias: false, depth: false, premultipliedAlpha: true,
    failIfMajorPerformanceCaveat: true, powerPreference: 'low-power' });
  if (!gl) return;
  if (usesSoftwareWebGL(gl)) {
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return;
  }
  const context = gl;
  function prepare() {
    if (context.isContextLost() || Math.max(normals.width, normals.height) > context.getParameter(context.MAX_TEXTURE_SIZE)) return;
    const texture = context.createTexture();
    if (!texture) return;
    context.bindTexture(context.TEXTURE_2D, texture);
    context.texParameteri(context.TEXTURE_2D, context.TEXTURE_MIN_FILTER, context.NEAREST);
    context.texParameteri(context.TEXTURE_2D, context.TEXTURE_MAG_FILTER, context.NEAREST);
    context.texImage2D(context.TEXTURE_2D, 0, context.RGBA8, normals.width, normals.height, 0,
      context.RGBA, context.UNSIGNED_BYTE, normals.data);
    if (context.getError() !== context.NO_ERROR) { context.deleteTexture(texture); return; }
    try {
      const { program, uniform } = linkWebGL2Program(context, fullscreenTriangle, fragment);
      context.useProgram(program);
      context.uniform1i(uniform('uNormals'), 0);
      const raster = uniform('uRaster');
      context.uniform3f(raster, 1 / scale, canvas.height, contrast);
      return { texture, program, raster, start: uniform('uStart'), light: uniform('uLight'), cone: uniform('uCone'), falloff: uniform('uFalloff') };
    } catch {
      context.deleteTexture(texture);
    }
  }
  let resources = prepare();
  const lost = (event: Event) => { event.preventDefault(); resources = undefined; };
  const restored = () => { resources = prepare(); };
  canvas.addEventListener('webglcontextlost', lost);
  canvas.addEventListener('webglcontextrestored', restored);
  return {
    paint(bounds: Box, light: Light & { elevation?: number }, power: number, ax: number, ay: number, cone: number) {
      if (!resources || context.isContextLost()) return;
      if (canvas.width < bounds.width) canvas.width = Math.ceil(bounds.width / 64) * 64;
      if (canvas.height < bounds.height) {
        canvas.height = Math.ceil(bounds.height / 64) * 64;
        context.uniform3f(resources.raster, 1 / scale, canvas.height, contrast);
      }
      context.viewport(0, canvas.height - bounds.height, bounds.width, bounds.height);
      context.uniform2f(resources.start, bounds.x, bounds.y);
      context.uniform2f(resources.light, light.origin.x, light.origin.y);
      context.uniform3f(resources.cone, ax, ay, light.heading === undefined ? -2 : cone);
      context.uniform3f(resources.falloff, light.range, light.elevation ?? 33, power);
      context.drawArrays(context.TRIANGLES, 0, 3);
      return canvas;
    },
    dispose() {
      canvas.removeEventListener('webglcontextlost', lost);
      canvas.removeEventListener('webglcontextrestored', restored);
      if (resources) {
        context.deleteTexture(resources.texture);
        context.deleteProgram(resources.program);
        resources = undefined;
      }
      context.getExtension('WEBGL_lose_context')?.loseContext();
      canvas.width = canvas.height = 0;
    },
  };
}
