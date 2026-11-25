import { surface } from './visibility.ts';

export function makePixelPostProcess(output: CanvasRenderingContext2D) {
  let world: CanvasRenderingContext2D | undefined;
  let samples: CanvasRenderingContext2D | undefined;

  return {
    target(step: number) {
      if (step === 1) return output;
      const { width, height } = output.canvas;
      if (world?.canvas.width !== width || world.canvas.height !== height) world = surface(width, height);
      return world;
    },
    present(step: number) {
      if (step === 1 || !world) return;
      const { width, height } = world.canvas;
      const columns = Math.ceil(width / step), rows = Math.ceil(height / step);
      if (samples?.canvas.width !== columns || samples.canvas.height !== rows) samples = surface(columns, rows);

      // Resample the current frame on a fixed screen grid. Treat partial edge blocks separately to keep the interior grid exact.
      const completeWidth = width - width % step, completeHeight = height - height % step;
      const xRuns = [[0, completeWidth], [completeWidth, width - completeWidth]];
      const yRuns = [[0, completeHeight], [completeHeight, height - completeHeight]];
      for (const [y, h] of yRuns) for (const [x, w] of xRuns) {
        if (!w || !h) continue;
        samples.drawImage(world.canvas, x, y, w, h, x / step, y / step, Math.ceil(w / step), Math.ceil(h / step));
      }
      output.resetTransform();
      output.imageSmoothingEnabled = false;
      output.drawImage(samples.canvas, 0, 0, columns * step, rows * step);
    },
  };
}
