import { Suspense } from "react";
import { Flash } from "@/components/flash";
import { AccountMenu, BottomTabs, TopTabs } from "@/components/nav";
import { initials } from "@/components/ui";
import { getContext } from "@/lib/context";
import { physioName } from "@/lib/names";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { clinic, member, email } = await getContext();

  return (
    <>
      <header className="sticky top-0 z-20 border-b border-border bg-bg/95 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-2.5">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand text-base font-bold text-brand-fg">P</div>
          <span className="min-w-0 flex-1 truncate text-base font-semibold">{clinic.name}</span>
          <TopTabs />
          <AccountMenu initials={initials(member.display_name)} name={physioName(member)} email={email} />
        </div>
      </header>
      <Suspense>
        <Flash />
      </Suspense>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pt-5 pb-28 md:pb-12">{children}</main>
      <BottomTabs />
    </>
  );
}
