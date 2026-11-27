export function usesSoftwareWebGL(context: WebGLRenderingContext | WebGL2RenderingContext) {
  const driver = context.getExtension('WEBGL_debug_renderer_info');
  return !!driver && /swiftshader|llvmpipe|software raster|microsoft basic render|\bwarp\b/i.test(
    context.getParameter(driver.UNMASKED_RENDERER_WEBGL));
}
