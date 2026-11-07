export interface ArtifactIssue {
  type: string;
  detail: string;
  count?: number;
  location?: { x?: number; y?: number };
}

export interface HudBox {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ArtifactScanOptions {
  checkPureBlackAboveFog?: boolean;
  checkMagenta?: boolean;
  checkFogSeams?: boolean;
  checkWaterEdge?: boolean;
  checkFlatness?: boolean;
  tilePitch?: number;
  hudBoxes?: HudBox[];
  islandConnections?: { id: string; connectedTo: string[] }[];
}

export function scanImageArtifacts(
  image: { width: number; height: number; data: Float32Array },
  options?: ArtifactScanOptions,
): ArtifactIssue[];

export function scanPngFile(filePath: string, options?: ArtifactScanOptions): ArtifactIssue[];
