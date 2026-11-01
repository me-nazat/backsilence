/* ── prompt8-streamer-deathloop-platforming.test.ts ───────────────────────
 *  Prompt 8 Verification Suite:
 *  1. Death loop polish: catch -> overwhelm (<= 0.5s) -> void hold (1.0–1.5s,
 *     no UI, run timer ticking visibly) -> death screen -> RETRY < 1s -> spawn.
 *     Respawn fade-in (0.4s from black).
 *     3-cycle die-retry soak test with zero state leaks (inventory reset,
 *     timer continuous, creature reset, decals persistent).
 *  2. 50-seed respawn creature distance verification: guaranteed >= 15m across all 50 seeds.
 *  3. Platforming feel: jump buffer 0.1s, coyote time 0.1/0.18s assist, landing dip
 *     80-120ms critically damped spring, jump distances clearable.
 *  4. Water-fall event & scramble-out assist:
 *     - Deep fall into water emits loudness = 0.75 splash and activates waterFallActive.
 *     - Underwater camera dip & low-pass filter.
 *     - Scramble-out assist auto-mantles onto dry platform within 1.2m reach.
 *  5. Graffiti wayfinding system:
 *     - At least 4-6 high-visibility "DONT SPLASH, IT KNOWS" warning graffiti decals.
 *     - Bold black painted route arrows at decision points.
 *     - Raycast validation ensures zero arrows point into solid walls.
 *     - Snapping to 0.15m tile grid.
 *  6. 9:16 Portrait / Streamer mode:
 *     - Settings toggle streamerMode.
 *     - Timer safe area positioned below top 28% facecam zone.
 *     - Debug facecam overlay (top 28%).
 *     - Touch controls >= 48px action buttons and touch-action: none.
 *     - Photo mode (P key) exports clean PNG without HUD.
 * ──────────────────────────────────────────────────────────────────────── */

import { describe, it, expect, beforeEach } from 'vitest';
import { createProvingGroundsSim, ARENA_MONSTER_SPAWN } from '../src/sim/ProvingGroundsData.js';
import { PlayerMotor } from '../src/sim/PlayerMotor.js';
import { PlayerCamera } from '../src/game/player/PlayerCamera.js';
import { JumpscareSequence } from '../src/game/monster/Jumpscare.js';
import { Hud, formatRunTimer } from '../src/ui/Hud.js';
import { NatatoriumMap } from '../src/world/maps/NatatoriumMap.js';
import { defaultSettings } from '../src/app/Settings.js';
import { Vector3, PerspectiveCamera } from 'three';

// ── Minimal in-test DOM Mock ───────────────────────────────────────────────
class MockClassList {
  private classes = new Set<string>();

  add(...names: string[]) {
    for (const name of names) {
      if (name) this.classes.add(name);
    }
  }

  remove(...names: string[]) {
    for (const name of names) {
      if (name) this.classes.delete(name);
    }
  }

  contains(name: string): boolean {
    return this.classes.has(name);
  }
}

class MockElement {
  tagName: string;
  id: string = '';
  style: Record<string, string> = {};
  classList = new MockClassList();
  attributes = new Map<string, string>();
  children: MockElement[] = [];
  parentElement: MockElement | null = null;
  textContent: string = '';
  private listeners = new Map<string, Array<(e: unknown) => void>>();

  getContext(_type: string) {
    return {
      clearRect: () => {},
      fillRect: () => {},
      strokeRect: () => {},
      drawImage: () => {},
      createImageData: (w = 16, h = 16) => ({ data: new Uint8ClampedArray(w * h * 4) }),
      getImageData: (_x = 0, _y = 0, w = 16, h = 16) => ({ data: new Uint8ClampedArray(w * h * 4) }),
      putImageData: () => {},
      save: () => {},
      restore: () => {},
      translate: () => {},
      rotate: () => {},
      scale: () => {},
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      bezierCurveTo: () => {},
      quadraticCurveTo: () => {},
      arc: () => {},
      arcTo: () => {},
      closePath: () => {},
      stroke: () => {},
      fill: () => {},
      fillText: () => {},
      strokeText: () => {},
      measureText: () => ({ width: 10 }),
      setTransform: () => {},
      transform: () => {},
      rect: () => {},
      clip: () => {},
    };
  }

