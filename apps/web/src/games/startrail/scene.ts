import Phaser from 'phaser';
import crewUrl from '../../assets/startrail/crew.png';
import locomotionUrl from '../../assets/startrail/solori-locomotion.png';
import verticalSoloriUrl from '../../assets/startrail/solori-vertical.png';
import verticalMonstersUrl from '../../assets/startrail/monsters-vertical.png';
import diagonalSoloriUrl from '../../assets/startrail/solori-diagonal.png';
import diagonalMonstersUrl from '../../assets/startrail/monsters-diagonal.png';
import enemyDirectionsUrl from '../../assets/startrail/enemy-directions.png';
import enemiesUrl from '../../assets/startrail/outpost-enemies.png';
import fallenUrl from '../../assets/startrail/outpost-fallen.png';
import setpiecesUrl from '../../assets/startrail/outpost-setpieces.png';
import outpostUrl from '../../assets/startrail/outpost.png';
import floorTilesUrl from '../../assets/startrail/outpost-floor.jpg';
import muralUrl from '../../assets/startrail/outpost-1-1.jpg';
import weaponsUrl from '../../assets/startrail/weapons.png';
import armoryUrl from '../../assets/startrail/outpost-armory.png';
import soloriArmedUrl from '../../assets/startrail/solori-armed.png';
import puzzleUrl from '../../assets/startrail/relay-puzzle.jpg';
import kommiUrl from '../../assets/startrail/kommi-crew.png';
import kommiArmedUrl from '../../assets/startrail/kommi-armed.png';
import handsUrl from '../../assets/startrail/explorer-hands.png';
import devicesUrl from '../../assets/startrail/outpost-devices.png';
import dummyUrl from '../../assets/startrail/medical-dummy.webp';
import outpostComicUrl from '../../assets/startrail/comic-outpost.jpg';
import observatoryComicUrl from '../../assets/startrail/comic-observatory.jpg';
import observatoryTilesUrl from '../../assets/startrail/observatory-tiles.jpg';
import residentUrl from '../../assets/startrail/observatory-resident.png';
import observatorySetpiecesUrl from '../../assets/startrail/observatory-setpieces.png';
import { dispersedHeading, finishReload, knife, knifeSwingDirection, makeGun, medical, refillMagazine, reloadStages, slots, startReload, swapDuration, weapons } from './gear.ts';
import type { Bullet, BulletSpec, Gun, Impact, Slot, SpentMetal, WeaponSwap } from './gear.ts';
import { balance, blockerClearance, defaultPixelStep, distance, maxPixelStep, onRay, pulseLightDuration, rayDistance, screen, waves } from './outpost.ts';
import type { Box, EnemyKind, ExplorerKind, MapMode, Point } from './outpost.ts';
import { observatoryStage, outpostStage } from './expedition-maps.ts';
import type { ExpeditionMap } from './expedition-maps.ts';
import { concealed, encounterRange, encounters, EnemyFlow, openPath } from './encounters.ts';
import { StoryIntro } from './story.ts';
import { powerTransfer } from './power-transfer.ts';
import { makeOutpostRenderer, restartArea } from './render.ts';
import { cameraView, maxCameraSpan, playerHitFeedback, projectToScreen, projectToWorld } from './camera.ts';
import { createIndirectLighting } from './gi.ts';
import type { LightingOptions } from './gi.ts';
import type { ActorArt, EnemyBolt, MuzzleLight, Phase, ResidentArt, Spark, StageInteraction, Trace, Warning } from './render.ts';
import { createOutpostAudio, deviceVolume } from './sound.ts';
import { piecePuzzle } from './puzzle.ts';
import type { ChallengeFeedback, InteractionChallenge } from './challenge.ts';
import { flarePoseAt, SupportGear, supportKinds, supportSpecs, turretSite } from './support.ts';
import type { Emplacement, Flare } from './support.ts';
import { distanceToLight, flashlightLevel } from './visibility.ts';
import { activeStatuses, applyStatus, rollCombatStatus, shortenStatuses, statusModifiers, tickStatuses } from './status.ts';
import type { BlockingStatus, Statuses } from './status.ts';
import { gunArt, heldPose, supportPose } from './weapon-pose.ts';
import { isHudPointer } from './reticle.ts';
import { createSpriteShadows } from './shadow.ts';
import type { ShadowMode } from './shadow.ts';

const timestep = 1 / 60;
const TAU = Math.PI * 2;
const keys = ['W', 'A', 'S', 'D', 'UP', 'DOWN', 'LEFT', 'RIGHT', 'E', 'R', 'F', 'ALT', 'Q', 'ONE', 'TWO', 'THREE', 'ESC', 'TAB', 'ENTER'] as const;
type Keys = Record<typeof keys[number], Phaser.Input.Keyboard.Key>;
type Body = Phaser.Physics.Matter.Image;
type Enemy = {
  body: Body; kind: EnemyKind; hp: number; aim: number; state: 'chase' | 'windup' | 'dash' | 'recover';
  stateUntil: number; hitUntil: number; attackAt: number; shotUntil?: number; lastArt?: ActorArt;
  statuses: Statuses; clock: number; medicSlow: number; reinforcement: boolean; waypoint?: Point; pursuing?: boolean;
};
type Ally = { body: Body; kind: ExplorerKind; hp: number; statuses: Statuses; invulnerableUntil: number; aim: number };
type TrainingDummy = { body: Body; hp: number; statuses: Statuses };
type Victim = Body | Emplacement;
type PropKind = keyof typeof balance.props;
type Prop = { body: Body; kind: PropKind; hp: number; hitUntil: number };
type Fallen = Omit<ActorArt, 'kind' | 'fallen'> & { kind: EnemyKind; at: number; knockback: Point };
type Bolt = EnemyBolt & { source: Enemy; speed: number; left: number };
type Trigger = { held: boolean; tapped: boolean };
type Slash = { heading: number; startedAt: number; struck: boolean; direction: 1 | -1 };
type ChallengeSession = { game: InteractionChallenge; location: Point; reach: number; solve: () => void };
type Roll = { stage: 'moving'; heading: number; origin: Point; startedAt: number }
  | { stage: 'recovering'; heading: number; startedAt: number };
type Resident = { body: Body; state: ResidentArt['state']; hiding: boolean; moving: boolean; trail: Point[] };
type ExpeditionProgress = { time: number; kills: number };

const airFriction = .11;
const enemyColors = { mite: '#9af2e1', boar: '#c6bcff', scout: '#ffb28a', sentinel: '#c9e786', spore: '#a6e9ff', grub: '#ccd3ff' } as const;

function mouseSlot(button: number): Slot | undefined {
  return button === 0 ? 'primary' : button === 2 ? 'sidearm' : undefined;
}

function isPageControl(target: EventTarget | null) {
  return target instanceof Element && !!target.closest('input, button, a, textarea, select, [contenteditable]');
}

function boxFor(prop: Prop, center: Point = prop.body): Box {
  const { width, height } = balance.props[prop.kind];
  return { x: center.x - width / 2, y: center.y - height / 2, width, height };
}

function enemyPose(enemy: Enemy, hit: number) {
  if (enemy.kind === 'mite') return hit > 0 ? 3 : undefined;
  if (enemy.clock < (enemy.shotUntil ?? 0)) return 3;
  return enemy.state === 'windup' ? enemy.kind === 'boar' ? 2 : 3 : enemy.state === 'dash' ? 3 : undefined;
}

export class OutpostScene extends Phaser.Scene {
  constructor(private readonly hud: CanvasRenderingContext2D, private readonly onReady: (stage: ExpeditionMap) => void,
    private readonly storyLanguage: 'ko' | 'en' = 'ko') { super(); }

  private keyboard!: Keys;
  private renderOutpost!: ReturnType<typeof makeOutpostRenderer>;
  private readonly shadows = createSpriteShadows();
  private readonly indirectLighting = createIndirectLighting();
  private lighting: LightingOptions = { mode: 'cascades', directStrength: .50, strength: .40, preview: false };
  private shadowMode: ShadowMode = 'auto';
  private player!: Body;
  private stage: ExpeditionMap = outpostStage;
  private previousStage?: ExpeditionProgress;
  private story?: StoryIntro;
  private showIntro = true;
  private transitioning = false;
  private resident?: Resident;
  private notice?: { text: string; until: number };
  private explorer: ExplorerKind = 'solori';
  private bringAlly = false;
  private ally?: Ally;
  private useTrainingDummy = false;
  private trainingDummy?: TrainingDummy;
  private playerStatuses: Statuses = {};
  private actionTime = 0;
  private flashlightOn = true;
  private medicalBeam?: { target: Enemy | Ally | TrainingDummy | 'self'; enemy: boolean };
  private medicalWaver?: number;
  private muzzleLights: MuzzleLight[] = [];
  private props: Prop[] = [];
  private enemies: Enemy[] = [];
  private enemyFlow!: EnemyFlow;
  private nextReinforcementsAt = 0;
  private encounterIndex = 0;
  private pendingReinforcements: EnemyKind[] = [];
  private securityGate?: ReturnType<Phaser.Physics.Matter.Factory['rectangle']>;
  private traces: Trace[] = [];
  private sparks: Spark[] = [];
  private bullets: Bullet[] = [];
  private spentMetal: SpentMetal[] = [];
  private fallen: Fallen[] = [];
  private bolts: Bolt[] = [];
  private rings: { x: number; y: number; radius: number; life: number }[] = [];
  private supplies = new Set<Point>();
  private pixelStep = defaultPixelStep;
  private phase: Phase = 'approach';
  private cameraSpan = 1;
  private cameraPosition = { x: 0, y: 0 };
  private previousCamera = { x: 0, y: 0 };
  private previousPositions = new WeakMap<Body, Point>();
  private readonly audio = createOutpostAudio();
  private elapsed = 0;
  private accumulator = 0;
  private facing = 0;
  private hp: number = balance.player.health;
  private healthBar?: Phaser.Time.TimerEvent;
  private lastHit?: { time: number; heading: number; healthFraction: number };
  private blockedStatus?: { kind: BlockingStatus; time: number };
  private blockedMovement = false;
  private readonly reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  private roll?: Roll;
  private rollRequested = false;
  private gaitDistance = 0;
  private walkFrame?: number;
  private guns: Record<Slot, Gun> = { primary: makeGun('pulse'), sidearm: makeGun('scout') };
  private triggers: Record<Slot, Trigger> = { primary: { held: false, tapped: false }, sidearm: { held: false, tapped: false } };
  private selected: Slot = 'primary';
  private swap?: WeaponSwap;
  private groundArms: (Point & { gun: Gun })[] = [];
  private support = new SupportGear();
  private turretHold = 0;
  private turretDeploy?: { heading: number; time: number; point: Point };
  private readonly flareBodies = new Map<Flare, Body>();
  private slash?: Slash;
  private knifeEquipped = false;
  private lastSlash?: { at: number; direction: Slash['direction'] };
  private relayPuzzle?: InteractionChallenge;
  private activeChallenge?: ChallengeSession;
  private invulnerableUntil = 0;
  private relayTime = 0;
  private gateOpenedAt = 0;
  private wave = 0;
  private defeated = 0;
  private mapMode: MapMode = 'off';
  private pointerSeen = false;
  private pointerInside = false;
  private restartRequested = false;

