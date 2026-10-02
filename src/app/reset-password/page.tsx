import Link from "next/link";
import { Icon } from "@/components/icons";
import { ResetForm } from "./reset-form";

export const metadata = { title: "Set a new password" };

// Reached from the reset email (signed in by the link) or from Profile → Change password.
export default function ResetPasswordPage() {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-10">
      <Link href="/profile" className="-ml-1 mb-4 inline-flex min-h-11 items-center gap-1 text-base font-medium text-brand">
        <Icon name="back" /> Profile
      </Link>
      <h1 className="text-2xl font-semibold">Set a new password</h1>
      <p className="mt-1 mb-6 text-base text-muted">At least 8 characters. You&apos;ll stay signed in on this device.</p>
      <ResetForm />
    </main>
  );
}