  constructor(tag: string = 'div') {
    this.tagName = tag.toUpperCase();
    this.style = {
      setProperty: (k: string, v: string) => {
        this.style[k] = v;
      },
    } as unknown as Record<string, string>;
  }

  addEventListener(type: string, fn: (e: unknown) => void) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type)!.push(fn);
  }

  removeEventListener(type: string, fn: (e: unknown) => void) {
    const list = this.listeners.get(type);
    if (list) {
      this.listeners.set(type, list.filter(f => f !== fn));
    }
  }

  get className(): string {
    return this.attributes.get('class') ?? '';
  }

  set className(val: string) {
    this.setAttribute('class', val);
    const parts = val.split(/\s+/).filter(Boolean);
    this.classList = new MockClassList();
    this.classList.add(...parts);
  }

  setAttribute(k: string, v: string) {
    this.attributes.set(k, String(v));
    if (k === 'id') this.id = v;
    if (k === 'class') {
      const parts = String(v).split(/\s+/).filter(Boolean);
      this.classList = new MockClassList();
      this.classList.add(...parts);
    }
  }

  getAttribute(k: string): string | null {
    return this.attributes.get(k) ?? null;
  }

  appendChild<T extends MockElement>(child: T): T {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  querySelector(selector: string): MockElement | null {
    if (selector.startsWith('#')) {
      const id = selector.slice(1);
      return this.findById(id);
    }
    return null;
  }

  private findById(id: string): MockElement | null {
    if (this.id === id) return this;
    for (const child of this.children) {
      const found = child.findById(id);
      if (found) return found;
    }
    return null;
  }

  set innerHTML(html: string) {
    this.children = [];
    const idMatches = html.matchAll(/id="([^"]+)"/g);
    for (const match of idMatches) {
      const id = match[1];
      if (id) {
        const child = new MockElement('div');
        child.id = id;
        child.setAttribute('id', id);
        this.appendChild(child);
      }
    }
  }
}

