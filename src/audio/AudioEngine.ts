/* ── AudioEngine.ts ───────────────────────────────────────────────────────
 *  100% Procedural Web Audio Synth Engine. Zero audio files.
 *  Master bus graph, HRTF 3D positional audio, procedural reverb sends,
 *  underwater muffle, dynamic tension director, and voice limiter.
 * ──────────────────────────────────────────────────────────────────────── */

import type { Vec3, Settings } from '../types/contracts.js';
import { createNoiseBuffers, type NoiseBuffers } from './Noise.js';
import { ReverbUnit, type ReverbPreset } from './Reverb.js';
import { Mixer, type AudioBusName, BUS_PRIORITIES } from './Mixer.js';
import { AudioDirector } from './AudioDirector.js';

import {
  playSplash,
  playWadeStep,
  playWadeLoop,
  playPebblePlink,
} from './voices/Splashes.js';
import {
  playStepDry,
  playStepSqueak,
  playMantle,
  playDrip,
  playPlayerBreath,
} from './voices/Footsteps.js';
import {
  playLapLoop,
  playHumLoop,
  playDroneLoop,
} from './voices/Loops.js';
import {
  playMonsterRoar,
  playMonsterSnarl,
  playMonsterBreathLoop,
  playMonsterSniff,
  playMonsterWade,
  playMonsterFootfall,
} from './voices/Monster.js';
import {
  playJumpscare,
  playHeartbeat,
} from './voices/Jumpscare.js';
import {
  playUiHover,
  playUiClick,
  playUiConfirm,
  playUiError,
  playKeypadBeep,
  playDoorClunk,
  playRippleTick,
  playUiStamp,
  playUiAchievement,
  playUiCountdownTick,
  playUiLobbyJoin,
  playUiReady,
  playUiRankUp,
  playResultsStinger,
  type UiVoiceContext,
} from './voices/UiSounds.js';
import {
  playSteamHiss,
  playPipeGroan,
  playValveTurn,
  playValveRelease,
  playWaterInflowLoop,
  playCrankLoop,
  playGeneratorLoop,
  playGeneratorCord,
  playAlarmKlaxon,
  playShutterRumble,
  playSocketClunk,
} from './voices/Machinery.js';
import {
  playBell,
  playStoneCreak,
  playPebbleClack,
  playFlashlightClick,
  playKeypadBuzz,
  playEscaped,
} from './voices/Interactables.js';
import {
  playAmbienceTunnels,
  playAmbienceAtrium,
  playAmbienceFiltration,
  playAmbienceDrain,
  playMonsterAmbientFar,
} from './voices/AmbienceBeds.js';
import {
  playVhsGlitch,
  playTapeRewind,
  playTapeEject,
  playTapeInsert,
  playStaticBurst,
} from './voices/TapeSounds.js';
import {
  playCreak,
  playLockerOpenFast,
  playLockerOpenCareful,
  playChainGrindLoop,
  playPaChime,
  playPaBlast,
  playPaGarble,
  playChalkScratch,
  playPianoClunk,
  playAmbienceSchool,
} from './voices/SchoolSounds.js';
import {
  playRiverLoop,
  playWaterfallLoop,
  playFrogChorusLoop,
  playCricketLoop,
  playBirdCall,
  playInsectDrone,
  playWindLeaves,
  playAmbienceJungle,
} from './voices/JungleSounds.js';
import {
  playRainLoop,
  playThunder,
  playNeonBuzzLoop,
  playDroneWhirrLoop,
  playSirenWail,
  playEmpPulse,
  playTerminalBeep,
  playHackSuccess,
  playHackFail,
  playHoloHum,
} from './voices/CitySounds.js';
import {
  playRailSingLoop,
  playTrainRumbleLoop,
  playTrainHorn,
  playLeverClunk,
  playBottleShatter,
  playStationAnnounceChime,
  playMonsterSwipe,
  playMonsterCollapse,
} from './voices/MetroSounds.js';
import {
  playWispWail,
  playWispWingbeat,
} from './voices/WispSounds.js';

