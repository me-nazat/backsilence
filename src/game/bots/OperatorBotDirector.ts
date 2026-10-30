/* ── OperatorBotDirector.ts ────────────────────────────────────────────────
 *  Intelligent AI Operator Bots for CO-OP ESCAPE, SILENT RACE, and LAST ONE DRY.
 *  Enables 100% playable multiplayer modes solo or with remote peers.
 * ──────────────────────────────────────────────────────────────────────── */

import { Group } from 'three';
import { RemotePlayerAvatar } from '../player/RemotePlayerAvatar.js';
import type { Vec3 } from '../../types/contracts.js';
import type { Hud, RosterMember } from '../../ui/Hud.js';
import type { AudioEngine } from '../../audio/AudioEngine.js';

export interface OperatorBot {
  id: string;
  name: string;
  colorIndex: number;
  pos: Vec3;
  targetPos: Vec3;
  yaw: number;
  speed: number;
  alive: boolean;
  eliminated: boolean;
  avatar: RemotePlayerAvatar;
  submergedTime: number;
  stepTimer: number;
}

export interface OperatorBotStepResult {
  coopDoorUnlocked?: boolean;
  racePlacement?: number;
  botSplash?: { pos: Vec3; loudness: number; botName: string };
  eliminatedName?: string;
}

export class OperatorBotDirector {
  readonly root = new Group();
  private bots: OperatorBot[] = [];
  private hud: Hud;
  private audio: AudioEngine;
  private mode: string;
  private matchTime = 0;
  private exitPos: Vec3;

  constructor(
    mode: string,
    hud: Hud,
    audio: AudioEngine,
    exitPos: Vec3 = { x: 0, y: 0.3, z: 45 },
  ) {
    this.mode = mode;
    this.hud = hud;
    this.audio = audio;
    this.exitPos = exitPos;
    this.root.name = 'OperatorBotDirector';

    this.spawnBotsForMode();
  }

  private spawnBotsForMode(): void {
    if (this.mode === 'coop') {
      this.spawnBot('bot_echo', 'OPERATOR ECHO-02', 1, { x: 4, y: 0.3, z: -10 });
    } else if (this.mode === 'race') {
      this.spawnBot('bot_spectre', 'SPECTRE-01', 0, { x: -6, y: 0.3, z: -10 });
      this.spawnBot('bot_drift', 'DRIFT-02', 2, { x: -2, y: 0.3, z: -12 });
      this.spawnBot('bot_null', 'NULL-03', 3, { x: 6, y: 0.3, z: -11 });
    } else if (this.mode === 'last_dry') {
      this.spawnBot('bot_apex', 'APEX-01', 0, { x: -8, y: 0.3, z: -8 });
      this.spawnBot('bot_strider', 'STRIDER-02', 2, { x: 8, y: 0.3, z: -8 });
      this.spawnBot('bot_vapor', 'VAPOR-03', 3, { x: 0, y: 0.3, z: 12 });
    }
  }

  private spawnBot(id: string, name: string, colorIndex: number, spawn: Vec3): void {
    const avatar = new RemotePlayerAvatar(id, name, colorIndex);
    avatar.teleport(spawn, 0);
    this.root.add(avatar.root);

    this.bots.push({
      id,
      name,
      colorIndex,
      pos: { ...spawn },
      targetPos: { ...spawn },
      yaw: 0,
      speed: 3.2,
      alive: true,
      eliminated: false,
      avatar,
      submergedTime: 0,
      stepTimer: Math.random() * 0.5,
    });
  }

