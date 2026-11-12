/**
 * A short, non-secret label for a failed Supabase auth call (for example "over_email_send_rate_limit" or "http_401"),
 * shown under the failure message so a person can tell support what went wrong.
 */
export function authErrorCode(error: { code?: string; status?: number; name?: string } | null | undefined): string | null {
  if (!error) return null;
  if (error.code) return error.code;
  if (error.status) return `http_${error.status}`;
  return error.name ?? "unknown";
}