export type VoiceName =
  | 'splash_small'
  | 'splash_big'
  | 'splash_jump'
  | 'wade_step'
  | 'wade_loop'
  | 'pebble_plink'
  | 'step_dry'
  | 'step_squeak'
  | 'mantle'
  | 'drip'
  | 'player_breath'
  | 'lap_loop'
  | 'hum_loop'
  | 'drone_loop'
  | 'monster_roar'
  | 'monster_snarl'
  | 'monster_breath_loop'
  | 'monster_sniff'
  | 'monster_wade'
  | 'monster_footfall'
  | 'jumpscare'
  | 'heartbeat'
  | 'ui_hover'
  | 'ui_click'
  | 'ui_confirm'
  | 'ui_error'
  | 'keypad_beep'
  | 'door_clunk'
  | 'ripple_tick'
  | 'ui_stamp'
  | 'ui_achievement'
  | 'ui_countdown_tick'
  | 'ui_lobby_join'
  | 'ui_ready'
  | 'ui_rank_up'
  | 'results_stinger'
  | 'steam_hiss'
  | 'pipe_groan'
  | 'valve_turn'
  | 'valve_release'
  | 'water_inflow_loop'
  | 'bell'
  | 'stone_creak'
  | 'pebble_clack'
  | 'flashlight_click'
  | 'crank_loop'
  | 'generator_loop'
  | 'generator_cord'
  | 'alarm_klaxon'
  | 'shutter_rumble'
  | 'socket_clunk'
  | 'keypad_buzz'
  | 'monster_ambient_far'
  | 'escaped'
  | 'ambience_tunnels'
  | 'ambience_atrium'
  | 'ambience_filtration'
  | 'ambience_drain'
  | 'vhs_glitch'
  | 'tape_rewind'
  | 'tape_eject'
  | 'tape_insert'
  | 'static_burst'
  // Batch 5 additions
  | 'creak'
  | 'locker_open_fast'
  | 'locker_open_careful'
  | 'chain_grind_loop'
  | 'pa_chime'
  | 'pa_blast'
  | 'pa_garble'
  | 'chalk_scratch'
  | 'piano_clunk'
  | 'ambience_school'
  | 'river_loop'
  | 'waterfall_loop'
  | 'frog_chorus_loop'
  | 'cricket_loop'
  | 'bird_call'
  | 'insect_drone'
  | 'wind_leaves'
  | 'ambience_jungle'
  | 'rain_loop'
  | 'thunder'
  | 'neon_buzz_loop'
  | 'drone_whirr_loop'
  | 'siren_wail'
  | 'emp_pulse'
  | 'terminal_beep'
  | 'hack_success'
  | 'hack_fail'
  | 'holo_hum'
  | 'rail_sing_loop'
  | 'train_rumble_loop'
  | 'train_horn'
  | 'lever_clunk'
  | 'bottle_shatter'
  | 'station_announce_chime'
  | 'monster_swipe'
  | 'monster_collapse'
  | 'wisp_wail'
  | 'wisp_wingbeat';

export interface PlayOptions {
  position?: Vec3;
  intensity?: number;
  gain?: number;
  seed?: number;
  bus?: AudioBusName;
  pitch?: number;
}

export interface RawVoiceHandle {
  stop(fadeSec?: number): void;
  setParam(name: string, v: number): void;
  readonly ended: Promise<void>;
}

export interface VoiceHandle {
  stop(fadeSec?: number): void;
  setParam(name: string, v: number): void;
  setPosition(v: Vec3): void;
  readonly ended: Promise<void>;
}

export interface AudioEngineApi {
  init(): Promise<void>;
  play(name: VoiceName, opts?: PlayOptions): VoiceHandle;
  setListener(pos: Vec3, forward: Vec3, up: Vec3): void;
  setReverbPreset(p: ReverbPreset): void;
  setUnderwater(amount: number): void;
  setTension(amount: number): void;
  setVhsIntensity(intensity: number): void;
  applySettings(s: Settings['audio']): void;
  startAmbience(): void;
  stopAmbience(fade?: number): void;
  stats(): { activeVoices: number; contextState: string; sampleRate: number };
  getContext(): AudioContext | null;
  getBusNode(bus: AudioBusName): GainNode | null;
  dispose(): void;
}

