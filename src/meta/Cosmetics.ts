/* ── Cosmetics.ts ──────────────────────────────────────────────────────────
 *  Procedural cosmetic items catalog: flashlights, jackets, hoods, splash tints,
 *  tape labels, nameplates, rank emblems, and silent emotes.
 *  Zero gameplay advantage, 100% procedural, purchasable with Static.
 * ──────────────────────────────────────────────────────────────────────── */

export type CosmeticCategory =
  | 'flashlight'
  | 'jacket'
  | 'hood'
  | 'splash_tint'
  | 'tape_label'
  | 'nameplate'
  | 'silent_emote';

export interface CosmeticDef {
  id: string;
  category: CosmeticCategory;
  name: string;
  description: string;
  costStatic: number;
  paletteValue?: string; // hex color or style token
}

export const COSMETIC_CATALOG: readonly CosmeticDef[] = [
  // Flashlights
  {
    id: 'flashlight_standard',
    category: 'flashlight',
    name: 'Industrial Heavy Duty',
    description: 'Standard black rubberized survey flashlight.',
    costStatic: 0,
    paletteValue: '#2a2a2a',
  },
  {
    id: 'flashlight_brass',
    category: 'flashlight',
    name: 'Patinated Brass',
    description: 'Turn-of-the-century nautical inspection torch.',
    costStatic: 350,
    paletteValue: '#bfa054',
  },
  {
    id: 'flashlight_duck',
    category: 'flashlight',
    name: 'Squeaky Rubber Duck',
    description: 'A cheerful yellow bathtub duck fitted with a high-intensity bulb. Squeaks harmlessly.',
    costStatic: 800,
    paletteValue: '#ffd43f',
  },
  {
    id: 'flashlight_tactical',
    category: 'flashlight',
    name: 'Matte Olive Tactical',
    description: 'Military-grade anodized aluminum casing with knurled grip.',
    costStatic: 450,
    paletteValue: '#4b5320',
  },

  // Jackets
  {
    id: 'jacket_yellow',
    category: 'jacket',
    name: 'Classic Yellow Slicker',
    description: 'Traditional bright yellow maritime rain jacket.',
    costStatic: 0,
    paletteValue: '#f7d038',
  },
  {
    id: 'jacket_orange',
    category: 'jacket',
    name: 'Safety Hazard Orange',
    description: 'High-visibility municipal worker trench coat.',
    costStatic: 250,
    paletteValue: '#ff6700',
  },
  {
    id: 'jacket_navy',
    category: 'jacket',
    name: 'Abyssal Navy',
    description: 'Deep midnight blue waterproof fabric.',
    costStatic: 400,
    paletteValue: '#12233c',
  },
  {
    id: 'jacket_slate',
    category: 'jacket',
    name: 'Concrete Slate',
    description: 'Brutalist gray raincoat blending into municipal tiles.',
    costStatic: 300,
    paletteValue: '#54585a',
  },

  // Hoods
  {
    id: 'hood_raised',
    category: 'hood',
    name: 'Weather Cowl (Raised)',
    description: 'Hood pulled up against ceiling condensation.',
    costStatic: 0,
  },
  {
    id: 'hood_lowered',
    category: 'hood',
    name: 'Draped Collar (Lowered)',
    description: 'Hood folded back across the collar.',
    costStatic: 150,
  },

  // Splash Tints (purely cosmetic water particle tint)
  {
    id: 'splash_tint_default',
    category: 'splash_tint',
    name: 'Milky Mineral',
    description: 'Default pale poolrooms water tint.',
    costStatic: 0,
    paletteValue: '#a8d8cf',
  },
  {
    id: 'splash_tint_algae',
    category: 'splash_tint',
    name: 'Bioluminescent Algae',
    description: 'Subtle emerald shimmer on surface ripples.',
    costStatic: 650,
    paletteValue: '#3fe8aa',
  },
  {
    id: 'splash_tint_tea',
    category: 'splash_tint',
    name: 'Tannin Tea',
    description: 'Murky sunken botanical garden runoff.',
    costStatic: 500,
    paletteValue: '#8c6239',
  },

  // Tape Labels
  {
    id: 'tape_label_standard',
    category: 'tape_label',
    name: 'Archival White Stamp',
    description: 'Standard white masking tape with typed log number.',
    costStatic: 0,
  },
  {
    id: 'tape_label_classified',
    category: 'tape_label',
    name: 'Classified Red Band',
    description: 'Bright red security tape marked RESTRICTED.',
    costStatic: 300,
  },
  {
    id: 'tape_label_scuffed',
    category: 'tape_label',
    name: 'Water-Damaged Faded',
    description: 'Peeled label with smeared typewriter ink.',
    costStatic: 200,
  },

  // Nameplates & Crests
  {
    id: 'nameplate_surveyor',
    category: 'nameplate',
    name: 'Municipal Surveyor Plate',
    description: 'Clean brushed steel player card frame.',
    costStatic: 0,
  },
  {
    id: 'nameplate_deep_diver',
    category: 'nameplate',
    name: 'Deep Diver Brass Card',
    description: 'Decorated with riveted bathysphere trim.',
    costStatic: 550,
  },
  {
    id: 'badge_phantom',
    category: 'nameplate',
    name: 'Phantom Archivist Crest',
    description: 'Reserved for high-tier competitors and collectors.',
    costStatic: 1200,
  },

  // Silent Emotes (no acoustic noise emitted)
  {
    id: 'emote_shush',
    category: 'silent_emote',
    name: 'Shush (Finger to Lips)',
    description: 'Signals silence to teammates. Emits 0 sound.',
    costStatic: 150,
  },
  {
    id: 'emote_wave',
    category: 'silent_emote',
    name: 'Cautious Hand Wave',
    description: 'Gentle greeting across the flooded hall. Emits 0 sound.',
    costStatic: 150,
  },
  {
    id: 'emote_point',
    category: 'silent_emote',
    name: 'Direct Point',
    description: 'Directs attention silently to a trench or perch. Emits 0 sound.',
    costStatic: 150,
  },
  {
    id: 'emote_thumbs_up',
    category: 'silent_emote',
    name: 'Silent Thumbs Up',
    description: 'Confirms puzzle readiness. Emits 0 sound.',
    costStatic: 150,
  },
];
