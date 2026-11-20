import type Phaser from 'phaser';

const padding = 12;
const diagonal = Math.SQRT2;

function pieceOutlineTexture(scene: Phaser.Scene, frame: Phaser.Textures.Frame) {
  const key = `${frame.texture.key}:${frame.name}:selection-outline`;
  if (scene.textures.exists(key)) return key;

  const source = frame.texture.getSourceImage(frame.name);
  if (!(source instanceof HTMLImageElement || source instanceof HTMLCanvasElement)) return;

  const width = frame.cutWidth + padding * 2;
  const height = frame.cutHeight + padding * 2;
  const texture = scene.textures.createCanvas(key, width, height);
  if (!texture) return;
  const context = texture.getContext();
  context.drawImage(source, frame.cutX, frame.cutY, frame.cutWidth, frame.cutHeight,
    padding, padding, frame.cutWidth, frame.cutHeight);
  const image = context.getImageData(0, 0, width, height);
  const pixels = image.data;
  const distance = Float32Array.from({ length: width * height }, (_, index) => pixels[4 * index + 3] >= 96 ? 0 : padding);

  // Propagate each pixel's distance to the alpha silhouette in two passes.
  for (const step of [1, -1]) {
    const start = step === 1 ? 1 : height - 2;
    const edge = step === 1 ? 1 : width - 2;
    for (let y = start; y > 0 && y < height - 1; y += step) {
      for (let x = edge; x > 0 && x < width - 1; x += step) {
        const i = y * width + x;
        const row = i - step * width;
        distance[i] = Math.min(distance[i], distance[i - step] + 1, distance[row] + 1,
          distance[row - 1] + diagonal, distance[row + 1] + diagonal);
      }
    }
  }

  for (let i = 0; i < distance.length; i++) {
    const d = distance[i];
    const rim = Math.max(0, Math.min(1, (5.6 - d) / 2));
    const glow = Math.max(0, 1 - d / 11);
    const pixel = i * 4;
    const outside = 1 - pixels[pixel + 3] / 255;
    pixels[pixel] = 255;
    pixels[pixel + 1] = 167 + 69 * rim;
    pixels[pixel + 2] = 86 + 101 * rim;
    pixels[pixel + 3] = 255 * outside * Math.max(rim * .93, glow * .58);
  }
  context.putImageData(image, 0, 0);
  texture.refresh();
  return key;
}

function pieceTintTexture(scene: Phaser.Scene, frame: Phaser.Textures.Frame) {
  const key = `${frame.texture.key}:${frame.name}:selection-tint`;
  if (scene.textures.exists(key)) return key;
  const source = frame.texture.getSourceImage(frame.name);
  if (!(source instanceof HTMLImageElement || source instanceof HTMLCanvasElement)) return;
  const width = frame.cutWidth;
  const height = frame.cutHeight;
  const texture = scene.textures.createCanvas(key, width, height);
  if (!texture) return;
  const context = texture.getContext();
  context.drawImage(source, frame.cutX, frame.cutY, width, height, 0, 0, width, height);
  context.globalCompositeOperation = 'source-atop';
  context.fillStyle = 'rgba(255, 238, 193, 0.42)';
  context.fillRect(0, 0, width, height);
  texture.refresh();
  return key;
}

export function createPieceSelection(scene: Phaser.Scene) {
  const outline = scene.add.image(0, 0, '__DEFAULT').setVisible(false);
  const tint = scene.add.image(0, 0, '__DEFAULT').setVisible(false);
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let selected: Phaser.GameObjects.Image | undefined;
  let frame: Phaser.Textures.Frame | undefined;
  let reduced = motion.matches;

  return (art?: Phaser.GameObjects.Image) => {
    if (art !== selected || art?.frame !== frame || reduced !== motion.matches) {
      selected = art;
      frame = art?.frame;
      reduced = motion.matches;
      scene.tweens.killTweensOf(tint);
      const outlineKey = frame && pieceOutlineTexture(scene, frame);
      const tintKey = frame && pieceTintTexture(scene, frame);
      outline.setVisible(Boolean(outlineKey));
      tint.setVisible(Boolean(tintKey));
      if (outlineKey) outline.setTexture(outlineKey);
      if (tintKey) {
        tint.setTexture(tintKey).setAlpha(reduced ? .42 : .24);
        if (!reduced) scene.tweens.add({ targets: tint, alpha: .92, duration: 850, ease: 'Sine.InOut', yoyo: true, repeat: -1 });
      }
    }
    if (art) {
      outline.setPosition(art.x, art.y).setScale(art.scaleX, art.scaleY).setRotation(art.rotation);
      tint.setPosition(art.x, art.y).setScale(art.scaleX, art.scaleY).setRotation(art.rotation);
      if (outline.depth !== art.depth - .1) outline.setDepth(art.depth - .1);
      if (tint.depth !== art.depth + .1) tint.setDepth(art.depth + .1);
    }
  };
}