export class AudioEngine implements AudioEngineApi {
  private static instance: AudioEngine | null = null;

  ctx: AudioContext | null = null;
  private noiseBuffers: NoiseBuffers | null = null;
  private mixer: Mixer | null = null;
  private reverb: ReverbUnit | null = null;
  private director: AudioDirector | null = null;
  readonly analyser: AnalyserNode | null = null;

  private isInitialized = false;
  private muteOnBlur = true;
  private voiceSeq = 0;
  private tapeHissSource: AudioBufferSourceNode | null = null;
  private tapeHissGain: GainNode | null = null;
  private vhsIntensity = 0.5;

  static getInstance(): AudioEngine {
    if (!AudioEngine.instance) {
      AudioEngine.instance = new AudioEngine();
    }
    return AudioEngine.instance;
  }

  /**
   * Lazy initialization triggered by first user gesture.
   */
  async init(): Promise<void> {
    if (this.isInitialized && this.ctx) {
      if (this.ctx.state === 'suspended') {
        await this.ctx.resume();
      }
      return;
    }

    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

    if (!AudioContextClass) {
      console.warn('[AudioEngine] Web Audio API not supported in this environment');
      return;
    }

    this.ctx = new AudioContextClass({ latencyHint: 'interactive' });
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }

    this.noiseBuffers = createNoiseBuffers(this.ctx);
    this.mixer = new Mixer(this.ctx);
    this.reverb = new ReverbUnit(this.ctx);
    this.director = new AudioDirector(this);

    // Wire reverb output to mixer sfx/ambient compressor
    this.reverb.output.connect(this.mixer.compressor);

    // Setup master analyser node for real-time oscilloscope
    const analyserNode = this.ctx.createAnalyser();
    analyserNode.fftSize = 512;
    this.mixer.masterGain.connect(analyserNode);
    analyserNode.connect(this.ctx.destination);
    (this as { analyser: AnalyserNode }).analyser = analyserNode;

