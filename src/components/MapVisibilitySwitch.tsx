"use client";

import { cn } from "@/lib/cn";

interface MapVisibilitySwitchProps {
  on: boolean;
  onToggle: () => void;
  /** Tailwind classes when switch is on (e.g. bg-sky-600 focus-visible:ring-sky-500) */
  activeClass: string;
  id?: string;
  labelledBy?: string;
}

export default function MapVisibilitySwitch({
  on,
  onToggle,
  activeClass,
  id,
  labelledBy,
}: MapVisibilitySwitchProps) {
  return (
    <button
      type="button"
      id={id}
      aria-labelledby={labelledBy}
      role="switch"
      aria-checked={on}
      onClick={onToggle}
      className={cn(
        "relative h-6 w-11 shrink-0 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-black",
        on ? activeClass : "bg-gray-700 focus-visible:ring-gray-500"
      )}
    >
      <span
        className={cn(
          "pointer-events-none absolute top-0.5 block h-5 w-5 rounded-full bg-white shadow transition-transform",
          on ? "translate-x-[1.375rem]" : "translate-x-0.5"
        )}
      />
    </button>
  );
}
