const fadeMs = 240;

export class SceneFade {
  private phase: 'in' | 'out' | 'idle' = 'in';
  private progress = 0;
  private swap?: () => void;

  get active() { return this.phase !== 'idle'; }
  get opacity() {
    const amount = this.phase === 'out' ? this.progress : this.phase === 'in' ? 1 - this.progress : 0;
    return amount * amount * (3 - 2 * amount);
  }

  enter() {
    this.phase = 'in';
    this.progress = 0;
    this.swap = undefined;
  }

  switchTo(swap: () => void) {
    if (this.phase === 'out') return false;
    this.progress = 1 - (this.phase === 'in' ? this.progress : 1);
    this.phase = 'out';
    this.swap = swap;
    return true;
  }

  advance(delta: number, reduceMotion: boolean) {
    if (!this.active) return;
    this.progress = Math.min(1, this.progress + delta / (reduceMotion ? 105 : fadeMs));
    if (this.progress < 1) return;
    if (this.phase === 'in') { this.phase = 'idle'; return; }
    const swap = this.swap;
    this.enter();
    swap?.();
  }
}

export class LayerFade<T> {
  private shown?: T;
  private alpha = 0;

  advance(next: T | undefined, delta: number, reduceMotion: boolean) {
    const step = delta / (reduceMotion ? 80 : 150);
    if (this.shown !== undefined && this.shown !== next) {
      this.alpha = Math.max(0, this.alpha - step);
      if (this.alpha === 0) this.shown = next;
      return;
    }
    this.shown = next;
    if (this.shown !== undefined && this.shown === next) this.alpha = Math.min(1, this.alpha + step);
  }

  reset() { this.shown = undefined; this.alpha = 0; }

  get layer() {
    if (this.shown !== undefined && this.alpha > 0) return { content: this.shown, opacity: this.alpha };
  }
}
