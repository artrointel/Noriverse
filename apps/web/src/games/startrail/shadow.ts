import type { Box, Point } from './outpost.ts';
import { flareFalloff } from './support.ts';
import { surface, visibleSurface } from './visibility.ts';
import type { Light } from './visibility.ts';
import { createShadowShader } from './shadow-gl.ts';

export const spriteCellSize = 128;
export type ShadowType = 'basic' | 'rotated';
export type ShadowMode = 'auto' | ShadowType;
type FrameSource = readonly [row: number, frame: number];
type ShadowTexture = HTMLImageElement | HTMLCanvasElement;
type ShadowPose = { angle?: number; scaleX?: number; scaleY?: number; scaleInScreenAxes?: boolean; flat?: boolean;
  opacity?: number; elevation?: number; blocker?: Box; groundRatio?: number };
export type ShadowLight = Light & { elevation: number; end?: Point };
export type ShadowProjection = { direction: Point; stretch: number; opacity: number; softness: number };
type ShadowSprite = { point: Point; size: number; frame: FrameSource; pose: ShadowPose; socket: Point };
type Attachment = { socket: Point; sprite: ShadowSprite };
type Caster = { source: ShadowTexture; point: Point; size: Point; frame?: FrameSource; pose: ShadowPose; attachment?: Attachment };
type AlphaBounds = readonly [left: number, top: number, right: number, bottom: number];
type GroundSpan = readonly [left: number, right: number];
type SourceFrame = { x: number; y: number; w: number; h: number; bounds: AlphaBounds; silhouette: readonly Point[];
  groundSpan: GroundSpan; contact: Point; flatContact: Point };
type ShadowCrossfade = { weight: number; anchorX: number; shear: number; bounds: readonly [number, number, number, number] };
type ShadowAxes = { origin: Point; horizontal: Point; vertical: Point };
type ShadowFootprint = ShadowAxes & { distance: readonly [number, number, number]; crossfade?: ShadowCrossfade };
export type ShadowDraw = {
  source: ShadowTexture; frame: SourceFrame; footprint: ShadowFootprint; opacity: number; softness: number;
  attachment?: { frame: SourceFrame; placement: ReturnType<typeof joinShadowFootprints> };
};

type LightHit = { direction: Point; distance: number; elevation: number; weight: number };
const contact: ShadowProjection = { direction: { x: 0, y: -1 }, stretch: 0, opacity: .32, softness: 1.2 };
const fullFrame: AlphaBounds = [0, 0, 1, 1];
const fullGroundSpan: GroundSpan = [0, 1];
const center = { x: .5, y: .5 };
const defaultGroundRatio = 1 / 6;
const flipFadeAngle = 10 * Math.PI / 180;
const flipFadeWidth = Math.sin(flipFadeAngle);

function corners([left, top, right, bottom]: AlphaBounds): readonly Point[] {
  return [{ x: left, y: top }, { x: right, y: top }, { x: right, y: bottom }, { x: left, y: bottom }];
}

function convexSilhouette(edges: Point[]) {
  edges.sort((a, b) => a.x - b.x || a.y - b.y);
  const hull: Point[] = [];
  function append(point: Point, bottom: number) {
    while (hull.length >= bottom + 2) {
      const a = hull[hull.length - 2], b = hull[hull.length - 1];
      if ((b.x - a.x) * (point.y - a.y) > (b.y - a.y) * (point.x - a.x)) break;
      hull.pop();
    }
    hull.push(point);
  }
  for (const point of edges) append(point, 0);
  const upperStart = hull.length - 1;
  for (let i = edges.length - 2; i >= 0; i--) append(edges[i], upperStart);
  hull.pop();
  return hull;
}

function lightOrigin(light: ShadowLight, point: Point) {
  if (!light.end) return light.origin;
  const x = light.end.x - light.origin.x, y = light.end.y - light.origin.y;
  const along = ((point.x - light.origin.x) * x + (point.y - light.origin.y) * y) / (x * x + y * y || 1);
  const t = Math.max(0, Math.min(1, along));
  return { x: light.origin.x + x * t, y: light.origin.y + y * t };
}

