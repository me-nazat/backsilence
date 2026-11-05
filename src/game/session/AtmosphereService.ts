/* ── AtmosphereService.ts ────────────────────────────────────────────────
 *  Atmosphere, fog, ambient hemisphere light, directional sunlight,
 *  and PMREM equirectangular environment texture setup.
 * ──────────────────────────────────────────────────────────────────────── */

import {
  FogExp2,
  Color,
  HemisphereLight,
  DirectionalLight,
  PMREMGenerator,
  Scene,
  type Texture,
} from 'three';
import type { MapDefinition } from '../../world/MapTypes.js';
import type { Settings } from '../../types/contracts.js';
import type { EngineRenderer } from '../../engine/Renderer.js';

export interface AtmosphereResult {
  envTexture: Texture | null;
  sunLight: DirectionalLight | null;
}

export function setupAtmosphere(
  scene: Scene,
  renderer: EngineRenderer,
  def: MapDefinition,
  settings: Settings,
  subMode?: string,
): AtmosphereResult {
    let fogDensity = def.atmosphere.fog.density;
    let fogColorHex = def.atmosphere.fog.color;
    if (def.id === 'drainage_core' || subMode === 'endless') {
      if (fogDensity > 0.014) fogDensity = 0.013;
      if (fogColorHex === '#040d0b' || fogColorHex === '#555555') fogColorHex = '#cfe0d5';
    }
    const fogColor = parseInt(fogColorHex.replace('#', '0x'), 16);
    scene.fog = new FogExp2(fogColor, fogDensity);
    scene.background = new Color(fogColor);
    renderer.renderer.setClearColor(fogColor, 1.0);
    renderer.setToneMapping(settings.graphics.toneMapping ?? 'agx');
    renderer.renderer.toneMappingExposure = def.atmosphere.exposure ?? 1.12;

    const pmrem = new PMREMGenerator(renderer.renderer);
    pmrem.compileEquirectangularShader();
    const envScene = new Scene();
    envScene.background = new Color(fogColor);
    const envTarget = pmrem.fromScene(envScene, 0.04);
    const envTexture = envTarget.texture;
    scene.environment = envTexture;
    scene.environmentIntensity = 0.35;
    pmrem.dispose();

    const skyColor = parseInt(def.atmosphere.hemisphere.sky.replace('#', '0x'), 16);
    const groundColor = parseInt(def.atmosphere.hemisphere.ground.replace('#', '0x'), 16);
    const hemi = new HemisphereLight(skyColor, groundColor, def.atmosphere.hemisphere.intensity ?? 1.25);
    scene.add(hemi);

    let sunLight: DirectionalLight | null = null;
    if (def.atmosphere.sun) {
      const sunColor = parseInt(def.atmosphere.sun.color.replace('#', '0x'), 16);
      const sun = new DirectionalLight(sunColor, def.atmosphere.sun.intensity);
      const dir = def.atmosphere.sun.direction;
      sun.position.set(dir.x * 30, dir.y * 30, dir.z * 30);
      scene.add(sun);
      sunLight = sun;
    }

    return { envTexture, sunLight };
  }
