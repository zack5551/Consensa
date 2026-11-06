import { afterEach, describe, expect, it } from "vitest";
import { recentEvents, setAnalyticsTransport, sourceFromReferrer, track, type TrackedEvent } from "@/lib/analytics";

afterEach(() => setAnalyticsTransport(null));

describe("analytics", () => {
  it("sends valid events to the transport", () => {
    const sent: TrackedEvent[] = [];
    setAnalyticsTransport((e) => sent.push(e));
    track("call_made", { locale: "fr", slug: "boc-cut-dec-2026", value: 40, gapToCrowd: 2, scored: true, changed: false });
    expect(sent).toHaveLength(1);
    expect(sent[0]?.name).toBe("call_made");
  });

  it("drops events that don't match their schema", () => {
    const sent: TrackedEvent[] = [];
    setAnalyticsTransport((e) => sent.push(e));
    // a call is 1–99, so this is dropped
    track("call_made", { locale: "en", slug: "x", value: 120, gapToCrowd: 0, scored: true, changed: false });
    expect(sent).toHaveLength(0);
  });

  it("keeps a short buffer without a transport", () => {
    track("screen_viewed", { locale: "en", screen: "today" });
    expect(recentEvents().at(-1)?.name).toBe("screen_viewed");
  });

  it("buckets where people came from without keeping the URL", () => {
    expect(sourceFromReferrer("", null)).toBe("direct");
    expect(sourceFromReferrer("https://www.google.ca/search?q=x", null)).toBe("search");
    expect(sourceFromReferrer("https://www.reddit.com/r/canada", null)).toBe("social");
    expect(sourceFromReferrer("https://example.org/", null)).toBe("other");
    expect(sourceFromReferrer("https://example.org/", "share")).toBe("share");
    expect(sourceFromReferrer("", "cpc")).toBe("ad");
    expect(sourceFromReferrer("not a url", null)).toBe("other");
  });
});
