import { NextResponse, type NextRequest } from "next/server";
import { safeNextPath } from "@/lib/redirect";
import { createClient } from "@/lib/supabase/server";

// Landing page for links in Supabase emails (sign-up confirmation, password
// reset). `next` says where to go afterwards; only paths on this site are allowed.
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const safeNext = safeNextPath(request.nextUrl.searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(safeNext, request.url));
  }
  const reason = safeNext === "/reset-password" ? "reset" : "confirm";
  return NextResponse.redirect(new URL(`/login?error=${reason}`, request.url));
}
