import Phaser from 'phaser';
import type { GameId } from '../../../../packages/protocol/games.ts';
import type { GameView } from './game-view.ts';
import type { RenderSize } from './render-resolution.ts';
import type { SceneFactory } from './scene-loader.ts';
import { tableSize } from './table.ts';
import { alkkagiWorldOrigin, alkkagiWorldSize } from './alkkagi/rules.ts';
import { sichuanSceneHeight } from './sichuan/options.ts';
import { createRoundAnnouncement, preloadRoundAnnouncement } from './round-announcement.ts';
import type { RoundAnnouncement } from './round-announcement.ts';
import { playSound } from '../platform/audio.ts';
export { loadRoundAnnouncementFont } from './round-announcement.ts';

export function mountGame(parent: HTMLElement, id: GameId, antialias: boolean, initialSize: RenderSize, current: () => GameView, createScene: SceneFactory,
  announcement: () => RoundAnnouncement, onReady: () => void) {
  const scene = createScene(current);
  const worldSize = id === 'physics' ? alkkagiWorldSize : tableSize;
  const origin = id === 'physics' ? alkkagiWorldOrigin : 0;
  let size = initialSize;
  let camera: Phaser.Cameras.Scene2D.Camera | undefined;
  let drawCue: ReturnType<typeof createRoundAnnouncement>;

  function applyResolution(game: Phaser.Game) {
    if (!camera) return;
    if (game.scale.gameSize.width !== size.width || game.scale.gameSize.height !== size.height) game.scale.resize(size.width, size.height);
    camera.setSize(size.width, size.height).setOrigin(0, 0).setZoom(size.width / worldSize).setScroll(origin, origin);
  }

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: initialSize.width,
    height: initialSize.height,
    render: { antialias, antialiasGL: antialias, mipmapFilter: id === 'sichuan' && antialias ? 'LINEAR_MIPMAP_LINEAR' : undefined },
    backgroundColor: current().dark ? '#272132' : '#e8ddd1',
    scale: { mode: Phaser.Scale.NONE },
    physics: id === 'physics' ? { default: 'arcade', arcade: { fps: 90 } } : undefined,
    scene: {
      key: id,
      ...scene,
      preload(this: Phaser.Scene) {
        preloadRoundAnnouncement(this);
        scene.preload?.call(this);
      },
      create(this: Phaser.Scene) {
        camera = this.cameras.main;
        applyResolution(this.game);
        if (id === 'physics') this.physics.world.setBounds(origin, origin, worldSize, worldSize);
        scene.create.call(this);
        drawCue = createRoundAnnouncement(this, tableSize / 2, (id === 'sichuan' ? sichuanSceneHeight : tableSize) / 2, worldSize, cue => {
          switch (cue) {
            case '1': case '2': case '3': return playSound('countdown', 4 - Number(cue));
            case 'go': return playSound('go');
            case 'victory': case 'success': return playSound('win');
            case 'defeat': return playSound('loss');
            case 'finished': return playSound('finish');
          }
        });
        onReady();
      },
      update(this: Phaser.Scene, time: number, delta: number) {
        scene.update?.call(this, time, delta);
        drawCue(announcement());
      },
    },
  });
  return {
    resize(next: RenderSize) { size = next; applyResolution(game); },
    refreshInputBounds() {
      if (!camera) return;
      const scale = game.scale;
      scale.updateBounds();
      const { width, height } = scale.canvasBounds;
      if (width && height) scale.displayScale.set(scale.baseSize.width / width, scale.baseSize.height / height);
    },
    destroy() { game.destroy(true); },
  };
}