export function shadowProjections(point: Point, lights: readonly ShadowLight[], blockers: Box[], blocker?: Box): ShadowProjection[] {
  let strongest: LightHit | undefined, second: LightHit | undefined;
  for (const light of lights) {
    const origin = lightOrigin(light, point);
    const dx = point.x - origin.x, dy = point.y - origin.y, distance = Math.hypot(dx, dy);
    if (distance < 5 || distance >= light.range || light.amount < .03) continue;
    const ratio = distance / light.range;
    let weight = light.amount * (light.reveals ? flareFalloff(distance, light.range) : (1 - ratio) ** 1.35);
    if (light.heading !== undefined && light.halfAngle !== undefined) {
      const relative = Math.atan2(dy, dx) - light.heading;
      const angle = Math.abs(Math.atan2(Math.sin(relative), Math.cos(relative)));
      weight *= Math.max(0, 1 - (angle / light.halfAngle) ** 2);
    }
    if (weight < .035 || (second && weight <= second.weight) ||
      !visibleSurface(origin, point, blockers, blocker, light.range)) continue;
    const hit = { direction: { x: dx / distance, y: dy / distance }, distance, elevation: light.elevation, weight };
    if (!strongest || weight > strongest.weight) { second = strongest; strongest = hit; }
    else second = hit;
  }
  if (!strongest) return [contact];

  const hits = second && second.weight >= strongest.weight * .2 ? [strongest, second] : [strongest];
  const total = hits.reduce((sum, hit) => sum + hit.weight, 0);
  const contrast = Math.min(1, total * 2.6);
  return [{ ...contact, opacity: .32 - .16 * contrast }, ...hits.map(hit => ({
    direction: hit.direction,
    stretch: Math.min(.99, .15 + hit.distance / (hit.elevation + 48)),
    opacity: (.12 + contrast * .72) * hit.weight / total,
    softness: Math.min(3.2, .8 + hit.distance / 56 + hit.elevation / 170),
  }))];
}

function imageSize(source: ShadowTexture) {
  return { w: 'naturalWidth' in source ? source.naturalWidth : source.width, h: 'naturalHeight' in source ? source.naturalHeight : source.height };
}

export function shadowBasis(position: Point, size: Point, bounds: AlphaBounds, anchor: Point, pose: ShadowPose, silhouette = corners(bounds),
  groundSpan: GroundSpan = [bounds[0], bounds[2]]) {
  const cos = Math.cos(pose.angle ?? 0), sin = Math.sin(pose.angle ?? 0);
  const sx = pose.scaleX ?? 1, sy = pose.scaleY ?? 1;
  const h = { x: size.x * sx * cos, y: size.x * (pose.scaleInScreenAxes ? sy : sx) * sin };
  const v = { x: -size.y * (pose.scaleInScreenAxes ? sx : sy) * sin, y: size.y * sy * cos };
  const flatten = pose.flat ? .83 : .42, elevation = Math.max(0, pose.elevation ?? 0);
  const at = (uv: Point) => ({
    x: position.x + (uv.x - .5) * h.x + (uv.y - .5) * v.x,
    y: position.y + elevation + (uv.x - .5) * h.y + (uv.y - .5) * v.y,
  });
  const groundAnchor = { x: (groundSpan[0] + groundSpan[1]) / 2, y: bounds[3] };
  const opaqueWidth = bounds[2] - bounds[0];
  const opaqueHeight = bounds[3] - bounds[1];
  const castLength = Math.abs(size.y * sy) * (pose.flat ? .62 : 1);
  const groundRatio = pose.groundRatio ?? defaultGroundRatio;
  return { point: at(anchor), anchor, groundPoint: at(groundAnchor), groundAnchor, silhouette, elevation,
    opaqueWidth, opaqueHeight, castLength, flatten, groundRatio, h, v };
}

function rotatedGroundProjection(edge: Point, away: Point, winding: number, groundRatio: number) {
  const width = Math.hypot(edge.x, edge.y);
  if (!width) return { horizontal: edge, lift: 0, mirrorWeight: 0 };
  const normal = { x: -away.y * winding, y: away.x * winding };
  const crossWidth = (edge.x * normal.x + edge.y * normal.y) / width;
  const naturalWidth = Math.abs(crossWidth);
  const liftLimit = width * groundRatio;
  let lift = crossWidth < 0 ? liftLimit : 0;
  if (naturalWidth >= Math.max(groundRatio, flipFadeWidth)) return { horizontal: edge, lift, mirrorWeight: 0 };

  const angle = Math.asin(crossWidth);
  const crossfading = Math.abs(angle) < flipFadeAngle - 1e-10;
  let tangent = (edge.x * away.x + edge.y * away.y) / width;
  if (naturalWidth < groundRatio) {
    const blend = naturalWidth / groundRatio;
    tangent = Math.sign(tangent) * Math.sqrt(1 - groundRatio ** 2) * blend ** 2 * (3 - 2 * blend);
    const transitionAngle = Math.asin(groundRatio);
    lift = liftLimit * (transitionAngle - angle) / (2 * transitionAngle);
  }
  const projectedWidth = Math.max(naturalWidth, groundRatio);
  const across = !crossfading && angle < 0 ? -projectedWidth : projectedWidth;
  const horizontal = { x: width * (normal.x * across + away.x * tangent), y: width * (normal.y * across + away.y * tangent) };
  const mirrorWeight = crossfading ? (flipFadeAngle - angle) / (2 * flipFadeAngle) : 0;
  return { horizontal, lift, mirrorWeight };
}

