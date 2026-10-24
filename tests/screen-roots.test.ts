import { describe, it, expect } from 'vitest';

interface FsModule {
  readFileSync: (path: string, encoding: string) => string;
  readdirSync: (path: string) => string[];
}

interface PathModule {
  resolve: (...parts: string[]) => string;
}

// Dynamically import node built-ins in node environment without requiring @types/node
declare const process: { cwd: () => string };

describe('Phase D: Screen Roots & Pointer-Events Architecture', () => {
  let fs: FsModule;
  let path: PathModule;
  let root: string;

  it('scans every component file and fails if a screen root is created without the shared class (bs-screen)', async () => {
    const fsModName = 'node:fs';
    const pathModName = 'node:path';
    fs = (await import(/* @vite-ignore */ fsModName)) as unknown as FsModule;
    path = (await import(/* @vite-ignore */ pathModName)) as unknown as PathModule;
    root = process.cwd();

    // 1. Verify index.html does not rely on brittle ID allowlist
    const html = fs.readFileSync(path.resolve(root, 'index.html'), 'utf8');

    expect(html).not.toMatch(/#mode-select-view,\s*#room-link-view,\s*#settings-panel-view/);
    expect(html).toMatch(/\.bs-screen\s*\{\s*pointer-events:\s*auto;?\s*\}/);
    expect(html).toMatch(/(?:#hud|\.bs-hud)\s*\{\s*pointer-events:\s*none;?\s*\}/);
    expect(html).not.toContain('Comic Sans MS');
    expect(html).toContain('prefers-reduced-motion:reduce');
    expect(html).toMatch(/\.flicker-title\s*\{[^}]*animation:\s*none/);

    // 2. Scan all screens in src/ui/screens/
    const screensDir = path.resolve(root, 'src/ui/screens');
    const screenFiles = fs.readdirSync(screensDir).filter((f: string) => f.endsWith('.ts') && f !== 'ShareCard.ts');

    for (const file of screenFiles) {
      const code = fs.readFileSync(path.resolve(screensDir, file), 'utf8');
      const hasSharedClass = code.includes('bs-screen');
      expect(hasSharedClass, `Component src/ui/screens/${file} must declare 'bs-screen' on its root`).toBe(true);
    }

    // 3. Scan legacy / modal screens in src/ui/
    const legacyScreens = [
      'MainMenu.ts',
      'ModeSelect.ts',
      'SettingsPanel.ts',
      'HowToPlay.ts',
      'PauseMenu.ts',
      'DeathScreen.ts',
      'ResultsScreen.ts',
      'RoomLinkPanel.ts',
      'KeypadModal.ts',
      'AudioUnlock.ts',
      'LoadingScreen.ts',
      'MetaHubPanel.ts',
    ];

    for (const file of legacyScreens) {
      const code = fs.readFileSync(path.resolve(root, 'src/ui', file), 'utf8');
      const hasSharedClass = code.includes('bs-screen');
      expect(hasSharedClass, `Component src/ui/${file} must declare 'bs-screen' on its root`).toBe(true);
    }

    // 4. Verify Hud sets pointer-events: none via bs-hud
    const hudCode = fs.readFileSync(path.resolve(root, 'src/ui/Hud.ts'), 'utf8');
    expect(hudCode).toContain('bs-hud');
    expect(hudCode).toContain('pointer-events: none');
  });

  it('verifies UiLayerManager exports and public API', async () => {
    const { UiLayerManager } = await import('../src/ui/UiLayerManager.js');
    expect(UiLayerManager).toBeDefined();
    expect(typeof UiLayerManager.getInstance).toBe('function');
  });
});
