"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { signOut } from "@/app/login/actions";
import { msg } from "@/i18n";
import { useT } from "@/i18n/client";
import { Icon, type IconName } from "./icons";
import { SubmitButton } from "./submit-button";

const TABS: { href: string; label: string; icon: IconName }[] = [
  { href: "/", label: msg("Home"), icon: "home" },
  { href: "/today", label: msg("Today"), icon: "today" },
  { href: "/patients", label: msg("Patients"), icon: "patients" },
  { href: "/profile", label: msg("Profile"), icon: "profile" },
];

function useActiveTab() {
  const pathname = usePathname();
  return (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
}

/** Tabs in the top bar on tablets / desktops. */
export function TopTabs() {
  const isActive = useActiveTab();
  const t = useT();
  return (
    <nav className="hidden items-center gap-1 md:flex" aria-label={t("Main")}>
      {TABS.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium ${
            isActive(tab.href) ? "bg-brand-soft text-brand" : "text-muted hover:bg-surface-2"
          }`}
        >
          <Icon name={tab.icon} className="size-[1.1rem]" />
          {t(tab.label)}
        </Link>
      ))}
    </nav>
  );
}

/** Tab bar at the bottom of the screen on phones. */
export function BottomTabs() {
  const isActive = useActiveTab();
  const t = useT();
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      aria-label={t("Main")}
    >
      <ul className="grid grid-cols-4">
        {TABS.map((tab) => {
          const active = isActive(tab.href);
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`flex flex-col items-center gap-0.5 pt-2 pb-2.5 text-xs font-medium ${active ? "text-brand" : "text-muted"}`}
              >
                <span className={`flex h-7 w-14 items-center justify-center rounded-full ${active ? "bg-brand-soft" : ""}`}>
                  <Icon name={tab.icon} className="size-[1.35rem]" />
                </span>
                {t(tab.label)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Round initials button in the top-right with "My profile" and "Log out". */
export function AccountMenu({ initials, name, email }: { initials: string; name: string; email: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const t = useT();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={t("Account menu")}
        className="flex size-10 items-center justify-center rounded-full bg-brand text-sm font-semibold text-brand-fg"
      >
        {initials}
      </button>
      {open && (
        <div className="absolute top-12 right-0 z-30 w-64 overflow-hidden rounded-2xl border border-border bg-surface shadow-xl">
          <div className="border-b border-border px-4 py-3">
            <p className="truncate font-medium">{name}</p>
            <p className="truncate text-sm text-muted">{email}</p>
          </div>
          <Link href="/profile" onClick={() => setOpen(false)} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2">
            <Icon name="profile" />
            {t("My profile")}
          </Link>
          <form action={signOut}>
            <SubmitButton className="flex w-full items-center gap-3 px-4 py-3 text-left text-bad hover:bg-bad-soft" pendingText={t("Logging out…")}>
              <Icon name="logout" />
              {t("Log out")}
            </SubmitButton>
          </form>
        </div>
      )}
    </div>
  );
}