  update(
    dt: number,
    playerPos: Vec3,
    waterY: number,
    isPlayerNearPlateA = false,
  ): OperatorBotStepResult {
    this.matchTime += dt;
    const result: OperatorBotStepResult = {};

    // 1. Co-Op Escape Coordination
    if (this.mode === 'coop' && this.bots[0] && this.bots[0].alive) {
      const echo = this.bots[0];
      const plateBPos = { x: 8, y: 0.3, z: -15 };

      if (isPlayerNearPlateA) {
        // Move towards Plate B to coordinate
        echo.targetPos = plateBPos;
        const distToB = Math.hypot(plateBPos.x - echo.pos.x, plateBPos.z - echo.pos.z);
        if (distToB < 1.5) {
          result.coopDoorUnlocked = true;
          this.hud.update({
            interactionPrompt: '[OPERATOR ECHO-02]: "Plate B locked down! Blast doors open!"',
          });
        }
      } else {
        // Follow player casually at safe dry distance (~4m)
        const dx = playerPos.x - echo.pos.x;
        const dz = playerPos.z - echo.pos.z;
        const dist = Math.hypot(dx, dz);
        if (dist > 5.0) {
          echo.targetPos = {
            x: playerPos.x - (dx / dist) * 3.5,
            y: playerPos.y,
            z: playerPos.z - (dz / dist) * 3.5,
          };
        }
      }
    }

    // 2. Silent Race Progression & Occasional Water Splash
    if (this.mode === 'race') {
      const runners = [
        { name: 'YOU', dist: Math.hypot(this.exitPos.x - playerPos.x, this.exitPos.z - playerPos.z) },
      ];

      for (let i = 0; i < this.bots.length; i++) {
        const bot = this.bots[i]!;
        if (!bot.alive) continue;

        // Move towards exit with randomized speed
        const dx = this.exitPos.x - bot.pos.x;
        const dz = this.exitPos.z - bot.pos.z;
        const dist = Math.hypot(dx, dz);
        if (dist > 2.0) {
          bot.targetPos = {
            x: bot.pos.x + (dx / dist) * bot.speed * dt,
            y: bot.pos.y,
            z: bot.pos.z + (dz / dist) * bot.speed * dt,
          };
        }

        // Random occasional water splash to lure monster
        bot.stepTimer += dt;
        if (bot.stepTimer > 12.0 + i * 4.0) {
          bot.stepTimer = 0;
          result.botSplash = {
            pos: { x: bot.pos.x, y: waterY, z: bot.pos.z },
            loudness: 0.7,
            botName: bot.name,
          };
        }

        runners.push({ name: bot.name, dist });
      }

      // Sort runners by remaining distance to exit
      runners.sort((a, b) => a.dist - b.dist);
      const myRank = runners.findIndex((r) => r.name === 'YOU') + 1;
      result.racePlacement = myRank;
    }

    // 3. Last One Dry Survival & Ring Submersion Eliminations
    if (this.mode === 'last_dry') {
      // Outer ring submerged at 20s, mid ring at 40s
      for (const bot of this.bots) {
        if (!bot.alive) continue;

        const distFromCenter = Math.hypot(bot.pos.x, bot.pos.z);
        // If outer ring submerged (> 18m) after 20s
        if (this.matchTime > 20.0 && distFromCenter > 18.0) {
          bot.submergedTime += dt;
        }
        // If mid ring submerged (> 10m) after 40s
        if (this.matchTime > 40.0 && distFromCenter > 10.0) {
          bot.submergedTime += dt;
        }

        if (bot.submergedTime >= 6.0 && bot.alive) {
          bot.alive = false;
          bot.eliminated = true;
          bot.avatar.root.visible = false;
          result.eliminatedName = bot.name;
          this.audio.play('water_splash_submerge', { position: bot.pos, gain: 0.9 });
        }
      }
    }

    // 4. Update Bot Positions & Avatars
    for (const bot of this.bots) {
      if (!bot.alive) continue;

      const dx = bot.targetPos.x - bot.pos.x;
      const dz = bot.targetPos.z - bot.pos.z;
      const dist = Math.hypot(dx, dz);

      if (dist > 0.05) {
        const step = Math.min(dist, bot.speed * dt);
        bot.pos.x += (dx / dist) * step;
        bot.pos.z += (dz / dist) * step;
        bot.yaw = Math.atan2(dx, dz);
      }

      bot.avatar.updatePose(
        bot.pos,
        bot.yaw,
        0,
        dist > 0.1,
        false,
        false,
        waterY,
        dt,
      );
    }

    // 5. Update Roster HUD
    const roster: RosterMember[] = [
      {
        id: 'player_local',
        name: 'OPERATOR (YOU)',
        status: 'alive',
        isLocal: true,
        colorIndex: 0,
      },
      ...this.bots.map((b) => ({
        id: b.id,
        name: b.name,
        status: (b.alive ? 'alive' : 'dead') as 'alive' | 'dead',
        isLocal: false,
        colorIndex: b.colorIndex,
      })),
    ];
    this.hud.update({ roster });

    return result;
  }

  dispose(): void {
    for (const bot of this.bots) {
      bot.avatar.dispose();
    }
    while (this.root.children.length > 0) {
      const c = this.root.children[0]!;
      this.root.remove(c);
    }
    this.bots = [];
  }
}