  preload() {
    this.load.image('crew', crewUrl);
    this.load.image('solori-locomotion', locomotionUrl);
    this.load.image('solori-vertical', verticalSoloriUrl);
    this.load.image('monsters-vertical', verticalMonstersUrl);
    this.load.image('solori-diagonal', diagonalSoloriUrl);
    this.load.image('monsters-diagonal', diagonalMonstersUrl);
    this.load.image('enemy-directions', enemyDirectionsUrl);
    this.load.image('outpost-enemies', enemiesUrl);
    this.load.image('outpost-fallen', fallenUrl);
    this.load.image('outpost-setpieces', setpiecesUrl);
    this.load.image('outpost', outpostUrl);
    if (this.stage.id === '1-1') {
      this.load.image('floor-tiles', floorTilesUrl);
      this.load.image('mural', muralUrl);
      this.load.image('comic-1-1', outpostComicUrl);
    } else {
      this.load.image('observatory-tiles', observatoryTilesUrl);
      this.load.image('comic-1-2', observatoryComicUrl);
      this.load.image('resident', residentUrl);
      this.load.image('observatory-setpieces', observatorySetpiecesUrl);
    }
    this.load.image('weapons', weaponsUrl);
    this.load.image('armory', armoryUrl);
    this.load.image('solori-armed', soloriArmedUrl);
    this.load.image('relay-puzzle', puzzleUrl);
    this.load.image('kommi', kommiUrl);
    this.load.image('kommi-armed', kommiArmedUrl);
    this.load.image('explorer-hands', handsUrl);
    this.load.image('devices', devicesUrl);
    this.load.image('medical-dummy', dummyUrl);
  }

