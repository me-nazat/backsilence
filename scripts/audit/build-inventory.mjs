#!/usr/bin/env node
import { readdir, readFile, writeFile, stat } from 'node:fs/promises';
import { resolve, relative, extname } from 'node:path';

const ROOT = process.cwd();
const TARGET_DIRS = ['src', 'tests', 'scripts', 'public', 'api'];
const ROOT_CONFIGS = [
  'package.json',
  'tsconfig.json',
  'vite.config.ts',
  'vitest.config.ts',
  'eslint.config.js',
  'index.html'
];

async function getFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== '.git' && entry.name !== 'dist' && entry.name !== 'reports') {
        files.push(...(await getFiles(fullPath)));
      }
    } else {
      files.push(fullPath);
    }
  }
  return files;
}

function extractPurpose(content, ext) {
  const lines = content.split('\n');
  for (let i = 0; i < Math.min(lines.length, 25); i++) {
    const l = lines[i].trim();
    if (l.startsWith('*') && !l.startsWith('*/') && !l.includes('──') && l.length > 5) {
      const clean = l.replace(/^\*\s*/, '').trim();
      if (clean.length > 10 && !clean.startsWith('http') && !clean.startsWith('@')) {
        return clean.endsWith('.') ? clean : clean + '.';
      }
    }
    if (l.startsWith('//') && !l.includes('──') && l.length > 10) {
      const clean = l.replace(/^\/\/\s*/, '').trim();
      if (clean.length > 10) return clean.endsWith('.') ? clean : clean + '.';
    }
  }
  return 'Module supporting application architecture.';
}

function extractExports(content, ext) {
  if (['.json', '.webmanifest', '.svg', '.png', '.glb'].includes(ext)) {
    return 'Asset / Config resource';
  }
  const lines = content.split('\n');
  const exports = [];
  for (const line of lines) {
    const trimmed = line.trim();
    const match = trimmed.match(/^export\s+(default\s+)?(class|function|const|let|var|type|interface|enum)\s+([a-zA-Z0-9_$]+)/);
    if (match) {
      exports.push(match[3]);
    } else if (trimmed.startsWith('export default ')) {
      exports.push('default');
    } else if (trimmed.match(/^export\s*\{([^}]+)\}/)) {
      const inside = trimmed.match(/^export\s*\{([^}]+)\}/)[1];
      inside.split(',').forEach(s => {
        const name = s.trim().split(/\s+as\s+/)[0].trim();
        if (name) exports.push(name);
      });
    }
  }
  return exports.length > 0 ? exports.slice(0, 5).join(', ') + (exports.length > 5 ? ` (+${exports.length - 5} more)` : '') : 'none (script/entry)';
}

function evaluateStatusAndRisks(relPath, content, lineCount) {
  let status = 'WORKS';
  const risks = [];

  if (content.includes('TODO') || content.includes('FIXME')) {
    risks.push('Contains pending TODO/FIXME annotations');
  }
  if (content.includes('as any') || content.includes(': any')) {
    risks.push('Uses any type assertions');
  }
  if (lineCount > 300) {
    risks.push(`Large file (${lineCount} lines)`);
  }
  if (relPath.startsWith('src/sim/') && (content.includes('Math.random') || content.includes('Date.now') || content.includes('performance.now'))) {
    status = 'PARTIAL';
    risks.push('Potential non-determinism in sim');
  }

  return { status, risks: risks.length > 0 ? risks.join('; ') : 'None identified' };
}

async function run() {
  const allFiles = [];

  for (const d of TARGET_DIRS) {
    const dirPath = resolve(ROOT, d);
    try {
      allFiles.push(...(await getFiles(dirPath)));
    } catch {}
  }

  for (const c of ROOT_CONFIGS) {
    const configPath = resolve(ROOT, c);
    try {
      allFiles.push(configPath);
    } catch {}
  }

  const inventory = [];

  for (const file of allFiles) {
    const rel = relative(ROOT, file);
    const ext = extname(file);
    const isBinary = ['.png', '.glb', '.ico', '.woff', '.woff2'].includes(ext);

    let content = '';
    let lineCount = 0;

    if (!isBinary) {
      try {
        content = await readFile(file, 'utf8');
        lineCount = content.split('\n').length;
      } catch (err) {
        content = '';
      }
    } else {
      lineCount = 0;
    }

    const purpose = isBinary ? `Binary asset (${ext})` : extractPurpose(content, ext);
    const exportedApi = isBinary ? 'Binary data' : extractExports(content, ext);
    const { status, risks } = evaluateStatusAndRisks(rel, content, lineCount);

    inventory.push({
      path: rel,
      lineCount,
      purpose,
      exportedApi,
      status,
      risks
    });
  }

  inventory.sort((a, b) => a.path.localeCompare(b.path));

  await writeFile(resolve(ROOT, 'reports/audit/inventory.json'), JSON.stringify(inventory, null, 2));
  console.log(`✅ Inventory compiled: ${inventory.length} files cataloged into reports/audit/inventory.json`);
}

run().catch(console.error);
