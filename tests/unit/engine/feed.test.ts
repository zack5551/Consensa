import { describe, expect, it } from "vitest";
import { parseFeed, stripHtml } from "@/engine/sources/feed";
import { getSource, isResolutionDomain, sources } from "@/engine/sources/registry";
import { sampleFeedResults } from "@/engine/sources/sample-feeds";

const cbc = getSource("cbc-canada")!;
const statcan = getSource("statcan-daily-en")!;

describe("parseFeed", () => {
  it("reads RSS 2.0 items and strips HTML", () => {
    const xml = `<rss version="2.0"><channel><item><title>Snow &amp; ice in &lt;b&gt;Halifax&lt;/b&gt;</title>
      <description><![CDATA[<p>Up to <b>20 cm</b> expected.</p><script>alert(1)</script>]]></description>
      <link>https://www.cbc.ca/news/a</link><pubDate>Fri, 06 Nov 2026 10:00:00 GMT</pubDate></item></channel></rss>`;
    const { signals, dropped } = parseFeed(xml, cbc);
    expect(dropped).toBe(0);
    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({ title: "Snow & ice in Halifax", summary: "Up to 20 cm expected.", url: "https://www.cbc.ca/news/a", publishedAt: "2026-11-06T10:00:00.000Z", lang: "en", kind: "news" });
  });

  it("reads Atom entries and picks the alternate link", () => {
    const xml = `<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Labour Force Survey, October 2026</title>
      <link rel="self" href="https://example.ca/self"/><link rel="alternate" href="https://www150.statcan.gc.ca/n1/daily-quotidien/x"/>
      <updated>2026-11-06T13:30:00Z</updated><summary>Jobs</summary></entry></feed>`;
    const { signals } = parseFeed(xml, statcan);
    expect(signals[0]).toMatchObject({ url: "https://www150.statcan.gc.ca/n1/daily-quotidien/x", kind: "official", weight: 2 });
  });

  it("drops items with no date, no link or a non-http link instead of guessing", () => {
    const xml = `<rss><channel>
      <item><title>No date</title><link>https://www.cbc.ca/a</link></item>
      <item><title>No link</title><pubDate>Fri, 06 Nov 2026 10:00:00 GMT</pubDate></item>
      <item><title>Script link</title><link>javascript:alert(1)</link><pubDate>Fri, 06 Nov 2026 10:00:00 GMT</pubDate></item>
      <item><title>Fine</title><link>https://www.cbc.ca/b</link><pubDate>Fri, 06 Nov 2026 10:00:00 GMT</pubDate></item>
    </channel></rss>`;
    const { signals, dropped } = parseFeed(xml, cbc);
    expect(signals.map((s) => s.title)).toEqual(["Fine"]);
    expect(dropped).toBe(3);
  });

  it("survives garbage without throwing", () => {
    expect(parseFeed("<<<not xml", cbc).signals).toEqual([]);
    expect(parseFeed("", cbc).signals).toEqual([]);
  });

  it("gives the same item the same id on every fetch", () => {
    const xml = `<rss><channel><item><title>A</title><link>https://www.cbc.ca/a</link><pubDate>Fri, 06 Nov 2026 10:00:00 GMT</pubDate></item></channel></rss>`;
    expect(parseFeed(xml, cbc).signals[0]!.id).toBe(parseFeed(xml, cbc).signals[0]!.id);
  });

  it("strips tags and scripts", () => {
    expect(stripHtml("<p>a</p><style>x{}</style><script>y()</script> b")).toBe("a b");
  });
});

describe("source registry", () => {
  it("has unique ids and both languages", () => {
    expect(new Set(sources.map((s) => s.id)).size).toBe(sources.length);
    expect(sources.some((s) => s.lang === "fr")).toBe(true);
    expect(sources.some((s) => s.kind === "official")).toBe(true);
  });

  it("only accepts official domains as resolution sources, matching whole labels", () => {
    expect(isResolutionDomain("https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=1")).toBe(true);
    expect(isResolutionDomain("https://www.bankofcanada.ca/rates/")).toBe(true);
    expect(isResolutionDomain("https://www.cbc.ca/news")).toBe(false);
    expect(isResolutionDomain("https://bankofcanada.ca.evil.example/")).toBe(false);
    expect(isResolutionDomain("https://notbankofcanada.ca/")).toBe(false);
    expect(isResolutionDomain("not a url")).toBe(false);
  });

  it("parses every sample feed cleanly", () => {
    for (const r of sampleFeedResults()) {
      expect(r.dropped, r.sourceId).toBe(0);
      expect(r.signals.length, r.sourceId).toBeGreaterThan(0);
    }
  });
});
