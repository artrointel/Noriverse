import type { SceneFactory } from '../scene-loader.ts';
import { tableSize } from '../table.ts';
import { liarSceneHeight } from './rules.ts';
import { createLiarHud, loadLiarHud } from './hud.ts';

export const liarScene: SceneFactory = current => {
  let hud: ReturnType<typeof createLiarHud>;
  return {
    preload() { loadLiarHud(this); },
    create() {
      const art = this.add.graphics();
      const center = { x: tableSize / 2, y: liarSceneHeight / 2 };
      art.fillStyle(0x201429).fillRect(0, 0, tableSize, liarSceneHeight);
      art.fillStyle(0x392340).fillRoundedRect(12, 12, tableSize - 24, liarSceneHeight - 24, 25);
      art.lineStyle(1, 0xe7b090, .38).strokeRoundedRect(19, 19, tableSize - 38, liarSceneHeight - 38, 20);
      art.fillStyle(0x523450).fillEllipse(center.x, center.y, 316, 176);
      for (const diameter of [100, 135, 174, 218]) {
        art.lineStyle(1, 0xe4b08c, .19).strokeEllipse(center.x, center.y, diameter * 1.65, diameter);
      }
      for (const x of [62, tableSize - 62]) for (const y of [52, liarSceneHeight - 52]) {
        art.fillStyle(0xe4b08c, .68).fillTriangle(x - 4, y, x, y - 7, x + 4, y)
          .fillTriangle(x - 4, y, x + 4, y, x, y + 7);
      }
      hud = createLiarHud(this);
      const view = current().liar;
      if (view) hud.update(view);
    },
    update() {
      const view = current().liar;
      if (view) hud.update(view);
    },
  };
};
