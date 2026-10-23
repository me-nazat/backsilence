# 3D Creature Models Setup Guide (`MODELS_SETUP.md`)

BackSilence supports optional high-detail binary 3D models (`.glb`) for the **Water Monster** ("Thumper") and the **Ambient Flying Skulls** ("Hoefnagel Creature").

> [!NOTE]
> **Zero-Dependency Fallback:** If models are not installed in `public/models/`, BackSilence automatically uses procedural creature models (fully animated multi-joint segmented bodies). The game is 100% playable and passes all tests out-of-the-box without binary files.

---

## 1. Quick Setup (for Owner)

### Step 1: Download glTF Models from Sketchfab
Sketchfab requires a login, so models cannot be downloaded via automated headless scripts.

1. **Lethal Company Thumper Rig**
   - **Creator:** NO DONT EAT ME CASEOH (Ferris wheel) (@NO.DONT.EAT.ME.CASEOH)
   - **License:** CC BY 4.0
   - **URL:** https://sketchfab.com/3d-models/lethal-company-thumper-rig-a6bbf5cd0d284e1abcdff82f816b62b3
   - Click **Download 3D Model** -> Download **glTF (autoconverted)** `.zip`.

2. **Hoefnagel creature**
   - **Creator:** silicat
   - **License:** CC BY 4.0
   - **URL:** https://sketchfab.com/3d-models/hoefnagel-creature-9a92596a121f412299dfbc61b1bb01aa
   - Click **Download 3D Model** -> Download **glTF (autoconverted)** `.zip`.

---

### Step 2: Convert to GLB and Place in `public/models/`

Unzip each downloaded archive. In your terminal, run `npx @gltf-transform/cli` to convert each glTF folder to a single binary `.glb`:

```bash
# Convert Thumper
npx @gltf-transform/cli copy /path/to/unzipped/thumper/scene.gltf public/models/thumper.glb

# Convert Skull
npx @gltf-transform/cli copy /path/to/unzipped/hoefnagel/scene.gltf public/models/skull.glb
```

---

### Step 3: Run the Optimization Pipeline

Run the optimization script to deduplicate, prune unused nodes, resize textures to $\le 1024$ px, quantize, and decimate the skull model to $\le 8\text{k}$ triangles:

```bash
node scripts/prepare-models.mjs
```

The script will produce:
- `public/models/thumper.glb` (optimized $\le 1.5$ MB)
- `public/models/skull_lod0.glb` ($\le 8$k tris)
- `public/models/skull_lod1.glb` ($\le 2$k tris)
- `public/models/manifest.json`

---

## 2. Configuration & Skin Modes

In Settings or via query parameter `?skin=procedural`, you can toggle between skins:
- `auto` (default): Uses `public/models/thumper.glb` if present; falls back to procedural body if missing.
- `model`: Forces GLB loading; displays a debug toast if file not found.
- `procedural`: Forces the pure mathematical procedural body.

### Intellectual Property (IP) Caution
> [!CAUTION]
> While the Sketchfab model upload is licensed under **CC BY 4.0** by the modeler, the "Thumper" character concept originates from *Lethal Company* (Zeekerss). If BackSilence is ever distributed commercially or monetized, set `creatures.waterMonsterSkin: 'procedural'` to eliminate third-party trademark/copyright risk.

---

## 3. Attribution Requirement (CC BY 4.0)

If models are present, attribution is displayed in `CREDITS.md` and the in-game Credits screen:
- *"Lethal Company Thumper Rig" by NO DONT EAT ME CASEOH (Ferris wheel) (@NO.DONT.EAT.ME.CASEOH), CC BY 4.0.*
- *"Hoefnagel creature" by silicat, CC BY 4.0.*
