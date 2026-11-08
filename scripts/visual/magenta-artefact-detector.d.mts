export interface MagentaFinding {
  type: string;
  count: number;
  fraction: number;
  sample: {
    x: number;
    y: number;
    r: number;
    g: number;
    b: number;
    h: number;
    s: number;
    l: number;
  };
  detail: string;
}

export interface MagentaScanOptions {
  shotId?: string;
  allowDesignatedEffects?: boolean;
}

export function rgbToHsl(r: number, g: number, b: number): [number, number, number];

export function detectMagentaArtifacts(
  image: { width: number; height: number; data: Float32Array },
  options?: MagentaScanOptions,
): MagentaFinding[];

export function scanPngForMagenta(
  filePath: string,
  options?: MagentaScanOptions,
): MagentaFinding[];
