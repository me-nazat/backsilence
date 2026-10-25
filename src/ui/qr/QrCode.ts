/* ── QrCode.ts ─────────────────────────────────────────────────────────
 *  Minimal, pure TypeScript QR Code (Model 2) generator with zero external
 *  dependencies. Supports Byte mode (ISO/IEC 18004) with Error Correction (L, M).
 *  Renders to 2D boolean module matrix, SVG string, or HTML5 Canvas.
 * ──────────────────────────────────────────────────────────────────────── */

export type ErrorCorrectionLevel = 'L' | 'M';

export interface QrRenderOptions {
  size?: number;       // total width/height in px (default: 200)
  margin?: number;     // quiet zone modules around QR (default: 4)
  fgColor?: string;    // module color (default: '#86cfa0')
  bgColor?: string;    // background color (default: '#0d0b06')
}

// Galois Field GF(256) tables with primitive polynomial 0x11D (285)
const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);

(function initGaloisField() {
  let val = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = val;
    GF_EXP[i + 255] = val;
    GF_LOG[val] = i;
    val = (val << 1) ^ (val & 0x80 ? 0x11d : 0);
  }
  GF_LOG[0] = 0; // Not mathematically defined, clamped for safety
})();

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a]! + GF_LOG[b]!] ?? 0;
}

// Reed-Solomon generator polynomial for a given number of EC codewords
function rsGeneratorPoly(ecCount: number): Uint8Array {
  let poly = new Uint8Array([1]);
  for (let i = 0; i < ecCount; i++) {
    const next = new Uint8Array(poly.length + 1);
    const factor = GF_EXP[i]!;
    for (let j = 0; j < poly.length; j++) {
      next[j] = (next[j] ?? 0) ^ gfMul(poly[j]!, factor);
      next[j + 1] = (next[j + 1] ?? 0) ^ poly[j]!;
    }
    poly = next;
  }
  return poly;
}

// Compute Reed-Solomon error correction codewords
function rsCompute(data: Uint8Array, ecCount: number): Uint8Array {
  const gen = rsGeneratorPoly(ecCount);
  const res = new Uint8Array(data.length + ecCount);
  res.set(data, 0);

  for (let i = 0; i < data.length; i++) {
    const coef = res[i]!;
    if (coef !== 0) {
      for (let j = 0; j < gen.length; j++) {
        res[i + j]! ^= gfMul(gen[j]!, coef);
      }
    }
  }

  return res.slice(data.length);
}

// Capacity table for QR Model 2 byte mode (versions 1 to 5)
interface VersionSpec {
  version: number;
  totalCodewords: number;
  ecCodewords: Record<ErrorCorrectionLevel, number>;
  dataCodewords: Record<ErrorCorrectionLevel, number>;
  alignments: number[];
}

const VERSION_SPECS: VersionSpec[] = [
  { version: 1, totalCodewords: 26, ecCodewords: { L: 7, M: 10 }, dataCodewords: { L: 19, M: 16 }, alignments: [] },
  { version: 2, totalCodewords: 44, ecCodewords: { L: 10, M: 16 }, dataCodewords: { L: 34, M: 28 }, alignments: [6, 18] },
  { version: 3, totalCodewords: 70, ecCodewords: { L: 15, M: 26 }, dataCodewords: { L: 55, M: 44 }, alignments: [6, 22] },
  { version: 4, totalCodewords: 100, ecCodewords: { L: 20, M: 36 }, dataCodewords: { L: 80, M: 64 }, alignments: [6, 26] },
  { version: 5, totalCodewords: 134, ecCodewords: { L: 26, M: 48 }, dataCodewords: { L: 108, M: 86 }, alignments: [6, 30] },
];

