/**
 * Where to go after an email link: only a path on this site ("/reset-password").
 * Rejects "//host" and "/\host", which browsers treat as another site.
 */
export function safeNextPath(next: string | null | undefined): string {
  return next && /^\/(?![/\\])/.test(next) ? next : "/";
}
