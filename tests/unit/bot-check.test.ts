import { solveChallenge } from "altcha-lib";
import { deriveKey } from "altcha-lib/algorithms/pbkdf2";
vi.mock("server-only", () => ({}));
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { newChallenge, verifyBotCheck } from "@/lib/server/bot-check";

const encode = (challenge: unknown, solution: unknown) => Buffer.from(JSON.stringify({ challenge, solution })).toString("base64");

async function solved() {
  const challenge = await newChallenge();
  if (!challenge) throw new Error("no challenge");
  const solution = await solveChallenge({ challenge, deriveKey });
  if (!solution) throw new Error("not solved");
  return { challenge, payload: encode(challenge, solution) };
}

describe("verifyBotCheck", () => {
  beforeEach(() => vi.stubEnv("ALTCHA_HMAC_KEY", "test-key-test-key-test-key-test-key"));
  afterEach(() => vi.unstubAllEnvs());

  it("passes a solved challenge", async () => {
    expect(await verifyBotCheck((await solved()).payload)).toBe("pass");
  });

  it("fails a missing, malformed or wrong payload", async () => {
    for (const bad of [null, "", "not base64 json", encode({}, {}), Buffer.from("[]").toString("base64")]) expect(await verifyBotCheck(bad)).toBe("fail");
    const { challenge } = await solved();
    expect(await verifyBotCheck(encode(challenge, { counter: 1, derivedKey: "00" }))).toBe("fail");
  });

  it("fails a challenge signed with another key", async () => {
    const { payload } = await solved();
    vi.stubEnv("ALTCHA_HMAC_KEY", "a-different-key-a-different-key-1234");
    expect(await verifyBotCheck(payload)).toBe("fail");
  });

  it("fails a challenge used before (replay)", async () => {
    const { payload } = await solved();
    expect(await verifyBotCheck(payload)).toBe("pass");
    expect(await verifyBotCheck(payload)).toBe("fail");
  });

  it("is skipped when there is no key", async () => {
    vi.stubEnv("ALTCHA_HMAC_KEY", "");
    expect(await verifyBotCheck(null)).toBe("skipped");
    expect(await verifyBotCheck("anything")).toBe("skipped");
    expect(await newChallenge()).toBeNull();
  });
});