export const QrCode = {
  /**
   * Generates a 2D boolean array representing the QR code matrix (true = dark module).
   */
  encode(text: string, ecLevel: ErrorCorrectionLevel = 'M'): boolean[][] {
    const rawBytes = new TextEncoder().encode(text);

    // Pick minimum version fitting this text length + 4-bit mode + 8-bit length
    let chosenSpec: VersionSpec | null = null;
    for (const spec of VERSION_SPECS) {
      // Byte mode header: 4 bits mode + 8 bits length = 1.5 bytes.
      // Maximum data capacity in bytes:
      const maxData = spec.dataCodewords[ecLevel] - 2;
      if (rawBytes.length <= maxData) {
        chosenSpec = spec;
        break;
      }
    }

    if (!chosenSpec) {
      // Fallback to highest supported version
      chosenSpec = VERSION_SPECS[VERSION_SPECS.length - 1]!;
    }

    const version = chosenSpec.version;
    const dataCap = chosenSpec.dataCodewords[ecLevel];
    const ecCap = chosenSpec.ecCodewords[ecLevel];

    // Build data bitstream (Mode 0100 for Byte mode)
    const bits: number[] = [];
    const pushBits = (val: number, len: number) => {
      for (let i = len - 1; i >= 0; i--) {
        bits.push((val >> i) & 1);
      }
    };

    pushBits(0b0100, 4); // Byte mode indicator
    pushBits(rawBytes.length, 8); // Character count indicator
    for (let i = 0; i < rawBytes.length; i++) {
      pushBits(rawBytes[i]!, 8);
    }

    // Add terminator (up to 4 zeros)
    const totalDataBits = dataCap * 8;
    const termLen = Math.min(4, totalDataBits - bits.length);
    pushBits(0, termLen);

    // Byte align
    while (bits.length % 8 !== 0) {
      bits.push(0);
    }

    // Convert bits to data codewords
    const dataCodewords = new Uint8Array(dataCap);
    for (let i = 0; i < bits.length / 8 && i < dataCap; i++) {
      let byteVal = 0;
      for (let b = 0; b < 8; b++) {
        byteVal = (byteVal << 1) | bits[i * 8 + b]!;
      }
      dataCodewords[i] = byteVal;
    }

    // Pad with 0xEC and 0x11
    const padBytes = [0xec, 0x11];
    let padIdx = 0;
    for (let i = bits.length / 8; i < dataCap; i++) {
      dataCodewords[i] = padBytes[padIdx % 2]!;
      padIdx++;
    }

    // Compute error correction codewords
    const ecCodewords = rsCompute(dataCodewords, ecCap);

    // Matrix construction
    const size = 17 + version * 4;
    const matrix: (boolean | null)[][] = Array.from({ length: size }, () =>
      Array.from({ length: size }, () => null)
    );
    const reserved: boolean[][] = Array.from({ length: size }, () =>
      Array.from({ length: size }, () => false)
    );

    // 1. Finder patterns (7x7) at (0,0), (size-7,0), (0,size-7)
    const placeFinder = (r: number, c: number) => {
      for (let y = -1; y <= 7; y++) {
        for (let x = -1; x <= 7; x++) {
          const row = r + y;
          const col = c + x;
          if (row >= 0 && row < size && col >= 0 && col < size) {
            reserved[row]![col] = true;
            if (y >= 0 && y <= 6 && x >= 0 && x <= 6) {
              const isOuter = y === 0 || y === 6 || x === 0 || x === 6;
              const isInner = y >= 2 && y <= 4 && x >= 2 && x <= 4;
              matrix[row]![col] = isOuter || isInner;
            } else {
              matrix[row]![col] = false; // Separator
            }
          }
        }
      }
    };

    placeFinder(0, 0);
    placeFinder(0, size - 7);
    placeFinder(size - 7, 0);

    // 2. Timing patterns on row 6 and col 6
    for (let i = 8; i < size - 8; i++) {
      if (!reserved[6]![i]) {
        matrix[6]![i] = i % 2 === 0;
        reserved[6]![i] = true;
      }
      if (!reserved[i]![6]) {
        matrix[i]![6] = i % 2 === 0;
        reserved[i]![6] = true;
      }
    }

    // 3. Alignment patterns (version >= 2)
    const alignCoords = chosenSpec.alignments;
    if (alignCoords.length > 0) {
      for (const r of alignCoords) {
        for (const c of alignCoords) {
          // Skip if overlapping finder patterns
          if (
            (r <= 8 && c <= 8) ||
            (r <= 8 && c >= size - 8) ||
            (r >= size - 8 && c <= 8)
          ) {
            continue;
          }
          for (let y = -2; y <= 2; y++) {
            for (let x = -2; x <= 2; x++) {
              const row = r + y;
              const col = c + x;
              const isBorder = Math.abs(x) === 2 || Math.abs(y) === 2;
              const isCenter = x === 0 && y === 0;
              matrix[row]![col] = isBorder || isCenter;
              reserved[row]![col] = true;
            }
          }
        }
      }
    }

    // 4. Dark module at (4*version + 9, 8)
    const darkRow = 4 * version + 9;
    matrix[darkRow]![8] = true;
    reserved[darkRow]![8] = true;

    // 5. Reserve format information areas
    for (let i = 0; i <= 8; i++) {
      reserved[8]![i] = true;
      reserved[i]![8] = true;
      reserved[8]![size - 1 - i] = true;
      reserved[size - 1 - i]![8] = true;
    }

    // 6. Place data and EC codewords in 2-column zigzag
    const fullBits: number[] = [];
    for (let i = 0; i < dataCodewords.length; i++) {
      for (let b = 7; b >= 0; b--) fullBits.push((dataCodewords[i]! >> b) & 1);
    }
    for (let i = 0; i < ecCodewords.length; i++) {
      for (let b = 7; b >= 0; b--) fullBits.push((ecCodewords[i]! >> b) & 1);
    }

    let bitIdx = 0;
    let upward = true;

    for (let right = size - 1; right > 0; right -= 2) {
      if (right === 6) right--; // Skip vertical timing column
      const left = right - 1;

      const rows: number[] = [];
      if (upward) {
        for (let r = size - 1; r >= 0; r--) rows.push(r);
      } else {
        for (let r = 0; r < size; r++) rows.push(r);
      }
      upward = !upward;

      for (const row of rows) {
        for (const col of [right, left]) {
          if (!reserved[row]![col]) {
            const rawBit = bitIdx < fullBits.length ? fullBits[bitIdx]! : 0;
            bitIdx++;

            // Apply Mask pattern 0: (row + col) % 2 === 0
            const mask = (row + col) % 2 === 0;
            matrix[row]![col] = (rawBit === 1) !== mask;
          }
        }
      }
    }

    // 7. Write Format Information (Mask 0 + EC Level L/M)
    // Precomputed 15-bit format words (including BCH and mask XOR 0x5412):
    // L-0: 0x77c4 (0111011111000100b)
    // M-0: 0x5412 (0101010000010010b)
    const formatWord = ecLevel === 'L' ? 0x77c4 : 0x5412;

    for (let i = 0; i < 15; i++) {
      const bit = ((formatWord >> (14 - i)) & 1) === 1;

      // Around top-left finder
      if (i < 6) {
        matrix[8]![i] = bit;
      } else if (i < 8) {
        matrix[8]![i + 1] = bit;
      } else if (i === 8) {
        matrix[7]![8] = bit;
      } else {
        matrix[14 - i]![8] = bit;
      }

      // Around top-right and bottom-left finders
      if (i < 8) {
        matrix[size - 1 - i]![8] = bit;
      } else {
        matrix[8]![size - 15 + i] = bit;
      }
    }

    // Convert nulls to false
    return matrix.map((row) => row.map((cell) => cell === true));
  },

  /**
   * Generates a self-contained SVG string representing the QR code.
   */
  toSvg(text: string, options: QrRenderOptions = {}): string {
    const matrix = this.encode(text);
    const moduleCount = matrix.length;
    const margin = options.margin ?? 4;
    const totalModules = moduleCount + margin * 2;
    const size = options.size ?? 200;
    const fg = options.fgColor ?? '#86cfa0';
    const bg = options.bgColor ?? '#0d0b06';

    const paths: string[] = [];

    for (let r = 0; r < moduleCount; r++) {
      for (let c = 0; c < moduleCount; c++) {
        if (matrix[r]![c]) {
          const x = c + margin;
          const y = r + margin;
          paths.push(`M${x},${y}h1v1h-1z`);
        }
      }
    }

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalModules} ${totalModules}" width="${size}" height="${size}" shape-rendering="crispEdges" aria-label="QR Code for ${text}">
      <rect width="${totalModules}" height="${totalModules}" fill="${bg}"/>
      <path d="${paths.join('')}" fill="${fg}"/>
    </svg>`;
  },

  /**
   * Draws the QR code directly onto an HTML5 Canvas.
   */
  renderToCanvas(
    text: string,
    canvas: HTMLCanvasElement,
    options: QrRenderOptions = {}
  ): void {
    const matrix = this.encode(text);
    const moduleCount = matrix.length;
    const margin = options.margin ?? 4;
    const totalModules = moduleCount + margin * 2;
    const size = options.size ?? canvas.width ?? 200;
    canvas.width = size;
    canvas.height = size;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const fg = options.fgColor ?? '#86cfa0';
    const bg = options.bgColor ?? '#0d0b06';

    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, size, size);

    ctx.fillStyle = fg;
    const cellSize = size / totalModules;

    for (let r = 0; r < moduleCount; r++) {
      for (let c = 0; c < moduleCount; c++) {
        if (matrix[r]![c]) {
          ctx.fillRect(
            Math.round((c + margin) * cellSize),
            Math.round((r + margin) * cellSize),
            Math.ceil(cellSize),
            Math.ceil(cellSize)
          );
        }
      }
    }
  },
};
