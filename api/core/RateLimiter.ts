/* ── api/core/RateLimiter.ts ────────────────────────────────────────────────
 *  Sliding window rate limiter for the BackSilence API proxy.
 *  Protects /api/run/submit (20 runs/hour/player) and room operations (15/min/player).
 * ──────────────────────────────────────────────────────────────────────── */

import type { ServerEnv } from './Types.js';
import { TursoClient } from './TursoClient.js';

interface RateLimitConfig {
  bucket: string;
  maxRequests: number;
  windowSeconds: number;
}

export const RATE_LIMIT_CONFIGS: Record<string, RateLimitConfig> = {
  run_submit: {
    bucket: 'run_submit',
    maxRequests: 20,
    windowSeconds: 3600, // 1 hour
  },
  room_action: {
    bucket: 'room_action',
    maxRequests: 15,
    windowSeconds: 60, // 1 min
  },
  auth_login: {
    bucket: 'auth_login',
    maxRequests: 10,
    windowSeconds: 60, // 1 min
  },
};

export const RateLimiter = {
  async checkLimit(
    playerId: string,
    action: 'run_submit' | 'room_action' | 'auth_login',
    env: ServerEnv = {},
  ): Promise<{ allowed: boolean; remaining: number; retryAfterSec?: number }> {
    const config = RATE_LIMIT_CONFIGS[action];
    if (!config) return { allowed: true, remaining: 999 };

    const now = Math.floor(Date.now() / 1000);
    const windowStart = Math.floor(now / config.windowSeconds) * config.windowSeconds;

    try {
      // 1. Query current usage count in this window
      const queryRes = await TursoClient.query(
        'SELECT count FROM rate_limits WHERE player_id = ? AND bucket = ? AND window = ?',
        [playerId, config.bucket, windowStart],
        env,
      );

      const currentCount = Number(queryRes.rows[0]?.['count'] ?? 0);

      if (currentCount >= config.maxRequests) {
        const retryAfter = windowStart + config.windowSeconds - now;
        return {
          allowed: false,
          remaining: 0,
          retryAfterSec: Math.max(1, retryAfter),
        };
      }

      // 2. Increment usage count
      await TursoClient.query(
        'INSERT INTO rate_limits (player_id, bucket, window, count) VALUES (?, ?, ?, ?) ON CONFLICT (player_id, bucket, window) DO UPDATE SET count = count + 1',
        [playerId, config.bucket, windowStart, currentCount + 1],
        env,
      );

      return {
        allowed: true,
        remaining: config.maxRequests - (currentCount + 1),
      };
    } catch {
      // Graceful degradation on database errors (casual trust)
      return { allowed: true, remaining: 1 };
    }
  }
}