function shadowCrossfade(weight: number, anchorX: number, shear: number): ShadowCrossfade {
  // Bound the union in the unflipped quad's UV space, including the reflected sprite's shear.
  const reflectedLeft = 2 * anchorX - 1, reflectedRight = 2 * anchorX;
  const offsetLeft = shear * (reflectedLeft - anchorX), offsetRight = shear * (reflectedRight - anchorX);
  const left = Math.min(0, reflectedLeft), top = Math.min(0, offsetLeft, offsetRight);
  const right = Math.max(1, reflectedRight), bottom = 1 + Math.max(0, offsetLeft, offsetRight);
  return { weight, anchorX, shear, bounds: [left, top, right - left, bottom - top] };
}

export function shadowFootprint(basis: ReturnType<typeof shadowBasis>, projection: ShadowProjection, type: ShadowType = 'basic'): ShadowFootprint {
  const { silhouette, h, v, elevation, opaqueWidth, opaqueHeight, castLength, flatten, groundRatio } = basis;
  const { direction: away, stretch } = projection;
  const rotateCast = type === 'rotated' && stretch > 0;
  let point = rotateCast ? basis.groundPoint : basis.point;
  const anchor = rotateCast ? basis.groundAnchor : basis.anchor;
  let horizontal = stretch ? h : { x: h.x, y: h.y * flatten };
  let vertical = stretch ? v : { x: v.x, y: v.y * flatten };
  let crossfade: ShadowCrossfade | undefined;
  if (rotateCast) {
    const winding = h.x * v.y - h.y * v.x < 0 ? -1 : 1;
    const ground = rotatedGroundProjection(h, away, winding, groundRatio);
    horizontal = ground.horizontal;
    const spriteHeight = Math.hypot(v.x, v.y);
    // Move the destination anchor up along the sprite by the measured width of the visible shadow.
    const anchorRise = ground.lift * opaqueWidth / (spriteHeight || 1);
    point = { x: point.x - v.x * anchorRise, y: point.y - v.y * anchorRise };
    const length = spriteHeight + castLength * stretch;
    vertical = { x: -away.x * length, y: -away.y * length };
    if (ground.mirrorWeight > 0 && length > 0) {
      const shear = 2 * (horizontal.x * away.x + horizontal.y * away.y) / length;
      crossfade = shadowCrossfade(ground.mirrorWeight, anchor.x, shear);
    }
  }
  const alongH = horizontal.x * away.x + horizontal.y * away.y;
  const alongV = vertical.x * away.x + vertical.y * away.y;
  let near = Infinity, far = -Infinity;
  for (const vertex of silhouette) {
    const along = vertex.x * alongH + vertex.y * alongV;
    near = Math.min(near, along);
    far = Math.max(far, along);
  }
  const extent = Math.max(1, far - near);
  const growth = rotateCast ? 0 : opaqueHeight * castLength * stretch / extent;
  const shift = elevation * stretch - near * growth;

  const along = (offset: Point, amount: number) => ({ x: offset.x + away.x * amount, y: offset.y + away.y * amount });
  return {
    origin: along({ x: point.x - horizontal.x * anchor.x - vertical.x * anchor.y,
      y: point.y - horizontal.y * anchor.x - vertical.y * anchor.y }, shift),
    horizontal: along(horizontal, growth * alongH),
    vertical: along(vertical, growth * alongV),
    distance: [alongH / extent, alongV / extent, -near / extent],
    crossfade,
  };
}

