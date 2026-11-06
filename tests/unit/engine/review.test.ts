import { describe, expect, it } from "vitest";
import { approve, canMove, edit, newItem, publish, queueOrder, reject, requestChanges, ReviewError } from "@/engine/review";
import type { Flag } from "@/engine/types";
import { goodDraft, NOW } from "./helpers";

const later = new Date(NOW.getTime() + 60_000);
const item = (flags: Flag[] = [], priority = 50, id = "a") =>
  newItem({ id, storyId: "s", draft: goodDraft(), flags, provenance: ["https://www.cbc.ca/x"], priority, drafter: "mock", at: NOW });

describe("review queue", () => {
  it("queues clean drafts as pending and blocked drafts as autoRejected, with a reason", () => {
    expect(item().status).toBe("pending");
    const blocked = item([{ code: "harm", severity: "block", detail: "x" }]);
    expect(blocked.status).toBe("autoRejected");
    expect(blocked.history[0]).toMatchObject({ actor: "engine", to: "autoRejected", note: "harm" });
  });

  it("never lets a blocked draft be approved", () => {
    expect(() => approve(item([{ code: "gambling", severity: "block", detail: "x" }]), "ed", later)).toThrow(ReviewError);
  });

  it("makes the editor acknowledge each review flag by name", () => {
    const flagged = item([{ code: "manualResolver", severity: "review", detail: "x" }]);
    expect(() => approve(flagged, "ed", later)).toThrow(/manualResolver/);
    const ok = approve(flagged, "ed", later, ["manualResolver"]);
    expect(ok.status).toBe("approved");
    expect(ok.history.at(-1)).toMatchObject({ actor: "ed", from: "pending", to: "approved", note: "acknowledged manualResolver" });
  });

  it("needs a reason to reject, and rejected is final", () => {
    expect(() => reject(item(), "ed", later, " ")).toThrow(ReviewError);
    const r = reject(item(), "ed", later, "Not interesting");
    expect(r.status).toBe("rejected");
    expect(() => approve(r, "ed", later)).toThrow(ReviewError);
  });

  it("re-checks an edited draft, so an approval covers the exact words that ship", () => {
    const changes = requestChanges(item(), "ed", later, "Tighten the French");
    const d = goodDraft();
    const edited = edit(changes, "ed", later, { ...d, question: { ...d.question, fr: "Quelle est la cote du chômage?" } });
    expect(edited.status).toBe("pending");
    expect(edited.flags.some((f) => f.code === "gambling")).toBe(true);
    expect(() => approve(edited, "ed", later)).toThrow(ReviewError);
  });

  it("only publishes approved items", () => {
    expect(() => publish(item(), later)).toThrow(ReviewError);
    expect(publish(approve(item(), "ed", later), later).status).toBe("published");
    expect(canMove("published", "pending")).toBe(false);
  });

  it("orders the queue by status, then priority", () => {
    const order = queueOrder([item([], 10, "low"), item([], 90, "high"), item([{ code: "harm", severity: "block", detail: "" }], 99, "blocked")]);
    expect(order.map((i) => i.id)).toEqual(["high", "low"]);
  });
});
