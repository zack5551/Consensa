import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

import { shareCardImage } from "@/components/share-card-image";
import { SAMPLE_NOW, sampleQuestions } from "@/content/sample-questions";
import { questionSchema } from "@/lib/question";

/**
 * Renders the share card with a test sponsor label (a fixture: no shipped question has one). Set SHARE_CARD_SHOTS to a
 * folder to save the PNGs for a look.
 */
const fixture = questionSchema.parse({
  ...sampleQuestions.find((q) => q.slug === "boc-cut-dec-2026"),
  askedBy: { kind: "sponsor", name: "Maison Test", sector: "retail" },
});

describe("share card image", () => {
  for (const locale of ["en", "fr"] as const) {
    it(`renders a card with the sponsor label (${locale})`, { timeout: 30_000 }, async () => {
      const res = await shareCardImage(fixture, locale, SAMPLE_NOW);
      const png = Buffer.from(await res.arrayBuffer());
      expect(png.subarray(1, 4).toString("ascii")).toBe("PNG");
      expect(png.readUInt32BE(16)).toBe(1200);
      expect(png.readUInt32BE(20)).toBe(630);
      const dir = process.env.SHARE_CARD_SHOTS;
      if (dir) {
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, `share-card-sponsor-${locale}.png`), png);
      }
    });
  }

  for (const locale of ["en", "fr"] as const) {
    it(`renders the Called it! card with the sponsor label (${locale})`, { timeout: 30_000 }, async () => {
      const resolved = sampleQuestions.find((q) => q.slug === "cpi-sept-2026")!;
      const live = await import("@/lib/live");
      const spy = vi.spyOn(live, "withLiveQuestion").mockResolvedValue(questionSchema.parse({ ...resolved, askedBy: { kind: "sponsor", name: "Maison Test", sector: "retail" } }));
      const { default: Image } = await import("@/app/[locale]/q/[slug]/called-it/[side]/opengraph-image");
      const res = await Image({ params: Promise.resolve({ locale, slug: resolved.slug, side: resolved.resolution.result!.outcome }) });
      spy.mockRestore();
      const png = Buffer.from(await res.arrayBuffer());
      expect(png.subarray(1, 4).toString("ascii")).toBe("PNG");
      const dir = process.env.SHARE_CARD_SHOTS;
      if (dir) writeFileSync(join(dir, `called-it-sponsor-${locale}.png`), png);
    });
  }
});
