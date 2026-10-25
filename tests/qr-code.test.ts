import { describe, it, expect } from 'vitest';
import { QrCode } from '../src/ui/qr/QrCode.js';

describe('Phase C: QR Code Pure TypeScript Generator', () => {
  it('encodes short text into a valid square matrix with finder patterns', () => {
    const text = 'https://backsilence.pages.dev/?room=K7QX';
    const matrix = QrCode.encode(text);

    expect(Array.isArray(matrix)).toBe(true);
    const size = matrix.length;
    expect(size).toBeGreaterThanOrEqual(21); // At least Version 1
    // Matrix must be square
    for (const row of matrix) {
      expect(row.length).toBe(size);
    }

    // Top-left finder: 7x7 outer square, 3x3 inner square
    // Top-left corner (0,0) must be dark
    expect(matrix[0]![0]).toBe(true);
    expect(matrix[0]![6]).toBe(true);
    expect(matrix[6]![0]).toBe(true);
    expect(matrix[6]![6]).toBe(true);
    // Center of top-left finder (3,3) must be dark
    expect(matrix[3]![3]).toBe(true);
    // Ring of top-left finder (1,1) must be light (false)
    expect(matrix[1]![1]).toBe(false);

    // Top-right finder: (0, size-7)
    expect(matrix[0]![size - 7]).toBe(true);
    expect(matrix[0]![size - 1]).toBe(true);
    expect(matrix[6]![size - 7]).toBe(true);
    expect(matrix[6]![size - 1]).toBe(true);
    expect(matrix[3]![size - 4]).toBe(true);

    // Bottom-left finder: (size-7, 0)
    expect(matrix[size - 7]![0]).toBe(true);
    expect(matrix[size - 1]![0]).toBe(true);
    expect(matrix[size - 7]![6]).toBe(true);
    expect(matrix[size - 1]![6]).toBe(true);
    expect(matrix[size - 4]![3]).toBe(true);
  });

  it('renders valid SVG string with proper viewBox and path markup', () => {
    const text = 'https://backsilence.pages.dev/?room=K7QX';
    const svg = QrCode.toSvg(text, { size: 240, fgColor: '#86cfa0', bgColor: '#0d0b06' });

    expect(typeof svg).toBe('string');
    expect(svg).toContain('<svg');
    expect(svg).toContain('viewBox=');
    expect(svg).toContain('width="240"');
    expect(svg).toContain('height="240"');
    expect(svg).toContain('#86cfa0');
    expect(svg).toContain('#0d0b06');
    expect(svg).toContain('</svg>');
  });

  it('handles empty or custom options gracefully', () => {
    const svg = QrCode.toSvg('ROOM123');
    expect(svg).toContain('<svg');
    expect(svg).toContain('</svg>');
  });
});