export function joinShadowFootprints(base: ShadowFootprint, socket: Point, attached: ShadowAxes, pivot: Point) {
  // Express the attached quad in the base quad's texture coordinates so both can share one draw.
  const { horizontal: h, vertical: v, crossfade } = base;
  const det = h.x * v.y - h.y * v.x;
  const toLocal = (p: Point) => ({ x: (v.y * p.x - v.x * p.y) / det, y: (h.x * p.y - h.y * p.x) / det });
  const horizontal = toLocal(attached.horizontal), vertical = toLocal(attached.vertical);
  const originAt = (p: Point) => ({
    x: p.x - horizontal.x * pivot.x - vertical.x * pivot.y,
    y: p.y - horizontal.y * pivot.x - vertical.y * pivot.y,
  });
  const origin = originAt(socket);
  const reflectedOrigin = crossfade ? originAt({
    x: 2 * crossfade.anchorX - socket.x, y: socket.y + crossfade.shear * (crossfade.anchorX - socket.x),
  }) : origin;
  const [x, y, width, height] = crossfade?.bounds ?? fullFrame;
  const left = Math.min(x, Math.min(origin.x, reflectedOrigin.x) + Math.min(0, horizontal.x) + Math.min(0, vertical.x));
  const top = Math.min(y, Math.min(origin.y, reflectedOrigin.y) + Math.min(0, horizontal.y) + Math.min(0, vertical.y));
  const right = Math.max(x + width, Math.max(origin.x, reflectedOrigin.x) + Math.max(0, horizontal.x) + Math.max(0, vertical.x));
  const bottom = Math.max(y + height, Math.max(origin.y, reflectedOrigin.y) + Math.max(0, horizontal.y) + Math.max(0, vertical.y));
  return { origin, reflectedOrigin, horizontal, vertical, bounds: [left, top, right - left, bottom - top] as const };
}

