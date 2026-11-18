import "server-only";

/** Logs an error code and nothing else: a short, non-secret label, never an address, a token or a message that could hold one. */
export function logErrorCode(where: string, code: string | number | undefined): void {
  console.warn(`${where}: ${String(code ?? "unknown")}`);
}
