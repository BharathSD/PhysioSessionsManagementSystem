/** Shown to physios on screens only a clinic owner can change (`text` is already translated). */
export function OwnerNote({ text }: { text: string }) {
  return <p className="mb-3 rounded-2xl bg-surface-2 p-3 text-base text-muted">{text}</p>;
}
