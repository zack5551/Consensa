import { describe, expect, it } from "vitest";
import { authErrorCode } from "@/lib/supabase/error-code";

describe("authErrorCode", () => {
  it("prefers Supabase's own code, then the HTTP status, then the error name", () => {
    expect(authErrorCode(null)).toBeNull();
    expect(authErrorCode({ code: "over_email_send_rate_limit", status: 429 })).toBe("over_email_send_rate_limit");
    expect(authErrorCode({ status: 401 })).toBe("http_401");
    expect(authErrorCode({ status: 0, name: "AuthRetryableFetchError" })).toBe("AuthRetryableFetchError");
  });
});
