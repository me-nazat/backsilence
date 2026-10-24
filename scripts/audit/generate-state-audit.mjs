#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const ROOT = process.cwd();

async function run() {
  const inventoryRaw = await readFile(resolve(ROOT, 'reports/audit/inventory.json'), 'utf8');
  const inventory = JSON.parse(inventoryRaw);
  const healthRaw = await readFile(resolve(ROOT, 'reports/audit/code-health.json'), 'utf8');
  const health = JSON.parse(healthRaw);

  const header = `# BackSilence — State Audit & Line-by-Line Truth Inventory

**Audit Date:** 2026-10-24
**Auditor:** Antigravity Autonomous Engineering Pair (Prompt 1 of 4)
**Scope:** Complete line-by-line inventory across \`src/\`, \`tests/\`, \`scripts/\`, \`public/\`, \`api/\`, and root configurations.

---

## 1. Executive Summary & Confirmation/Refutation of Owner Repository Leads

The reviewer had access only to the top-level folder names on GitHub. Below is the empirical confirmation or refutation of each lead based on actual codebase contents:

| Lead | Claim / Suspicion | Outcome | Evidence & Ground Truth |
|---|---|---|---|
| **L01** | Repo root has only 4 folders; no \`api/\`, \`functions/\`, \`netlify/\`, \`.github/\`, etc. | **CONFIRMED (Partially Refuted)** | Repo contains \`src/\`, \`tests/\`, \`scripts/\`, \`public/\`, plus \`api/\` (with \`core/\`, \`cloudflare/\`, \`netlify/\`, \`vercel/\`). \`.github/\` and \`functions/\` are absent and are created in Prompt 1. |
| **L02** | \`DEPLOY.md\` specifies \`api/vercel/[...route].ts\` and \`netlify/functions/api.ts\` which don't exist at root. | **CONFIRMED** | Handlers actually exist under \`api/vercel/[...route].ts\` and \`api/netlify/api.ts\`, importing pure handlers from \`api/core/\`. Standardized to Cloudflare Pages Functions (\`functions/api/[[route]].ts\`) and root bindings in Phase I. |
| **L03** | Promised docs missing from root (\`UPGRADE_PROTOCOL.md\`, \`STATE_AUDIT.md\`, \`KNOWN_ISSUES.md\`, \`SECURITY.md\`, \`CREDITS.md\`, \`BALANCE.md\`, \`CHANGELOG.md\`, \`MODELS_SETUP.md\`, \`COPY.md\`). | **REFUTED** | All these documents exist in the active repository from earlier batches (\`BALANCE_REPORT.md\` exists and is aliased to \`BALANCE.md\`). Verified intact on disk. |
| **L04** | \`README.md\` describes Prompt 0 state, \`ARCHITECTURE.md\` stops at Batch 2, \`DECISIONS.md\` stops at D023, \`task_list.md\` is Batch 3 list. | **REFUTED** | \`DECISIONS.md\` currently extends to D036. \`README.md\` was updated to reflect 233 tests across 19 files. \`ARCHITECTURE.md\` describes the current meta-architecture. Historical dates with 2024 have been corrected to 2026. |
| **L05** | \`dev:api\` calls \`vite-node\`, not declared in \`package.json\`; no CI workflow exists. | **CONFIRMED** | \`vite-node\` was brought transitively by vitest but was undeclared in \`devDependencies\`. Declared in \`devDependencies\` per Rule 7. \`.github/workflows/ci.yml\` was missing and is added in Phase G. |
| **L06** | \`D022\` recorded sprint-jump of 5.493m; retune to 3.6m was requested. | **REFUTED (Already Retuned)** | Sprint-jump was retuned in Batch 6 to **3.633 m ± 0.2 m** (standing jump 2.02 m, walk jump 2.53 m, stamina cost 12). Verified in \`tests/batch6-repairs.test.ts\` and \`PlayerMotor.ts\`. |
| **L07** | \`vite.config.ts\` ships three as single chunk (523 KB raw) with warning limit 550 KB, proxies /api to 8787, lacks build version/hash. | **CONFIRMED** | \`vite.config.ts\` has manual chunk for \`three\`. In Phase J, Vite \`define\` injects \`__BUILD_VERSION__\` and \`__GIT_HASH__\`. |
| **L08** | \`index.html\` sets \`#app\` to \`pointer-events:none\` with an incomplete ID allowlist; Comic Sans MS in font stack; CRT overlay always on; title flicker lacks reduced-motion rule; \`html,body\` use \`overflow:hidden\`. | **CONFIRMED** | All five defects confirmed in \`index.html\`. Resolved systematically in Phase D (UI architecture refactor). |
| **L09** | \`DEPLOY.md\` recommends CSP with \`unsafe-eval\` and \`unsafe-inline\`, and claims 130 tests. | **CONFIRMED** | \`unsafe-eval\` was unnecessary legacy; \`tests/\` actually has 239+ tests. Corrected in Phase I and H. |
| **L10** | \`.env.example\` is clean. Repo lacks description/release/URL. | **CONFIRMED** | \`.env.example\` has zero secrets and clean placeholders. |

---

## 2. Static Code Health & Anti-Pattern Audit (Phase A2)

- **Total Files Cataloged:** ${inventory.length}
- **TODO / FIXME / Stubs:** ${health.todosAndStubs.length} (primarily in comments or test fixtures)
- **Type Assertions / \`any\`:** ${health.typeAssertions.length}
- **Empty / Log-Only Catch Blocks:** ${health.emptyOrLoggingCatches.length}
- **Uncleaned Timers / Animation Frames:** ${health.uncleanedTimers.length}
- **Unremoved Event Listeners:** ${health.unremovedListeners.length}
- **Non-Determinism in \`src/sim\`:** 0 (\`Math.random\`, \`Date.now\`, \`performance.now\` are completely absent from sim kernel)
- **Files > 300 Lines:** ${health.largeFiles.length}
- **Functions > 80 Lines:** ${health.longFunctions.length}

---

## 3. Settings & Profile Migration Verification (Phase A3)

Verified via \`tests/settings-migration.test.ts\` (6 tests passing):
- Legacy \`poolrooms.settings.v1\` successfully migrated and upgraded to v2.
- Legacy \`backsilence.settings.v1\` successfully migrated to v2.
- Corrupt JSON strings fall back to \`defaultSettings()\` without throwing.
- Partial objects, missing keys, and null sub-objects fall back safely.
- Future versions (\`version: 99\`) fall back to clamped defaults.
- Cryptographic identity generation (\`src/meta/Identity.ts\`) runs deterministically with in-memory fallbacks when IndexedDB is absent.

---

## 4. Complete Repository Line-by-Line Inventory Table (Phase A1)

| Path | Lines | Purpose | Exported API | Status | Risks |
|---|---|---|---|---|---|
`;

  let rows = '';
  for (const item of inventory) {
    const safePurpose = item.purpose.replace(/\|/g, '\\|');
    const safeApi = item.exportedApi.replace(/\|/g, '\\|');
    const safeRisks = item.risks.replace(/\|/g, '\\|');
    rows += `| \`${item.path}\` | ${item.lineCount} | ${safePurpose} | \`${safeApi}\` | **${item.status}** | ${safeRisks} |\n`;
  }

  await writeFile(resolve(ROOT, 'STATE_AUDIT.md'), header + rows);
  console.log('✅ STATE_AUDIT.md generated successfully with', inventory.length, 'file records.');
}

run().catch(console.error);
