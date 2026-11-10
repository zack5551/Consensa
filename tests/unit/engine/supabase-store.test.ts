import { describe, expect, it } from "vitest";
import { toSiteQuestion } from "@/engine/live";
import { newItem, publish } from "@/engine/review";
import { applyDashboardStatus, SupabaseStore, type FetchFn } from "@/engine/supabase-store";
import type { Flag, QueueItem } from "@/engine/types";
import { goodDraft, NOW } from "./helpers";

const item = (flags: Flag[] = []): QueueItem =>
  newItem({ id: "q1", storyId: "s", draft: goodDraft(), flags, provenance: ["https://www.cbc.ca/x"], priority: 50, drafter: "mock", at: NOW });

const reviewFlag: Flag = { code: "minors", severity: "review", detail: "x" };
const blockFlag: Flag = { code: "harm", severity: "block", detail: "x" };

describe("dashboard review", () => {
  it("turns a dashboard approval into an approve step that acknowledges review flags", () => {
    const out = applyDashboardStatus(item([reviewFlag]), "approved", "editor", NOW);
    expect(out.status).toBe("approved");
    expect(out.history.at(-1)).toMatchObject({ actor: "editor", from: "pending", to: "approved" });
  });

  it("refuses to approve a blocked draft or skip straight to published", () => {
    expect(applyDashboardStatus(item([blockFlag]), "approved", "editor", NOW).status).toBe("autoRejected");
    expect(applyDashboardStatus(item(), "published", "editor", NOW).status).toBe("pending");
  });

  it("logs a rejection with a reason", () => {
    expect(applyDashboardStatus(item(), "rejected", "editor", NOW).history.at(-1)?.note).toMatch(/dashboard/);
  });
});

describe("SupabaseStore", () => {
  it("reconciles a status changed in the dashboard and writes the item back", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fake: FetchFn = async (url, init) => {
      calls.push({ url, init });
      if (!init?.method) return new Response(JSON.stringify([{ id: "q1", status: "approved", item: item() }]));
      return new Response("");
    };
    const store = new SupabaseStore({ url: "https://x.supabase.co/", secretKey: "sb_secret_0123456789abcdef", fetch: fake, now: () => NOW });
    const [got] = await store.items();
    expect(got?.status).toBe("approved");
    expect(calls[0]?.url).toBe("https://x.supabase.co/rest/v1/engine_queue?select=id,status,item&order=created_at.asc&limit=5000");
    const write = calls[1];
    expect(write?.init?.method).toBe("POST");
    expect(JSON.parse(String(write?.init?.body))[0]).toMatchObject({ id: "q1", status: "approved" });
    expect((write?.init?.headers as Record<string, string>).apikey).toBe("sb_secret_0123456789abcdef");
  });

  it("throws with the status when Supabase refuses", async () => {
    const store = new SupabaseStore({ url: "https://x.supabase.co", secretKey: "sb_secret_0123456789abcdef", fetch: async () => new Response("nope", { status: 401 }) });
    await expect(store.wasDrafted("s")).rejects.toThrow(/401/);
  });
});

describe("toSiteQuestion", () => {
  it("makes a valid site question with an empty crowd", () => {
    const q = toSiteQuestion(publish({ ...item(), status: "approved" }, NOW));
    expect(q.forecasters).toBe(0);
    expect(q.history).toEqual([50, 50]);
    expect(q.resolution.result).toBeUndefined();
  });
});
