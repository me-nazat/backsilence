/* ── Economy.ts ────────────────────────────────────────────────────────────
 *  Static meta-currency calculation and transaction ledger.
 *  Spent strictly on cosmetics, loadout slot choices, and tape skips. Zero pay-to-win.
 * ──────────────────────────────────────────────────────────────────────── */

export interface Transaction {
  id: string;
  amount: number;
  type: 'earn' | 'spend';
  reason: string;
  timestamp: number;
}

export function computeRunStatic(
  finalScore: number,
  objectivesDone: number,
  isFirstRunOfDay = false,
): number {
  const base = Math.floor(finalScore / 40);
  const objBonus = objectivesDone * 10;
  const firstRunBonus = isFirstRunOfDay ? 20 : 0;
  return Math.max(0, base + objBonus + firstRunBonus);
}

export class EconomyLedger {
  private balance = 0;
  private history: Transaction[] = [];

  constructor(initialBalance = 0) {
    this.balance = Math.max(0, initialBalance);
  }

  getBalance(): number {
    return this.balance;
  }

  credit(amount: number, reason: string): boolean {
    if (amount <= 0) return false;
    this.balance += amount;
    this.history.push({
      id: `tx_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      amount,
      type: 'earn',
      reason,
      timestamp: Date.now(),
    });
    return true;
  }

  debit(amount: number, reason: string): boolean {
    if (amount <= 0 || this.balance < amount) return false;
    this.balance -= amount;
    this.history.push({
      id: `tx_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      amount,
      type: 'spend',
      reason,
      timestamp: Date.now(),
    });
    return true;
  }

  serialize(): { balance: number; historyCount: number } {
    return {
      balance: this.balance,
      historyCount: this.history.length,
    };
  }

  hydrate(data: { balance: number }): void {
    this.balance = Math.max(0, data.balance);
  }
}
