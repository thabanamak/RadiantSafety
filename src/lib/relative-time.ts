/**
 * Relative age for report timestamps: calendar buckets only — Today, Yesterday,
 * days (2–6), weeks (7–29), then months and years. No clock time on same-day reports.
 */
export function formatReportRelativeAge(date: Date, nowMs: number): string {
  const now = new Date(nowMs);
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startThen = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffCalendarDays = Math.round(
    (startToday.getTime() - startThen.getTime()) / 86400000
  );

  if (diffCalendarDays <= 0) {
    return "Today";
  }
  if (diffCalendarDays === 1) {
    return "Yesterday";
  }
  if (diffCalendarDays < 7) {
    return `${diffCalendarDays} days ago`;
  }
  if (diffCalendarDays < 30) {
    const weeks = Math.floor(diffCalendarDays / 7);
    const w = Math.max(1, weeks);
    return `${w} week${w === 1 ? "" : "s"} ago`;
  }

  let months =
    (now.getFullYear() - date.getFullYear()) * 12 + (now.getMonth() - date.getMonth());
  if (now.getDate() < date.getDate()) {
    months -= 1;
  }
  if (months < 1) {
    return `${diffCalendarDays} days ago`;
  }
  if (months < 12) {
    return `${months} month${months === 1 ? "" : "s"} ago`;
  }

  let years = now.getFullYear() - date.getFullYear();
  if (
    now.getMonth() < date.getMonth() ||
    (now.getMonth() === date.getMonth() && now.getDate() < date.getDate())
  ) {
    years -= 1;
  }
  years = Math.max(1, years);
  return `${years} year${years === 1 ? "" : "s"} ago`;
}

/**
 * Full calendar date and time with seconds (locale-aware), for display under relative labels.
 */
export function formatReportExactTimestamp(date: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}
