import Link from "next/link";
import { Icon } from "@/components/icons";
import { ForgotForm } from "./forgot-form";

export const metadata = { title: "Forgot password" };

export default function ForgotPasswordPage() {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-10">
      <Link href="/login" className="-ml-1 mb-4 inline-flex min-h-11 items-center gap-1 text-base font-medium text-brand">
        <Icon name="back" /> Sign in
      </Link>
      <h1 className="text-2xl font-semibold">Forgot your password?</h1>
      <p className="mt-1 mb-6 text-base text-muted">Enter the email you signed up with. We&apos;ll send you a link to set a new password.</p>
      <ForgotForm />
    </main>
  );
}
