"use client";

import { useState } from "react";
import type { FormState } from "@/app/(app)/actions";
import { ScoreRow } from "@/components/assessment-inputs";
import { SubmitButton } from "@/components/submit-button";
import { useFormAction } from "@/lib/use-form-action";

type Kind = "exercise" | "treatment";
export type RecordItem = { kind: Kind; name: string; dosage: string | null };
type Row = RecordItem & { key: number };

let keySeq = 0;
const toRows = (items: RecordItem[]): Row[] => items.map((it) => ({ ...it, key: keySeq++ }));

/**
 * What was done in a session: exercises and treatments (quick-add from the
 * clinic's list, or type a new one), "Same as last time", notes, the case it
 * belongs to, and an optional pain check.
 */
export function RecordForm({
  action,
  library,
  initial,
  lastTime,
  notes,
  cases,
  caseId,
}: {
  action: (prev: FormState, form: FormData) => Promise<FormState>;
  library: RecordItem[];
  initial: RecordItem[];
  lastTime: RecordItem[];
  notes: string;
  cases: { id: string; title: string }[];
  caseId: string | null;
}) {
  const [state, onSubmit, pending] = useFormAction(action, undefined);
  const [rows, setRows] = useState<Row[]>(() => toRows(initial));

  const add = (item: RecordItem) => setRows((rs) => [...rs, ...toRows([item])]);
  const update = (key: number, patch: Partial<RecordItem>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const remove = (key: number) => setRows((rs) => rs.filter((r) => r.key !== key));

  const section = (kind: Kind, title: string, placeholder: string, dosageHint: string) => {
    const mine = rows.filter((r) => r.kind === kind);
    const quick = library.filter((l) => l.kind === kind && !mine.some((r) => r.name.toLowerCase() === l.name.toLowerCase()));
    return (
      <section className="card space-y-3">
        <h2 className="text-lg font-semibold">{title}</h2>
        {quick.length > 0 && (
          <div>
            <p className="mb-1.5 text-sm text-muted">Tap to add</p>
            <div className="flex flex-wrap gap-2">
              {quick.map((l) => (
                <button
                  key={l.name}
                  type="button"
                  onClick={() => add(l)}
                  className="rounded-full border border-border bg-surface px-3.5 py-2 text-sm font-medium hover:border-brand hover:text-brand"
                >
                  + {l.name}
                </button>
              ))}
            </div>
          </div>
        )}
        {mine.map((r) => (
          <div key={r.key} className="flex items-center gap-2">
            <input
              value={r.name}
              onChange={(e) => update(r.key, { name: e.target.value })}
              list={`${kind}-names`}
              placeholder={placeholder}
              aria-label={`${title} name`}
              className="min-h-11 min-w-0 flex-[2] rounded-xl border border-border bg-surface px-3 text-base outline-none focus:border-brand"
            />
            <input
              value={r.dosage ?? ""}
              onChange={(e) => update(r.key, { dosage: e.target.value })}
              placeholder={dosageHint}
              aria-label="Dosage"
              className="min-h-11 min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 text-base outline-none focus:border-brand"
            />
            <button type="button" onClick={() => remove(r.key)} className="px-1 text-muted" aria-label={`Remove ${r.name || kind}`}>
              ✕
            </button>
          </div>
        ))}
        <datalist id={`${kind}-names`}>
          {library
            .filter((l) => l.kind === kind)
            .map((l) => (
              <option key={l.name} value={l.name} />
            ))}
        </datalist>
        <button type="button" onClick={() => add({ kind, name: "", dosage: "" })} className="text-sm font-medium text-brand">
          + {kind === "exercise" ? "Add an exercise" : "Add a treatment"}
        </button>
      </section>
    );
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {rows
        .filter((r) => r.name.trim())
        .map((r) => (
          <span key={r.key} hidden>
            <input type="hidden" name="item_kind" value={r.kind} />
            <input type="hidden" name="item_name" value={r.name} />
            <input type="hidden" name="item_dosage" value={r.dosage ?? ""} />
          </span>
        ))}

      {lastTime.length > 0 && (
        <button type="button" onClick={() => setRows(toRows(lastTime))} className="btn w-full text-base">
          ↻ Same as last time ({lastTime.length} item{lastTime.length === 1 ? "" : "s"})
        </button>
      )}

      {section("exercise", "Exercises", "e.g. Straight leg raise", "3 × 10")}
      {section("treatment", "Treatments", "e.g. IFT, ultrasound, hot pack", "10 min")}

      <section className="card space-y-3">
        <label className="field">
          <span>Notes</span>
          <textarea name="notes" rows={3} defaultValue={notes} placeholder="How it went, response, what to do next time" />
        </label>
        {cases.length > 1 ? (
          <label className="field">
            <span>Part of case</span>
            <select name="case_id" defaultValue={caseId ?? ""}>
              <option value="">No case</option>
              {cases.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <input type="hidden" name="case_id" value={caseId ?? cases[0]?.id ?? ""} />
        )}
      </section>

      <details className="card">
        <summary className="cursor-pointer text-base font-medium">Pain check (optional)</summary>
        <div className="mt-3 space-y-4">
          <ScoreRow name="before_session" label="Before the session" />
          <ScoreRow name="after_session" label="After the session" />
          <ScoreRow name="at_rest" label="At rest" />
          <ScoreRow name="on_activity" label="On activity" />
          <p className="text-sm text-muted">Saved as a new entry in the pain history each time.</p>
        </div>
      </details>

      {state?.error && (
        <p role="alert" className="rounded-2xl bg-bad-soft p-3 text-base text-bad">
          {state.error}
        </p>
      )}
      <SubmitButton className="btn btn-primary min-h-12 w-full text-base" pendingText="Saving…" pending={pending}>
        Save session record
      </SubmitButton>
    </form>
  );
}
