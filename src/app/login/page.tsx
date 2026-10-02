import { AuthForms } from "./auth-forms";

export const metadata = { title: "Sign in" };

export default async function LoginPage(props: PageProps<"/login">) {
  const { error } = await props.searchParams;

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-10">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-3 flex size-14 items-center justify-center rounded-2xl bg-brand text-2xl font-bold text-brand-fg">
          P
        </div>
        <h1 className="text-2xl font-semibold">Physio Sessions</h1>
        <p className="mt-1 text-sm text-muted">Track sessions, attendance and payments in one place.</p>
      </div>
      {error === "reset" && (
        <p className="mb-4 rounded-lg bg-bad-soft p-3 text-sm text-bad">
          That reset link has expired or was already used. Ask for a new one with “Forgot password?” below — and open it on this device.
        </p>
      )}
      {error === "confirm" && (
        <p className="mb-4 rounded-lg bg-bad-soft p-3 text-sm text-bad">
          That confirmation link didn&apos;t work. Open it in the same browser you signed up with, or sign in below.
        </p>
      )}
      <AuthForms />
    </main>
  );
}
