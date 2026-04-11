/**
 * White police badge for map markers (dark blue circle behind).
 * Shield ring + star — stylised mark; swap for an approved Victoria Police
 * asset if you have one for production.
 */
export function VicPoliceMapIcon({ sizePx }: { sizePx: number }) {
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
      <path
        fill="white"
        fillRule="evenodd"
        d="M12 2 3.5 6.25V12c0 5.2 3.6 9.6 8.5 10.9.35.1.7.1 1 0 4.9-1.3 8.5-5.7 8.5-10.9V6.25L12 2Zm0 2.1 6.2 3.15V12c0 3.7-2.5 6.8-6.2 7.9-3.7-1.1-6.2-4.2-6.2-7.9V7.25L12 4.1Z"
      />
      <path
        fill="white"
        d="M12 8.35 13.02 10.5l2.35.34-1.7 1.66.4 2.34L12 13.65l-2.1 1.19.4-2.34-1.7-1.66 2.35-.34 1.02-2.15Z"
      />
    </svg>
  );
}
