/**
 * Relative age for report timestamps: uses calendar days / months / years only
 * (no seconds, minutes, or hours).
 */
export function formatReportRelativeAge(date: Date, nowMs: number): string {
  const now = new Date(nowMs);
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startThen = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffCalendarDays = Math.round(
    (startToday.getTime() - startThen.getTime()) / 86400000
  );

  if (diffCalendarDays <= 0) return "Today";
  if (diffCalendarDays === 1) return "1 day ago";
  if (diffCalendarDays < 30) {
    return `${diffCalendarDays} days ago`;
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
