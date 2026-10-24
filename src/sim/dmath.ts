/* ── dmath.ts ─────────────────────────────────────────────────────────────
 *  Deterministic math kernel for simulation and procedural generation.
 *  Complies with strict determinism rules: forbids Math.sin, cos, tan, atan2,
 *  exp, log, pow, hypot across JavaScript engines.
 *  Uses only allowed primitives: + - * /, Math.sqrt, abs, min, max, floor, ceil, fround, imul.
 * ──────────────────────────────────────────────────────────────────────── */

export const D_PI = 3.14159265358979323846;
export const D_TWO_PI = 6.28318530717958647692;
export const D_HALF_PI = 1.57079632679489661923;
export const D_INV_TWO_PI = 0.15915494309189533576888;
export const D_LN2 = 0.693147180559945309417;
export const D_LOG2E = 1.44269504088896340736;
export const D_TAN_PI_8 = 0.41421356237309504880; // sqrt(2) - 1
export const D_PI_4 = 0.785398163397448309616;

/** Deterministic 2D hypotenuse using only Math.sqrt and basic arithmetic. */
export function dHypot(x: number, y: number): number {
  const ax = Math.abs(x);
  const ay = Math.abs(y);
  if (ax === 0 && ay === 0) return 0;
  const max = Math.max(ax, ay);
  const min = Math.min(ax, ay);
  const r = min / max;
  return max * Math.sqrt(1 + r * r);
}

/** Deterministic 3D hypotenuse. */
export function dHypot3(x: number, y: number, z: number): number {
  const ax = Math.abs(x);
  const ay = Math.abs(y);
  const az = Math.abs(z);
  const max = Math.max(ax, Math.max(ay, az));
  if (max === 0) return 0;
  const rx = ax / max;
  const ry = ay / max;
  const rz = az / max;
  return max * Math.sqrt(rx * rx + ry * ry + rz * rz);
}

/** Deterministic sine using range reduction and high-precision polynomial. */
export function dSin(x: number): number {
  if (x !== x || Math.abs(x) === Infinity) return NaN;
  // Reduce x to [-PI, PI]
  const k = Math.floor(x * D_INV_TWO_PI + 0.5);
  let r = x - k * D_TWO_PI;

  // Further reduce to [-HALF_PI, HALF_PI]
  if (r > D_HALF_PI) {
    r = D_PI - r;
  } else if (r < -D_HALF_PI) {
    r = -D_PI - r;
  }

  const r2 = r * r;
  // Taylor polynomial up to degree 19 (error < 1e-15 on [-PI/2, PI/2])
  return r * (1 + r2 * (
    -0.16666666666666666666667 + r2 * (
      0.00833333333333333333333 + r2 * (
        -0.000198412698412698412698 + r2 * (
          0.000002755731922398589065 + r2 * (
            -0.00000002505210838544171877 + r2 * (
              0.000000000160590438368216146 + r2 * (
                -7.6471637318198164759e-13 + r2 * (
                  2.8114572543455207632e-15 - r2 * 7.6471637318198164759e-18
                )
              )
            )
          )
        )
      )
    )
  ));
}

/** Deterministic cosine. */
export function dCos(x: number): number {
  return dSin(x + D_HALF_PI);
}

/** Deterministic tangent. */
export function dTan(x: number): number {
  const c = dCos(x);
  if (Math.abs(c) < 1e-15) return c >= 0 ? Infinity : -Infinity;
  return dSin(x) / c;
}

/** Internal arctangent polynomial on [0, TAN_PI_8]. */
function dAtanSmall(t: number): number {
  const t2 = t * t;
  return t * (1 + t2 * (
    -0.33333333333333333333333 + t2 * (
      0.2 + t2 * (
        -0.1428571428571428571428 + t2 * (
          0.1111111111111111111111 + t2 * (
            -0.0909090909090909090909 + t2 * (
              0.0769230769230769230769 + t2 * (
                -0.0666666666666666666667 + t2 * (
                  0.0588235294117647058824 + t2 * (
                    -0.0526315789473684210526 + t2 * (
                      0.0476190476190476190476 + t2 * (
                        -0.0434782608695652173913 + t2 * (
                          0.04 - t2 * 0.037037037037037037037
                        )
                      )
                    )
                  )
                )
              )
            )
          )
        )
      )
    )
  ));
}

