"use client";

import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import type { Dictionary } from "@/i18n/dictionaries/en";
import { shareImageName, shareImagePath, type ShareLinks } from "@/lib/social";

type Props = {
  t: Dictionary["share"];
  /** Already filled with the question text (no tracking, no user ID). */
  text: string;
  /** The plain question page address. */
  url: string;
  links: ShareLinks;
  /** A heading other than "Share this question", for the "Share your call" bar under a "Called it!". */
  title?: string;
};

type Status = "" | "copied" | "instagramShared" | "instagramSaved" | "instagramFailed";

const button =
  "inline-flex min-h-11 items-center justify-center rounded-control border border-line bg-surface px-4 py-2 text-body-sm font-semibold text-ink hover:bg-sunken";

/** True when this browser can hand an image file to the phone's share sheet (where Instagram shows up). */
function canShareImages(): boolean {
  if (typeof navigator === "undefined" || typeof navigator.share !== "function" || typeof navigator.canShare !== "function") return false;
  try {
    return navigator.canShare({ files: [new File([new Uint8Array(1)], "card.png", { type: "image/png" })] });
  } catch {
    return false;
  }
}

/**
 * Share a question (or, with `title`, a right call): plain links to X, Threads and Facebook (nothing loads from them until someone follows a link),
 * an Instagram button, Copy link, and the phone's own share sheet where the browser has one.
 * Instagram has no web share address, so its button works with our own share card: on a phone it copies the link and opens the share sheet
 * with the card image (pick Instagram, add a Link sticker); on a computer it saves the card and copies the link. Without scripts it is a plain
 * download link to the card. YouTube has no way for a visitor to post a link, so it has no button.
 */
export function ShareBar({ t, text, url, links, title = t.title }: Props) {
  const [canShare, setCanShare] = useState(false);
  const [imageShare, setImageShare] = useState(false);
  const [status, setStatus] = useState<Status>("");
  const timer = useRef<number | undefined>(undefined);
  const image = useRef<Promise<Blob | null> | null>(null);
  const imagePath = shareImagePath(url);
  const imageName = shareImageName(url);

  /** Fetched once and kept, so a second tap opens the share sheet straight away (Safari wants it inside the tap). */
  const loadImage = useCallback((): Promise<Blob | null> => {
    image.current ??= fetch(imagePath)
      .then((r) => (r.ok && r.headers.get("content-type")?.startsWith("image/") ? r.blob() : null))
      .catch(() => null);
    return image.current;
  }, [imagePath]);

  useEffect(() => {
    setCanShare(typeof navigator !== "undefined" && typeof navigator.share === "function");
    const images = canShareImages();
    setImageShare(images);
    // On a phone the card is fetched ahead (one small same-origin image), because Safari opens the share sheet only close to the tap.
    if (images) void loadImage();
    return () => window.clearTimeout(timer.current);
  }, [loadImage]);

  function show(next: Status, ms = 2500) {
    window.clearTimeout(timer.current);
    setStatus(next);
    timer.current = window.setTimeout(() => setStatus(""), ms);
  }

  async function copyLink(): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(url);
      return true;
    } catch {
      return false;
    }
  }

  async function copy() {
    if (await copyLink()) show("copied");
  }

  async function share() {
    try {
      await navigator.share({ text, url });
    } catch {
      // Closing the share sheet is not an error.
    }
  }

  async function instagram(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    // The link goes on the clipboard first, inside the tap, so it is ready to paste on a Link sticker or under the post.
    const copied = copyLink();
    const blob = await loadImage();
    await copied;
    if (!blob) return show("instagramFailed", 6000);
    const file = new File([blob], imageName, { type: blob.type || "image/png" });
    if (imageShare) {
      show("instagramShared", 8000);
      try {
        // The image only: Instagram drops any text that comes with it.
        await navigator.share({ files: [file] });
      } catch {
        // Closing the share sheet is not an error.
      }
      return;
    }
    const href = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = href;
    a.download = imageName;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(href), 1000);
    show("instagramSaved", 8000);
  }

  return (
    <section aria-label={title} className="grid gap-3 border-t border-line pt-5">
      <h2 className="m-0 text-caption font-bold uppercase tracking-wide text-ink-2">{title}</h2>
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
        <a
          href={imagePath}
          download={imageName}
          onClick={instagram}
          onPointerEnter={() => void loadImage()}
          onFocus={() => void loadImage()}
          className={button}
          data-share="instagram"
        >
          {imageShare ? t.onInstagram : t.instagramSave}
        </a>
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
        {status ? t[status] : ""}
      </p>
    </section>
  );
}
