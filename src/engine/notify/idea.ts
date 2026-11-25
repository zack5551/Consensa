/** What the review page says after the editor suggests a question. Plain English, for the editor only. */
import type { RunResult } from "@/engine/run";
import type { EngineStore } from "@/engine/store";

export async function ideaNotice(result: Pick<RunResult, "report" | "draftAllowance" | "published">, store: Pick<EngineStore, "getItem">): Promise<{ ok: boolean; message: string }> {
  if (result.draftAllowance <= 0) return { ok: false, message: "Today's writing limit is used up, so nothing was written. Try again tomorrow, or raise ENGINE_DAILY_DRAFTS in Vercel." };
  const d = result.report.decisions[0];
  if (!d) return { ok: false, message: "Nothing was written. Try wording the idea as a question about something that will happen." };
  switch (d.decision) {
    case "blockedStory":
      return { ok: false, message: `That topic is off limits for CANsensus: ${d.flags.map((f) => f.detail).join(" ")}` };
    case "skipped":
      return { ok: false, message: `The writer couldn't make a fair question from that: ${d.reason}` };
    case "error":
      return { ok: false, message: `Something went wrong while writing it (${d.reason}). Try again in a minute.` };
    case "autoRejected":
      return { ok: false, message: "The writer's version failed a hard rule, so it was set aside. Try a different angle." };
    case "queued": {
      const item = await store.getItem(d.itemId);
      const q = item?.draft.question.en ?? d.headline;
      if (item && result.published.includes(item.draft.slug)) return { ok: true, message: `Written and live on the site: "${q}"` };
      return { ok: true, message: `Written: "${q}". It's waiting below for your OK.` };
    }
  }
}
