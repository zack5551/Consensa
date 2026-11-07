import Link from "next/link";

type Tab = { href: string; label: string; current: boolean };

/** Link tabs for switching boards. They're links (each board has its own URL), marked with aria-current. */
export function BoardTabs({ label, tabs, size = "md" }: { label: string; tabs: readonly Tab[]; size?: "md" | "sm" }) {
  return (
    <nav aria-label={label}>
      <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
        {tabs.map((tab) => (
          <li key={tab.href}>
            <Link
              href={tab.href}
              aria-current={tab.current ? "page" : undefined}
              className={`inline-flex items-center rounded-full border font-semibold transition-colors duration-[var(--cn-duration-fast)] ${
                size === "md" ? "px-4 py-2 text-body-sm" : "px-3 py-1 text-caption"
              } ${tab.current ? "border-ink bg-ink text-paper" : "border-line bg-surface text-ink hover:bg-sunken"}`}
            >
              {tab.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
