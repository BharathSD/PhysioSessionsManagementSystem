// Small layout building blocks shared by every screen, so all pages look and
// behave the same way.

import Link from "next/link";
import { Icon, type IconName } from "./icons";

/** Screen title. With `back`, shows a large "← label" link above it. */
export function PageHeader({
  title,
  subtitle,
  back,
  action,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  back?: { href: string; label: string };
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-5">
      {back && (
        <Link href={back.href} className="-ml-1 mb-2 inline-flex min-h-11 items-center gap-1 pr-3 text-base font-medium text-brand">
          <Icon name="back" />
          {back.label}
        </Link>
      )}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[1.65rem] leading-tight font-semibold">{title}</h1>
          {subtitle && <div className="mt-1 text-base text-muted">{subtitle}</div>}
        </div>
        {action}
      </div>
    </div>
  );
}

export function SectionTitle({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="mt-7 mb-2.5 flex items-baseline justify-between gap-3 px-1">
      <h2 className="text-sm font-semibold tracking-wide text-muted uppercase">{children}</h2>
      {aside && <div className="text-sm text-muted">{aside}</div>}
    </div>
  );
}

/** A big tappable row: icon, title, optional detail, chevron. */
export function LinkRow({
  href,
  icon,
  title,
  detail,
  tone = "default",
}: {
  href: string;
  icon: IconName;
  title: React.ReactNode;
  detail?: React.ReactNode;
  tone?: "default" | "bad" | "warn" | "ok";
}) {
  const toneClass = {
    default: "bg-surface-2 text-fg",
    bad: "bg-bad-soft text-bad",
    warn: "bg-warn-soft text-warn",
    ok: "bg-ok-soft text-ok",
  }[tone];
  return (
    <Link href={href} className="flex items-center gap-3 px-4 py-3.5 active:bg-surface-2">
      <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${toneClass}`}>
        <Icon name={icon} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{title}</span>
        {detail && <span className="block truncate text-sm text-muted">{detail}</span>}
      </span>
      <Icon name="chevron" className="size-5 shrink-0 text-muted" />
    </Link>
  );
}

/** Large icon + label button used for a screen's main actions. */
export function ActionTile({ href, icon, label }: { href: string; icon: IconName; label: string }) {
  return (
    <Link
      href={href}
      className="flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-2xl border border-border bg-surface px-2 py-3 text-center text-sm font-medium active:scale-[0.98]"
    >
      <span className="flex size-9 items-center justify-center rounded-full bg-brand-soft text-brand">
        <Icon name={icon} />
      </span>
      {label}
    </Link>
  );
}

export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="card py-10 text-center">
      <p className="text-base font-medium">{title}</p>
      {children && <div className="mt-2 text-sm text-muted">{children}</div>}
    </div>
  );
}

export function initials(name: string): string {
  return name
    .replace(/^(dr\.?|mr\.?|mrs\.?|ms\.?)\s+/i, "")
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}
