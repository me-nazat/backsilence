/* ── caustics.glsl.ts ─────────────────────────────────────────────────────
 *  GLSL shader chunk for animated underwater caustics.
 *  Uses the classic dual-sample min() trick for realistic fluid filaments.
 * ──────────────────────────────────────────────────────────────────────── */

export const causticsChunk = /* glsl */ `
uniform sampler2D tCaustics;
uniform float uTime;

/**
 * High/Medium tier animated caustics using dual rotated min() sampling.
 */
float caustics(vec2 uv, float t) {
  vec2 p1 = uv * 1.6 + vec2(t * 0.03, t * 0.02);
  // ~30 deg rotation matrix: cos(0.5236)=0.866, sin(0.5236)=0.5
  mat2 rot = mat2(0.866025, -0.5, 0.5, 0.866025);
  vec2 p2 = rot * (uv * 1.85) - vec2(t * 0.025, t * 0.035);

  float c1 = texture2D(tCaustics, p1).r;
  float c2 = texture2D(tCaustics, p2).r;
  return min(c1, c2) * 1.55;
}

/**
 * Low tier fallback: single sample.
 */
float causticsLow(vec2 uv, float t) {
  vec2 p = uv * 1.6 + vec2(t * 0.03, t * 0.02);
  return texture2D(tCaustics, p).r;
}
`;
