"use client";

/**
 * Catches runtime errors in the route segment (e.g. Map / React tree) so the user
 * sees a recovery UI instead of a blank screen.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#0a0a0a] px-6 text-center text-gray-200">
      <p className="text-lg font-semibold">Something went wrong</p>
      <p className="max-w-md text-xs text-gray-500">{error.message}</p>
      <button
        type="button"
        onClick={() => reset()}
        className="rounded-xl bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-500"
      >
        Try again
      </button>
    </div>
  );
}