    // Window visibility lifecycle: mute on blur if configured
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.muteOnBlur && this.ctx?.state === 'running') {
        this.ctx.suspend().catch(() => {});
      } else if (!document.hidden && this.ctx?.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
    });

    this.isInitialized = true;

    // Tape Hiss Bed (high-passed pink noise)
    if (this.noiseBuffers && this.ctx) {
      try {
        const hiss = this.ctx.createBufferSource();
        hiss.buffer = this.noiseBuffers.pink;
        hiss.loop = true;

        const hp = this.ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.setValueAtTime(1200, this.ctx.currentTime);

        const hissGain = this.ctx.createGain();
        hissGain.gain.setValueAtTime(0.02 * this.vhsIntensity, this.ctx.currentTime);

        hiss.connect(hp);
        hp.connect(hissGain);
        if (this.mixer) {
          hissGain.connect(this.mixer.ambientGain);
        }

        hiss.start();
        this.tapeHissSource = hiss;
        this.tapeHissGain = hissGain;
      } catch (e) {
        console.warn('[AudioEngine] Tape hiss bed initialization error:', e);
      }
    }
  }

  getContext(): AudioContext | null {
    return this.ctx;
  }

  getBusNode(bus: AudioBusName): GainNode | null {
    return this.mixer ? this.mixer.getBusNode(bus) : null;
  }

  play(name: VoiceName, opts: PlayOptions = {}): VoiceHandle {
    if (!this.ctx || !this.mixer || !this.reverb || !this.noiseBuffers) {
      // Offline / uninitialized fallback: return no-op voice handle
      return {
        stop(): void {},
        setParam(): void {},
        setPosition(): void {},
        ended: Promise.resolve(),
      };
    }

    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }

    const busName = opts.bus ?? this.defaultBusForVoice(name);
    const busGain = this.mixer.getBusNode(busName);
    const reverbSend = this.reverb.input;

    let destinationNode: AudioNode = busGain;
    let panner: PannerNode | null = null;

    // Spatial 3D HRTF audio routing
    if (opts.position) {
      panner = this.ctx.createPanner();
      panner.panningModel = 'HRTF';
      panner.distanceModel = 'inverse';
      panner.refDistance = 2.0;
      panner.maxDistance = 60.0;
      panner.rolloffFactor = 1.4;

      if (panner.positionX) {
        panner.positionX.setValueAtTime(opts.position.x, this.ctx.currentTime);
        panner.positionY.setValueAtTime(opts.position.y, this.ctx.currentTime);
        panner.positionZ.setValueAtTime(opts.position.z, this.ctx.currentTime);
      } else {
        (panner as unknown as { setPosition: (x: number, y: number, z: number) => void }).setPosition(
          opts.position.x,
          opts.position.y,
          opts.position.z,
        );
      }

      panner.connect(busGain);
      destinationNode = panner;
    }

    const voiceCtx = {
      ctx: this.ctx,
      destination: destinationNode,
      reverbSend,
      noise: this.noiseBuffers,
      ...(opts.intensity !== undefined || opts.gain !== undefined
        ? { intensity: opts.intensity ?? opts.gain }
        : {}),
      ...(opts.pitch !== undefined ? { pitch: opts.pitch } : {}),
      ...(opts.seed !== undefined ? { seed: opts.seed } : {}),
      mixer: this.mixer,
    };

    let handle: RawVoiceHandle;

    switch (name) {
      case 'splash_small':
        handle = playSplash('small', voiceCtx);
        break;
      case 'splash_big':
        handle = playSplash('big', voiceCtx);
        break;
      case 'splash_jump':
        handle = playSplash('jump', voiceCtx);
        break;
      case 'wade_step':
        handle = playWadeStep(voiceCtx);
        break;
      case 'wade_loop':
        handle = playWadeLoop(voiceCtx);
        break;
      case 'pebble_plink':
        handle = playPebblePlink(voiceCtx);
        break;
      case 'step_dry':
        handle = playStepDry(voiceCtx);
        break;
      case 'step_squeak':
        handle = playStepSqueak(voiceCtx);
        break;
      case 'mantle':
        handle = playMantle(voiceCtx);
        break;
      case 'drip':
        handle = playDrip(voiceCtx);
        break;
      case 'lap_loop':
        handle = playLapLoop(voiceCtx);
        break;
      case 'hum_loop':
        handle = playHumLoop(voiceCtx);
        break;
      case 'drone_loop':
        handle = playDroneLoop(voiceCtx);
        break;
      case 'monster_roar':
        handle = playMonsterRoar(voiceCtx);
        break;
      case 'monster_snarl':
        handle = playMonsterSnarl(voiceCtx);
        break;
      case 'monster_breath_loop':
        handle = playMonsterBreathLoop(voiceCtx);
        break;
      case 'monster_sniff':
        handle = playMonsterSniff(voiceCtx);
        break;
      case 'monster_wade':
        handle = playMonsterWade(voiceCtx);
        break;
      case 'jumpscare':
        handle = playJumpscare(voiceCtx);
        break;
      case 'heartbeat':
        handle = playHeartbeat(voiceCtx);
        break;
      case 'ui_hover':
        handle = playUiHover(voiceCtx);
        break;
      case 'ui_click':
        handle = playUiClick(voiceCtx);
        break;
      case 'ui_confirm':
        handle = playUiConfirm(voiceCtx);
        break;
      case 'ui_error':
        handle = playUiError(voiceCtx);
        break;
      case 'keypad_beep':
        handle = playKeypadBeep(voiceCtx);
        break;
      case 'door_clunk':
        handle = playDoorClunk(voiceCtx);
        break;
      case 'player_breath':
        handle = playPlayerBreath(voiceCtx);
        break;
      case 'ripple_tick':
        handle = playRippleTick(voiceCtx);
        break;
      case 'ui_stamp':
        handle = playUiStamp(voiceCtx);
        break;
      case 'ui_achievement':
        handle = playUiAchievement(voiceCtx);
        break;
      case 'ui_countdown_tick':
        handle = playUiCountdownTick(voiceCtx);
        break;
      case 'ui_lobby_join':
        handle = playUiLobbyJoin(voiceCtx);
        break;
      case 'ui_ready':
        handle = playUiReady(voiceCtx);
        break;
      case 'ui_rank_up':
        handle = playUiRankUp(voiceCtx);
        break;
      case 'results_stinger':
        handle = playResultsStinger(voiceCtx as UiVoiceContext & { rank?: string });
        break;
      case 'monster_footfall':
        handle = playMonsterFootfall(voiceCtx);
        break;
      case 'steam_hiss':
        handle = playSteamHiss(voiceCtx);
        break;
      case 'pipe_groan':
        handle = playPipeGroan(voiceCtx);
        break;
      case 'valve_turn':
        handle = playValveTurn(voiceCtx);
        break;
      case 'valve_release':
        handle = playValveRelease(voiceCtx);
        break;
      case 'water_inflow_loop':
        handle = playWaterInflowLoop(voiceCtx);
        break;
      case 'bell':
        handle = playBell(voiceCtx);
        break;
      case 'stone_creak':
        handle = playStoneCreak(voiceCtx);
        break;
      case 'pebble_clack':
        handle = playPebbleClack(voiceCtx);
        break;
      case 'flashlight_click':
        handle = playFlashlightClick(voiceCtx);
        break;
      case 'crank_loop':
        handle = playCrankLoop(voiceCtx);
        break;
      case 'generator_loop':
        handle = playGeneratorLoop(voiceCtx);
        break;
      case 'generator_cord':
        handle = playGeneratorCord(voiceCtx);
        break;
      case 'alarm_klaxon':
        handle = playAlarmKlaxon(voiceCtx);
        break;
      case 'shutter_rumble':
        handle = playShutterRumble(voiceCtx);
        break;
      case 'socket_clunk':
        handle = playSocketClunk(voiceCtx);
        break;
      case 'keypad_buzz':
        handle = playKeypadBuzz(voiceCtx);
        break;
      case 'monster_ambient_far':
        handle = playMonsterAmbientFar(voiceCtx);
        break;
      case 'escaped':
        handle = playEscaped(voiceCtx);
        break;
      case 'ambience_tunnels':
        handle = playAmbienceTunnels(voiceCtx);
        break;
      case 'ambience_atrium':
        handle = playAmbienceAtrium(voiceCtx);
        break;
      case 'ambience_filtration':
        handle = playAmbienceFiltration(voiceCtx);
        break;
      case 'ambience_drain':
        handle = playAmbienceDrain(voiceCtx);
        break;
      case 'vhs_glitch':
        handle = playVhsGlitch(voiceCtx);
        break;
      case 'tape_rewind':
        handle = playTapeRewind(voiceCtx);
        break;
      case 'tape_eject':
        handle = playTapeEject(voiceCtx);
        break;
      case 'tape_insert':
        handle = playTapeInsert(voiceCtx);
        break;
      case 'static_burst':
        handle = playStaticBurst(voiceCtx);
        break;
      // Batch 5 cases
      case 'creak':
        handle = playCreak(voiceCtx);
        break;
      case 'locker_open_fast':
        handle = playLockerOpenFast(voiceCtx);
        break;
      case 'locker_open_careful':
        handle = playLockerOpenCareful(voiceCtx);
        break;
      case 'chain_grind_loop':
        handle = playChainGrindLoop(voiceCtx);
        break;
      case 'pa_chime':
        handle = playPaChime(voiceCtx);
        break;
      case 'pa_blast':
        handle = playPaBlast(voiceCtx);
        break;
      case 'pa_garble':
        handle = playPaGarble(voiceCtx);
        break;
      case 'chalk_scratch':
        handle = playChalkScratch(voiceCtx);
        break;
      case 'piano_clunk':
        handle = playPianoClunk(voiceCtx);
        break;
      case 'ambience_school':
        handle = playAmbienceSchool(voiceCtx);
        break;
      case 'river_loop':
        handle = playRiverLoop(voiceCtx);
        break;
      case 'waterfall_loop':
        handle = playWaterfallLoop(voiceCtx);
        break;
      case 'frog_chorus_loop':
        handle = playFrogChorusLoop(voiceCtx);
        break;
      case 'cricket_loop':
        handle = playCricketLoop(voiceCtx);
        break;
      case 'bird_call':
        handle = playBirdCall(voiceCtx);
        break;
      case 'insect_drone':
        handle = playInsectDrone(voiceCtx);
        break;
      case 'wind_leaves':
        handle = playWindLeaves(voiceCtx);
        break;
      case 'ambience_jungle':
        handle = playAmbienceJungle(voiceCtx);
        break;
      case 'rain_loop':
        handle = playRainLoop(voiceCtx);
        break;
      case 'thunder':
        handle = playThunder(voiceCtx);
        break;
      case 'neon_buzz_loop':
        handle = playNeonBuzzLoop(voiceCtx);
        break;
      case 'drone_whirr_loop':
        handle = playDroneWhirrLoop(voiceCtx);
        break;
      case 'siren_wail':
        handle = playSirenWail(voiceCtx);
        break;
      case 'emp_pulse':
        handle = playEmpPulse(voiceCtx);
        break;
      case 'terminal_beep':
        handle = playTerminalBeep(voiceCtx);
        break;
      case 'hack_success':
        handle = playHackSuccess(voiceCtx);
        break;
      case 'hack_fail':
        handle = playHackFail(voiceCtx);
        break;
      case 'holo_hum':
        handle = playHoloHum(voiceCtx);
        break;
      case 'rail_sing_loop':
        handle = playRailSingLoop(voiceCtx);
        break;
      case 'train_rumble_loop':
        handle = playTrainRumbleLoop(voiceCtx);
        break;
      case 'train_horn':
        handle = playTrainHorn(voiceCtx);
        break;
      case 'lever_clunk':
        handle = playLeverClunk(voiceCtx);
        break;
      case 'bottle_shatter':
        handle = playBottleShatter(voiceCtx);
        break;
      case 'station_announce_chime':
        handle = playStationAnnounceChime(voiceCtx);
        break;
      case 'monster_swipe':
        handle = playMonsterSwipe(voiceCtx);
        break;
      case 'monster_collapse':
        handle = playMonsterCollapse(voiceCtx);
        break;
      case 'wisp_wail':
        handle = playWispWail(voiceCtx);
        break;
      case 'wisp_wingbeat':
        handle = playWispWingbeat(voiceCtx);
        break;
      default:
        handle = playUiClick(voiceCtx);
    }

    const wrappedHandle: VoiceHandle = {
      stop: (fadeSec) => handle.stop(fadeSec),
      setParam: (pName, val) => handle.setParam(pName, val),
      setPosition: (pos: Vec3) => {
        if (!panner || !this.ctx) return;
        const now = this.ctx.currentTime;
        if (panner.positionX) {
          panner.positionX.linearRampToValueAtTime(pos.x, now + 0.03);
          panner.positionY.linearRampToValueAtTime(pos.y, now + 0.03);
          panner.positionZ.linearRampToValueAtTime(pos.z, now + 0.03);
        } else {
          (panner as unknown as { setPosition?: (x: number, y: number, z: number) => void }).setPosition?.(pos.x, pos.y, pos.z);
        }
      },
      ended: handle.ended,
    };

    const voiceId = `voice_${++this.voiceSeq}`;
    const priority = BUS_PRIORITIES[busName] ?? 5;

    this.mixer.registerVoice({
      id: voiceId,
      name,
      bus: busName,
      priority,
      startTime: this.ctx.currentTime,
      stop: () => wrappedHandle.stop(),
    });

    void wrappedHandle.ended.then(() => {
      this.mixer?.unregisterVoice(voiceId);
      if (panner) {
        try {
          panner.disconnect();
        } catch {
          /* ignore disconnect error */
        }
      }
    });

    return wrappedHandle;
  }

  private defaultBusForVoice(name: VoiceName): AudioBusName {
    if (
      name === 'ripple_tick' ||
      name.startsWith('ui_') ||
      name === 'keypad_beep' ||
      name === 'door_clunk' ||
      name === 'terminal_beep' ||
      name === 'hack_success' ||
      name === 'hack_fail' ||
      name === 'pa_chime' ||
      name === 'station_announce_chime'
    ) {
      return 'ui';
    }
    if (
      name === 'monster_footfall' ||
      name.startsWith('monster_') ||
      name === 'jumpscare' ||
      name === 'heartbeat'
    ) {
      return 'monster';
    }
    if (
      name.endsWith('_loop') ||
      name === 'drip' ||
      name.startsWith('ambience_') ||
      name === 'insect_drone' ||
      name === 'wind_leaves' ||
      name === 'holo_hum'
    ) {
      return 'ambient';
    }
    if (name.startsWith('tape_') || name === 'vhs_glitch' || name === 'static_burst') {
      return 'sfx';
    }
    return 'sfx';
  }

  /**
   * Update 3D listener position, forward, and up vectors.
   */
  setListener(pos: Vec3, forward: Vec3, up: Vec3): void {
    if (!this.ctx) return;
    const listener = this.ctx.listener;
    const now = this.ctx.currentTime;

    if (listener.positionX) {
      listener.positionX.setValueAtTime(pos.x, now);
      listener.positionY.setValueAtTime(pos.y, now);
      listener.positionZ.setValueAtTime(pos.z, now);
      listener.forwardX.setValueAtTime(forward.x, now);
      listener.forwardY.setValueAtTime(forward.y, now);
      listener.forwardZ.setValueAtTime(forward.z, now);
      listener.upX.setValueAtTime(up.x, now);
      listener.upY.setValueAtTime(up.y, now);
      listener.upZ.setValueAtTime(up.z, now);
    } else {
      (listener as unknown as {
        setPosition: (x: number, y: number, z: number) => void;
        setOrientation: (fx: number, fy: number, fz: number, ux: number, uy: number, uz: number) => void;
      }).setPosition(pos.x, pos.y, pos.z);
      (listener as unknown as {
        setPosition: (x: number, y: number, z: number) => void;
        setOrientation: (fx: number, fy: number, fz: number, ux: number, uy: number, uz: number) => void;
      }).setOrientation(forward.x, forward.y, forward.z, up.x, up.y, up.z);
    }
  }

  setReverbPreset(preset: ReverbPreset): void {
    this.reverb?.setPreset(preset);
  }

  setUnderwater(amount: number): void {
    this.mixer?.setUnderwater(amount);
  }

  setTension(amount: number): void {
    this.director?.setTension(amount);
  }

  setVhsIntensity(intensity: number): void {
    this.vhsIntensity = Math.max(0, Math.min(1, intensity));
    if (this.tapeHissGain && this.ctx) {
      const now = this.ctx.currentTime;
      this.tapeHissGain.gain.linearRampToValueAtTime(0.035 * this.vhsIntensity, now + 0.1);
    }
  }

  duckBus(bus: AudioBusName, amount: number, attack = 0.05, release = 1.0): void {
    this.mixer?.duck(bus, amount, attack, release);
  }

  applySettings(s: Settings['audio']): void {
    this.muteOnBlur = s.muteOnBlur;
    this.mixer?.setVolumes({
      master: s.master,
      sfx: s.sfx,
      ambient: s.ambient,
      monster: s.monster,
    });
  }

  startAmbience(): void {
    this.director?.startAmbience();
  }

  stopAmbience(fade = 1.0): void {
    this.director?.stopAmbience(fade);
  }

  async suspend(): Promise<void> {
    if (this.ctx && this.ctx.state === 'running') {
      await this.ctx.suspend();
    }
  }

  async resume(): Promise<void> {
    if (this.ctx && this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
  }

  stats(): { activeVoices: number; contextState: string; sampleRate: number } {
    return {
      activeVoices: this.mixer?.getActiveVoiceCount() ?? 0,
      contextState: this.ctx?.state ?? 'uninitialized',
      sampleRate: this.ctx?.sampleRate ?? 0,
    };
  }

  dispose(): void {
    if (this.tapeHissSource) {
      try {
        this.tapeHissSource.stop();
      } catch (err) {
        void err;
      }
      this.tapeHissSource = null;
    }
    this.director?.dispose();
    this.mixer?.dispose();
    this.reverb?.dispose();
    if (this.ctx && this.ctx.state !== 'closed') {
      this.ctx.close().catch(() => {});
    }
    this.isInitialized = false;
  }
}
