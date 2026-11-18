import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { take } = vi.hoisted(() => ({ take: vi.fn(async (): Promise<string | null> => "token") }));
vi.mock("@/lib/bot-check-client", () => ({ takeBotCheck: () => take(), warmBotCheck: () => {} }));

const sent: { at: number; slug: string; probability: number; altcha: string | null }[] = [];
const fetchMock = vi.fn(async (_url: string, init: { body: string; headers: Record<string, string> }) => {
  const body = JSON.parse(init.body) as { slug: string; probability: number };
  sent.push({ at: Date.now(), ...body, altcha: init.headers["x-altcha"] ?? null });
  return { ok: true, status: 200, json: async () => ({}) };
});

describe("pushCall", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("window", { dispatchEvent: () => true, addEventListener: () => {}, removeEventListener: () => {} });
    sent.length = 0;
    fetchMock.mockClear();
    vi.resetModules();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("sends at once with the ready token, and two changes never reach the server less than 2s apart", async () => {
    const { pushCall } = await import("@/lib/calls-store");
    pushCall("q-one", 40);
    await vi.advanceTimersByTimeAsync(0);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.altcha).toBe("token");
    await vi.advanceTimersByTimeAsync(2100); // a second change 2.1s after the first
    pushCall("q-one", 60);
    await vi.advanceTimersByTimeAsync(0);
    expect(sent).toHaveLength(2);
    pushCall("q-one", 70); // a third, straight after: has to wait for the gap
    await vi.advanceTimersByTimeAsync(2099);
    expect(sent).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(sent).toHaveLength(3);
    for (let i = 1; i < sent.length; i++) expect((sent[i]?.at ?? 0) - (sent[i - 1]?.at ?? 0)).toBeGreaterThanOrEqual(2100);
  });

  it("the newer value wins: only the latest of several quick changes is sent", async () => {
    const { pushCall } = await import("@/lib/calls-store");
    pushCall("q-two", 10);
    await vi.advanceTimersByTimeAsync(0);
    pushCall("q-two", 20);
    pushCall("q-two", 30);
    pushCall("q-two", 55);
    await vi.advanceTimersByTimeAsync(5000);
    expect(sent.map((s) => s.probability)).toEqual([10, 55]);
  });

  it("a newer value that arrives while the token is being solved replaces the older one", async () => {
    const { pushCall } = await import("@/lib/calls-store");
    let release: (t: string) => void = () => {};
    take.mockImplementationOnce(() => new Promise<string>((resolve) => (release = resolve)));
    pushCall("q-three", 11);
    await vi.advanceTimersByTimeAsync(0);
    pushCall("q-three", 22);
    release("late");
    await vi.advanceTimersByTimeAsync(5000);
    expect(sent.map((s) => s.probability)).toEqual([22]);
  });

  it("sends one request at a time per question, and questions don't wait for each other", async () => {
    const { pushCall } = await import("@/lib/calls-store");
    pushCall("q-a", 1);
    pushCall("q-b", 2);
    await vi.advanceTimersByTimeAsync(0);
    expect(sent.map((s) => s.slug).sort()).toEqual(["q-a", "q-b"]);
  });
});
