import type { Point } from './outpost.ts';

export type ChallengeFeedback = 'pickup' | 'placed' | 'miss' | 'solved' | 'close';

export interface InteractionChallenge {
  readonly solved: boolean;
  pointerDown(id: number, point: Point, time: number): ChallengeFeedback | undefined;
  pointerMove(id: number, point: Point): void;
  pointerUp(id: number, point: Point, time: number): ChallengeFeedback | undefined;
  cancelDrag(): void;
  draw(ctx: CanvasRenderingContext2D, time: number): void;
}
