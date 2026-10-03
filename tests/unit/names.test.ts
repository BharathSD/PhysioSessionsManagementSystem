import { describe, expect, it } from "vitest";
import { greetingName, physioName, splitDesignation } from "@/lib/names";

describe("physio names", () => {
  it.each([
    ["Dr. Priya Sharma", "Dr.", "Priya Sharma"],
    ["dr priya", "Dr.", "priya"],
    ["MRS. Rao", "Mrs.", "Rao"],
    ["Prof Anil", "Prof.", "Anil"],
    ["Drishti Rao", "", "Drishti Rao"],
    ["Dr.", "", "Dr."],
  ])("%s → %s + %s", (full, designation, name) => {
    expect(splitDesignation(full)).toEqual({ designation, name });
  });

  it("shows the designation on receipts and in the greeting", () => {
    expect(physioName({ designation: "Dr.", display_name: "Priya Sharma" })).toBe("Dr. Priya Sharma");
    expect(greetingName({ designation: "Dr.", display_name: "Priya Sharma" })).toBe("Dr. Priya");
    expect(physioName({ designation: "", display_name: "Priya Sharma" })).toBe("Priya Sharma");
    expect(greetingName({ designation: "", display_name: "Priya Sharma" })).toBe("Priya");
  });
});
