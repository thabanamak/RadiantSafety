/** Red medical cross for hospital / clinic map markers (on white circle). */
export function MedicalCrossIcon({ sizePx }: { sizePx: number }) {
  return (
    <svg
      width={sizePx}
      height={sizePx}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      className="shrink-0"
    >
      <rect x="10" y="4.5" width="4" height="15" rx="1" fill="#dc2626" />
      <rect x="4.5" y="10" width="15" height="4" rx="1" fill="#dc2626" />
    </svg>
  );
}
