"use client";

import { useEffect } from "react";
import { cn } from "@/lib/cn";

export default function RouteToast({
  message,
  variant = "error",
  onDismiss,
}: {
  message: string | null;
  variant?: "error" | "info";
  onDismiss: () => void;
}) {
  useEffect(() => {
    if (!message) return;
    const t = window.setTimeout(() => onDismiss(), 5200);
    return () => window.clearTimeout(t);
  }, [message, onDismiss]);

  if (!message) return null;

  return (
    <div
      className={cn(
        "pointer-events-auto fixed left-1/2 top-20 z-[100] w-[min(100%-1.5rem,24rem)] -translate-x-1/2",
        variant === "error"
          ? "rounded-xl border border-red-500/40 bg-red-950/95 px-4 py-3 text-sm text-red-100 shadow-2xl backdrop-blur-xl"
          : "rounded-xl border border-cyan-500/30 bg-zinc-950/95 px-4 py-3 text-sm text-cyan-50 shadow-2xl backdrop-blur-xl"
      )}
      role="alert"
    >
      {message}
    </div>
  );
}
