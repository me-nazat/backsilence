/* ── AtmosphereService.ts ────────────────────────────────────────────────
 *  Atmosphere, fog, ambient hemisphere light, directional sunlight,
 *  shadow rig with player follower, water bounce light, and PMREM equirectangular
 *  environment texture setup.
 * ──────────────────────────────────────────────────────────────────────── */

import {
  FogExp2,
  Color,
  HemisphereLight,
  DirectionalLight,
  Object3D,
  Vector3,
  PMREMGenerator,
  Scene,
  type Texture,
} from 'three';
import type { MapDefinition } from '../../world/MapTypes.js';
import type { Settings } from '../../types/contracts.js';
import type { EngineRenderer } from '../../engine/Renderer.js';
import { resolveQualityTier } from '../../engine/Quality.js';
import { ShadowFollower } from './ShadowFollower.js';

export interface AtmosphereResult {
  envTexture: Texture | null;
  sunLight: DirectionalLight | null;
  sunTarget: Object3D | null;
  bounceLight: DirectionalLight | null;
  shadowFollower: ShadowFollower | null;
}

export function setupAtmosphere(
  scene: Scene,
  renderer: EngineRenderer,
  def: MapDefinition,
  settings: Settings,
  subMode?: string,
): AtmosphereResult {
  const tier = resolveQualityTier(settings.graphics.quality);

  let fogDensity = def.atmosphere.fog.density ?? 0.028;
  let fogColorHex = def.atmosphere.fog.color ?? '#d6dccd';
  let exposure = 1.0;

  const isLiminalPoolroom = def.id === 'natatorium' || def.id === 'poolrooms';

  if (isLiminalPoolroom) {
    fogColorHex = '#d6dccd'; // Reference measured horizon fog: #d6dccd
    fogDensity = 0.028;      // Analytic transmittance: 97.8% @ 5m, 69.8% @ 20m, 44.5% @ 30m
    exposure = 1.0;          // Calibrated 1.0 baseline
  } else if (def.id === 'drainage_core' || subMode === 'endless') {
    if (fogDensity > 0.025) fogDensity = 0.022;
    if (fogColorHex === '#040d0b' || fogColorHex === '#555555') fogColorHex = '#cfe0d5';
  }

  const fogColor = parseInt(fogColorHex.replace('#', '0x'), 16);
  scene.fog = new FogExp2(fogColor, fogDensity);
  scene.background = new Color(fogColor);
  renderer.renderer.setClearColor(fogColor, 1.0);
  renderer.setToneMapping(settings.graphics.toneMapping ?? 'agx');
  renderer.renderer.toneMappingExposure = exposure;

  let envTexture: Texture | null = null;
  if (typeof (renderer.renderer as unknown as { compile?: unknown })?.compile === 'function') {
    const pmrem = new PMREMGenerator(renderer.renderer);
    pmrem.compileEquirectangularShader();
    const envScene = new Scene();
    envScene.background = new Color(fogColor);
    const envTarget = pmrem.fromScene(envScene, 0.04);
    envTexture = envTarget.texture;
    scene.environment = envTexture;
    scene.environmentIntensity = 0.22; // prompt calibrated: 0.18–0.25
    pmrem.dispose();
  }

  // Re-balanced Hemisphere Light:
  // Sky: soft warm cream (#fff5db); Ground: muted olive (#506e4a) matching water bounce
  const skyHex = isLiminalPoolroom ? '#fff5db' : (def.atmosphere.hemisphere.sky ?? '#fff5db');
  const gndHex = isLiminalPoolroom ? '#506e4a' : (def.atmosphere.hemisphere.ground ?? '#506e4a');
  const skyColor = parseInt(skyHex.replace('#', '0x'), 16);
  const groundColor = parseInt(gndHex.replace('#', '0x'), 16);
  const hemiIntensity = 0.65; // Prompt calibrated: 0.55–0.75

  const hemi = new HemisphereLight(skyColor, groundColor, hemiIntensity);
  scene.add(hemi);

  // Water bounce light: dim, green-tinted upward light from below pool surface (#5a8c50, intensity 0.28)
  // Illuminates undersides of slabs and creature limbs with pool bounce
  const bounceLight = new DirectionalLight(0x5a8c50, 0.28);
  bounceLight.position.set(0, -10, 0);
  const bounceTarget = new Object3D();
  bounceTarget.position.set(0, 0, 0);
  scene.add(bounceTarget);
  bounceLight.target = bounceTarget;
  bounceLight.castShadow = false;
  scene.add(bounceLight);

  let sunLight: DirectionalLight | null = null;
  let sunTarget: Object3D | null = null;
  let shadowFollower: ShadowFollower | null = null;

  if (def.atmosphere.sun) {
    const sunColor = parseInt(def.atmosphere.sun.color.replace('#', '0x'), 16);
    // Key light intensity: 1.8 (prompt calibrated: 1.6–2.0)
    const sunIntensity = 1.8;
    const sun = new DirectionalLight(sunColor, sunIntensity);
    const dir = new Vector3(
      def.atmosphere.sun.direction.x,
      def.atmosphere.sun.direction.y,
      def.atmosphere.sun.direction.z,
    ).normalize();

    // Explicit sun.target added to scene graph so shadow camera has valid frustum
    sunTarget = new Object3D();
    sunTarget.name = 'SunTarget';
    sunTarget.position.set(0, 0, 0);
    scene.add(sunTarget);
    sun.target = sunTarget;

    // Connect the shadow rig!
    sun.castShadow = true;

    // Quality tier resolution & filtering
    if (tier === 'high') {
      sun.shadow.mapSize.set(2048, 2048);
      sun.shadow.radius = 3;
    } else if (tier === 'medium') {
      sun.shadow.mapSize.set(1024, 1024);
      sun.shadow.radius = 1.5;
    } else {
      sun.shadow.mapSize.set(1024, 1024);
      sun.shadow.radius = 1.0;
    }

    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;

    const d = 35.0; // 35m bounds covering playable room footprint around player
    sun.shadow.camera.left = -d;
    sun.shadow.camera.right = d;
    sun.shadow.camera.top = d;
    sun.shadow.camera.bottom = -d;
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 70.0;
    sun.shadow.camera.updateProjectionMatrix();

    sun.position.set(dir.x * 30, dir.y * 30, dir.z * 30);
    scene.add(sun);
    sunLight = sun;

    shadowFollower = new ShadowFollower(sun, sunTarget, dir, { distance: 30.0 });
  }

  return { envTexture, sunLight, sunTarget, bounceLight, shadowFollower };
}
