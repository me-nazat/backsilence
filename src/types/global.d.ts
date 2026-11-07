/** Global type augmentations for BackSilence. */

/** Vite import.meta.env typing. */
interface ImportMetaEnv {
  readonly PROD: boolean;
  readonly VITE_NET_PROVIDER?: string;
  readonly VITE_NET_URL?: string;
  readonly VITE_NET_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module '*?worker&url' {
  const src: string;
  export default src;
}

declare const process: {
  cwd: () => string;
  exitCode?: number;
  exit: (code?: number) => never;
  env: Record<string, string | undefined>;
  argv: string[];
};

declare module '*/scripts/gates/summary.mjs' {
  export interface GateDef {
    name: string;
    cmd: string;
    summarize: (res: { ok: boolean; code: number; stdout: string; stderr: string }) => {
      detail: string;
      failures?: number;
      worst?: string | null;
    };
  }
  export const GATES: GateDef[];
  export function evaluateGateSummary(): Promise<unknown>;
}

declare module '*/scripts/reference/compare-frames.mjs' {
  export interface PerceptualVerdict {
    verdict: 'MATCH' | 'EXCEEDS' | 'FAIL';
    ssim: number;
    passed: boolean;
    failureReasons: string[];
    semantics: Record<string, boolean>;
    regions: Record<string, unknown>;
    regionDeltasSummary: string;
    perChannelMae: { maeR: number; maeG: number; maeB: number; meanMae: number };
    wholeFrameDeltaE: { deltaE: number };
  }
  export function compareFrames(
    refImg: { width: number; height: number; data: Float32Array },
    shotImg: { width: number; height: number; data: Float32Array },
    pairing: unknown,
  ): PerceptualVerdict;
  export function compareAllPairings(
    pairingsData: unknown,
    options?: unknown,
  ): Promise<{ results: PerceptualVerdict[]; summary: unknown }>;
}

declare module '*/scripts/visual/compare.mjs' {
  export function decodePng(buf: Uint8Array): { width: number; height: number; data: Float32Array };
}

declare module '*/scripts/audit/verdict-honesty.mjs' {
  export function auditReportHonesty(
    filePath: string,
    checkMap: Map<string, unknown>,
    counts: { expectedExceeds: number; expectedMatch: number; expectedFail: number },
  ): string[];
  export function runVerdictHonestyAudit(): void;
}

