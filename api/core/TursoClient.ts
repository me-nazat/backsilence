/* ── api/core/TursoClient.ts ────────────────────────────────────────────────
 *  HTTP Pipeline client for Turso / libSQL Cloud.
 *  Uses zero SDK dependencies — standard fetch to /v2/pipeline with parameterized queries.
 *  Falls back cleanly to FakeLibsql for tests and offline dev.
 * ──────────────────────────────────────────────────────────────────────── */

import type { ServerEnv } from './Types.js';
import { FakeLibsql } from './FakeLibsql.js';

export function getOrCreateGlobalFakeDb(): FakeLibsql {
  return FakeLibsql.getDefault();
}


interface LibSqlArg {
  type: 'text' | 'integer' | 'float' | 'null';
  value?: string;
}

interface PipelineResponse {
  results?: Array<{
    type: string;
    response?: {
      result?: {
        cols: Array<{ name: string }>;
        rows: LibSqlArg[][];
        affected_row_count?: number;
      };
    };
    error?: { message: string };
  }>;
}

export class TursoClient {
  private readonly dbUrl: string;
  private readonly token: string;

  constructor(dbUrl = '', token = '') {
    this.dbUrl = dbUrl;
    this.token = token;
  }

  async execute(
    sql: string,
    params: (string | number | null)[] = [],
  ): Promise<Record<string, unknown>[]> {
    const res = await TursoClient.query(sql, params, {
      TURSO_DATABASE_URL: this.dbUrl,
      TURSO_AUTH_TOKEN: this.token,
    });
    return res.rows;
  }

  static async query(
    sql: string,
    params: (string | number | null)[] = [],
    env: ServerEnv = {},
  ): Promise<{ rows: Record<string, unknown>[]; rowsAffected: number }> {

    // 1. If explicit fakeDb or missing production credentials, use in-memory emulator
    if (env.fakeDb instanceof FakeLibsql) {
      return env.fakeDb.execute(sql, params);
    }
    if (!env.TURSO_DATABASE_URL || !env.TURSO_AUTH_TOKEN) {
      return getOrCreateGlobalFakeDb().execute(sql, params);
    }

    // 2. Production HTTP pipeline execution
    let baseUrl = env.TURSO_DATABASE_URL.trim();
    if (baseUrl.startsWith('libsql://')) {
      baseUrl = baseUrl.replace('libsql://', 'https://');
    }
    const endpoint = `${baseUrl.replace(/\/+$/, '')}/v2/pipeline`;

    const args: LibSqlArg[] = params.map((p) => {
      if (p === null || p === undefined) return { type: 'null' };
      if (typeof p === 'number') {
        return Number.isInteger(p)
          ? { type: 'integer', value: String(p) }
          : { type: 'float', value: String(p) };
      }
      return { type: 'text', value: String(p) };
    });

    const body = JSON.stringify({
      requests: [
        {
          type: 'execute',
          stmt: {
            sql,
            args,
          },
        },
        { type: 'close' },
      ],
    });

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.TURSO_AUTH_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Turso HTTP pipeline error [status ${res.status}]: ${errText}`);
    }

    const data = (await res.json()) as PipelineResponse;
    const firstResult = data.results?.[0];

    if (!firstResult) {
      return { rows: [], rowsAffected: 0 };
    }
    if (firstResult.error) {
      throw new Error(`Turso SQL error: ${firstResult.error.message}`);
    }

    const result = firstResult.response?.result;
    if (!result) {
      return { rows: [], rowsAffected: 0 };
    }

    const cols = result.cols.map((c) => c.name);
    const rows = result.rows.map((row) => {
      const obj: Record<string, unknown> = {};
      row.forEach((val, i) => {
        const col = cols[i]!;
        if (val.type === 'null') {
          obj[col] = null;
        } else if (val.type === 'integer' || val.type === 'float') {
          obj[col] = Number(val.value);
        } else {
          obj[col] = val.value ?? '';
        }
      });
      return obj;
    });

    return {
      rows,
      rowsAffected: result.affected_row_count ?? 0,
    };
  }
}
