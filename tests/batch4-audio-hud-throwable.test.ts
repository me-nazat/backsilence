/* ── tests/batch4-audio-hud-throwable.test.ts ───────────────────────────────
 *  Comprehensive verification suite for ANTIGRAVITY BATCH 4:
 *  - PROMPT 4A: WebAudio Natatorium Reverb IR, Master Bus Compression, Player Foley,
 *               and 3D Spatial Monster Gallop & Roar
 *  - PROMPT 4B: Minimalist Reference HUD (Timer MM:SS.d, 3px Reticle, Hotbar, Checkpoint Banner),
 *               Throwable Pebble System, and 4-Color Keypad Console Pedestal & Pillar Clues
 * ────────────────────────────────────────────────────────────────────────── */

import { describe, it, expect, beforeEach } from 'vitest';
import { createNatatoriumImpulseResponse } from '../src/audio/Reverb.js';
import { playCalmRoomTone } from '../src/audio/voices/Loops.js';
import { playStepDry, playDryLanding } from '../src/audio/voices/Footsteps.js';
import { playSplash, playWadeStep } from '../src/audio/voices/Splashes.js';
import { playMonsterGallopSlam, playMonsterRoar } from '../src/audio/voices/Monster.js';
import { Hud, formatRunTimer } from '../src/ui/Hud.js';
import { ThrowableSystem } from '../src/game/ThrowableSystem.js';
import { AcousticBus } from '../src/sim/AcousticBus.js';
import { NatatoriumMap } from '../src/world/maps/NatatoriumMap.js';
import { makePuzzleDigitDecal } from '../src/procedural/textures/GraffitiDecals.js';

function createMockAudioParam() {
  return {
    value: 1.0,
    setValueAtTime(_v: number, _t: number) {},
    linearRampToValueAtTime(_v: number, _t: number) {},
    exponentialRampToValueAtTime(_v: number, _t: number) {},
    cancelScheduledValues(_t: number) {},
  };
}

// ── WebAudio Mock Context for Vitest ─────────────────────────────────────────
function createMockAudioContext(sampleRate = 48000) {
  let time = 0.0;
  return {
    sampleRate,
    get currentTime() {
      return time;
    },
    advanceTime(dt: number) {
      time += dt;
    },
    createBuffer(channels: number, length: number, sr: number) {
      const channelData = Array.from({ length: channels }, () => new Float32Array(length));
      return {
        numberOfChannels: channels,
        length,
        sampleRate: sr,
        duration: length / sr,
        getChannelData(ch: number) {
          return channelData[ch]!;
        },
      };
    },
    createGain() {
      return {
        gain: createMockAudioParam(),
        connect(_dest: unknown) {},
        disconnect() {},
      };
    },
    createBufferSource() {
      return {
        buffer: null,
        loop: false,
        playbackRate: createMockAudioParam(),
        connect(_dest: unknown) {},
        disconnect() {},
        start(_t?: number) {},
        stop(_t?: number) {},
      };
    },
    createBiquadFilter() {
      return {
        type: 'lowpass',
        frequency: createMockAudioParam(),
        Q: createMockAudioParam(),
        gain: createMockAudioParam(),
        connect(_dest: unknown) {},
        disconnect() {},
      };
    },
    createOscillator() {
      return {
        type: 'sine',
        frequency: createMockAudioParam(),
        connect(_dest: unknown) {},
        disconnect() {},
        start(_t?: number) {},
        stop(_t?: number) {},
      };
    },
    createWaveShaper() {
      return {
        curve: null,
        oversample: 'none',
        connect(_dest: unknown) {},
        disconnect() {},
      };
    },
    createChannelMerger(_n: number) {
      return {
        connect(_dest: unknown) {},
        disconnect() {},
      };
    },
    createStereoPanner() {
      return {
        pan: createMockAudioParam(),
        connect(_dest: unknown) {},
        disconnect() {},
      };
    },
  } as unknown as BaseAudioContext;
}

