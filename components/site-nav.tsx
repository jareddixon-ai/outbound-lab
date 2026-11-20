"use client";
// The bar at the top of every page, so one link reaches all of Outbound Lab.
// It's a client component only so it can highlight the page you're on.

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Overview" },
  { href: "/domain-check", label: "A · Domain check" },
  { href: "/pipeline", label: "B · Pipeline" },
  { href: "/experiment", label: "C · Experiment" },
];

export function SiteNav() {
  const path = usePathname();
  return (
    <nav aria-label="Outbound Lab" className="border-b border-border bg-surface">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-1 gap-y-1 px-4 py-2 sm:px-6">
        <Link href="/" className="mr-3 py-1 font-semibold tracking-tight">
          Outbound Lab <span className="rounded bg-pass-bg px-1.5 py-0.5 text-xs font-medium text-accent">v2</span>
        </Link>
        {LINKS.slice(1).map((l) => {
          const active = path === l.href;
          return (
            <Link
              key={l.href}
              href={l.href}
              aria-current={active ? "page" : undefined}
              className={`rounded-md px-2.5 py-1 text-sm ${
                active ? "bg-pass-bg font-medium text-accent" : "text-muted hover:text-foreground"
              }`}
            >
              {l.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
