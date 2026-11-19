"use client";

import { useEffect, useState } from "react";
import type { Dictionary } from "@/i18n/dictionaries/en";
import type { ShareLinks } from "@/lib/social";

type Props = {
  t: Dictionary["share"];
  /** Already filled with the question text (no tracking, no user ID). */
  text: string;
  /** The plain question page address. */
  url: string;
  links: ShareLinks;
};

const button =
  "inline-flex min-h-11 items-center justify-center rounded-control border border-line bg-surface px-4 py-2 text-body-sm font-semibold text-ink hover:bg-sunken";

/**
 * Share a question: plain links to X, Threads and Facebook (nothing loads from them until someone follows a link),
 * Copy link, and the phone's own share sheet where the browser has one.
 */
export function ShareBar({ t, text, url, links }: Props) {
  const [canShare, setCanShare] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setCanShare(typeof navigator !== "undefined" && typeof navigator.share === "function");
  }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  }

  async function share() {
    try {
      await navigator.share({ text, url });
    } catch {
      // Closing the share sheet is not an error.
    }
  }

  return (
    <section aria-label={t.title} className="grid gap-3 border-t border-line pt-5">
      <h2 className="m-0 text-caption font-bold uppercase tracking-wide text-ink-2">{t.title}</h2>
      <div className="flex flex-wrap gap-2">
        {([
          ["x", t.onX, links.x],
          ["threads", t.onThreads, links.threads],
          ["facebook", t.onFacebook, links.facebook],
        ] as const).map(([key, label, href]) => (
          <a key={key} href={href} target="_blank" rel="noopener noreferrer" className={button} data-share={key}>
            {label}
            <span className="sr-only"> ({t.opensNew})</span>
          </a>
        ))}
        {canShare && (
          <button type="button" onClick={share} className={button} data-share="native">
            {t.native}
          </button>
        )}
        <button type="button" onClick={copy} className={button} data-share="copy">
          {t.copy}
        </button>
      </div>
      <p role="status" className="m-0 min-h-5 text-body-sm text-side-a-text">
        {copied ? t.copied : ""}
      </p>
    </section>
  );
}