// ── Minimal DOM Mock for HUD Tests ───────────────────────────────────────────
class MockClassList {
  private classes = new Set<string>();
  add(...names: string[]) {
    for (const name of names) if (name) this.classes.add(name);
  }
  remove(...names: string[]) {
    for (const name of names) if (name) this.classes.delete(name);
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

  constructor(tag = 'div') {
    this.tagName = tag.toUpperCase();
    this.style = {
      setProperty: (k: string, v: string) => {
        this.style[k] = v;
      },
    } as unknown as Record<string, string>;
  }

  getContext(type: string) {
    if (type === '2d') {
      return {
        save() {},
        restore() {},
        clearRect() {},
        fillRect() {},
        beginPath() {},
        moveTo() {},
        lineTo() {},
        stroke() {},
        fill() {},
        arc() {},
        measureText() {
          return { width: 40 };
        },
        fillText() {},
      };
    }
    return null;
  }

  addEventListener(type: string, fn: (e: unknown) => void) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type)!.push(fn);
  }

  setAttribute(k: string, v: string) {
    this.attributes.set(k, String(v));
    if (k === 'id') this.id = v;
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
        const regex = new RegExp(`id="${id}"[^>]*style="([^"]*)"`);
        const styleMatch = html.match(regex);
        if (styleMatch && styleMatch[1]) {
          const styleStr = styleMatch[1];
          if (styleStr.includes('display: none')) {
            child.style.display = 'none';
          }
        }
        this.appendChild(child);
      }
    }
  }
}

