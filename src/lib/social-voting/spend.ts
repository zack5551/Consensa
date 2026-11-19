/**
 * The hard monthly spend cap for paid reads (X bills per post read). The running total lives in the database
 * through the injected store (AEGIS note 7), never in server memory: every server instance and every cycle sees
 * the same number, and a reservation is one atomic statement there. Amounts are millionths of a US dollar.
 */
import type { Platform } from "./types";

export interface SpendStore {
  /** Adds `micros` to the month's total unless that would pass `capMicros`. A negative amount hands some back. */
  reserve(platform: Platform, month: string, micros: number, capMicros: number): Promise<boolean>;
  /** The month's running total so far. */
  spent(platform: Platform, month: string): Promise<number>;
}

export const MICROS_PER_USD = 1_000_000;

export function usdToMicros(usd: number): number {
  return Number.isFinite(usd) && usd > 0 ? Math.round(usd * MICROS_PER_USD) : 0;
}

/** The first day of the month (UTC) the spend is counted under, as the database stores it. */
export function monthOf(now: Date): string {
  return `${now.toISOString().slice(0, 7)}-01`;
}

export class SpendCap {
  constructor(
    private readonly store: SpendStore,
    private readonly platform: Platform,
    private readonly capMicros: number,
  ) {}

  /** True when the read may go ahead. With no cap set (0) nothing is ever read, and the store isn't even asked. */
  async reserve(micros: number, now: Date): Promise<boolean> {
    if (this.capMicros <= 0 || !Number.isInteger(micros) || micros <= 0 || micros > this.capMicros) return false;
    try {
      return await this.store.reserve(this.platform, monthOf(now), micros, this.capMicros);
    } catch {
      return false; // if the counter can't be reached, don't spend
    }
  }

  /** What is left under the month's cap right now. 0 with no cap set, or when the counter can't be reached. */
  async remaining(now: Date): Promise<number> {
    if (this.capMicros <= 0) return 0;
    try {
      const spent = await this.store.spent(this.platform, monthOf(now));
      return Number.isFinite(spent) ? Math.max(0, this.capMicros - Math.max(0, Math.floor(spent))) : 0;
    } catch {
      return 0; // if the counter can't be reached, don't spend
    }
  }

  /** Hands back what a reservation didn't use. Best effort: a failure only makes the cap bite a little early. */
  async release(micros: number, now: Date): Promise<void> {
    if (this.capMicros <= 0 || !Number.isInteger(micros) || micros <= 0) return;
    await this.store.reserve(this.platform, monthOf(now), -micros, this.capMicros).catch(() => undefined);
  }
}
