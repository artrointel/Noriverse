export const burgerSceneHeight = 320;
export const maxBurgerPixelStep = 6;
export const burgerLayerSpacing = .115;

export function orderBubbleSize(layers: number, drink: boolean) {
  const burger = Math.max(22, (drink ? 28 : 33) - (layers - 1) * 1.5);
  const stack = (layers + 1) * burger * burgerLayerSpacing;
  const stripHeight = 15;
  const stripWidth = Math.min(84, layers * 12);
  const mealHeight = Math.max(burger + Math.ceil(stack), drink ? 32 : 0);
  return { burger, stack, stripWidth, stripHeight, width: Math.max(burger + (drink ? 24 : 0), stripWidth) + 12,
    height: mealHeight + stripHeight + 8 };
}

export function fitBurgerPixels(width: number, height: number, density: number, requestedStep: number) {
  const physicalWidth = Math.min(width, height * 1.5) * density;
  const step = Math.max(requestedStep, Math.ceil(physicalWidth / 1920));
  const columns = Math.floor(physicalWidth / (step * 3));
  const buffer = { width: columns * 3, height: columns * 2 };
  const frame = { width: buffer.width * step / density, height: buffer.height * step / density };
  return { frame, buffer, step };
}