/** Deterministic arctangent. */
export function dAtan(x: number): number {
  if (x !== x) return NaN;
  if (x === 0) return 0;
  if (x < 0) return -dAtan(-x);
  if (x > 1) return D_HALF_PI - dAtan(1 / x);
  if (x > D_TAN_PI_8) {
    return D_PI_4 + dAtanSmall((x - 1) / (1 + x));
  }
  return dAtanSmall(x);
}

/** Deterministic atan2. */
export function dAtan2(y: number, x: number): number {
  if (x !== x || y !== y) return NaN;
  if (x === 0) {
    if (y > 0) return D_HALF_PI;
    if (y < 0) return -D_HALF_PI;
    return 0;
  }
  if (y === 0) {
    return x >= 0 ? 0 : D_PI;
  }
  const phi = dAtan(Math.abs(y / x));
  if (x > 0) {
    return y > 0 ? phi : -phi;
  } else {
    return y > 0 ? D_PI - phi : -(D_PI - phi);
  }
}

/** Deterministic 2^k for integer k. */
function dPow2Int(k: number): number {
  if (k === 0) return 1;
  let e = Math.abs(k);
  let base = k < 0 ? 0.5 : 2.0;
  let res = 1;
  while (e > 0) {
    if (e % 2 === 1) res *= base;
    base *= base;
    e = Math.floor(e / 2);
  }
  return res;
}

/** Deterministic natural log using argument reduction and series. */
export function dLog(x: number): number {
  if (x !== x || x < 0) return NaN;
  if (x === 0) return -Infinity;
  if (x === 1) return 0;

  let k = 0;
  let val = x;
  while (val >= 2) {
    val /= 2;
    k++;
  }
  while (val < 1) {
    val *= 2;
    k--;
  }

  // val is in [1, 2)
  const u = (val - 1) / (val + 1);
  const u2 = u * u;
  const series = 2 * u * (1 + u2 * (
    0.3333333333333333333333 + u2 * (
      0.2 + u2 * (
        0.1428571428571428571429 + u2 * (
          0.1111111111111111111111 + u2 * (
            0.0909090909090909090909 + u2 * (
              0.0769230769230769230769 + u2 * (
                0.0666666666666666666667 + u2 * (
                  0.0588235294117647058824 + u2 * (
                    0.0526315789473684210526 + u2 * 0.0476190476190476190476
                  )
                )
              )
            )
          )
        )
      )
    )
  ));

  return k * D_LN2 + series;
}

/** Deterministic exponential function. */
export function dExp(x: number): number {
  if (x !== x) return NaN;
  if (x < -708) return 0;
  if (x > 709) return Infinity;
  if (x === 0) return 1;

  const k = Math.floor(x * D_LOG2E + 0.5);
  const r = x - k * D_LN2;

  // Taylor series for e^r on |r| <= 0.35
  const er = 1 + r * (
    1 + r * (
      0.5 + r * (
        0.16666666666666666667 + r * (
          0.04166666666666666667 + r * (
            0.00833333333333333333 + r * (
              0.00138888888888888889 + r * (
                0.00019841269841269841 + r * (
                  0.00002480158730158730 + r * (
                    0.00000275573192239859 + r * (
                      0.00000027557319223986 + r * (
                        0.00000002505210838544 + r * 0.00000000208767569879
                      )
                    )
                  )
                )
              )
            )
          )
        )
      )
    )
  );

  return er * dPow2Int(k);
}

/** Deterministic power function. */
export function dPow(base: number, exp: number): number {
  if (exp === 0) return 1;
  if (base === 1) return 1;
  if (base === 0) return exp > 0 ? 0 : Infinity;
  if (Math.floor(exp) === exp) {
    let e = Math.abs(exp);
    let b = exp < 0 ? 1 / base : base;
    let res = 1;
    while (e > 0) {
      if (e % 2 === 1) res *= b;
      b *= b;
      e = Math.floor(e / 2);
    }
    return res;
  }
  if (base < 0) return NaN;
  return dExp(exp * dLog(base));
}
