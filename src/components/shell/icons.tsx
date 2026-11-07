/**
 * The shell's line icons. One 24px grid, 1.75 stroke, round caps, currentColor, so they follow the
 * text token they sit in. Always decorative: the label next to them (visible or sr-only) carries meaning.
 */
import type { ReactNode, SVGProps } from "react";

export type IconName = "today" | "board" | "provinces" | "leaderboard" | "record" | "search" | "sun" | "moon" | "system" | "close" | "arrow" | "check" | "offline";

const paths: Record<IconName, ReactNode> = {
  today: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
      <circle cx="12" cy="15" r="1.6" fill="currentColor" stroke="none" />
    </>
  ),
  board: (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.75" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.75" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.75" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.75" />
    </>
  ),
  provinces: <path d="M4 20V11M9 20V6M14 20v-7M19 20V9M2.5 20.5h19" />,
  leaderboard: (
    <>
      <path d="M8 20.5V12H3.5v8.5M15.5 20.5V8.5h-7v12M20.5 20.5V14H16v6.5M2.5 20.5h19" />
    </>
  ),
  record: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 20.5c1.2-3.6 4-5.5 7.5-5.5s6.3 1.9 7.5 5.5" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
    </>
  ),
  moon: <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />,
  system: (
    <>
      <rect x="3" y="4.5" width="18" height="12" rx="2" />
      <path d="M8.5 20.5h7M12 16.5v4" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6 6 18" />,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  offline: (
    <>
      <path d="M2.5 8.5a14 14 0 0 1 19 0M5.5 12a9.5 9.5 0 0 1 13 0M8.5 15.5a5 5 0 0 1 7 0" />
      <path d="M3 3l18 18" />
    </>
  ),
};

export function Icon({ name, className = "size-5", ...rest }: { name: IconName } & Omit<SVGProps<SVGSVGElement>, "name">) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={`shrink-0 ${className}`}
      {...rest}
    >
      {paths[name]}
    </svg>
  );
}
