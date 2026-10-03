import { DESIGNATIONS } from "@/lib/names";
import { TitlePicker } from "./title-picker";

/** Dr. · Prof. · Mr. · Ms. · Mrs. · None, as tap-chips. Submits `designation`. */
export function DesignationPicker({ defaultValue = "Dr." }: { defaultValue?: string }) {
  return (
    <TitlePicker
      name="designation"
      titles={DESIGNATIONS}
      defaultValue={defaultValue}
      legend={
        <>
          Title <em className="font-normal text-muted">(shown before your name)</em>
        </>
      }
    />
  );
}
