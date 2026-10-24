/* ── input-gamepad.test.ts ──────────────────────────────────────────────────
 *  Tests for Phase D: Input, Gamepad API, Spatial Navigation & Glyph Switching.
 * ──────────────────────────────────────────────────────────────────────── */

import { describe, it, expect, beforeEach } from 'vitest';
import { GamepadManager } from '../src/engine/input/GamepadManager.js';
import { InputGlyphs } from '../src/ui/input/InputGlyphs.js';
import { SpatialNavigation, type SpatialDirection } from '../src/ui/input/SpatialNavigation.js';
import { KeyRemapper } from '../src/ui/input/KeyRemapper.js';

describe('Prompt 4 Phase D: Input, Gamepad, Glyphs & Spatial Navigation', () => {
  let gamepadMgr: GamepadManager;
  let glyphs: InputGlyphs;

  beforeEach(() => {
    gamepadMgr = GamepadManager.getInstance();
    gamepadMgr.setMockGamepads(null);
    gamepadMgr.setDeadzone(0.15);
    gamepadMgr.setResponseExponent(1.8);
    gamepadMgr.setInvertLookY(false);

    glyphs = InputGlyphs.getInstance();
    glyphs.setDevice('keyboard');
  });

  it('calculates radial deadzones and response curves accurately', () => {
    // 1. Within 0.15 radial deadzone -> clamped to (0, 0)
    const deadResult = gamepadMgr.applyRadialDeadzone(0.08, 0.08); // mag ≈ 0.113 < 0.15
    expect(deadResult.x).toBe(0);
    expect(deadResult.y).toBe(0);

    // 2. Beyond 0.15 deadzone -> smoothly scaled with power curve
    const activeResult = gamepadMgr.applyRadialDeadzone(0.6, 0.0); // mag = 0.6 >= 0.15
    expect(activeResult.x).toBeGreaterThan(0);
    expect(activeResult.y).toBe(0);
    expect(activeResult.x).toBeLessThan(0.6); // Power curve exponent > 1 produces smooth low-end feel

    // 3. Full deflection (1.0) -> outputs full 1.0
    const fullResult = gamepadMgr.applyRadialDeadzone(1.0, 0.0);
    expect(fullResult.x).toBeCloseTo(1.0, 2);
  });

  it('detects Xbox, PlayStation, and Switch layouts from Gamepad ID', () => {
    const xboxPad = { id: 'Xbox Wireless Controller (STANDARD GAMEPAD)', connected: true } as unknown as Gamepad;
    expect(gamepadMgr.detectGamepadType(xboxPad)).toBe('xbox');

    const psPad = { id: 'DualSense Wireless Controller (054c:0ce6)', connected: true } as unknown as Gamepad;
    expect(gamepadMgr.detectGamepadType(psPad)).toBe('playstation');

    const switchPad = { id: 'Nintendo Switch Pro Controller (057e:2009)', connected: true } as unknown as Gamepad;
    expect(gamepadMgr.detectGamepadType(switchPad)).toBe('switch');

    expect(gamepadMgr.detectGamepadType(null)).toBe('generic');
  });

  it('polls mock gamepad buttons and triggers (sprint on RT, throw on LT)', () => {
    const mockPad = {
      connected: true,
      id: 'Standard Controller',
      axes: [0.0, -0.8, 0.5, 0.0],
      buttons: [
        { pressed: true, value: 1.0 }, // 0: Jump (A)
        { pressed: false, value: 0.0 }, // 1: Crouch (B)
        { pressed: false, value: 0.0 }, // 2: Flashlight (X)
        { pressed: true, value: 1.0 }, // 3: Interact (Y)
        { pressed: false, value: 0.0 }, // 4: LB
        { pressed: false, value: 0.0 }, // 5: RB
        { pressed: true, value: 1.0 }, // 6: LT (Throw)
        { pressed: true, value: 1.0 }, // 7: RT (Sprint)
        { pressed: false, value: 0.0 }, // 8
        { pressed: false, value: 0.0 }, // 9: Pause
        { pressed: false, value: 0.0 }, // 10
        { pressed: false, value: 0.0 }, // 11
        { pressed: true, value: 1.0 }, // 12: D-pad Up
        { pressed: false, value: 0.0 }, // 13: D-pad Down
        { pressed: false, value: 0.0 }, // 14: D-pad Left
        { pressed: false, value: 0.0 }, // 15: D-pad Right
      ],
    } as unknown as Gamepad;

    gamepadMgr.setMockGamepads([mockPad]);

    const axes = gamepadMgr.pollAxes();
    expect(axes.moveY).toBeLessThan(0); // Upward movement
    expect(axes.lookX).toBeGreaterThan(0); // Rightward look

    const btns = gamepadMgr.pollButtons();
    expect(btns.jump).toBe(true);
    expect(btns.interact).toBe(true);
    expect(btns.sprint).toBe(true); // RT Trigger
    expect(btns.throw).toBe(true);  // LT Trigger
    expect(btns.dpadUp).toBe(true);
    expect(btns.crouch).toBe(false);
  });

  it('guards haptic rumble playback and returns false gracefully without hardware', async () => {
    const padWithoutActuator = {
      connected: true,
      id: 'Mock Controller',
      buttons: [],
      axes: [],
    } as unknown as Gamepad;

    gamepadMgr.setMockGamepads([padWithoutActuator]);
    const success = await gamepadMgr.playRumble('jumpscare');
    expect(success).toBe(false);

    // Mock with vibrationActuator
    let rumbleCalledWith: any = null;
    const padWithActuator = {
      connected: true,
      id: 'Mock Controller With Rumble',
      buttons: [],
      axes: [],
      vibrationActuator: {
        playEffect: async (_type: string, opts: any) => {
          rumbleCalledWith = opts;
          return 'complete';
        },
      },
    } as unknown as Gamepad;

    gamepadMgr.setMockGamepads([padWithActuator]);
    const rSuccess = await gamepadMgr.playRumble('near-miss');
    expect(rSuccess).toBe(true);
    expect(rumbleCalledWith).not.toBeNull();
    expect(rumbleCalledWith.duration).toBe(250);
  });

  it('switches input prompt glyphs between keyboard, gamepad, and touch', () => {
    // 1. Keyboard
    glyphs.setDevice('keyboard');
    const kbGlyph = glyphs.renderGlyph('interact', 'E');
    expect(kbGlyph).toContain('bs-keycap');
    expect(kbGlyph).toContain('E');

    // 2. Touch
    glyphs.setDevice('touch');
    const touchGlyph = glyphs.renderGlyph('interact');
    expect(touchGlyph).toContain('bs-touch-glyph');

    // 3. Gamepad Xbox
    const xboxPad = { id: 'Xbox One', connected: true } as unknown as Gamepad;
    gamepadMgr.setMockGamepads([xboxPad]);
    glyphs.setDevice('gamepad');

    const gpGlyph = glyphs.renderGlyph('jump');
    expect(gpGlyph).toContain('bs-gamepad-glyph');
    expect(gpGlyph).toContain('A');

    // 4. Gamepad PlayStation
    const psPad = { id: 'DualShock 4', connected: true } as unknown as Gamepad;
    gamepadMgr.setMockGamepads([psPad]);
    const psGlyph = glyphs.renderGlyph('jump');
    expect(psGlyph).toContain('bs-gamepad-glyph');
    expect(psGlyph).toContain('line'); // Cross lines
  });

  it('navigates spatially in 2D between interactive elements', () => {
    // Mock interactive elements with positions
    const elA = {
      focus: () => { focused = 'A'; },
      getBoundingClientRect: () => ({ left: 100, top: 100, width: 80, height: 30 }),
      hasAttribute: () => false,
    } as unknown as HTMLElement;

    const elB = {
      focus: () => { focused = 'B'; },
      getBoundingClientRect: () => ({ left: 100, top: 180, width: 80, height: 30 }),
      hasAttribute: () => false,
    } as unknown as HTMLElement;

    const elC = {
      focus: () => { focused = 'C'; },
      getBoundingClientRect: () => ({ left: 240, top: 100, width: 80, height: 30 }),
      hasAttribute: () => false,
    } as unknown as HTMLElement;

    let focused = 'A';
    const mockContainer = {
      querySelectorAll: () => [elA, elB, elC],
    } as unknown as HTMLElement;

    let navDir: SpatialDirection | null = null;
    const nav = new SpatialNavigation({
      container: mockContainer,
      onNavigate: (_el, dir) => { navDir = dir; },
    });

    // Mock document.activeElement
    // @ts-expect-error mocking activeElement
    globalThis.document = { activeElement: elA };

    // Navigate Down: elB is directly below elA
    const movedDown = nav.navigate('down');
    expect(movedDown).toBe(true);
    expect(focused).toBe('B');
    expect(navDir).toBe('down');

    // Navigate Right from elA: elC is directly right of elA
    // @ts-expect-error mocking activeElement
    globalThis.document.activeElement = elA;
    const movedRight = nav.navigate('right');
    expect(movedRight).toBe(true);
    expect(focused).toBe('C');
    expect(navDir).toBe('right');

    nav.dispose();
  });

  it('validates key remapping, conflict detection, and reset to defaults', () => {
    const defaults = KeyRemapper.getDefaults();
    expect(defaults.forward).toBe('KeyW');
    expect(defaults.jump).toBe('Space');

    // 1. Conflict detection when assigning already bound key
    const rebindResult = KeyRemapper.rebind(defaults, 'jump', 'KeyW'); // KeyW already used for forward!
    expect(rebindResult.conflict).toBe('forward');
    expect(rebindResult.bindings.jump).toBe('KeyW');

    // 2. Validate table
    const validation = KeyRemapper.validate(rebindResult.bindings);
    expect(validation.isValid).toBe(false);
    expect(validation.conflicts.length).toBe(1);
    expect(validation.conflicts[0]!.actionA).toBe('forward');
    expect(validation.conflicts[0]!.actionB).toBe('jump');

    // 3. Reset defaults restores clean mapping
    const clean = KeyRemapper.getDefaults();
    expect(KeyRemapper.validate(clean).isValid).toBe(true);
  });
});