  create() {
    this.reset();
    this.game.canvas.tabIndex = 0;
    this.keyboard = this.input.keyboard!.addKeys(keys.join(','), false) as Keys;
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      this.pointerSeen = this.pointerInside = true;
      this.activeChallenge?.game.pointerMove(pointer.id, this.pointerPosition(pointer));
    });
    this.input.on('wheel', (pointer: Phaser.Input.Pointer, _targets: unknown[], _dx: number, dy: number) => {
      if (!dy || !Number.isFinite(dy) || this.story || this.transitioning || this.activeChallenge || this.mapOpen || this.finished()) return;
      const event = pointer.event as WheelEvent;
      const unit = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? 120 : 1;
      this.pointerSeen = this.pointerInside = true;
      this.zoomCamera(Phaser.Math.Clamp(this.cameraSpan + dy * unit / 1000, 1, maxCameraSpan));
    });
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.pointerSeen = this.pointerInside = true;
      this.game.canvas.focus({ preventScroll: true });
      this.audio.unlock();
      if (this.story) {
        if (pointer.button === 0 || pointer.wasTouch) this.turnStoryPage();
        return;
      }
      if (this.transitioning) return;
      if (this.finished()) {
        const button = restartArea;
        const point = this.pointerPosition(pointer);
        if (pointer.button === 0 && point.x >= button.x && point.x <= button.x + button.width && point.y >= button.y && point.y <= button.y + button.height) this.restartRequested = true;
        return;
      }
      if (this.activeChallenge) {
        if (pointer.button === 0) this.challengeFeedback(this.activeChallenge.game.pointerDown(pointer.id, this.pointerPosition(pointer), this.elapsed));
        return;
      }
      if (isHudPointer(this.pointerPosition(pointer))) return;
      if (this.mapOpen || this.roll) return;
      const slot = mouseSlot(pointer.button);
      if (slot && !this.denyAction(statusModifiers(this.playerStatuses, this.elapsed).attackBlock)) {
        this.requestSwap(slot);
        this.triggers[slot] = { held: true, tapped: true };
      }
    });
    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (this.activeChallenge) {
        this.challengeFeedback(this.activeChallenge.game.pointerUp(pointer.id, this.pointerPosition(pointer), this.elapsed));
        return;
      }
      const slot = mouseSlot(pointer.button);
      if (slot) this.triggers[slot].held = false;
    });
    this.input.on('pointerupoutside', () => { this.activeChallenge?.game.cancelDrag(); this.stopFiring(); });
    this.input.on('gameout', () => { this.pointerInside = false; this.activeChallenge?.game.cancelDrag(); this.stopFiring(); });
    this.input.keyboard!.on('keydown', (event: KeyboardEvent) => {
      if (isPageControl(event.target)) return;
      this.audio.unlock();
      if (this.story) {
        if (!event.repeat && (event.code === 'Enter' || event.code === 'Space' || event.code === 'ArrowRight')) {
          event.preventDefault(); this.turnStoryPage();
        }
        return;
      }
      if (event.code === 'Tab' || event.code === 'Space' || event.code.startsWith('Arrow')) event.preventDefault();
      if (event.key === 'Alt' && document.activeElement === this.game.canvas) event.preventDefault();
      if (event.code === 'Space' && !event.repeat) this.rollRequested = true;
    });
    this.input.keyboard!.on('keyup-ALT', (event: KeyboardEvent) => {
      if (document.activeElement === this.game.canvas) event.preventDefault();
    });
    this.game.events.on(Phaser.Core.Events.BLUR, this.clearInput, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(Phaser.Core.Events.BLUR, this.clearInput, this);
      this.events.off(Phaser.Scenes.Events.RENDER, this.paint, this);
      this.renderOutpost?.dispose();
      this.audio.end();
    });
    this.events.off(Phaser.Scenes.Events.DESTROY, this.audio.dispose);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.audio.dispose);
    this.events.off(Phaser.Scenes.Events.DESTROY, this.shadows.dispose);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.shadows.dispose);
    this.events.off(Phaser.Scenes.Events.DESTROY, this.indirectLighting.dispose);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.indirectLighting.dispose);

    const { gameContext } = this.game.renderer as Phaser.Renderer.Canvas.CanvasRenderer;
    const stage = this.stage;
    const { obstacles, gate, crates, crystals, landing, patrols } = stage;
    const surfaceStage = stage.id === '1-1';
    this.renderOutpost = makeOutpostRenderer(gameContext, this.hud, {
      crew: this.texture('crew'), locomotion: this.texture('solori-locomotion'), verticalSolori: this.texture('solori-vertical'),
      verticalMonsters: this.texture('monsters-vertical'), outpost: this.texture('outpost'), tiles: this.texture(surfaceStage ? 'floor-tiles' : 'observatory-tiles'),
      diagonalSolori: this.texture('solori-diagonal'), enemies: this.texture('outpost-enemies'), fallen: this.texture('outpost-fallen'), setpieces: this.texture('outpost-setpieces'),
      diagonalMonsters: this.texture('monsters-diagonal'), enemyDirections: this.texture('enemy-directions'),
      mural: surfaceStage ? this.texture('mural') : undefined, gear: this.texture('weapons'), armory: this.texture('armory'), hands: this.texture('explorer-hands'),
      kommi: this.texture('kommi'), soloriArmed: this.texture('solori-armed'), kommiArmed: this.texture('kommi-armed'), devices: this.texture('devices'),
      dummy: this.texture('medical-dummy'), resident: surfaceStage ? undefined : this.texture('resident'),
      observatory: surfaceStage ? undefined : this.texture('observatory-setpieces'),
    }, this.shadows, this.indirectLighting, stage);
    for (const box of obstacles) this.addBarrier(box);
    this.securityGate = this.addBarrier(gate);
    for (const point of crates) this.spawnProp('crate', point);
    for (const point of crystals) this.spawnProp('crystal', point);
    this.player = this.makeBody(landing, balance.player.mass, { type: 'circle', radius: balance.player.radius });
    if (this.bringAlly) {
      const body = this.makeBody({ x: landing.x - 38, y: landing.y + 12 }, balance.player.mass, { type: 'circle', radius: balance.player.radius });
      this.ally = { body, kind: this.explorer === 'solori' ? 'kommi' : 'solori', hp: balance.player.health, statuses: {}, invulnerableUntil: 0, aim: 0 };
    }
    if (this.useTrainingDummy && surfaceStage) {
      const body = this.makeBody({ x: landing.x - 38, y: landing.y - 45 }, 2, { type: 'circle', radius: 10 }).setStatic(true);
      this.trainingDummy = { body, hp: 50, statuses: {} };
      this.resetDummy();
    }
    if ('shelter' in stage) {
      const body = this.makeBody(stage.shelter, .8, { type: 'circle', radius: 8 }).setSensor(true).setStatic(true);
      this.resident = { body, state: 'waiting', hiding: false, moving: false, trail: [] };
      this.showNotice('파루미 · 물소리가 갈리는 곳에서 대피실의 주황빛을 찾아요.');
    }
    for (const point of patrols) this.spawn(point.kind, point);
    this.follow(1);
    this.previousCamera = { ...this.cameraPosition };
    this.events.on(Phaser.Scenes.Events.RENDER, this.paint, this);
    this.story = this.showIntro ? new StoryIntro(stage, this.texture(`comic-${stage.id}`), this.storyLanguage, this.reducedMotion.matches) : undefined;
    this.game.canvas.style.cursor = this.story ? 'pointer' : '';
    this.onReady(stage);
  }

  private reset() {
    this.indirectLighting.reset();
    this.props = []; this.enemies = []; this.traces = []; this.sparks = []; this.bullets = []; this.spentMetal = [];
    this.enemyFlow = new EnemyFlow(this.stage);
    this.nextReinforcementsAt = encounters[this.stage.id].firstAt;
    this.encounterIndex = 0; this.pendingReinforcements = [];
    this.fallen = []; this.bolts = []; this.rings = []; this.supplies = new Set(this.stage.caches);
    this.transitioning = false; this.resident = undefined; this.notice = undefined; this.story = undefined;
    this.ally = undefined; this.trainingDummy = undefined; this.playerStatuses = {}; this.actionTime = 0; this.flashlightOn = true;
    this.medicalBeam = undefined; this.medicalWaver = undefined; this.muzzleLights = [];
    this.flareBodies.clear(); this.turretDeploy = undefined;
    this.phase = 'approach'; this.cameraSpan = 1; this.cameraPosition = { x: 0, y: 0 }; this.previousPositions = new WeakMap();
    this.elapsed = 0; this.accumulator = 0; this.facing = 0; this.hp = balance.player.health;
    this.healthBar = undefined; this.lastHit = undefined; this.roll = undefined; this.rollRequested = false; this.gaitDistance = 0; this.walkFrame = undefined;
    this.guns = { primary: makeGun('pulse'), sidearm: makeGun('scout') };
    this.selected = 'primary'; this.swap = undefined;
    this.groundArms = this.stage.weaponPickups.map(pickup => ({ x: pickup.x, y: pickup.y, gun: makeGun(pickup.weapon) }));
    this.support = new SupportGear(this.stage.walkable);
    this.turretHold = 0; this.slash = undefined; this.knifeEquipped = false; this.lastSlash = undefined;
    this.blockedStatus = undefined; this.blockedMovement = false;
    this.relayPuzzle = undefined; this.activeChallenge = undefined;
    this.invulnerableUntil = 0; this.relayTime = 0; this.gateOpenedAt = 0;
    this.wave = 0; this.defeated = 0; this.mapMode = 'off';
    this.stopFiring(); this.pointerSeen = this.pointerInside = false; this.restartRequested = false;
    this.audio.begin();
  }

  setPixelStep(value: number) {
    this.pixelStep = Number.isFinite(value) ? Phaser.Math.Clamp(Math.round(value), 1, maxPixelStep) : defaultPixelStep;
  }

  setLighting(options: LightingOptions) { this.lighting = options; }

  setShadowMode(mode: ShadowMode) {
    if (mode === this.shadowMode) return;
    this.shadowMode = mode;
    this.indirectLighting.reset();
  }

  lightingDiagnostics() { return this.indirectLighting.diagnostics(); }

  isMuted() { return this.audio.isMuted(); }

  setMuted(value: boolean) { this.audio.setMuted(value); }

  setVolume(value: number) { this.audio.setVolume(value); }

  startExpedition(explorer: ExplorerKind, withAlly: boolean, withDummy = false) {
    this.explorer = explorer;
    this.bringAlly = withAlly;
    this.useTrainingDummy = withDummy;
    this.stage = outpostStage; this.previousStage = undefined; this.showIntro = true; this.transitioning = true;
    this.audio.unlock();
    this.scene.restart();
  }

  private turnStoryPage() {
    if (!this.story?.advance(this.time.now)) return;
    this.story = undefined;
    this.showIntro = false;
    this.game.canvas.style.cursor = '';
    this.clearInput();
  }

  private showNotice(text: string) { this.notice = { text, until: this.elapsed + 4.7 }; }

  private texture(key: string) {
    return this.textures.get(key).getSourceImage() as HTMLImageElement;
  }

  private addBarrier(box: Box) {
    if (box.polygon) {
      const { center, vertices } = box.polygon;
      return this.matter.add.fromVertices(center.x, center.y, [vertices.map(p => ({ ...p }))], { isStatic: true, friction: .025 });
    }
    return this.matter.add.rectangle(box.x + box.width / 2, box.y + box.height / 2, box.width, box.height, { isStatic: true, friction: .025 });
  }

  private makeBody(point: Point, mass: number, shape: Phaser.Types.Physics.Matter.MatterSetBodyConfig) {
    const body = this.matter.add.image(point.x, point.y, '__WHITE');
    return body.setBody(shape).setMass(mass).setFixedRotation().setFriction(.023, airFriction, .05).setBounce(.11).setVisible(false);
  }

  private spawnProp(kind: PropKind, point: Point) {
    const stats = balance.props[kind];
    const body = this.makeBody(point, stats.mass, { type: 'rectangle', width: stats.width, height: stats.height });
    if (stats.anchored) body.setStatic(true);
    this.props.push({ body, kind, hp: stats.hp, hitUntil: 0 });
  }

  private spawn(kind: EnemyKind, position: Point, reinforcement = false) {
    const stats = balance[kind];
    const body = this.makeBody(position, stats.mass, { type: 'circle', radius: stats.radius });
    this.enemies.push({ body, kind, hp: stats.health, aim: Math.PI, state: 'chase', stateUntil: 0, hitUntil: 0, attackAt: this.elapsed + .42,
      statuses: {}, clock: this.elapsed, medicSlow: 0, reinforcement });
  }

  private clearInput() {
    this.stopFiring();
    this.activeChallenge?.game.cancelDrag();
    this.rollRequested = false;
    this.turretDeploy = undefined;
    this.input.keyboard?.resetKeys();
  }

  private stopFiring() {
    for (const slot of slots) this.triggers[slot] = { held: false, tapped: false };
  }

  private denyAction(kind: BlockingStatus | undefined) {
    if (!kind) return false;
    this.blockedStatus = { kind, time: this.elapsed };
    return true;
  }

  private finished() { return this.phase === 'defeated' || this.phase === 'cleared'; }

  private walls() { return this.securityGate ? [...this.stage.obstacles, this.stage.gate] : this.stage.obstacles; }

  private blockerBoxes(): Box[] { return [...this.walls(), ...this.props.map(prop => boxFor(prop))]; }

  private get mapOpen() { return this.mapMode === 'panel'; }

  private get controlsLocked() { return this.mapOpen || !!this.roll || !!this.activeChallenge || statusModifiers(this.playerStatuses, this.elapsed).stunned; }

  private challengeFeedback(feedback?: ChallengeFeedback) {
    if (feedback === 'close') { this.closeChallenge(); return; }
    if (feedback === 'solved' && this.activeChallenge?.game.solved) {
      const solve = this.activeChallenge.solve;
      this.closeChallenge();
      solve();
    } else if (feedback) {
      this.audio.play(feedback === 'miss' ? 'casing' : 'swap', undefined, undefined, .45, feedback === 'placed' ? 1.3 : .9);
    }
  }

  private closeChallenge() {
    this.activeChallenge?.game.cancelDrag();
    this.activeChallenge = undefined;
    this.stopFiring();
  }

  private follow(weight: number) {
    const target = cameraView({ x: this.player.x - screen.width * this.cameraSpan / 2,
      y: this.player.y - screen.height * this.cameraSpan / 2 }, this.cameraSpan, this.stage.world);
    this.cameraPosition.x = Phaser.Math.Linear(this.cameraPosition.x, target.x, weight);
    this.cameraPosition.y = Phaser.Math.Linear(this.cameraPosition.y, target.y, weight);
  }

  private zoomCamera(span: number) {
    if (span === this.cameraSpan) return;
    const shift = (this.cameraSpan - span) / 2;
    const recenter = (point: Point) => cameraView({ x: point.x + screen.width * shift, y: point.y + screen.height * shift }, span, this.stage.world);
    this.previousCamera = recenter(this.previousCamera);
    this.cameraPosition = recenter(this.cameraPosition);
    this.cameraSpan = span;
  }

  private hitFeedback() {
    const hit = this.lastHit;
    return hit && playerHitFeedback((this.time.now - hit.time) / 1000, hit.heading, hit.healthFraction, this.reducedMotion.matches);
  }

  private displayCamera(hit = this.hitFeedback()) {
    const origin = this.interpolate(this.previousCamera, this.cameraPosition);
    const camera = cameraView({ x: origin.x + (hit?.offset.x ?? 0), y: origin.y + (hit?.offset.y ?? 0) }, this.cameraSpan, this.stage.world);
    const scaleX = this.scale.width / camera.width, scaleY = this.scale.height / camera.height;
    return cameraView({ x: Math.round(camera.x * scaleX) / scaleX, y: Math.round(camera.y * scaleY) / scaleY }, this.cameraSpan, this.stage.world);
  }

  private interpolate(previous: Point, current: Point) {
    const alpha = Math.min(1, this.accumulator / timestep);
    return { x: Phaser.Math.Linear(previous.x, current.x, alpha), y: Phaser.Math.Linear(previous.y, current.y, alpha) };
  }

  private visualPosition(body: Body): Point {
    const previous = this.previousPositions.get(body);
    return previous ? this.interpolate(previous, body) : { x: body.x, y: body.y };
  }

  private pointerPosition(pointer: Phaser.Input.Pointer): Point {
    return { x: pointer.x * screen.width / this.scale.width, y: pointer.y * screen.height / this.scale.height };
  }

  private screenAim(camera: Box) {
    return this.pointerSeen ? this.pointerPosition(this.input.activePointer) :
      projectToScreen({ x: this.player.x + 94, y: this.player.y - 12 }, camera);
  }

  private aimPoint() {
    const camera = this.displayCamera();
    return projectToWorld(this.screenAim(camera), camera);
  }

  private impulse(body: Body, heading: number, strength: number, mass: number) {
    const velocity = body.getVelocity();
    const push = onRay(velocity, heading, strength / mass);
    body.setVelocity(push.x, push.y);
  }

  private steer(body: Body, angle: number, speed: number, response: number) {
    const velocity = body.getVelocity();
    body.setVelocity(Phaser.Math.Linear(velocity.x, Math.cos(angle) * speed, response), Phaser.Math.Linear(velocity.y, Math.sin(angle) * speed, response));
  }

  private beginRoll(x: number, y: number) {
    const heading = Math.atan2(y, x);
    const origin = { x: this.player.x, y: this.player.y };
    this.roll = { stage: 'moving', heading, origin, startedAt: this.actionTime };
    this.audio.play('roll');
    this.burst(origin, this.explorer === 'kommi' ? '#7df3ff' : '#bbd8e4', 7);
  }

  private recoverRoll(heading: number) {
    const speed = this.player.getVelocity();
    this.player.setVelocity(speed.x * .16, speed.y * .16);
    this.roll = { stage: 'recovering', heading, startedAt: this.actionTime };
  }

  private get rollSpec() { return this.explorer === 'kommi' ? balance.cometDash : balance.roll; }

  private advanceRoll(blockers: Box[], actionStep: number) {
    const roll = this.roll;
    if (!roll) return false;
    const time = this.actionTime - roll.startedAt;
    const spec = this.rollSpec;
    if (roll.stage === 'recovering') {
      if (time >= spec.recovery) { this.roll = undefined; return false; }
      this.steer(this.player, roll.heading, 0, .24);
      return true;
    }
    if (time >= spec.duration) { this.recoverRoll(roll.heading); return true; }

    const dx = Math.cos(roll.heading), dy = Math.sin(roll.heading);
    const traveled = (this.player.x - roll.origin.x) * dx + (this.player.y - roll.origin.y) * dy;
    const next = Math.min(1, (time + actionStep) / spec.duration);
    const desired = spec.range * (1 - (1 - next) ** 2.65);
    const step = Phaser.Math.Clamp(desired - traveled, 0, 12);
    const radius = balance.player.radius;
    const clearance = rayDistance(this.player, dx, dy, step, blockers, 'front', radius);
    const speed = clearance / (1 - airFriction);
    this.player.setVelocity(dx * speed, dy * speed);
    if (this.explorer === 'kommi' && this.sparks.length < 300) this.burst(this.player, '#73dbf6', 1);
    if (clearance < .4 && step > .4) this.recoverRoll(roll.heading);
    return true;
  }

  private shoot(gun: Gun) {
    const stats = weapons[gun.weapon];
    if (gun.weapon === 'medical' || stats.mode === 'medical') return;
    gun.ammo--; gun.firedAt = this.actionTime;
    this.audio.play(gun.weapon);
    const bob = Math.hypot(this.player.getVelocity().x, this.player.getVelocity().y) > .17 ? Math.sin(this.elapsed * 17) * .85 : 0;
    const pose = heldPose(this.player, this.facing, gun.weapon, 0, 0, 1, bob);
    const reach = distance(this.player, pose.ground);
    const cursor = this.aimPoint();
    const convergence = this.pointerSeen && distance(this.player, cursor) > reach + 9 ?
      Math.atan2(cursor.y - pose.muzzle.y, cursor.x - pose.muzzle.x) : this.facing;
    const heading = dispersedHeading(convergence, stats.accuracy);
    const { point: start, blocked, target } = this.muzzleClearance(this.player, pose.ground);
    const art = gunArt[gun.weapon];
    const ballistic = stats.mode === 'ballistic';
    this.muzzleLights.push({ origin: start, point: pose.muzzle, emitter: { x: this.player.x, y: this.player.y },
      heading: this.facing, life: art.duration, duration: art.duration, strength: art.flash, color: art.glow,
      wide: gun.weapon === 'shotgun', ballistic, gun });
    this.burst(pose.muzzle, stats.color, gun.weapon === 'shotgun' ? 14 : 4);
    if (ballistic) {
      for (const spread of stats.spread) {
        if (blocked) this.impactShot(start, heading + spread, stats, target, pose.lift);
        else this.fireBullet(start, heading + spread, { speed: stats.speed, range: stats.range, impact: stats, expiresClean: gun.weapon === 'shotgun' }, pose.lift);
      }
      this.dropMetal(onRay({ x: pose.mount.x, y: pose.mount.y + pose.lift }, heading + Math.PI / 2, 4), heading + .96, 'case');
      return;
    }
    const collision = blocked ? { travel: 0, target } : this.shotCollision(start, heading, stats.range);
    const hit = collision.travel < stats.range, to = onRay(start, heading, collision.travel);
    this.traces.push({ from: start, to, lift: pose.lift, life: pulseLightDuration, hit, color: stats.color, gun, blocked });
    if (hit) this.impactShot(to, heading, stats, collision.target, pose.lift);
  }

  private fireBullet(origin: Point, heading: number, spec: BulletSpec, lift: number) {
    this.bullets.push({ x: origin.x, y: origin.y, heading, traveled: 0, lift, ...spec });
  }

  private muzzleClearance(emitter: Point, muzzle: Point) {
    const reach = distance(emitter, muzzle);
    const heading = Math.atan2(muzzle.y - emitter.y, muzzle.x - emitter.x);
    const { travel, target } = this.shotCollision(emitter, heading, reach);
    const blocked = travel < reach - .01;
    return { point: blocked ? onRay(emitter, heading, travel) : muzzle, blocked, target };
  }

  private advanceSlash() {
    const attack = this.slash;
    if (!attack) return;
    const age = this.actionTime - attack.startedAt;
    if (age + 1e-7 >= knife.duration + knife.recovery) {
      this.slash = undefined;
      return;
    }
    if (attack.struck || age + 1e-7 < knife.windup) return;
    attack.struck = true;
    const hits = new Map<Enemy | Prop, { point: Point; heading: number }>();
    for (let i = -4; i <= 4; i++) {
      const heading = attack.heading + attack.direction * knife.arc * i / 4;
      const { travel, target } = this.shotCollision(this.player, heading, knife.reach);
      if (target && !hits.has(target)) hits.set(target, { point: onRay(this.player, heading, travel), heading });
    }
    for (const [target, hit] of hits) this.impactShot(hit.point, hit.heading, knife, target);
    if (!hits.size) this.burst(onRay(this.player, attack.heading, knife.reach - 4), knife.color, 3);
  }

  private shotCollision(origin: Point, heading: number, range: number) {
    const dx = Math.cos(heading), dy = Math.sin(heading);
    let travel = rayDistance(origin, dx, dy, range, this.walls());
    let target: Enemy | Prop | undefined;
    for (const prop of this.props) {
      const box = boxFor(prop);
      const inside = origin.x >= box.x && origin.x <= box.x + box.width && origin.y >= box.y && origin.y <= box.y + box.height;
      const entry = inside ? 0 : rayDistance(origin, dx, dy, travel, [box]);
      if (entry < travel) { target = prop; travel = entry; }
    }
    for (const enemy of this.enemies) {
      const ox = enemy.body.x - origin.x, oy = enemy.body.y - origin.y;
      const projection = ox * dx + oy * dy;
      const perpendicular = ox * dy - oy * dx;
      const radius = balance[enemy.kind].radius;
      if (Math.abs(perpendicular) >= radius) continue;
      const half = Math.sqrt(radius ** 2 - perpendicular ** 2);
      if (projection + half < 0) continue;
      const entry = Math.max(0, projection - half);
      if (entry < travel) { target = enemy; travel = entry; }
    }
    return { travel, target };
  }

  private impactShot(point: Point, heading: number, stats: Impact, target?: Enemy | Prop, lift = 0) {
    this.burst({ x: point.x, y: point.y - lift }, target?.kind === 'boar' ? '#e6c3ff' : stats.color, 7);
    if (!target || target.hp <= 0) return;
    this.audio.play(stats === knife ? 'knifeImpact' : 'hit', point, this.player, .92);
    const wasHit = target.hitUntil > this.elapsed;
    target.hp -= stats.damage;
    target.hitUntil = this.elapsed + .14;
    if ('state' in target) {
      this.impulse(target.body, heading, stats.impulse, balance[target.kind].mass);
      if (target.hp <= 0) this.defeatEnemy(target, heading, stats.impulse, wasHit);
      else if (stats === weapons.pulse) rollCombatStatus(target.statuses, 'pulse', this.elapsed);
    } else {
      const prop = balance.props[target.kind];
      if (!prop.anchored) this.impulse(target.body, heading, stats.impulse, prop.mass);
      if (target.hp > 0) return;
      this.audio.play('break'); this.burst(target.body, prop.color, 27);
      this.props.splice(this.props.indexOf(target), 1);
      target.body.destroy();
    }
  }

  private defeatEnemy(target: Enemy, heading: number, force = 0, wasHit = false) {
    const index = this.enemies.indexOf(target);
    if (index < 0) return;
    this.burst(target.body, enemyColors[target.kind], 18);
    const art = target.lastArt, velocity = target.body.getVelocity();
    this.fallen.push({ ...this.visualPosition(target.body), kind: target.kind, aim: art?.aim ?? target.aim, at: this.elapsed,
      stride: art?.stride ?? Math.hypot(velocity.x, velocity.y), pose: art ? art.pose : enemyPose(target, +wasHit),
      poseTime: art?.poseTime ?? this.elapsed, hit: 0,
      knockback: onRay({ x: 0, y: 0 }, heading, Math.min(14, force * 3 / balance[target.kind].mass)) });
    this.audio.play('fall', target.body, this.player);
    if (this.medicalBeam?.target === target) this.medicalBeam = undefined;
    this.enemies.splice(index, 1);
    target.body.destroy();
    this.defeated++;
  }

  private dropMetal(point: Point, heading: number, kind: SpentMetal['kind'], volume = 1) {
    const isCase = kind === 'case';
    const velocity = onRay({ x: 0, y: 0 }, heading, isCase ? 44 + Math.random() * 11 : 12);
    this.spentMetal.push({ ...point, kind, vx: velocity.x, vy: velocity.y, z: isCase ? 8 : 4, vz: isCase ? 58 : 25,
      angle: heading, spin: (isCase ? 1 : -1) * (10 + Math.random() * 7), age: 0, volume });
  }

  private updateBallistics() {
    if (!this.bullets.length && !this.spentMetal.length) return;
    this.bullets = this.bullets.filter(bullet => {
      const step = Math.min(bullet.speed * timestep, bullet.range - bullet.traveled);
      const { travel, target } = this.shotCollision(bullet, bullet.heading, step);
      const point = onRay(bullet, bullet.heading, travel);
      const hit = travel < step;
      if (hit || bullet.traveled + travel >= bullet.range - .01) {
        if (hit) this.impactShot(point, bullet.heading, bullet.impact, target, bullet.lift);
        if (hit || !bullet.expiresClean) this.dropMetal(onRay(point, bullet.heading + Math.PI, 2), bullet.heading + Math.PI * .67, 'slug');
        return false;
      }
      bullet.x = point.x; bullet.y = point.y; bullet.traveled += travel;
      return true;
    });
    const blockers = this.blockerBoxes();
    this.spentMetal = this.spentMetal.filter(piece => {
      piece.age += timestep;
      if (piece.age >= 2.4) return false;
      if (piece.z <= 0 && piece.vz <= 0) return true;
      const step = Math.hypot(piece.vx, piece.vy) * timestep;
      const travel = step > 0 ? rayDistance(piece, piece.vx * timestep / step, piece.vy * timestep / step, step, blockers) : 0;
      if (travel < step) { piece.vx *= -.24; piece.vy *= -.24; }
      else { piece.x += piece.vx * timestep; piece.y += piece.vy * timestep; }
      piece.z += piece.vz * timestep; piece.vz -= 550 * timestep; piece.angle += piece.spin * timestep;
      if (piece.z <= 0) {
        if (piece.kind === 'case') this.audio.play('casing', piece, this.player, piece.volume * (piece.age > .32 ? .36 : 1));
        piece.z = 0;
        piece.vz = piece.vz < -30 ? -piece.vz * .23 : 0;
        piece.vx *= .38; piece.vy *= .38; piece.spin *= .5;
      }
      return true;
    });
  }

  private reload(slot: Slot) {
    const gun = this.guns[slot];
    if (startReload(gun, weapons[gun.weapon], this.actionTime)) gun.reloadStage = 0;
  }

  private reloadProgress(gun: Gun) {
    return gun.reloadAt === undefined ? undefined : Math.min(1, (this.actionTime - gun.reloadAt) / weapons[gun.weapon].reload);
  }

  private requestSwap(to: Slot, force = false) {
    if (!force && (this.swap?.to ?? (this.knifeEquipped ? 'knife' : this.selected)) === to) return;
    this.triggers[to === 'primary' ? 'sidearm' : 'primary'].tapped = false;
    if (this.swap?.from === 'knife') { this.swap.to = to; this.swap.reload = undefined; return; }
    const startedAt = this.slash ? this.slash.startedAt + knife.duration + knife.recovery : this.actionTime;
    this.swap = { from: this.knifeEquipped ? 'knife' : this.selected, to, startedAt };
    this.audio.play('swap', undefined, undefined, .56);
  }

  private advanceWeaponSwap() {
    const swap = this.swap;
    if (!swap || this.actionTime - swap.startedAt + 1e-7 < swapDuration) return;
    this.swap = undefined;
    this.selected = swap.to;
    this.knifeEquipped = false;
    if (swap.reload) this.reload(swap.to);
  }

  private updateGuns(canFire: boolean) {
    for (const slot of slots) {
      const gun = this.guns[slot];
      const progress = this.reloadProgress(gun);
      if (progress !== undefined) {
        while (gun.reloadStage < reloadStages.length && progress >= reloadStages[gun.reloadStage]) {
          if (slot === this.selected && !this.activeChallenge) this.audio.reload(gun.reloadStage, gun.weapon !== 'scout');
          gun.reloadStage++;
        }
        if (progress >= 1) finishReload(gun, weapons[gun.weapon]);
      }
    }
    if (!canFire || this.swap || this.knifeEquipped) { this.medicalBeam = undefined; this.medicalWaver = undefined; return; }
    const slot = this.selected;
    const gun = this.guns[slot], trigger = this.triggers[slot];
    const firing = trigger.held || trigger.tapped;
    trigger.tapped = false;
    if (gun.weapon === 'medical') { this.updateMedical(gun, firing); return; }
    this.medicalBeam = undefined; this.medicalWaver = undefined;
    if (!firing || gun.reloadAt !== undefined || this.actionTime - gun.firedAt < weapons[gun.weapon].interval) return;
    if (gun.ammo) this.shoot(gun);
    else this.reload(slot);
  }

  private updateMedical(gun: Gun, firing: boolean) {
    if (!firing || gun.reloadAt !== undefined) { this.medicalBeam = undefined; this.medicalWaver = undefined; return; }
    const stats = weapons.medical;
    const blockers = this.blockerBoxes();
    this.medicalWaver ??= dispersedHeading(0, stats.accuracy);
    const heading = this.facing + this.medicalWaver;
    const score = (body: Point) => {
      const reach = distance(this.player, body);
      const angle = Math.atan2(body.y - this.player.y, body.x - this.player.x);
      const difference = Math.abs(Math.atan2(Math.sin(angle - heading), Math.cos(angle - heading)));
      if (reach > stats.range || difference > medical.aimCone || rayDistance(this.player, Math.cos(angle), Math.sin(angle), reach, blockers) < reach) return Infinity;
      return difference * 75 + reach * .23;
    };
    const eligible = (hp: number, statuses: Statuses) => hp > 0 && (hp < balance.player.health || activeStatuses(statuses, this.elapsed).length > 0);
    const selfAim = distance(this.aimPoint(), { x: this.player.x, y: this.player.y - 12 }) <= medical.selfRadius;
    const ally = [this.ally, this.trainingDummy].filter((unit): unit is Ally | TrainingDummy =>
      !!unit && eligible(unit.hp, unit.statuses) && score(unit.body) < Infinity).sort((a, b) => score(a.body) - score(b.body))[0];
    if (selfAim) this.medicalBeam = eligible(this.hp, this.playerStatuses) ? { target: 'self', enemy: false } : undefined;
    else if (ally) {
      this.medicalBeam = { target: ally, enemy: false };
    } else {
      let best: Enemy | undefined;
      let limit = Infinity;
      for (const enemy of this.enemies) {
        const candidate = score(enemy.body) - (this.medicalBeam?.target === enemy ? 8 : 0);
        if (candidate < limit) { best = enemy; limit = candidate; }
      }
      this.medicalBeam = best ? { target: best, enemy: true } : undefined;
    }
    const beam = this.medicalBeam;
    if (!beam) return;
    if (!gun.ammo) { this.medicalBeam = undefined; this.reload(this.selected); return; }
    if (this.actionTime - gun.firedAt + 1e-7 < stats.interval) return;
    gun.firedAt = this.actionTime; gun.ammo--;
    const { target } = beam;
    const body = target === 'self' ? this.player : target.body;
    const statuses = target === 'self' ? this.playerStatuses : target.statuses;
    if (target === 'self') { this.hp = Math.min(balance.player.health, this.hp + medical.heal); this.showHealthBar(); }
    else if ('medicSlow' in target) {
      if (Math.random() < medical.slowChance) target.medicSlow = this.elapsed + medical.slowDuration;
    }
    else target.hp = Math.min(balance.player.health, target.hp + medical.heal);
    shortenStatuses(statuses, this.elapsed, medical.cleanse);
    const art = gunArt.medical;
    const bob = Math.hypot(this.player.getVelocity().x, this.player.getVelocity().y) > .17 ? Math.sin(this.elapsed * 17) * .85 : 0;
    const pose = heldPose(this.player, this.facing, gun.weapon, 0, 0, 1, bob);
    this.muzzleLights.push({ origin: pose.ground, point: pose.muzzle, emitter: { x: this.player.x, y: this.player.y }, heading: this.facing,
      life: art.duration, duration: art.duration, strength: art.flash, color: art.glow, wide: false, gun });
    this.burst({ x: body.x, y: body.y - 12 }, stats.color, 5);
    this.audio.play('medicalPulse', body, this.player, .65);
  }

  private resetDummy() {
    const dummy = this.trainingDummy;
    if (!dummy) return;
    dummy.hp = 50; dummy.statuses = {};
    applyStatus(dummy.statuses, 'poison', 1, this.elapsed);
  }

  private interact() {
    const option = this.selection();
    if (option?.kind === 'dummy') { this.resetDummy(); this.audio.play('swap'); }
    if (option?.kind === 'resident' && this.resident) {
      if (this.resident.state === 'waiting') {
        this.resident.state = 'sheltered';
        this.showNotice('주민 · 비상 승강기가 멈췄어요. 동쪽 배전실에서 전력을 돌릴 수 있어요.');
      } else if (this.resident.state === 'ready') {
        this.resident.state = 'following';
        this.showNotice('파루미 · 주황색 비상등을 따라 함께 승강기까지 가요.');
      }
      this.audio.play('swap');
    }
    if (option?.kind === 'relay') {
      this.relayPuzzle ??= this.stage.id === '1-1' ? piecePuzzle(this.texture('relay-puzzle'), balance.relay.puzzleSize, '발전기 · 회로 복구') : powerTransfer();
      this.activeChallenge = {
        game: this.relayPuzzle, location: option.point, reach: balance.relay.radius + 35,
        solve: () => {
          if (this.stage.id === '1-1') this.phase = 'defense';
          else if (this.resident?.state === 'sheltered' && 'alertReinforcements' in this.stage) {
            this.resident.state = 'ready';
            this.openGate();
            this.showNotice('파루미 · 비상 전력이 들어왔어요. 주민을 데리러 돌아가세요.');
            this.audio.play('turretDetect', option.point, this.player, .7, .76);
            this.callReinforcements(this.stage.alertReinforcements);
          }
          this.audio.play('power');
        },
      };
      this.mapMode = 'off';
      this.slash = undefined;
      this.stopFiring();
      this.audio.play('swap');
    }
    if (option?.kind === 'supply') {
      this.hp = Math.min(balance.player.health, this.hp + 35);
      this.showHealthBar();
      for (const gun of Object.values(this.guns)) refillMagazine(gun, weapons[gun.weapon]);
      this.support.refill();
      this.supplies.delete(option.point); this.audio.play('swap');
    }
    if (option?.kind === 'weapon') {
      const pickup = option.point;
      const previous = this.guns.primary;
      previous.reloadAt = undefined;
      pickup.gun.reloadAt = undefined;
      this.guns.primary = pickup.gun;
      pickup.gun = previous;
      this.stopFiring();
      this.requestSwap('primary', true);
    }
  }

  private selection(): StageInteraction | undefined {
    if (this.controlsLocked || this.finished()) return;
    const nearby: StageInteraction[] = [];
    const { relayAccess } = this.stage;
    if (this.phase === 'approach' && (this.stage.id === '1-1' || this.resident?.state === 'sheltered') &&
      distance(this.player, relayAccess) < balance.relay.radius) nearby.push({ kind: 'relay', point: relayAccess });
    const resident = this.resident;
    if (resident && (resident.state === 'waiting' || resident.state === 'ready') && distance(this.player, resident.body) < 37) {
      nearby.push({ kind: 'resident', point: resident.body });
    }
    for (const point of this.groundArms) if (distance(this.player, point) < 31) nearby.push({ kind: 'weapon', point });
    for (const point of this.supplies) if (distance(this.player, point) < 31) nearby.push({ kind: 'supply', point });
    if (this.support.turret && distance(this.player, this.support.turret) < 35) nearby.push({ kind: 'turret', point: this.support.turret });
    if (this.trainingDummy && distance(this.player, this.trainingDummy.body) < 33) nearby.push({ kind: 'dummy', point: this.trainingDummy.body });
    return nearby.sort((a, b) => distance(this.player, a.point) - distance(this.player, b.point))[0];
  }

  private burst(point: Point, color: string, count: number) {
    for (let i = 0; i < count; i++) {
      const velocity = onRay({ x: 0, y: 0 }, Math.random() * TAU, 10 + Math.random() * 58);
      this.sparks.push({ x: point.x, y: point.y, vx: velocity.x, vy: velocity.y, life: .16 + Math.random() * .4, color });
    }
  }

  private showHealthBar() {
    this.healthBar?.remove();
    this.healthBar = this.time.delayedCall(1000, () => { this.healthBar = undefined; });
  }

  private takeHit(kind: EnemyKind, heading: number, target: Victim = this.player, multiplier = 1, strong = false) {
    if ('kind' in target) {
      const hit = this.support.hit(target, this.elapsed, balance[kind].damage * multiplier);
      if (!hit) return;
      this.burst({ x: target.x, y: target.y - 15 }, '#ffbc88', 8);
      this.audio.play('hit', target, this.player, deviceVolume);
      if (hit === 'recalled') this.playDeviceRecall(target);
      return;
    }
    const ally = this.ally?.body === target ? this.ally : undefined;
    if (this.elapsed < (ally?.invulnerableUntil ?? this.invulnerableUntil)) return;
    const stats = balance[kind];
    const hp = Math.max(0, (ally?.hp ?? this.hp) - stats.damage * multiplier);
    const statuses = ally?.statuses ?? this.playerStatuses;
    if (hp > 0) rollCombatStatus(statuses, kind, this.elapsed, strong);
    if (ally) { ally.hp = hp; ally.invulnerableUntil = this.elapsed + .52; }
    else {
      this.hp = hp;
      this.lastHit = { time: this.time.now, heading, healthFraction: hp / balance.player.health };
      this.showHealthBar();
      this.invulnerableUntil = this.elapsed + .52;
      if (this.roll?.stage === 'moving') this.recoverRoll(this.roll.heading);
    }
    this.impulse(target, heading, stats.impulse, balance.player.mass);
    this.audio.play('hurt', target, this.player); this.burst(target, '#ff9f7e', 9);
    if (!this.hp) this.complete('defeated');
  }

  private playerActionStep() {
    const hp = tickStatuses(this.playerStatuses, this.elapsed, this.hp, balance.player.health);
    if (hp < this.hp) { this.hp = hp; this.showHealthBar(); }
    if (!this.hp) { this.complete('defeated'); return; }
    const mods = statusModifiers(this.playerStatuses, this.elapsed);
    if (mods.attackBlock && slots.some(slot => this.triggers[slot].held || this.triggers[slot].tapped)) this.denyAction(mods.attackBlock);
    if (mods.supportBlock && this.turretDeploy && this.keyboard.Q.isDown) this.denyAction(mods.supportBlock);
    if (mods.stunned) {
      this.closeChallenge(); this.swap = undefined; this.turretDeploy = undefined; this.turretHold = 0;
      for (const gun of Object.values(this.guns)) gun.reloadAt = undefined;
    }
    if (!mods.attack) { this.slash = undefined; this.medicalBeam = undefined; this.stopFiring(); }
    if (!mods.roll) this.roll = undefined;
    this.actionTime += timestep * mods.speed;
    return mods;
  }

  private advanceAlly(blockers: Box[]) {
    const ally = this.ally;
    if (!ally) return;
    ally.hp = tickStatuses(ally.statuses, this.elapsed, ally.hp, balance.player.health);
    const speed = statusModifiers(ally.statuses, this.elapsed).speed;
    const reach = distance(this.player, ally.body);
    if (!ally.hp || !speed || reach < 47) { this.steer(ally.body, ally.aim, 0, .32); return; }
    const heading = Math.atan2(this.player.y - ally.body.y, this.player.x - ally.body.x);
    for (const turn of [0, .83, -.83, 1.4, -1.4]) {
      const angle = heading + turn;
      if (rayDistance(ally.body, Math.cos(angle), Math.sin(angle), 20, blockers) < 19) continue;
      ally.aim = angle; this.steer(ally.body, angle, balance.player.speed * 1.17 * speed, .26); break;
    }
  }

  private enemyTarget(enemy: Enemy, blockers: Box[], aggro: number): Victim {
    let best: Victim = this.player, limit = Infinity;
    const options = [this.player, this.ally && this.ally.hp > 0 ? this.ally.body : undefined, this.support.turret, this.support.drone];
    for (const target of options) {
      if (!target) continue;
      const from = enemy.body, reach = distance(from, target);
      if (reach > aggro) continue;
      const sight = openPath(from, target, blockers);
      const device = 'kind' in target;
      if (device && !sight) continue;
      const score = reach + (device ? 70 : 0) + (sight ? 0 : 88);
      if (score < limit) { best = target; limit = score; }
    }
    return best;
  }

  private advanceEnemy(enemy: Enemy, blockers: Box[]) {
    const { body, kind } = enemy;
    const stats = balance[kind];
    enemy.hp = tickStatuses(enemy.statuses, this.elapsed, enemy.hp, stats.health);
    if (!enemy.hp) { this.defeatEnemy(enemy, enemy.aim); return; }
    const effects = statusModifiers(enemy.statuses, this.elapsed);
    enemy.clock += timestep * effects.speed;
    const slowing = this.elapsed < enemy.medicSlow ? medical.slow : 1;
    if (!effects.attack && enemy.state !== 'chase') {
      enemy.state = 'chase'; enemy.attackAt = enemy.clock + .55;
    }
    if (effects.stunned) { this.steer(body, enemy.aim, 0, .76); return; }
    const time = enemy.clock;
    const aggroRange = this.aggroRange();
    const pursuitRange = aggroRange + (enemy.pursuing ? encounterRange.pursuitBuffer : 0);
    const target = this.enemyTarget(enemy, blockers, pursuitRange);
    const separation = distance(target, body);
    if (separation > pursuitRange && enemy.state === 'chase') {
      enemy.pursuing = false;
      enemy.waypoint = undefined;
      return;
    }
    if (separation <= aggroRange) enemy.pursuing = true;
    const range = ('kind' in target ? supportSpecs[target.kind].radius : balance.player.radius) + stats.radius;
    const heading = Math.atan2(target.y - body.y, target.x - body.x);
    const sight = openPath(body, target, blockers);
    const attack = kind === 'mite' ? undefined : balance.attacks[kind];
    if (enemy.state === 'windup' && attack && time >= enemy.stateUntil) {
      if (attack.style === 'dash') {
        enemy.state = 'dash'; enemy.stateUntil = time + attack.duration;
        this.audio.play('dash', body, this.player);
      } else {
        if (attack.style === 'shot' && (kind === 'scout' || kind === 'sentinel')) {
          const pose = this.renderOutpost.enemyMuzzle(body, kind, enemy.aim);
          const targetPoint = onRay(body, enemy.aim, attack.range);
          const axis = Math.atan2(targetPoint.y - pose.ground.y, targetPoint.x - pose.ground.x);
          const reach = distance(body, pose.ground);
          const muzzleAxis = Math.atan2(pose.ground.y - body.y, pose.ground.x - body.x);
          const clear = rayDistance(body, Math.cos(muzzleAxis), Math.sin(muzzleAxis), reach, blockers);
          const blocked = clear < reach - .01;
          const point = blocked ? onRay(body, muzzleAxis, clear) : pose.ground;
          for (const offset of attack.spread) {
            if (blocked) break;
            const aim = dispersedHeading(axis, attack.accuracy) + offset;
            this.bolts.push({ ...point, heading: aim, lift: pose.lift,
              source: enemy, color: enemyColors[kind], speed: attack.speed, left: attack.range + 78 });
          }
          enemy.shotUntil = enemy.clock + .12;
          this.muzzleLights.push({ origin: point, point: pose.muzzle, emitter: { x: body.x, y: body.y }, heading: enemy.aim, life: .085, duration: .085,
            strength: .35, color: kind === 'scout' ? '255,168,139' : '201,240,148', wide: false });
          this.audio.play('bolt', body, this.player, .65);
        } else if (attack.style === 'burst') {
          this.rings.push({ x: body.x, y: body.y, radius: attack.radius, life: .4 });
          this.burst(body, enemyColors[kind], 21);
          if (sight && separation <= attack.radius) this.takeHit(kind, heading, target, effects.outgoing, separation <= 27);
          this.audio.play('burst', body, this.player);
        }
        enemy.state = 'recover'; enemy.stateUntil = time + attack.recovery;
      }
    } else if (enemy.state === 'recover' && time >= enemy.stateUntil) {
      enemy.state = 'chase'; enemy.attackAt = time + .55;
    }
    if (enemy.state === 'dash' && attack?.style === 'dash') {
      const clear = rayDistance(body, Math.cos(enemy.aim), Math.sin(enemy.aim), stats.radius + attack.speed + 2, blockers);
      if (sight && separation <= range + 6) this.takeHit(kind, enemy.aim, target, effects.outgoing);
      if (time >= enemy.stateUntil || clear < stats.radius + attack.speed + 1 || (sight && separation <= range + 6)) {
        enemy.state = 'recover'; enemy.stateUntil = time + attack.recovery;
      } else {
        this.steer(body, enemy.aim, attack.speed * effects.speed * slowing, .39);
        return;
      }
    }
    if (enemy.state !== 'chase') { this.steer(body, enemy.aim, 0, .26); return; }
    if (effects.attack && attack && sight && separation < attack.range && time > enemy.attackAt) {
      enemy.aim = heading; enemy.state = 'windup'; enemy.stateUntil = time + attack.windup;
      this.audio.play('warning', body, this.player, .72);
      return;
    }
    if (effects.attack && !attack && sight && separation <= range + 3 && enemy.attackAt < time) {
      this.takeHit(kind, heading, target, effects.outgoing);
      enemy.attackAt = time + .72;
    }
    if (this.elapsed < enemy.hitUntil || separation > pursuitRange) return;
    const retreat = attack?.style === 'shot' && sight && separation < attack.keepDistance;
    if (attack?.style === 'shot' && sight && !retreat && separation < attack.range) return;
    if (sight && openPath(body, target, blockers, stats.radius * .6)) enemy.waypoint = undefined;
    else if (!enemy.waypoint || distance(body, enemy.waypoint) < 6 || !openPath(body, enemy.waypoint, blockers, stats.radius * .45)) {
      enemy.waypoint = this.enemyFlow.waypoint(body, blockers, stats.radius);
    }
    const direction = enemy.waypoint && !retreat ? Math.atan2(enemy.waypoint.y - body.y, enemy.waypoint.x - body.x) : heading;
    const steeringAngles = [0, .67, -.67, 1.26, -1.26];
    for (const turn of steeringAngles) {
      const angle = direction + (retreat ? Math.PI : 0) + turn;
      if (rayDistance(body, Math.cos(angle), Math.sin(angle), stats.radius + 11, blockers) < stats.radius + 9) continue;
      enemy.aim = retreat ? heading : angle; this.steer(body, angle, stats.speed * effects.speed * slowing, .18); break;
    }
  }

  private advanceBolts(blockers: Box[]) {
    this.bolts = this.bolts.filter(bolt => {
      const step = Math.min(bolt.left, bolt.speed * timestep);
      const dx = Math.cos(bolt.heading), dy = Math.sin(bolt.heading);
      const wall = rayDistance(bolt, dx, dy, step, blockers);
      const targets = [this.player, this.ally && this.ally.hp > 0 ? this.ally.body : undefined, this.support.turret, this.support.drone];
      let struck: Victim | undefined, nearest = wall;
      for (const target of targets) {
        if (!target) continue;
        const radius = ('kind' in target ? supportSpecs[target.kind].radius : balance.player.radius) + 2;
        const offset = { x: target.x - bolt.x, y: target.y - bolt.y };
        const projected = offset.x * dx + offset.y * dy;
        const normal = offset.x * dy - offset.y * dx;
        if (Math.abs(normal) >= radius || projected < -radius) continue;
        const reach = Math.sqrt(radius ** 2 - normal ** 2);
        const entry = Math.max(0, projected - reach);
        if (projected + reach >= 0 && (entry < nearest || !struck && entry === nearest)) { struck = target; nearest = entry; }
      }
      if (struck) {
        this.takeHit(bolt.source.kind, bolt.heading, struck, statusModifiers(bolt.source.statuses, this.elapsed).outgoing,
          distance(bolt.source.lastArt ?? bolt, struck) < 55);
        return false;
      }
      if (wall < step || bolt.left <= step) {
        this.burst(onRay(bolt, bolt.heading, wall), bolt.color, 5);
        return false;
      }
      bolt.x += dx * step; bolt.y += dy * step; bolt.left -= step;
      return true;
    });
  }

  private complete(phase: 'cleared' | 'defeated') {
    this.phase = phase; this.closeChallenge(); this.mapMode = 'off';
    this.rollRequested = false;
    this.audio.end();
    this.audio.play(phase === 'cleared' ? 'win' : 'loss');
  }

  private openGate() {
    if (this.securityGate) this.matter.world.remove(this.securityGate);
    this.securityGate = undefined; this.phase = 'evacuate'; this.gateOpenedAt = this.elapsed; this.audio.play('gate');
  }

  private descend() {
    this.previousStage = { time: this.elapsed, kills: this.defeated };
    this.stage = observatoryStage;
    this.showIntro = this.transitioning = true;
    this.scene.restart();
  }

  private updateRelay() {
    const { relayAccess, lift } = this.stage;
    if (this.phase === 'defense') {
      if (distance(this.player, relayAccess) <= balance.relay.defenseRadius) this.relayTime += timestep;
      const wave = waves[this.wave];
      if (wave && this.relayTime >= wave.at) {
        this.callReinforcements(wave.kinds);
        this.wave++;
      }
      if (this.relayTime >= balance.relay.duration) this.openGate();
    }
    if (this.phase !== 'evacuate' || distance(this.player, lift) >= 23) return;
    if (this.stage.id === '1-1') this.descend();
    else if (this.resident?.state === 'following' && distance(this.resident.body, lift) < 37) {
      this.complete('cleared');
    }
  }

  private aggroRange() { return this.phase === 'approach' ? encounterRange.approach : encounterRange.alert; }

  private callReinforcements(kinds: readonly EnemyKind[]) {
    this.pendingReinforcements.push(...kinds);
    this.nextReinforcementsAt = this.elapsed;
  }

  private reinforce(blockers: Box[]) {
    const walls = this.walls();
    this.enemyFlow.update(this.player, !!this.securityGate, walls);
    if (this.elapsed < this.nextReinforcementsAt) return;
    const table = encounters[this.stage.id];
    const camera = this.displayCamera();
    const lampReach = rayDistance(this.player, Math.cos(this.facing), Math.sin(this.facing), 8, blockers);
    const lamp = onRay(this.player, this.facing, Math.max(0, lampReach - .15));
    const flares = this.support.flares.map(flare => flarePoseAt(flare, this.elapsed).base);
    const lit = (point: Point) =>
      this.flashlightOn && flashlightLevel(lamp, this.facing, point) > .02 && openPath(lamp, point, blockers) ||
      flares.some(flare => distance(flare, point) < supportSpecs.flare.radius && openPath(flare, point, blockers)) ||
      this.traces.some(trace => distanceToLight(point, trace.from, trace.to) < 19 && openPath(trace.from, point, blockers));
    const hidden = (point: Point) => concealed(point, camera, this.player, blockers, lit);

    this.enemies = this.enemies.filter(enemy => {
      if (!enemy.reinforcement || distance(enemy.body, this.player) < encounterRange.retire || !hidden(enemy.body) ||
        this.resident?.state === 'following' && distance(enemy.body, this.resident.body) < encounterRange.approach) return true;
      if (this.medicalBeam?.target === enemy) this.medicalBeam = undefined;
      enemy.body.destroy();
      return false;
    });
    const limit = Math.min(table.cap - this.enemies.length, table.packSize);
    let count = 0;
    for (; count < limit; count++) {
      const pending = this.pendingReinforcements[0];
      const kind = pending ?? table.roster[this.encounterIndex % table.roster.length];
      const radius = balance[kind].radius;
      const site = this.enemyFlow.spawnPoint(this.player, encounterRange.safe, this.aggroRange(), point =>
        (!this.ally || distance(point, this.ally.body) > 80) &&
        (!this.resident || distance(point, this.resident.body) > 104) &&
        this.enemies.every(enemy => distance(point, enemy.body) > radius + balance[enemy.kind].radius + 14) &&
        blockers.every(box => blockerClearance(point, box) > radius + 2) && hidden(point));
      if (!site) break;
      this.spawn(kind, site, true);
      if (pending) this.pendingReinforcements.shift();
      else this.encounterIndex++;
    }
    const interval = this.phase === 'approach' ? table.interval : table.alertInterval;
    this.nextReinforcementsAt = this.elapsed + (count < limit ? .65 : interval);
  }

  private advanceResident(blockers: Box[]) {
    const resident = this.resident;
    if (resident?.state !== 'following') return;
    const { body, trail } = resident;
    const next = { x: this.player.x, y: this.player.y };
    if (!trail.length || distance(trail[trail.length - 1], next) > 13) trail.push(next);
    const openLine = (point: Point) => {
      const span = distance(body, point);
      const direction = Math.atan2(point.y - body.y, point.x - body.x);
      return rayDistance(body, Math.cos(direction), Math.sin(direction), span, blockers) >= span;
    };
    resident.hiding = this.enemies.some(enemy => distance(body, enemy.body) < 67 && openLine(enemy.body));
    resident.moving = false;
    this.previousPositions.set(body, { x: body.x, y: body.y });
    if (resident.hiding) return;
    if (distance(body, next) < 16 && openLine(next)) { trail.length = 0; return; }
    let index = trail.length - 1;
    while (index >= 0 && (distance(body, trail[index]) > 110 || !openLine(trail[index]))) index--;
    if (index < 0) return;
    if (index) trail.splice(0, index);
    const target = trail[0];
    const span = distance(body, target);
    if (span < 3) { trail.shift(); return; }
    const heading = Math.atan2(target.y - body.y, target.x - body.x);
    const step = onRay(body, heading, Math.min(span, 2.9));
    if (!this.stage.walkable(step)) return;
    body.setPosition(step.x, step.y);
    resident.moving = true;
  }

  private simulate() {
    if (this.story || this.transitioning) return;
    this.elapsed += timestep;
    const mods = this.playerActionStep();
    if (!mods) return;
    const actionStep = timestep * mods.speed;
    const key = this.keyboard;
    const cursor = this.aimPoint();
    if (!this.activeChallenge && !this.slash) this.facing = Math.atan2(cursor.y - (this.player.y - 12), cursor.x - this.player.x);
    if (this.activeChallenge && distance(this.player, this.activeChallenge.location) > this.activeChallenge.reach) this.closeChallenge();
    this.updateRelay();
    if (this.finished() || this.transitioning) return;
    this.advanceWeaponSwap();
    this.advanceSlash();
    const x = Number(key.D.isDown || key.RIGHT.isDown) - Number(key.A.isDown || key.LEFT.isDown);
    const y = Number(key.S.isDown || key.DOWN.isDown) - Number(key.W.isDown || key.UP.isDown);
    const moving = !!(x || y);
    const movementBlocked = mods.stunned && !this.mapOpen && moving;
    if (movementBlocked && !this.blockedMovement) this.denyAction('stun');
    this.blockedMovement = movementBlocked;
    if (this.rollRequested && !this.mapOpen && !this.roll && !this.activeChallenge && !this.slash && !this.turretDeploy && moving &&
      !this.denyAction(mods.attackBlock)) this.beginRoll(x, y);
    this.rollRequested = false;
    if (key.E.isDown && this.selection()?.kind === 'turret') {
      this.turretHold += actionStep;
      if (this.turretHold + 1e-7 >= supportSpecs.turret.pickup) {
        this.playDeviceRecall(this.support.recall('turret'));
        this.turretHold = 0;
      }
    } else this.turretHold = 0;
    if (this.turretDeploy) {
      if (!key.Q.isDown || !mods.support || this.controlsLocked || this.support.selected !== 'turret') this.turretDeploy = undefined;
      else {
        this.turretDeploy.time += actionStep;
        if (this.turretDeploy.time + 1e-7 >= supportSpecs.turret.deploy) {
          this.deploySupport(this.turretDeploy);
          this.turretDeploy = undefined;
        }
      }
    }
    const speed = this.controlsLocked || this.turretHold > 0 || this.turretDeploy || this.slash || (!x && !y) ? 0 :
      balance.player.speed * mods.speed;
    const rolling = this.advanceRoll(this.roll?.stage === 'moving' ? this.blockerBoxes() : [], actionStep);
    const steering = this.elapsed + .32 < this.invulnerableUntil ? .075 : this.slash ? 1 : .24;
    if (!rolling) this.steer(this.player, Math.atan2(y, x), speed, steering);

    this.traces = this.traces.filter(trace => (trace.life -= timestep) > 0);
    this.muzzleLights = this.muzzleLights.filter(flash => (flash.life -= timestep) > 0);
    this.sparks = this.sparks.filter(spark => {
      spark.x += spark.vx * timestep; spark.y += spark.vy * timestep;
      return (spark.life -= timestep) > 0;
    });
    this.updateGuns(mods.attack && !this.controlsLocked && !rolling && !this.slash && this.turretHold === 0);
    this.updateBallistics();
    const blockers = this.blockerBoxes();
    this.reinforce(blockers);
    this.support.update(this.elapsed, timestep, this.player, this.enemies.map(enemy => enemy.body), blockers, (kind, unit, heading, shot) => {
      const pose = supportPose(unit, unit.heading, kind, this.elapsed, unit.firedAt);
      const { point, blocked, target } = this.muzzleClearance(unit, pose.ground);
      const impact = mods.outgoing === 1 ? shot.impact : { ...shot.impact, damage: shot.impact.damage * mods.outgoing };
      if (blocked) this.impactShot(point, heading, impact, target, pose.lift);
      else this.fireBullet(point, heading, { ...shot, impact }, pose.lift);
      this.muzzleLights.push({ origin: point, point: pose.muzzle, emitter: { x: unit.x, y: unit.y },
        heading: unit.heading, life: .105, duration: .105, strength: .53, color: '255,210,150', wide: false, ballistic: true });
      this.dropMetal(onRay(unit, heading + Math.PI / 2, 6), heading + 1.05, 'case', deviceVolume);
      this.burst(pose.muzzle, shot.impact.color, 3);
      this.audio.play('scout', unit, this.player, deviceVolume * (kind === 'turret' ? .58 : .42), kind === 'turret' ? .93 : 1.24);
    }, unit => this.audio.play('turretDetect', unit, this.player, deviceVolume * (unit.kind === 'turret' ? 1 : .64)),
    unit => this.playDeviceRecall(unit));
    this.updateFlareBodies();
    const { turret, drone } = this.support;
    this.audio.syncDevices(turret && this.elapsed >= turret.readyAt ? turret : undefined,
      drone && this.elapsed >= drone.readyAt ? drone : undefined, this.player);
    this.advanceBolts(blockers);
    this.advanceAlly(blockers);
    if (this.trainingDummy) this.trainingDummy.hp = tickStatuses(this.trainingDummy.statuses, this.elapsed, this.trainingDummy.hp, balance.player.health);
    this.rings = this.rings.filter(ring => (ring.life -= timestep) > 0);
    this.fallen = this.fallen.filter(enemy => this.elapsed - enemy.at < balance.fallen.duration);
    for (const enemy of [...this.enemies]) {
      if (this.finished()) break;
      this.advanceEnemy(enemy, blockers);
    }
    const before = { x: this.player.x, y: this.player.y };
    this.previousPositions.set(this.player, before);
    if (this.ally) this.previousPositions.set(this.ally.body, { x: this.ally.body.x, y: this.ally.body.y });
    for (const { body } of this.enemies) this.previousPositions.set(body, { x: body.x, y: body.y });
    for (const { body } of this.props) this.previousPositions.set(body, { x: body.x, y: body.y });
    this.matter.world.step(timestep * 1000);
    this.advanceResident(blockers);
    const step = distance(this.player, before);
    if (!rolling && speed && step > .18) {
      this.gaitDistance += step;
      this.walkFrame = Math.floor(this.gaitDistance / 5.2) % 6;
    } else this.walkFrame = undefined;
    this.previousCamera = { ...this.cameraPosition };
    this.follow(.16);
  }

  private updateFlareBodies() {
    for (const [flare, body] of this.flareBodies) {
      if (this.support.flares.includes(flare)) continue;
      body.destroy(); this.flareBodies.delete(flare);
    }
    for (const flare of this.support.flares) {
      if (this.elapsed < flare.litAt || this.flareBodies.has(flare)) continue;
      const body = this.makeBody(flare.to, .14, { type: 'circle', radius: 4.5 });
      const heading = Math.atan2(flare.to.y - flare.from.y, flare.to.x - flare.from.x);
      const velocity = onRay({ x: 0, y: 0 }, heading, 1.5 + Math.min(2.6, distance(flare.from, flare.to) / 95));
      this.matter.body.setInertia(body.body as MatterJS.BodyType, .37);
      body.setFriction(.27, .065, .24).setBounce(.39);
      body.setRotation(heading + .3).setVelocity(velocity.x, velocity.y).setAngularVelocity(.22);
      flare.ground = body;
      this.flareBodies.set(flare, body);
      this.audio.play('casing', body, this.player, .36, .88);
    }
  }

  private paint() {
    if (this.transitioning) return;
    if (this.story) {
      const { gameContext } = this.game.renderer as Phaser.Renderer.Canvas.CanvasRenderer;
      this.story.draw(gameContext, this.hud, this.time.now);
      return;
    }
    const hit = this.hitFeedback();
    const camera = this.displayCamera(hit);
    const props = this.props.map(prop => {
      const point = this.visualPosition(prop.body);
      return { ...point, kind: prop.kind, bounds: boxFor(prop, point),
        health: prop.hp / balance.props[prop.kind].hp, hit: Math.max(0, prop.hitUntil - this.elapsed) };
    });
    const blockers = [...this.walls(), ...props.map(prop => prop.bounds)];
    const warnings: Warning[] = [];
    const actors: ActorArt[] = this.enemies.map(enemy => {
      const { body, aim, state } = enemy;
      const point = this.visualPosition(body);
      const attack = enemy.kind === 'mite' ? undefined : balance.attacks[enemy.kind];
      if (state === 'windup' && attack) {
        const fill = Phaser.Math.Clamp(1 - (enemy.stateUntil - enemy.clock) / attack.windup, 0, 1);
        const color = enemyColors[enemy.kind];
        if (attack.style === 'burst') warnings.push({ from: point, radius: attack.radius, fill, color });
        else {
          const angles = attack.style === 'shot' ? attack.spread : [0];
          for (const offset of angles) {
            const heading = aim + offset;
            const range = rayDistance(point, Math.cos(heading), Math.sin(heading), attack.range + 20, blockers);
            warnings.push({ from: point, to: onRay(point, heading, range), fill, color, wide: attack.style === 'dash' });
          }
        }
      }
      const velocity = body.getVelocity();
      const hit = Math.max(0, enemy.hitUntil - this.elapsed);
      return enemy.lastArt = { ...point, kind: enemy.kind, aim, stride: Math.hypot(velocity.x, velocity.y),
        hit, pose: enemyPose(enemy, hit), poseTime: enemy.clock, statuses: activeStatuses(enemy.statuses, this.elapsed),
        medicSlow: this.elapsed < enemy.medicSlow };
    });
    for (const enemy of this.fallen) {
      const age = this.elapsed - enemy.at;
      const slide = 1 - Math.max(0, 1 - age / balance.fallen.collapse) ** 2;
      actors.push({ kind: enemy.kind, x: enemy.x + enemy.knockback.x * slide, y: enemy.y + enemy.knockback.y * slide,
        aim: enemy.aim, stride: enemy.stride, hit: 0, pose: enemy.pose, poseTime: enemy.poseTime, fallen: age });
    }
    const velocity = this.player.getVelocity();
    const held = this.guns[this.selected];
    const recoil = held.weapon === 'medical' ? 0 : Math.max(0, 1 - (this.actionTime - held.firedAt) / .12);
    const roll = this.roll;
    const rollTime = roll ? this.actionTime - roll.startedAt : 0;
    const rollPose = roll ? {
      heading: roll.heading,
      frame: roll.stage === 'moving' ? Math.min(4, Math.floor(rollTime / this.rollSpec.duration * 5)) : rollTime < this.rollSpec.recovery * .47 ? 4 : 5,
    } : undefined;
    const ally = this.ally;
    const allyArt = ally ? { ...this.visualPosition(ally.body), kind: ally.kind, aim: ally.aim, hp: ally.hp,
      stride: Math.hypot(ally.body.getVelocity().x, ally.body.getVelocity().y), hit: Math.max(0, ally.invulnerableUntil - this.elapsed - .26),
      statuses: activeStatuses(ally.statuses, this.elapsed) } : undefined;
    const training = this.trainingDummy;
    const dummy = training ? { x: training.body.x, y: training.body.y, hp: training.hp, statuses: activeStatuses(training.statuses, this.elapsed) } : undefined;
    const resident = this.resident;
    const beam = this.medicalBeam;
    const turretDeploy = this.turretDeploy;
    this.renderOutpost({
      player: { ...this.visualPosition(this.player), kind: this.explorer, aim: this.facing, hit: Math.max(0, this.invulnerableUntil - this.elapsed - .26),
        stride: Math.hypot(velocity.x, velocity.y), pose: recoil > .4 ? 3 : undefined, statuses: activeStatuses(this.playerStatuses, this.elapsed) },
      actors, props, ally: allyArt, dummy,
      resident: resident ? { ...this.visualPosition(resident.body), state: resident.state, hiding: resident.hiding, moving: resident.moving } : undefined,
      notice: this.notice && this.elapsed < this.notice.until ? this.notice.text : undefined,
      blockers, warnings, aim: this.screenAim(camera), mapMode: this.mapMode, flashlightOn: this.flashlightOn,
      phase: this.phase, hp: this.hp, hitTint: hit?.tint ?? 0, showHealth: !!this.healthBar, roll: rollPose, walkFrame: this.walkFrame,
      blockedStatus: this.blockedStatus, reducedMotion: this.reducedMotion.matches,
      selected: this.selected, guns: this.guns, groundArms: this.groundArms, pointerInside: this.pointerInside, knifeEquipped: this.knifeEquipped,
      swapping: this.swap ? { from: this.swap.from, to: this.swap.to,
        progress: Math.min(1, Math.max(0, (this.actionTime - this.swap.startedAt) / swapDuration)) } : undefined,
      slash: this.slash ? { heading: this.slash.heading, direction: this.slash.direction,
        progress: Math.min(1, (this.actionTime - this.slash.startedAt) / knife.duration),
        settle: Math.max(0, (this.actionTime - this.slash.startedAt - knife.duration) / knife.recovery) } : undefined,
      reload: this.reloadProgress(held),
      gateTravel: this.gateOpenedAt ? Phaser.Math.Clamp((this.elapsed - this.gateOpenedAt) / .36, 0, 1) : 0,
      charge: Math.min(1, this.relayTime / balance.relay.duration),
      time: this.elapsed, sparks: this.sparks, traces: this.traces, selection: this.selection(),
      missionTime: (this.previousStage?.time ?? 0) + this.elapsed, missionKills: (this.previousStage?.kills ?? 0) + this.defeated,
      bullets: this.bullets, spentMetal: this.spentMetal, bolts: this.bolts, rings: this.rings,
      supplies: this.supplies, challenge: this.activeChallenge?.game, support: this.support, turretHold: this.turretHold / supportSpecs.turret.pickup,
      turretDeploy: turretDeploy ? { ...turretSite(this.player, turretDeploy.heading, blockers, turretDeploy.point, this.stage.walkable),
        heading: turretDeploy.heading, progress: turretDeploy.time / supportSpecs.turret.deploy } : undefined,
      medicalBeam: beam ? { point: this.visualPosition(beam.target === 'self' ? this.player : beam.target.body), enemy: beam.enemy, self: beam.target === 'self' } : undefined,
      muzzleLights: this.muzzleLights, actionTime: this.actionTime, lighting: this.lighting, shadowMode: this.shadowMode,
    }, camera, this.pixelStep);
  }

  update(_time: number, delta: number) {
    if (this.story || this.transitioning) return;
    const justDown = Phaser.Input.Keyboard.JustDown;
    if (isPageControl(document.activeElement)) this.clearInput();
    if (this.finished()) {
      if (this.restartRequested || justDown(this.keyboard.ENTER)) {
        if (this.phase === 'cleared') this.startExpedition(this.explorer, this.bringAlly, this.useTrainingDummy);
        else { this.transitioning = true; this.scene.restart(); }
      }
      return;
    }
    const key = this.keyboard;
    const close = justDown(key.ESC), map = justDown(key.TAB), interact = justDown(key.E), reload = justDown(key.R);
    const useSupport = justDown(key.Q), swing = justDown(key.ALT), toggleLight = justDown(key.F);
    const mods = statusModifiers(this.playerStatuses, this.elapsed);
    if (toggleLight && !mods.stunned) this.flashlightOn = !this.flashlightOn;
    const choice = [key.ONE, key.TWO, key.THREE].map(justDown).findIndex(pressed => pressed);
    if (this.activeChallenge) {
      if (close) this.closeChallenge();
    } else {
      if (map) {
        this.mapMode = this.mapMode === 'off' ? 'panel' : this.mapMode === 'panel' ? 'overlay' : 'off';
        if (this.mapOpen) this.stopFiring();
      }
      if (!this.mapOpen && !this.roll && mods.stunned) {
        if (useSupport || swing || reload || interact || toggleLight) this.denyAction('stun');
      } else if (!this.controlsLocked) {
        if (interact) this.interact();
        if (!this.activeChallenge) {
          if (choice >= 0) this.support.selected = supportKinds[choice];
          if (useSupport && !this.denyAction(mods.supportBlock)) {
            if (this.support.selected === 'turret' && !this.support.turret && this.support.chargeRatio('turret')) {
              this.turretDeploy = { heading: this.facing, time: 0,
                point: turretSite(this.player, this.facing, this.blockerBoxes(), undefined, this.stage.walkable).point };
              this.player.setVelocity(0, 0);
            } else this.deploySupport();
          }
          if (swing && !this.denyAction(mods.attackBlock) && !this.slash) this.swingKnife();
          if (reload) {
            if (this.knifeEquipped) this.requestSwap(this.swap?.to ?? this.selected);
            if (this.swap) this.swap.reload = true;
            else this.reload(this.selected);
          }
        }
      }
    }
    this.accumulator += Math.min(.05, delta / 1000);
    while (this.accumulator >= timestep && !this.finished() && !this.transitioning) {
      this.simulate();
      this.accumulator -= timestep;
    }
  }

  private deploySupport(planned?: NonNullable<OutpostScene['turretDeploy']>) {
    const target = this.aimPoint();
    const heading = planned?.heading ?? Math.atan2(target.y - this.player.y, target.x - this.player.x);
    const kind = this.support.selected;
    const prior = kind === 'flare' ? undefined : this.support[kind];
    const placed = this.support.use(this.player, target, heading, this.blockerBoxes(), this.elapsed, planned?.point);
    if (!placed) this.audio.play('casing', this.player, this.player, .37);
    else if (kind === 'flare') this.audio.play('flareThrow', this.player, this.player, deviceVolume);
    else {
      const unit = this.support[kind];
      this.audio.devicePower(kind, !!unit, unit ?? prior ?? this.player, this.player);
    }
  }

  private playDeviceRecall(unit?: Emplacement) {
    if (unit) this.audio.devicePower(unit.kind, false, unit, this.player);
  }

  private swingKnife() {
    const aim = this.aimPoint();
    this.facing = Math.atan2(aim.y - this.player.y, aim.x - this.player.x);
    this.swap = undefined;
    this.knifeEquipped = true;
    const direction = knifeSwingDirection(this.lastSlash, this.elapsed);
    this.lastSlash = { at: this.elapsed, direction };
    this.slash = { heading: this.facing, startedAt: this.actionTime, struck: false, direction };
    this.stopFiring();
    this.audio.play('knifeSwing');
  }
}