export function createSpriteShadows() {
  const gpu = createShadowShader();
  const casters: Caster[] = [];
  const frameCache = new WeakMap<ShadowTexture, Map<number, SourceFrame>>();
  let probe: CanvasRenderingContext2D | undefined;
  let fallback: CanvasRenderingContext2D | undefined;
  let blendLayer: CanvasRenderingContext2D | undefined;
  let pairLayer: CanvasRenderingContext2D | undefined;
  let pairBlendLayer: CanvasRenderingContext2D | undefined;
  let solid: HTMLCanvasElement | undefined;

  function rectangle(point: Point, width: number, height: number, pose: ShadowPose = {}) {
    if (width <= 0 || height <= 0) return;
    if (!solid) {
      const pixel = surface(1, 1);
      pixel.fillStyle = '#fff'; pixel.fillRect(0, 0, 1, 1);
      solid = pixel.canvas;
    }
    casters.push({ source: solid, point, size: { x: width, y: height }, pose: { flat: true, ...pose } });
  }

  function sourceFrame(source: ShadowTexture, frame?: FrameSource) {
    let frames = frameCache.get(source);
    if (!frames) { frames = new Map(); frameCache.set(source, frames); }
    const key = frame ? frame[0] * 16 + frame[1] : -1;
    const cached = frames.get(key);
    if (cached) return cached;
    const size = spriteCellSize;
    const rect = frame ? { x: frame[1] * size, y: frame[0] * size, w: size, h: size } : { x: 0, y: 0, ...imageSize(source) };
    if (source === solid) return { ...rect, bounds: fullFrame, silhouette: corners(fullFrame), groundSpan: fullGroundSpan,
      contact: center, flatContact: center };
    const scratch = probe ??= surface(size, size, true);
    scratch.clearRect(0, 0, size, size);
    scratch.drawImage(source, rect.x, rect.y, rect.w, rect.h, 0, 0, size, size);
    const pixels = scratch.getImageData(0, 0, size, size).data;
    const edges: Point[] = [];
    let groundSpan = fullGroundSpan;
    let left = size, top = size, right = 0, bottom = 0;
    for (let y = 0; y < size; y++) {
      let first = 0, last = size - 1;
      while (first < size && pixels[(y * size + first) * 4 + 3] < 42) first++;
      if (first === size) continue;
      while (last > first && pixels[(y * size + last) * 4 + 3] < 42) last--;
      left = Math.min(left, first); right = Math.max(right, last + 1);
      top = Math.min(top, y); bottom = y + 1;
      groundSpan = [first / size, (last + 1) / size];
      edges.push(...corners([groundSpan[0], y / size, groundSpan[1], (y + 1) / size]));
    }
    const bounds: AlphaBounds = right ? [left / size, top / size, right / size, bottom / size] : fullFrame;
    function anchorAt(row: number) {
      let point = center, score = Infinity;
      const midX = (left + right) / 2;
      for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) {
        if (pixels[(y * size + x) * 4 + 3] < 96) continue;
        const weight = (x + .5 - midX) ** 2 + (y + .5 - row) ** 2 * 24;
        if (weight >= score) continue;
        score = weight; point = { x: (x + .5) / size, y: (y + .5) / size };
      }
      return point;
    }
    const info = { ...rect, bounds, silhouette: edges.length ? convexSilhouette(edges) : corners(fullFrame), groundSpan,
      contact: anchorAt(bottom - Math.max(1, (bottom - top) * .065)), flatContact: anchorAt((top + bottom) / 2) };
    frames.set(key, info);
    return info;
  }

  function drawPair(target: CanvasRenderingContext2D, draw: ShadowDraw, attachment: NonNullable<ShadowDraw['attachment']>) {
    const { frame, placement: { horizontal, vertical, origin, reflectedOrigin, bounds } } = attachment;
    const { crossfade } = draw.footprint;
    const size = spriteCellSize;
    const x = Math.floor(bounds[0] * size), y = Math.floor(bounds[1] * size);
    const w = Math.ceil((bounds[0] + bounds[2]) * size) - x, h = Math.ceil((bounds[1] + bounds[3]) * size) - y;
    const pair = pairLayer ??= surface(w, h);
    if (pair.canvas.width < w) pair.canvas.width = w;
    if (pair.canvas.height < h) pair.canvas.height = h;
    pair.imageSmoothingEnabled = false;
    function paintPair(at: Point, reflection?: ShadowCrossfade) {
      pair.resetTransform();
      pair.clearRect(0, 0, w, h);
      pair.globalCompositeOperation = 'source-over';
      if (reflection) pair.setTransform(-1, -reflection.shear, 0, 1, 2 * reflection.anchorX * size - x, reflection.shear * reflection.anchorX * size - y);
      else pair.translate(-x, -y);
      const base = draw.frame;
      pair.drawImage(draw.source, base.x, base.y, base.w, base.h, 0, 0, size, size);
      pair.setTransform(horizontal.x, horizontal.y, vertical.x, vertical.y, at.x * size - x, at.y * size - y);
      pair.drawImage(draw.source, frame.x, frame.y, frame.w, frame.h, 0, 0, size, size);
      pair.resetTransform();
      pair.globalCompositeOperation = 'source-in';
      pair.fillStyle = '#020916'; pair.fillRect(0, 0, w, h);
    }
    paintPair(origin);
    if (!crossfade) {
      target.drawImage(pair.canvas, 0, 0, w, h, x, y, w, h);
      return;
    }

    const blend = pairBlendLayer ??= surface(w, h);
    if (blend.canvas.width < w) blend.canvas.width = w;
    if (blend.canvas.height < h) blend.canvas.height = h;
    blend.clearRect(0, 0, w, h);
    blend.globalCompositeOperation = 'lighter';
    blend.globalAlpha = 1 - crossfade.weight;
    blend.drawImage(pair.canvas, 0, 0, w, h, 0, 0, w, h);
    paintPair(reflectedOrigin, crossfade);
    blend.globalAlpha = crossfade.weight;
    blend.drawImage(pair.canvas, 0, 0, w, h, 0, 0, w, h);
    target.drawImage(blend.canvas, 0, 0, w, h, x, y, w, h);
  }

  function drawWithCanvas(target: CanvasRenderingContext2D, draws: ShadowDraw[]) {
    const size = spriteCellSize;
    const tint = fallback ??= surface(size, size);
    for (const draw of draws) {
      const { frame } = draw;
      const { origin, horizontal, vertical, crossfade } = draw.footprint;
      target.save(); target.globalAlpha *= draw.opacity;
      target.transform(horizontal.x / size, horizontal.y / size, vertical.x / size, vertical.y / size, origin.x, origin.y);
      if (draw.attachment) {
        drawPair(target, draw, draw.attachment);
        target.restore();
        continue;
      }
      tint.clearRect(0, 0, size, size);
      tint.globalCompositeOperation = 'source-over';
      tint.drawImage(draw.source, frame.x, frame.y, frame.w, frame.h, 0, 0, size, size);
      tint.globalCompositeOperation = 'source-in';
      tint.fillStyle = '#020916'; tint.fillRect(0, 0, size, size);
      if (crossfade) {
        const { weight, anchorX, shear, bounds: [left, top, width, height] } = crossfade;
        const x = Math.floor(left * size), y = Math.floor(top * size);
        const w = Math.ceil((left + width) * size) - x, h = Math.ceil((top + height) * size) - y;
        const layer = blendLayer ??= surface(w, h);
        if (layer.canvas.width !== w) layer.canvas.width = w;
        if (layer.canvas.height !== h) layer.canvas.height = h;
        layer.resetTransform();
        layer.clearRect(0, 0, w, h);
        layer.imageSmoothingEnabled = false;
        layer.globalCompositeOperation = 'lighter';
        layer.globalAlpha = 1 - weight;
        layer.drawImage(tint.canvas, -x, -y);
        layer.globalAlpha = weight;
        layer.setTransform(-1, -shear, 0, 1, 2 * anchorX * size - x, shear * anchorX * size - y);
        layer.drawImage(tint.canvas, 0, 0);
        target.drawImage(layer.canvas, x, y);
      } else target.drawImage(tint.canvas, 0, 0);
      target.restore();
    }
  }

  return {
    sprite(source: ShadowTexture, point: Point, size: number, frame?: FrameSource, pose: ShadowPose = {}) {
      casters.push({ source, point, size: { x: size, y: size }, frame, pose });
    },
    attachedSprite(source: ShadowTexture, base: ShadowSprite, sprite: ShadowSprite) {
      casters.push({ source, point: base.point, size: { x: base.size, y: base.size }, frame: base.frame,
        pose: base.pose, attachment: { socket: base.socket, sprite } });
    },
    rectangle,
    paint(target: CanvasRenderingContext2D, camera: Box, lights: readonly ShadowLight[], blockers: Box[], mode: ShadowMode = 'auto') {
      const draws: ShadowDraw[] = [];
      const { width, height } = camera;
      const toView = (p: Point) => ({ x: p.x - camera.x, y: p.y - camera.y });
      for (const { source, point, size, frame, pose, attachment } of casters) {
        const opacity = pose.opacity ?? .66;
        const x = point.x - camera.x, y = point.y - camera.y;
        const border = Math.max(size.x, size.y) * 1.9 + (pose.elevation ?? 0) * 1.5;
        if (opacity <= 0 || x < -border || y < -border || x > width + border || y > height + border) continue;
        const info = sourceFrame(source, frame);
        const type = mode === 'auto' ? (pose.flat ? 'basic' : 'rotated') : mode;
        const basis = shadowBasis(point, size, info.bounds, pose.flat ? info.flatContact : info.contact, pose, info.silhouette, info.groundSpan);
        const inView = { ...basis, point: toView(basis.point), groundPoint: toView(basis.groundPoint) };
        const lightTarget = type === 'rotated' ? basis.groundPoint : basis.point;
        const part = attachment?.sprite;
        const attachedFrame = part && sourceFrame(source, part.frame);
        const attachedBasis = part && attachedFrame && shadowBasis(toView(part.point), { x: part.size, y: part.size },
          attachedFrame.bounds, attachedFrame.flatContact, part.pose, attachedFrame.silhouette, attachedFrame.groundSpan);
        for (const projection of shadowProjections(lightTarget, lights, blockers, pose.blocker)) {
          const footprint = shadowFootprint(inView, projection, type);
          const draw: ShadowDraw = { source, frame: info, footprint,
            opacity: opacity * projection.opacity / (1 + basis.elevation / 125), softness: projection.softness };
          if (attachment && attachedFrame && attachedBasis && projection.stretch > 0) {
            const attached = shadowFootprint(attachedBasis, projection, 'basic');
            draw.attachment = { frame: attachedFrame, placement: joinShadowFootprints(footprint, attachment.socket, attached, attachment.sprite.socket) };
          }
          draws.push(draw);
        }
      }
      casters.length = 0;
      if (!draws.length) return;
      const layer = gpu?.paint(draws, target.canvas.width, target.canvas.height, camera);
      if (layer) target.drawImage(layer, 0, 0, width, height);
      else drawWithCanvas(target, draws);
    },
    dispose() { gpu?.dispose(); },
  };
}

export type SpriteShadows = ReturnType<typeof createSpriteShadows>;
