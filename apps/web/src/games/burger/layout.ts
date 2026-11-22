export const burgerSceneHeight = 320;
export const maxBurgerPixelStep = 6;
export const burgerLayerSpacing = .115;

export function orderBubbleSize(layers: number, drink: boolean) {
  const burger = Math.max(22, (drink ? 28 : 33) - (layers - 1) * 1.5);
  const stack = (layers + 1) * burger * burgerLayerSpacing;
  return { burger, stack, width: burger + (drink ? 24 : 0) + 12,
    height: Math.max(burger + Math.ceil(stack), drink ? 32 : 0) + 8 };
}

export function fitBurgerPixels(width: number, height: number, density: number, requestedStep: number) {
  const physicalWidth = Math.min(width, height * 1.5) * density;
  const step = Math.max(requestedStep, Math.ceil(physicalWidth / 1920));
  const columns = Math.floor(physicalWidth / (step * 3));
  const buffer = { width: columns * 3, height: columns * 2 };
  const frame = { width: buffer.width * step / density, height: buffer.height * step / density };
  return { frame, buffer, step };
}
