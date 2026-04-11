"use client";

import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Vote control (same interaction model as report vote buttons).
 * Pass `showLabel` to show `label` as visible text next to the icon.
 */
export function VoteIconButton({
  icon: Icon,
  label,
  showLabel = false,
  disabled,
  busy,
  locked = false,
  titleHint,
  active,
  isUp,
  onClick,
  className,
}: {
  icon: LucideIcon;
  label: string;
  /** When true, `label` is shown beside the icon (e.g. Approve / Disapprove). */
  showLabel?: boolean;
  disabled: boolean;
  busy: boolean;
  /** After a final vote: keep selected styling but block further clicks. */
  locked?: boolean;
  titleHint?: string;
  active: boolean;
  isUp: boolean;
  onClick: () => void;
  className?: string;
}) {
  const noPermission = disabled;
  const title =
    locked && !noPermission
      ? "You’ve already voted on this profile"
      : busy
        ? label
        : noPermission && titleHint
          ? titleHint
          : noPermission
            ? "Sign in to vote"
            : label;
  return (
    <button
      type="button"
      title={title}
      aria-pressed={active}
      disabled={noPermission || busy}
      onClick={(e) => {
        e.stopPropagation();
        if (locked) return;
        onClick();
      }}
      className={cn(
        "flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-colors",
        noPermission
          ? "cursor-not-allowed border-radiant-border/60 text-gray-600 opacity-70"
          : active && isUp
            ? showLabel
              ? "border-emerald-400 bg-emerald-900/55 text-emerald-50 shadow-[0_0_0_1px_rgba(52,211,153,0.35)] ring-1 ring-emerald-500/30"
              : "border-emerald-500/70 bg-emerald-950/40 text-emerald-200 shadow-[0_0_0_1px_rgba(16,185,129,0.15)]"
            : active && !isUp
              ? showLabel
                ? "border-red-400 bg-red-950/55 text-red-50 shadow-[0_0_0_1px_rgba(248,113,113,0.35)] ring-1 ring-red-500/30"
                : "border-red-500/70 bg-red-950/40 text-red-200 shadow-[0_0_0_1px_rgba(248,113,113,0.12)]"
              : "border-radiant-border text-gray-400 hover:border-gray-500 hover:text-gray-200",
        locked && "pointer-events-none cursor-default",
        locked && !active && "opacity-50",
        busy && "opacity-70",
        className
      )}
    >
      <Icon className="h-3 w-3 shrink-0" />
      {showLabel ? <span>{label}</span> : null}
    </button>
  );
}
