"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Crew leads: the leaderboard is the reason to open the app.
const TABS = [
  { href: "/crew", label: "Crew", icon: "M3 20a5 5 0 0110 0M8 7a3 3 0 106 0 3 3 0 00-6 0m8 13a5 5 0 018-4" },
  { href: "/today", label: "Log", icon: "M4 12l5 5L20 6" },
  { href: "/me", label: "Me", icon: "M5 20a7 7 0 0114 0M9 7a3 3 0 106 0 3 3 0 00-6 0" },
];

export default function NavBar() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 backdrop-blur
                 pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto flex max-w-lg">
        {TABS.map((tab) => {
          const active = pathname.startsWith(tab.href);
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition ${
                  active ? "text-accent" : "text-muted"
                }`}
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-6 w-6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={active ? 2.4 : 1.9}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d={tab.icon} />
                </svg>
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
