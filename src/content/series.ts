/**
 * Sample questions until the database lands. Numbers are illustrative.
 * History is built from keyframes (day, percent) so the charts look like real crowds, deterministically.
 */
export function series(days: number, keyframes: ReadonlyArray<readonly [number, number]>): number[] {
  return Array.from({ length: days }, (_, d) => {
    const next = keyframes.findIndex(([day]) => day >= d);
    const [d1, v1] = keyframes[Math.max(0, next)] ?? keyframes[keyframes.length - 1]!;
    const [d0, v0] = keyframes[Math.max(0, next - 1)] ?? [d1, v1];
    const t = d1 === d0 ? 1 : (d - d0) / (d1 - d0);
    const wobble = Math.sin(d * 1.7) * 0.8 + Math.sin(d * 0.6) * 0.6;
    return Math.round(Math.min(99, Math.max(1, v0 + (v1 - v0) * t + (d === days - 1 ? 0 : wobble))));
  });
}

