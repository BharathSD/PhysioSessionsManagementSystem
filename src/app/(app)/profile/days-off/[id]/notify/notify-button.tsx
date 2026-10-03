"use client";

import { startTransition, useState } from "react";
import { Icon } from "@/components/icons";
import { markNotified } from "../../../../actions";

/** Opens the patient's WhatsApp with the message ready, and ticks them as told. */
export function NotifyButton({ href, dayOffId, patientId, told }: { href: string; dayOffId: string; patientId: string; told: boolean }) {
  const [done, setDone] = useState(told);
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => {
        setDone(true);
        startTransition(() => markNotified(dayOffId, patientId));
      }}
      className={`btn min-h-11 shrink-0 px-3 text-sm ${done ? "text-ok" : "btn-whatsapp"}`}
    >
      {done ? (
        <>
          <Icon name="check" className="size-4" /> Told · send again
        </>
      ) : (
        <>
          <Icon name="message" className="size-4" /> Send
        </>
      )}
    </a>
  );
}
