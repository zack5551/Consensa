/**
 * Swing detection — the first M4 ("why it moved") building block.
 * Finds the biggest move in a question's daily history, so the chart summary
 * (and later, an AI "why it moved" draft) can name it instead of only
 * showing where the crowd started and ended.
 *
 * A swing is a change of at least SWING_MIN_POINTS over at most
 * SWING_WINDOW_DAYS days. Smaller moves are noise; a longer drift is a trend,
 * not a swing. Ties prefer the sharper (shorter) move, then the most recent.
 */
export const SWING_MIN_POINTS = 5;
export const SWING_WINDOW_DAYS = 7;

export type Swing = {
  /** Index into the history where the move starts (oldest day of the move). */
  startIndex: number;
  /** Index into the history where the move ends. */
  endIndex: number;
  /** Crowd probability (percent) at the start of the move. */
  from: number;
  /** Crowd probability (percent) at the end of the move. */
  to: number;
  /** Signed whole-point change: positive means the crowd moved up. */
  change: number;
};

/**
 * The largest move in `history` (oldest first), or null when no window of
 * 1–SWING_WINDOW_DAYS days moves by at least SWING_MIN_POINTS.
 */
export function largestSwing(history: readonly number[], windowDays = SWING_WINDOW_DAYS): Swing | null {
  let best: Swing | null = null;
  for (let length = 1; length <= windowDays; length++) {
    for (let end = history.length - 1; end >= length; end--) {
      const start = end - length;
      const from = history[start]!;
      const to = history[end]!;
      const change = to - from;
      if (Math.abs(change) >= SWING_MIN_POINTS && (!best || Math.abs(change) > Math.abs(best.change))) {
        best = { startIndex: start, endIndex: end, from, to, change };
      }
    }
  }
  return best;
}
