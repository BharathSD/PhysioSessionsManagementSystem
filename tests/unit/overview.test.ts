import { describe, expect, it } from "vitest";
import { datesBetween, describeOff, isOffFor, offOn, type DayOff } from "@/lib/days-off";
import { absentStreak, actualPerWeek, ageOn, attendance, dobForAge, dueSince, plannedPerWeek, upcomingVisits, weeklyVisits } from "@/lib/overview";
import type { Plan } from "@/lib/schedule";
import type { Charge, Package, Payment, Session } from "@/lib/types";

const TODAY = "2026-10-03"; // Saturday
const visit = (session_date: string, status: Session["status"] = "attended", extra: Partial<Session> = {}) =>
  ({ id: session_date, session_date, status, visit_type_id: "c", notes: null, charge: 0, package_id: null, pain_score: null, ...extra }) as Session;
const visits = [
  visit("2026-09-07"),
  visit("2026-09-09"),
  visit("2026-09-14"),
  visit("2026-09-16"),
  visit("2026-09-21"),
  visit("2026-09-23", "missed"),
  visit("2026-09-25", "cancelled_patient"),
  visit("2026-09-28"),
  visit("2026-09-30", "missed"),
  visit("2026-10-01", "cancelled_clinic"),
  visit("2026-10-02", "missed"),
];
const mwf: Plan = {
  id: "p",
  patient_id: "rahul",
  mode: "fixed_days",
  weekdays: [1, 3, 5],
  every_n_weeks: 1,
  sessions_per_period: null,
  valid_from: "2026-09-01",
  valid_until: null,
  note: null,
  visit_type_id: "clinic",
  day_visit_types: { "5": "home" },
};

describe("attendance", () => {
  it("rates the last 30 days, not counting clinic cancellations", () => {
    expect(attendance(visits, TODAY)).toEqual({ present: 6, absent: 3, cancelled: 1, rate: 60 });
  });

  it("counts absences in a row, ignoring clinic cancellations", () => {
    expect(absentStreak(visits)).toBe(2);
  });

  it("compares actual and planned visits per week", () => {
    expect(plannedPerWeek(mwf)).toBe(3);
    expect(plannedPerWeek({ ...mwf, mode: "flexible", weekdays: [], sessions_per_period: 2, every_n_weeks: 2 })).toBe(1);
    // first visit (7 Sep) is inside the 4-week window: 6 visits in 27 days
    expect(actualPerWeek(visits, TODAY)!.toFixed(2)).toBe("1.56");
  });

  it("counts visits per Monday-to-Sunday week", () => {
    expect(weeklyVisits(visits, TODAY, 4).map((w) => [w.start, w.count])).toEqual([
      ["2026-09-07", 2],
      ["2026-09-14", 2],
      ["2026-09-21", 1],
      ["2026-09-28", 1],
    ]);
  });
});

describe("coming up", () => {
  it("lists schedule days and bookings with their visit types", () => {
    expect(upcomingVisits([mwf], [{ scheduled_date: "2026-10-06", visit_type_id: "assess" }], "clinic", TODAY)).toEqual([
      { date: "2026-10-05", visitTypeId: "clinic", booked: false },
      { date: "2026-10-06", visitTypeId: "assess", booked: true },
      { date: "2026-10-07", visitTypeId: "clinic", booked: false },
      { date: "2026-10-09", visitTypeId: "home", booked: false },
    ]);
  });

  it("includes today only while today's session isn't marked", () => {
    const sat = { ...mwf, weekdays: [1, 3, 6], day_visit_types: {} };
    expect(upcomingVisits([sat], [], "clinic", TODAY, 7, true)[0].date).toBe("2026-10-03");
    expect(upcomingVisits([sat], [], "clinic", TODAY, 7, false)[0].date).toBe("2026-10-05");
  });

  it("flags days cancelled in advance instead of dropping them", () => {
    const offs: DayOff[] = [
      { id: "c", patient_id: null, from_date: "2026-10-05", to_date: "2026-10-07", cancelled_by: "clinic", reason: "Conference" },
      { id: "b", patient_id: "rahul", from_date: "2026-10-09", to_date: "2026-10-09", cancelled_by: "patient", reason: null },
    ];
    const up = upcomingVisits([mwf], [], "clinic", TODAY, 7, false, (d) => offOn(offs, "rahul", d));
    expect(up.map((u) => [u.date, u.off?.id ?? null])).toEqual([
      ["2026-10-05", "c"],
      ["2026-10-07", "c"],
      ["2026-10-09", "b"],
    ]);
  });
});

describe("money", () => {
  it("finds the oldest charge not yet paid off (payments pay oldest first)", () => {
    expect(
      dueSince({
        packages: [{ start_date: "2026-09-01", price: 5000 } as Package],
        visits: [visit("2026-09-12", "attended", { charge: 1000 })],
        charges: [{ charge_date: "2026-09-20", amount: 800 } as Charge, { charge_date: "2026-09-22", amount: -300 } as Charge],
        payments: [{ amount: 5500 } as Payment],
      }),
    ).toBe("2026-09-12");
    expect(
      dueSince({ packages: [{ start_date: "2026-09-01", price: 5000 } as Package], visits: [], charges: [], payments: [{ amount: 5000 } as Payment] }),
    ).toBeNull();
  });
});

describe("age", () => {
  it("counts whole years", () => {
    expect(ageOn("1981-10-03", TODAY)).toBe(45);
    expect(ageOn("1981-10-04", TODAY)).toBe(44);
  });

  it("turns an age into an estimated date of birth", () => {
    expect(ageOn(dobForAge(45, TODAY), TODAY)).toBe(45);
  });
});

describe("days off", () => {
  const offs: DayOff[] = [
    { id: "clinic", patient_id: null, from_date: "2026-10-20", to_date: "2026-10-24", cancelled_by: "clinic", reason: "Diwali" },
    { id: "own", patient_id: "rahul", from_date: "2026-10-22", to_date: "2026-10-22", cancelled_by: "patient", reason: null },
  ];

  it("prefers the patient's own day off over a clinic closure", () => {
    expect(offOn(offs, "rahul", "2026-10-22")?.id).toBe("own");
    expect(offOn(offs, "meena", "2026-10-22")?.id).toBe("clinic");
    expect(offOn(offs, "rahul", "2026-10-25")).toBeUndefined();
    expect(isOffFor(offs, "meena")("2026-10-24")).toBe(true);
  });

  it("describes and expands days off", () => {
    expect(describeOff(offs[0])).toBe("Clinic closed · Diwali");
    expect(describeOff(offs[1])).toBe("Cancelled by patient");
    expect(datesBetween("2026-10-30", "2026-11-02")).toEqual(["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
  });
});