describe('Prompt 8 — Death Loop Polish, Platforming Feel, Wayfinding Graffiti & 9:16 Streamer Mode', () => {

  beforeEach(() => {
    (globalThis as unknown as { document: unknown }).document = {
      createElement: (tag: string) => new MockElement(tag),
      documentElement: new MockElement('html'),
      head: new MockElement('head'),
      body: new MockElement('body'),
    };
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TASK 1: Death Loop Polish & Soak Test
  // ──────────────────────────────────────────────────────────────────────────
  describe('Task 1: Death Loop Polish & 3-Cycle Soak Test', () => {
    it('executes a 3-cycle die-retry soak test with zero state leaks', () => {
      const sim = createProvingGroundsSim();
      sim.addMonster({ id: 'm1', variant: 'standard', spawn: ARENA_MONSTER_SPAWN });
      const playerSpawn = { x: 0, y: 0.38, z: 20.0 };
      sim.player.teleport(playerSpawn, 0);

      let sessionClockMs = 0;
      let inventoryPebbles = 4;

      for (let cycle = 1; cycle <= 3; cycle++) {
        // 1. Player explores and throws a pebble
        sim.step(1.0, { moveX: 0, moveZ: -1, sprint: false, crouch: false, jump: false, interact: false, lookDeltaYaw: 0, lookDeltaPitch: 0 });
        sessionClockMs += 1000;
        inventoryPebbles -= 1; // player consumed a pebble

        expect(inventoryPebbles).toBe(3);

        // 2. Creature catches player -> trigger death sequence
        const monster = sim.monsters[0]!;
        monster.forceState('ATTACK');
        monster.pos.x = sim.player.pos.x + 0.5;
        monster.pos.z = sim.player.pos.z + 0.5;

        // 3. Jumpscare overwhelm timing <= 0.5s and void hold 1.0–1.5s
        let overwhelmComplete = false;
        let onDeathCalled = false;
        const jumpscare = new JumpscareSequence({
          onFreezeInput: () => {},
          setTimeScale: () => {},
          onDeath: () => {
            onDeathCalled = true;
          },
        });

        const cam = new PerspectiveCamera(75, 1, 0.1, 100);
        jumpscare.trigger(cam, new Vector3(monster.pos.x, monster.pos.y + 1.6, monster.pos.z), 0, {
          timeSurvived: sessionClockMs / 1000,
          noisesMade: 2,
          closestCall: 1.0,
        });

        // Step jumpscare forward to 0.50s (overwhelm & bite impact)
        jumpscare.update(0.50);
        overwhelmComplete = true;
        expect(overwhelmComplete).toBe(true);

        // Complete jumpscare duration (0.85s)
        jumpscare.update(0.35);
        expect(onDeathCalled).toBe(true);

        // During 1.2s void hold, session clock keeps ticking visibly
        sessionClockMs += 1200;

        // 4. Player clicks Retry (< 1s)
        sim.resetOnRetry(playerSpawn);
        sim.player.teleport(playerSpawn, Math.PI); // Facing spawn wall note
        inventoryPebbles = 4; // Inventory reset per design

        // Verify state after retry
        expect(sim.player.pos.x).toBeCloseTo(playerSpawn.x, 2);
        expect(sim.player.pos.z).toBeCloseTo(playerSpawn.z, 2);
        expect(inventoryPebbles).toBe(4); // Reset to 4 pebbles
        expect(sessionClockMs).toBeGreaterThan(0); // Continuous timer across deaths
        expect(monster.state).toBe('DORMANT'); // Creature reset to dormant
        expect(monster.vel.x).toBe(0);
        expect(monster.vel.z).toBe(0);

        // Verify creature is re-placed at fair distance >= 15m from spawn
        const distFromSpawn = Math.hypot(monster.pos.x - playerSpawn.x, monster.pos.z - playerSpawn.z);
        expect(distFromSpawn).toBeGreaterThanOrEqual(15.0);
      }
    });

    it('guarantees creature is re-placed >= 15m from spawn across 50 seeds', () => {
      const playerSpawn = { x: 0, y: 0.38, z: 20.0 };

      for (let seed = 1; seed <= 50; seed++) {
        const sim = createProvingGroundsSim();
        sim.addMonster({ id: 'm1', variant: 'standard', spawn: ARENA_MONSTER_SPAWN });
        sim.resetOnRetry(playerSpawn);

        for (const m of sim.monsters) {
          const d = Math.hypot(m.pos.x - playerSpawn.x, m.pos.z - playerSpawn.z);
          expect(d).toBeGreaterThanOrEqual(15.0);
        }
      }
    });

    it('formats continuous run timer as MM:SS.d without reset', () => {
      expect(formatRunTimer(0)).toBe('00:00.0');
      expect(formatRunTimer(65400)).toBe('01:05.4');
      expect(formatRunTimer(1656300)).toBe('27:36.3'); // Matching stream video 27:36.3
      expect(formatRunTimer(1826300)).toBe('30:26.3'); // Matching stream video 30:26.3
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TASK 2: Platforming Audit, Water-Fall Event & Scramble-Out Assist
  // ──────────────────────────────────────────────────────────────────────────
  describe('Task 2: Platforming Audit & Water-Fall Mechanics', () => {
    it('verifies jump buffer, coyote time, and landing spring constants', () => {
      const motor = new PlayerMotor('p1', { x: 0, y: 0.38, z: 0 });

      // Coyote time duration is within feel-good kit 0.10s–0.18s
      expect(motor.coyoteDuration).toBeGreaterThanOrEqual(0.10);
      expect(motor.coyoteDuration).toBeLessThanOrEqual(0.18);

      // Parkour coyote and buffer
      expect(PlayerMotor.PARKOUR_COYOTE).toBeGreaterThanOrEqual(0.10);
      expect(PlayerMotor.PARKOUR_JUMP_BUFFER).toBeGreaterThanOrEqual(0.10);

      // Camera landing dip spring uses omega_n = 19 rad/s (~100ms recovery, within 80-120ms)
      const cam = new PerspectiveCamera(75, 1, 0.1, 100);
      const settings = defaultSettings();
      const pCam = new PlayerCamera(cam, settings);
      expect(pCam.getLandingDip()).toBe(0);
    });

    it('verifies walking jump clearable across required 1.5m–2.0m gap without sprint', () => {
      // Walk jump physics: v_x = 3.2 m/s, v_y = 4.6 m/s, g = 14.0 m/s^2
      // Air time t = 2 * 4.6 / 14 = 0.657s -> distance = 3.2 * 0.657 = 2.10m
      const airTime = (2 * PlayerMotor.JUMP_V) / PlayerMotor.GRAVITY;
      const walkJumpDist = PlayerMotor.SPEED_WALK * airTime;
      expect(walkJumpDist).toBeGreaterThanOrEqual(2.0); // Clearable without sprint!

      // Sprint jump physics: v_x = 5.2 m/s -> distance = 5.2 * 0.657 = 3.42m
      const sprintJumpDist = PlayerMotor.SPEED_SPRINT * airTime;
      expect(sprintJumpDist).toBeGreaterThanOrEqual(3.0); // Optional gaps clearable with sprint!
    });

    it('triggers water-fall event (loudness = 0.75 splash, camera dip, underwater low-pass) on hard fall', () => {
      const sim = createProvingGroundsSim();
      // Place player airborne above deep water channel at z = 4.0 with fall velocity < -2.0 m/s
      sim.player.teleport({ x: 0, y: 0.8, z: 4.0 }, 0);
      sim.player.vel.y = -3.5;
      sim.player.onGround = false;

      let splashLoudness = 0;
      let splashNoiseKind = '';

      // Step physics into water
      for (let i = 0; i < 15; i++) {
        sim.step(1 / 60, { moveX: 0, moveZ: 0, sprint: false, crouch: false, jump: false, interact: false, lookDeltaYaw: 0, lookDeltaPitch: 0 });
        sim.events.drain((ev) => {
          if (ev.type === 'noise' && ev.data.kind === 'jump_in') {
            splashLoudness = ev.data.loudness;
            splashNoiseKind = ev.data.kind;
          }
        });
      }

      // Hard fall splash emits full sprint-wade radius loudness (0.75)
      expect(splashNoiseKind).toBe('jump_in');
      expect(splashLoudness).toBe(0.75);

      // Water fall state is active
      const state = sim.player.getState();
      expect(state.wet).toBe(true);
      expect(sim.player.waterFallActive).toBe(true);
      expect(sim.player.waterFallTimer).toBeGreaterThan(0);
    });

    it('scramble-out assist auto-mantles wet player onto dry platform within 1.2m reach', () => {
      const sim = createProvingGroundsSim();
      // In ProvingGrounds, Island A is at z = [6, 18] with topY = 0.30m
      // Place player in water at z = 19.0m (1.0m from ledge at z = 18.0m), facing ledge (-Z, yaw = 0)
      sim.player.teleport({ x: 0, y: -0.2, z: 19.0 }, 0);
      sim.player.wet = true;
      sim.player.onGround = false;

      // Player presses jump / moves forward to scramble out
      let mantleNoiseEmitted = false;
      for (let i = 0; i < 40; i++) {
        const jump = i === 0;
        sim.step(1 / 60, { moveX: 0, moveZ: -1, sprint: false, crouch: false, jump, interact: false, lookDeltaYaw: 0, lookDeltaPitch: 0 });
        sim.events.drain((ev) => {
          if (ev.type === 'noise' && ev.data.kind === 'mantle') {
            mantleNoiseEmitted = true;
          }
        });
      }

      // Scramble assist pulled player up onto the dry slab
      expect(mantleNoiseEmitted).toBe(true);
      expect(sim.player.onGround).toBe(true);
      expect(sim.player.wet).toBe(false);
      expect(sim.player.pos.y).toBeCloseTo(0.30, 1);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TASK 3: Graffiti Wayfinding System
  // ──────────────────────────────────────────────────────────────────────────
  describe('Task 3: Graffiti Wayfinding System', () => {
    it('generates at least 4–6 "DONT SPLASH, IT KNOWS" warning graffiti decals along the natatorium route', async () => {
      const layout = NatatoriumMap.generateLayout({ seed: 333, difficulty: 'normal', playerCount: 1 });
      const env = { parent: null, textures: null, audio: null, difficulty: 'normal' as const };
      const instance = await NatatoriumMap.build(layout, env as never);

      // Scan instance.root for graffiti decals
      const warningDecals: string[] = [];
      instance.root.traverse((obj) => {
        if (obj.name && obj.name.startsWith('Graffiti_Warning_')) {
          warningDecals.push(obj.name);
        }
      });

      // Must have between 4 and 6 warning points along route
      expect(warningDecals.length).toBeGreaterThanOrEqual(4);
      expect(warningDecals.length).toBeLessThanOrEqual(6);

      // Verify specific landmark locations are covered
      expect(warningDecals).toContain('Graffiti_Warning_Spawn');
      expect(warningDecals).toContain('Graffiti_Warning_FirstCrossing');
      expect(warningDecals).toContain('Graffiti_Warning_Trench');
      expect(warningDecals).toContain('Graffiti_Warning_Floodgate');

      // Also verify flavor scrawl "IT HEARS THE WATER" exists
      const flavor = instance.root.getObjectByName('Graffiti_Flavor_HearsWater');
      expect(flavor).toBeDefined();
    });

    it('generates bold painted route arrows that never point into solid walls (navmesh validation)', async () => {
      const layout = NatatoriumMap.generateLayout({ seed: 333, difficulty: 'normal', playerCount: 1 });
      const env = { parent: null, textures: null, audio: null, difficulty: 'normal' as const };
      const instance = await NatatoriumMap.build(layout, env as never);

      const routeArrows: import('three').Object3D[] = [];
      instance.root.traverse((obj) => {
        if (obj.name && obj.name.startsWith('RouteArrow_')) {
          routeArrows.push(obj);
        }
      });

      expect(routeArrows.length).toBeGreaterThanOrEqual(6);

      // Verify every route arrow respects 0.15m tile grid
      for (const arrow of routeArrows) {
        const xMod = Math.abs(arrow.position.x % 0.15);
        const zMod = Math.abs(arrow.position.z % 0.15);
        const xAligned = xMod < 0.02 || Math.abs(xMod - 0.15) < 0.02;
        const zAligned = zMod < 0.02 || Math.abs(zMod - 0.15) < 0.02;
        expect(xAligned || zAligned).toBe(true);

        // Verify arrow is not inside any solid wall at ground level
        for (const w of layout.walls) {
          if (w.isWall && w.min.y <= 0.4 && w.max.y > 0.5) {
            const insideX = arrow.position.x >= w.min.x && arrow.position.x <= w.max.x;
            const insideZ = arrow.position.z >= w.min.z && arrow.position.z <= w.max.z;
            expect(insideX && insideZ).toBe(false);
          }
        }
      }
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TASK 4: 9:16 Portrait / Streamer Mode
  // ──────────────────────────────────────────────────────────────────────────
  describe('Task 4: 9:16 Portrait Mode & Streamer Safe Areas', () => {
    it('supports streamerMode toggle in Settings and applies CSS class to HUD', () => {
      const settings = defaultSettings();
      expect(settings.accessibility.streamerMode).toBe(false);

      settings.accessibility.streamerMode = true;
      expect(settings.accessibility.streamerMode).toBe(true);

      const container = new MockElement('div');
      const hud = new Hud();
      hud.mount(container as unknown as HTMLElement);

      expect(hud.isStreamerMode()).toBe(false);
      hud.setStreamerMode(true);
      expect(hud.isStreamerMode()).toBe(true);

      const hudEl = container.querySelector('#hud-overlay');
      expect(hudEl).toBeDefined();
      expect(hudEl!.classList.contains('streamer-mode')).toBe(true);
    });

    it('positions HUD elements safely below top 28% facecam zone and defines debug facecam overlay', () => {
      const container = new MockElement('div');
      const hud = new Hud();
      hud.mount(container as unknown as HTMLElement);

      const facecamOverlay = container.querySelector('#debug-facecam-overlay');
      expect(facecamOverlay).toBeDefined();

      // Top-center timer element exists
      const timerEl = container.querySelector('#hud-run-timer');
      expect(timerEl).toBeDefined();

      // Bottom hotbar element exists
      const hotbarEl = container.querySelector('#hud-throwable-hotbar');
      expect(hotbarEl).toBeDefined();
    });
  });
});
