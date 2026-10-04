import { describe, expect, it } from "vitest";
import {
  describePlan,
  flexibleProgress,
  isScheduledDay,
  isoWeekday,
  nextScheduledDay,
  nextVisit,
  planVisitType,
  projectedEnd,
  type Plan,
} from "@/lib/schedule";

const TODAY = "2026-10-02"; // a Friday

function plan(overrides: Partial<Plan> = {}): Plan {
  return {
    id: "plan",
    patient_id: "p",
    mode: "fixed_days",
    weekdays: [1, 3, 5],
    every_n_weeks: 1,
    sessions_per_period: null,
    valid_from: "2026-09-28",
    valid_until: null,
    note: null,
    visit_type_id: "clinic",
    day_visit_types: {},
    ...overrides,
  };
}

describe("fixed-day schedules", () => {
  it("knows which weekdays are session days", () => {
    expect(isoWeekday(TODAY)).toBe(5);
    expect(isScheduledDay(plan(), TODAY)).toBe(true);
    expect(isScheduledDay(plan(), "2026-10-03")).toBe(false);
  });

  it("repeats every N weeks counted from the start week", () => {
    const everyOtherSat = plan({ weekdays: [6], every_n_weeks: 2, valid_from: "2026-10-01" });
    expect(isScheduledDay(everyOtherSat, "2026-10-03")).toBe(true);
    expect(isScheduledDay(everyOtherSat, "2026-10-10")).toBe(false);
    expect(isScheduledDay(everyOtherSat, "2026-10-17")).toBe(true);
    expect(describePlan(everyOtherSat)).toBe("Sat · every 2 weeks");
  });

  it("stops after the plan ends", () => {
    expect(isScheduledDay(plan({ valid_until: "2026-10-01" }), TODAY)).toBe(false);
  });

  it("finds the next session day", () => {
    expect(nextScheduledDay(plan(), TODAY)).toBe("2026-10-05");
  });

  it("uses per-weekday visit types for mixed schedules", () => {
    const mixed = plan({ day_visit_types: { "5": "home" } });
    expect(planVisitType(mixed, TODAY)).toBe("home");
    expect(planVisitType(mixed, "2026-10-05")).toBe("clinic");
  });
});

describe("flexible schedules", () => {
  const twice = plan({ mode: "flexible", weekdays: [], sessions_per_period: 2, valid_from: "2026-09-21" });

  it("counts progress within the current week", () => {
    expect(flexibleProgress(twice, TODAY, ["2026-09-30", "2026-09-25"])).toEqual({
      done: 1,
      target: 2,
      start: "2026-09-28",
      end: "2026-10-04",
    });
    expect(describePlan(twice)).toBe("2× a week, any days");
  });
});

describe("next visit and package end", () => {
  it("picks the earlier of the schedule and a booking", () => {
    expect(nextVisit(plan(), ["2026-10-04"], TODAY)).toBe("2026-10-04");
    expect(nextVisit(undefined, ["2026-10-04"], TODAY)).toBe("2026-10-04");
  });

  it("projects when a package runs out on a fixed schedule", () => {
    // 3 left, today still to come: Fri, Mon, Wed
    expect(projectedEnd(plan(), TODAY, 3, [])).toEqual({ date: "2026-10-07", approximate: false });
    // already attended today: Mon, Wed, Fri
    expect(projectedEnd(plan(), TODAY, 3, [TODAY])).toEqual({ date: "2026-10-09", approximate: false });
  });

  it("estimates the end on a flexible schedule", () => {
    const twice = plan({ mode: "flexible", weekdays: [], sessions_per_period: 2, valid_from: "2026-09-21" });
    // 1 more this week (ends Sun 4 Oct), then 4 more = 2 weeks
    expect(projectedEnd(twice, TODAY, 5, ["2026-09-30"])).toEqual({ date: "2026-10-18", approximate: true });
  });

  it("skips days off for the next visit and the package end", () => {
    const off = (d: string) => d >= "2026-10-05" && d <= "2026-10-07";
    expect(nextVisit(plan(), [], TODAY, off)).toBe("2026-10-09");
    expect(projectedEnd(plan(), TODAY, 2, [TODAY], off)).toEqual({ date: "2026-10-12", approximate: false });
  });
});

import { describeOff, isOffFor, offOn, weeklyOff } from "@/lib/days-off";

describe("weekly closing days", () => {
  const sundays = weeklyOff([7]);
  it("cover every such weekday, and only those", () => {
    expect(offOn(sundays, "p1", "2026-10-04")?.weekdays).toEqual([7]); // a Sunday
    expect(offOn(sundays, "p1", "2026-10-05")).toBeUndefined(); // Monday
    expect(weeklyOff([])).toEqual([]);
  });
  it("move the next visit and stretch the package past them", () => {
    const daily = plan({ weekdays: [1, 2, 3, 4, 5, 6, 7], every_n_weeks: 1, valid_from: "2026-10-01" });
    expect(nextVisit(daily, [], "2026-10-03", isOffFor(sundays, "p1"))).toBe("2026-10-05");
  });
  it("are described as a weekly off", () => {
    expect(describeOff(sundays[0])).toBe("Clinic closed (weekly off)");
  });
});