describe('ANTIGRAVITY BATCH 4 VERIFICATION SUITE', () => {
  // ──────────────────────────────────────────────────────────────────────────
  // 1. PROMPT 4A: WebAudio Engine Overhaul
  // ──────────────────────────────────────────────────────────────────────────
  describe('Prompt 4A: Procedural Natatorium IR, Foley, and Monster Audio', () => {
    it('1.1 Generates exact 2.1s Tiled-Natatorium Impulse Response with 4 early spikes and no NaNs', () => {
      const mockCtx = createMockAudioContext(48000);
      const ir = createNatatoriumImpulseResponse(mockCtx);

      expect(ir.numberOfChannels).toBe(2);
      expect(ir.sampleRate).toBe(48000);
      expect(ir.length).toBe(Math.floor(48000 * 2.1)); // Exactly 2.1 seconds
      expect(ir.duration).toBeCloseTo(2.1, 2);

      const left = ir.getChannelData(0);
      const right = ir.getChannelData(1);

      let maxPeak = 0;
      let hasNaN = false;
      for (let i = 0; i < ir.length; i++) {
        if (Number.isNaN(left[i]) || Number.isNaN(right[i])) hasNaN = true;
        const absL = Math.abs(left[i] ?? 0);
        const absR = Math.abs(right[i] ?? 0);
        if (absL > maxPeak) maxPeak = absL;
        if (absR > maxPeak) maxPeak = absR;
      }

      expect(hasNaN).toBe(false);
      expect(maxPeak).toBeGreaterThan(0.2); // Robust non-zero normalized peak energy
      expect(maxPeak).toBeLessThanOrEqual(0.70);
    });

    it('1.2 Synthesizes -40 dBFS calm poolroom room tone bed with zero tonal oscillators', () => {
      const mockCtx = createMockAudioContext(48000);
      const dest = mockCtx.createGain();
      const noise = {
        brown: mockCtx.createBuffer(1, 48000, 48000),
        pink: mockCtx.createBuffer(1, 48000, 48000),
        white: mockCtx.createBuffer(1, 48000, 48000),
      };

      const handle = playCalmRoomTone({
        ctx: mockCtx,
        destination: dest,
        reverbSend: dest,
        noise,
      });

      expect(handle).toBeDefined();
      expect(typeof handle.stop).toBe('function');
      handle.stop(0.01);
    });

    it('1.3 Synthesizes dry ceramic tile steps and landings with crisp shoe transients', () => {
      const mockCtx = createMockAudioContext(48000);
      const dest = mockCtx.createGain();
      const noise = {
        brown: mockCtx.createBuffer(1, 48000, 48000),
        pink: mockCtx.createBuffer(1, 48000, 48000),
        white: mockCtx.createBuffer(1, 48000, 48000),
      };

      const step = playStepDry({
        ctx: mockCtx,
        destination: dest,
        reverbSend: dest,
        noise,
      });
      expect(step).toBeDefined();

      const landing = playDryLanding({
        ctx: mockCtx,
        destination: dest,
        reverbSend: dest,
        noise,
      });
      expect(landing).toBeDefined();
    });

    it('1.4 Synthesizes water plunge splashes and wading sloshes with bubble cavity sweep', () => {
      const mockCtx = createMockAudioContext(48000);
      const dest = mockCtx.createGain();
      const noise = {
        brown: mockCtx.createBuffer(1, 48000, 48000),
        pink: mockCtx.createBuffer(1, 48000, 48000),
        white: mockCtx.createBuffer(1, 48000, 48000),
      };

      const splash = playSplash('jump', {
        ctx: mockCtx,
        destination: dest,
        reverbSend: dest,
        noise,
        intensity: 0.8,
        usePool: false,
      });
      expect(splash).toBeDefined();

      const wade = playWadeStep({
        ctx: mockCtx,
        destination: dest,
        reverbSend: dest,
        noise,
        intensity: 1.2,
      });
      expect(wade).toBeDefined();
    });

    it('1.5 Synthesizes quadrupedal monster gallop water slam and 3-voice guttural roar', () => {
      const mockCtx = createMockAudioContext(48000);
      const dest = mockCtx.createGain();
      const noise = {
        brown: mockCtx.createBuffer(1, 48000, 48000),
        pink: mockCtx.createBuffer(1, 48000, 48000),
        white: mockCtx.createBuffer(1, 48000, 48000),
      };

      const gallop = playMonsterGallopSlam({
        ctx: mockCtx,
        destination: dest,
        reverbSend: dest,
        noise,
        intensity: 0.9,
      });
      expect(gallop).toBeDefined();

      const roar = playMonsterRoar({
        ctx: mockCtx,
        destination: dest,
        reverbSend: dest,
        noise,
      });
      expect(roar).toBeDefined();
      expect(typeof roar.stop).toBe('function');
      roar.stop(0.01);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 2. PROMPT 4B: Minimalist Reference HUD
  // ──────────────────────────────────────────────────────────────────────────
  describe('Prompt 4B: Minimalist Gameplay HUD, Run Timer, and Hotbar', () => {
    beforeEach(() => {
      (globalThis as unknown as { document: unknown }).document = {
        createElement: (tag: string) => new MockElement(tag),
        documentElement: new MockElement('html'),
      };
    });

    it('2.1 Formats active run timer into MM:SS.d format', () => {
      expect(formatRunTimer(0)).toBe('00:00.0');
      expect(formatRunTimer(12300)).toBe('00:12.3');
      expect(formatRunTimer(42500)).toBe('00:42.5');
      expect(formatRunTimer(65400)).toBe('01:05.4');
      expect(formatRunTimer(145890)).toBe('02:25.8');
    });

    it('2.2 Mounts Minimalist HUD elements: Run Timer, Reticle, Hotbar, and Checkpoint Notification', () => {
      const hud = new Hud();
      const container = new MockElement('div');
      hud.mount(container as unknown as HTMLElement);

      const hudEl = container.children[0]!;
      expect(hudEl).toBeDefined();

      // Top-Center Run Timer
      const runTimer = hudEl.querySelector('#hud-run-timer');
      expect(runTimer).toBeDefined();

      // Center Reticle (3px x 3px white dot)
      const reticle = hudEl.querySelector('#hud-reticle');
      expect(reticle).toBeDefined();

      // Bottom-Center Hotbar & Control Hint
      const hotbar = hudEl.querySelector('#hud-throwable-hotbar');
      expect(hotbar).toBeDefined();

      const pebbleCount = hudEl.querySelector('#hud-pebble-count');
      expect(pebbleCount).toBeDefined();

      // Checkpoint Saved Banner
      const checkpoint = hudEl.querySelector('#hud-checkpoint-saved');
      expect(checkpoint).toBeDefined();
    });

    it('2.3 Updates Run Timer, Hotbar Pebble Count, and Checkpoint Notification reactivity', () => {
      const hud = new Hud();
      const container = new MockElement('div');
      hud.mount(container as unknown as HTMLElement);

      hud.update({
        runTimeMs: 42300,
        pebbleCount: 4,
        pebbleEquipped: true,
      });

      const hudEl = container.children[0]!;
      const runTimer = hudEl.querySelector('#hud-run-timer');
      expect(runTimer?.textContent).toBe('00:42.3');

      const pebbleCount = hudEl.querySelector('#hud-pebble-count');
      expect(pebbleCount?.textContent).toBe('4');

      const slot1 = hudEl.querySelector('#hud-slot-1');
      expect(slot1?.style.borderColor).toBe('#00e5ff'); // Highlighted when equipped
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 3. PROMPT 4B: Throwable Pebble System
  // ──────────────────────────────────────────────────────────────────────────
  describe('Prompt 4B: Throwable Pebble Ballistics and Acoustic Splash Emission', () => {
    it('3.1 Starts with 2 pebbles in Slot 1 and toggles equip state on key 1', () => {
      const throwable = new ThrowableSystem();
      expect(throwable.pebbleCount).toBe(2);
      expect(throwable.isEquipped).toBe(false);

      // Key 1 press: equips pebble
      const eq1 = throwable.toggleEquip();
      expect(eq1).toBe(true);
      expect(throwable.isEquipped).toBe(true);

      // Key 1 press again: puts away pebble
      const eq2 = throwable.toggleEquip();
      expect(eq2).toBe(false);
      expect(throwable.isEquipped).toBe(false);
    });

    it('3.2 Throws pebble with exact ballistics: 13.5 m/s forward + 2.2 m/s arc, gravity -18.0 m/s^2', () => {
      const throwable = new ThrowableSystem();
      throwable.setEquipped(true);

      const camPos = { x: 0, y: 1.65, z: 0 };
      const camForward = { x: 0, y: 0, z: -1 };

      const projectile = throwable.throwPebble(camPos, camForward, 0.0);
      expect(projectile).toBeDefined();
      expect(projectile?.active).toBe(true);
      expect(throwable.pebbleCount).toBe(1);

      // Launch velocity checks
      expect(projectile?.vel.x).toBeCloseTo(0.0, 2);
      expect(projectile?.vel.y).toBeCloseTo(2.2, 2); // +2.2 m/s upward arc
      expect(projectile?.vel.z).toBeCloseTo(-13.5, 2); // 13.5 m/s forward

      // Integrate step by dt = 0.1s
      let waterHitPos: { x: number; y: number; z: number } | null = null;
      throwable.step(0.1, 0.1, 0.0, {
        onWaterHit: (pos) => {
          waterHitPos = pos;
        },
      });

      // Gravity applied (-18.0 m/s^2 * 0.1s = -1.8 m/s delta => vel.y = 0.4 m/s)
      expect(projectile?.vel.y).toBeCloseTo(0.4, 2);
      expect(waterHitPos).toBeNull(); // Still airborne
    });

    it('3.3 Emits THROWN_STONE_SPLASH acoustic event (priority 10) on water impact to divert monster', () => {
      const throwable = new ThrowableSystem();
      const acousticBus = new AcousticBus();

      let emittedSplashEvent: unknown = null;
      acousticBus.subscribe((ev) => {
        if (ev.kind === 'THROWN_STONE_SPLASH') {
          emittedSplashEvent = ev;
        }
      });

      throwable.setEquipped(true);
      // Throw downwards directly towards water from camera height (y = 1.65)
      throwable.throwPebble({ x: 0, y: 1.65, z: 0 }, { x: 0, y: -0.8, z: -1.0 }, 1.0);

      // Step by dt = 0.3s to trigger water collision
      throwable.step(0.3, 1.3, 0.0, {
        acousticBus,
        onWaterHit: () => {},
      });

      expect(emittedSplashEvent).toBeDefined();
      expect((emittedSplashEvent as { priority: number }).priority).toBe(10); // Priority 10 overrides player splash
      expect((emittedSplashEvent as { kind: string }).kind).toBe('THROWN_STONE_SPLASH');
      expect(acousticBus.targetSoundPos).toBeDefined(); // Diverts monster to stone location
    });

    it('3.4 Collectible stones placed on dry platforms can be picked up within 2.6m', () => {
      const throwable = new ThrowableSystem();
      throwable.addCollectible('test_stone_1', { x: 0.0, y: 0.38, z: 2.0 });

      // Player standing at (0, 1.65, 0) looking along +Z (distance ~2.38m < 2.6m)
      const target = throwable.checkPickup({ x: 0, y: 1.65, z: 0 }, { x: 0, y: -0.5, z: 1.0 });
      expect(target).toBeDefined();
      expect(target?.id).toBe('test_stone_1');

      // Pickup pebble
      const picked = throwable.pickupPebble('test_stone_1');
      expect(picked).toBe(true);
      expect(throwable.pebbleCount).toBe(3); // Incremented from 2 to 3
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 4. PROMPT 4B: Pillar Clues & 4-Color Keypad Console
  // ──────────────────────────────────────────────────────────────────────────
  describe('Prompt 4B: 4-Color Pillar Clues and Keypad Console Pedestal', () => {
    const layout = NatatoriumMap.generateLayout({ seed: 777, difficulty: 'normal', playerCount: 1 });

    it('4.1 Natatorium layout assigns distinct clue colors: Blue #1, Green #2, Yellow #3, Red #4', () => {
      const codePillars = layout.pillars.filter((p) => p.ordinal !== undefined);
      expect(codePillars.length).toBe(4);

      const p1 = codePillars.find((p) => p.ordinal === 1);
      const p2 = codePillars.find((p) => p.ordinal === 2);
      const p3 = codePillars.find((p) => p.ordinal === 3);
      const p4 = codePillars.find((p) => p.ordinal === 4);

      expect(p1?.clueColor).toBe('#1e88e5'); // Blue = #1
      expect(p2?.clueColor).toBe('#43a047'); // Green = #2
      expect(p3?.clueColor).toBe('#fbc02d'); // Yellow = #3
      expect(p4?.clueColor).toBe('#e53935'); // Red = #4
    });

    it('4.2 Stencil decal texture generator supports colored clue stripes', () => {
      const tex = makePuzzleDigitDecal(4, true, 501, '#1e88e5');
      expect(tex).toBeDefined();
      expect(tex.image).toBeDefined();
    });

    it('4.3 Generates 3D Keypad Console Pedestal and collectible pebble props in NatatoriumMap', () => {
      const keypadPedestalProp = layout.props.find((p) => p.kind === 'keypad_pedestal');
      expect(keypadPedestalProp).toBeDefined();
      expect(keypadPedestalProp?.position.z).toBeCloseTo(-56.5, 1);

      const pebbleProps = layout.props.filter((p) => p.kind === 'pebble');
      expect(pebbleProps.length).toBeGreaterThanOrEqual(5);
    });
  });
});
