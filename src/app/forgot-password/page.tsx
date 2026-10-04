import Link from "next/link";
import { Icon } from "@/components/icons";
import { msg } from "@/i18n";
import { getT, titled } from "@/i18n/server";
import { ForgotForm } from "./forgot-form";

export const generateMetadata = titled(msg("Forgot password"));

export default async function ForgotPasswordPage() {
  const t = await getT();
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-10">
      <Link href="/login" className="-ml-1 mb-4 inline-flex min-h-11 items-center gap-1 text-base font-medium text-brand">
        <Icon name="back" /> {t("Sign in")}
      </Link>
      <h1 className="text-2xl font-semibold">{t("Forgot your password?")}</h1>
      <p className="mt-1 mb-6 text-base text-muted">{t("Enter the email you signed up with. We'll send you a link to set a new password.")}</p>
      <ForgotForm />
    </main>
  );
}
