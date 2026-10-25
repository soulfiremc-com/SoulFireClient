import { constructFilterFn, filterFn_inDateRange } from "@tanstack/react-table";

function parseDateBound(value: unknown) {
  if (
    typeof value !== "number" &&
    (typeof value !== "string" || value.trim() === "")
  ) {
    return undefined;
  }
  const date = new Date(Number(value));
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export const calendarDateRangeFilter = constructFilterFn({
  ...filterFn_inDateRange,
  resolveFilterValue: (value: unknown) => {
    const bounds = Array.isArray(value) ? value : [];
    let from = parseDateBound(bounds[0]);
    let to = parseDateBound(bounds[1]);
    if (from && to && from > to) [from, to] = [to, from];

    // Calendar selections include the final day, even across a DST transition.
    return [
      from?.setHours(0, 0, 0, 0) ?? -Infinity,
      to?.setHours(23, 59, 59, 999) ?? Infinity,
    ];
  },
});
