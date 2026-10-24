/* ── Inventory.ts ──────────────────────────────────────────────────────────
 *  In-run item carry and action validation system.
 *  Pure, serializable, deterministic, host-authoritative.
 * ──────────────────────────────────────────────────────────────────────── */

export type ItemId =
  | 'pebble'
  | 'bottle'
  | 'noisemaker'
  | 'glow_stick'
  | 'battery_cell'
  | 'echo_bell'
  | 'tape_reel'
  | 'emp';

export interface ItemDef {
  id: ItemId;
  name: string;
  maxCarry: number;
  noiseProfile: {
    water: number;
    dry: number;
    delaySeconds?: number;
    durationSeconds?: number;
  };
  lightRadius?: number;
  lightDuration?: number;
  batteryBoostPercent?: number;
  empRadius?: number;
  empDuration?: number;
  isCollectible?: boolean;
}

export const ITEM_DEFS: Record<ItemId, ItemDef> = {
  pebble: {
    id: 'pebble',
    name: 'Pebble',
    maxCarry: 6,
    noiseProfile: { water: 0.6, dry: 0.2 },
  },
  bottle: {
    id: 'bottle',
    name: 'Glass Bottle',
    maxCarry: 3,
    noiseProfile: { water: 0.6, dry: 0.5 },
  },
  noisemaker: {
    id: 'noisemaker',
    name: 'Noisemaker Beacon',
    maxCarry: 2,
    noiseProfile: { water: 0.7, dry: 0.7, durationSeconds: 8.0 },
  },
  glow_stick: {
    id: 'glow_stick',
    name: 'Chemical Glow Stick',
    maxCarry: 3,
    noiseProfile: { water: 0.0, dry: 0.0 },
    lightRadius: 6.0,
    lightDuration: 90.0,
  },
  battery_cell: {
    id: 'battery_cell',
    name: 'Flashlight Battery Cell',
    maxCarry: 3,
    noiseProfile: { water: 0.0, dry: 0.0 },
    batteryBoostPercent: 60,
  },
  echo_bell: {
    id: 'echo_bell',
    name: 'Delayed Echo Bell',
    maxCarry: 1,
    noiseProfile: { water: 0.8, dry: 0.8, delaySeconds: 3.0 },
  },
  tape_reel: {
    id: 'tape_reel',
    name: 'Archival Tape Reel',
    maxCarry: 5,
    noiseProfile: { water: 0.0, dry: 0.0 },
    isCollectible: true,
  },
  emp: {
    id: 'emp',
    name: 'Electromagnetic Pulse (EMP)',
    maxCarry: 2,
    noiseProfile: { water: 0.3, dry: 0.3 },
    empRadius: 10.0,
    empDuration: 20.0,
  },
};

/**
 * Resource budget validator from Section 9:
 * A perfect run needs at most 70% of items placed;
 * A recovery run (1 death, 2 mistakes) needs at most 100%.
 */
export function validateResourceBudget(
  itemsUsed: number,
  totalPlaced: number,
  isRecoveryRun = false,
): { valid: boolean; ratio: number; maxAllowedRatio: number } {
  if (totalPlaced <= 0) return { valid: true, ratio: 0, maxAllowedRatio: isRecoveryRun ? 1.0 : 0.7 };
  const ratio = itemsUsed / totalPlaced;
  const maxAllowed = isRecoveryRun ? 1.0 : 0.7;
  return {
    valid: ratio <= maxAllowed + 0.001,
    ratio,
    maxAllowedRatio: maxAllowed,
  };
}

export interface InventorySnapshot {
  counts: Partial<Record<ItemId, number>>;
  activeSlot: ItemId | null;
  flashlightCharge: number; // 0..100
}

export class Inventory {
  private counts: Map<ItemId, number> = new Map();
  private activeSlot: ItemId | null = 'pebble';
  private flashlightCharge = 100.0;

  constructor(initialItems?: Partial<Record<ItemId, number>>) {
    if (initialItems) {
      for (const [id, count] of Object.entries(initialItems) as [ItemId, number][]) {
        this.add(id, count);
      }
    }
  }

  get(id: ItemId): number {
    return this.counts.get(id) ?? 0;
  }

  getActiveItem(): ItemId | null {
    return this.activeSlot;
  }

  getItemCount(id: ItemId): number {
    return this.get(id);
  }

  addItem(id: ItemId, quantity = 1): number {
    return this.add(id, quantity);
  }

  add(id: ItemId, quantity = 1): number {
    const def = ITEM_DEFS[id];
    if (!def || quantity <= 0) return 0;

    const current = this.get(id);
    const added = Math.min(quantity, def.maxCarry - current);
    if (added > 0) {
      this.counts.set(id, current + added);
      if (!this.activeSlot || this.get(this.activeSlot) === 0) {
        this.activeSlot = id;
      }
    }
    return added;
  }

  use(id: ItemId): boolean {
    const current = this.get(id);
    if (current <= 0) return false;

    this.counts.set(id, current - 1);

    if (id === 'battery_cell') {
      this.flashlightCharge = Math.min(100.0, this.flashlightCharge + (ITEM_DEFS.battery_cell.batteryBoostPercent ?? 60));
    }

    if (this.counts.get(id) === 0 && this.activeSlot === id) {
      this.cycleActiveItem();
    }

    return true;
  }

  cycleActiveItem(): ItemId | null {
    const available = (Object.keys(ITEM_DEFS) as ItemId[]).filter((id) => this.get(id) > 0 && !ITEM_DEFS[id].isCollectible);
    if (available.length === 0) {
      this.activeSlot = null;
      return null;
    }

    if (!this.activeSlot) {
      this.activeSlot = available[0]!;
      return this.activeSlot;
    }

    const idx = available.indexOf(this.activeSlot);
    const nextIdx = (idx + 1) % available.length;
    this.activeSlot = available[nextIdx]!;
    return this.activeSlot;
  }

  getFlashlightCharge(): number {
    return this.flashlightCharge;
  }

  drainFlashlight(dt: number, drainRatePerSec = 0.5): void {
    this.flashlightCharge = Math.max(0, this.flashlightCharge - dt * drainRatePerSec);
  }

  serialize(): InventorySnapshot {
    const counts: Partial<Record<ItemId, number>> = {};
    for (const [k, v] of this.counts.entries()) {
      if (v > 0) counts[k] = v;
    }
    return {
      counts,
      activeSlot: this.activeSlot,
      flashlightCharge: Number(this.flashlightCharge.toFixed(2)),
    };
  }

  hydrate(snapshot: InventorySnapshot): void {
    this.counts.clear();
    for (const [k, v] of Object.entries(snapshot.counts) as [ItemId, number][]) {
      this.counts.set(k, v);
    }
    this.activeSlot = snapshot.activeSlot;
    this.flashlightCharge = snapshot.flashlightCharge;
  }
}
