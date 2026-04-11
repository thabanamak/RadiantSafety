"use client";

import { Shield, X, AlertTriangle } from "lucide-react";

interface HotspotNudgeProps {
  onStart: () => void;
  onDismiss: () => void;
}

/**
 * Subtle banner shown when the user enters a high-incident-density area.
 * Suggests starting Safe Walk — never auto-starts it.
 */
export default function HotspotNudge({ onStart, onDismiss }: HotspotNudgeProps) {
  return (
    <div className="pointer-events-auto absolute bottom-24 left-1/2 z-50 w-[calc(100vw-2rem)] max-w-sm -translate-x-1/2">
      <div className="flex items-center gap-3 rounded-2xl border border-orange-500/30 bg-black/95 px-4 py-3 shadow-xl shadow-orange-900/20 backdrop-blur-xl">
        {/* Icon */}
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-orange-500/15 ring-1 ring-orange-500/30">
          <AlertTriangle className="h-4 w-4 text-orange-400" />
        </div>

        {/* Text */}
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold text-white">High-activity area</p>
          <p className="text-[10px] text-gray-400">Start Safe Walk to alert friends if needed</p>
        </div>

        {/* Actions */}
        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={onStart}
            className="flex items-center gap-1 rounded-lg bg-green-500/20 px-3 py-1.5 text-xs font-semibold text-green-300 ring-1 ring-green-500/30 transition-colors hover:bg-green-500/30 active:scale-95"
          >
            <Shield className="h-3 w-3" />
            Start
          </button>
          <button
            onClick={onDismiss}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-600 transition-colors hover:text-gray-300"
            aria-label="Dismiss"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
