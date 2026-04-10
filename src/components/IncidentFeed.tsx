"use client";

import { useState, useCallback } from "react";
import {
  ChevronUp,
  ChevronDown,
  Zap,
  MapPin,
  ThumbsUp,
  ThumbsDown,
  CheckCircle,
} from "lucide-react";
import { cn } from "@/lib/cn";
import type { UserReport } from "@/lib/types";

interface IncidentFeedProps {
  reports: UserReport[];
  onViewMap: (report: UserReport) => void;
}

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

type SheetState = "collapsed" | "half" | "full";

export default function IncidentFeed({ reports, onViewMap }: IncidentFeedProps) {
  const [sheetState, setSheetState] = useState<SheetState>("half");

  const cycleSheet = useCallback(() => {
    setSheetState((prev) => {
      if (prev === "collapsed") return "half";
      if (prev === "half") return "full";
      return "collapsed";
    });
  }, []);

  const sheetHeight: Record<SheetState, string> = {
    collapsed: "h-[60px]",
    half: "h-[45vh]",
    full: "h-[85vh]",
  };

  const sorted = [...reports].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
  );

  return (
    <div
      className={cn(
        "pointer-events-auto absolute inset-x-0 bottom-0 z-20 flex flex-col rounded-t-2xl bg-radiant-surface/95 backdrop-blur-xl border-t border-radiant-border transition-all duration-300 ease-out",
        sheetHeight[sheetState]
      )}
    >
      {/* Drag handle */}
      <button
        onClick={cycleSheet}
        className="flex w-full flex-col items-center gap-2 px-5 pt-3 pb-2 cursor-pointer"
        aria-label="Toggle incident feed"
      >
        <div className="h-1 w-10 rounded-full bg-gray-600" />
      </button>

      {/* Header */}
      <div className="flex items-center justify-between px-5 pb-3">
        <h2 className="text-lg font-bold text-gray-100">Incident Feed</h2>
        <div className="flex items-center gap-1.5 text-xs text-gray-400">
          <Zap className="h-3 w-3 text-radiant-green" />
          Live Updates
        </div>
      </div>

      {/* Feed list */}
      <div className="flex-1 overflow-y-auto px-5 pb-24">
        <div className="flex flex-col gap-3">
          {sorted.map((report) => (
            <IncidentCard
              key={report.id}
              report={report}
              onViewMap={() => onViewMap(report)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function IncidentCard({
  report,
  onViewMap,
}: {
  report: UserReport;
  onViewMap: () => void;
}) {
  return (
    <div className="rounded-xl border border-radiant-border bg-radiant-card p-4 transition-colors hover:border-gray-600">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <h3 className="text-sm font-bold text-gray-100">{report.category}</h3>
          <div className="mt-1 flex items-center gap-1.5">
            <CheckCircle className="h-3 w-3 text-radiant-green" />
            <span className="text-xs font-medium text-radiant-green">
              Verified by {report.verifiedBy} Trusted Users
            </span>
          </div>
        </div>
        <span className="text-xs text-gray-500">{timeAgo(report.createdAt)}</span>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <VoteButton icon={ThumbsUp} count={report.upvotes} />
          <VoteButton icon={ThumbsDown} count={report.downvotes} />
        </div>

        <button
          onClick={onViewMap}
          className="flex items-center gap-1.5 rounded-lg border border-radiant-border bg-radiant-dark px-3 py-1.5 text-xs font-medium text-gray-300 transition-colors hover:border-gray-500 hover:text-white"
        >
          <MapPin className="h-3 w-3" />
          View Map
        </button>
      </div>
    </div>
  );
}

function VoteButton({
  icon: Icon,
  count,
}: {
  icon: typeof ThumbsUp;
  count: number;
}) {
  return (
    <button className="flex items-center gap-1.5 rounded-lg border border-radiant-border px-2.5 py-1 text-xs text-gray-400 transition-colors hover:border-gray-500 hover:text-gray-200">
      <Icon className="h-3 w-3" />
      {count}
    </button>
  );
}
