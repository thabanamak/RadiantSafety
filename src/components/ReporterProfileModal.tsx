"use client";

import { X, MapPin, FileText, Trash2 } from "lucide-react";
import type { UserReport } from "@/lib/types";
import { cn } from "@/lib/cn";

interface ReporterProfileModalProps {
  open: boolean;
  onClose: () => void;
  reporterId: string;
  reporterDisplayName: string;
  reports: UserReport[];
  onViewMap: (report: UserReport) => void;
  currentUserId?: string | null;
  onDeleteReport?: (reportId: string) => void;
}

export default function ReporterProfileModal({
  open,
  onClose,
  reporterId,
  reporterDisplayName,
  reports,
  onViewMap,
  currentUserId,
  onDeleteReport,
}: ReporterProfileModalProps) {
  if (!open) return null;

  const sorted = [...reports].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
  );

  function reportOwnerId(r: UserReport): string {
    return r.reporterId || r.userId;
  }

  function canDeleteReport(r: UserReport): boolean {
    if (!currentUserId || !onDeleteReport) return false;
    return (
      reportOwnerId(r).trim().toLowerCase() === currentUserId.trim().toLowerCase()
    );
  }

  const handleDelete = (r: UserReport) => {
    if (!canDeleteReport(r) || !onDeleteReport) return;
    if (!window.confirm("Delete this report? This cannot be undone.")) return;
    onDeleteReport(r.id);
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="reporter-profile-title"
        className="relative z-10 flex max-h-[min(85vh,640px)] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-radiant-border bg-radiant-surface shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-radiant-border px-5 py-4">
          <div className="min-w-0">
            <h2 id="reporter-profile-title" className="text-lg font-bold text-gray-100">
              {reporterDisplayName}
            </h2>
            <p className="mt-1 text-[11px] text-gray-500">
              Verified 18+ reporter · {sorted.length} incident{sorted.length === 1 ? "" : "s"} filed
            </p>
            <p className="mt-0.5 truncate font-mono text-[10px] text-gray-600" title={reporterId}>
              ID: {reporterId}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-radiant-card hover:text-gray-300"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {sorted.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">No reports from this user in this session.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {sorted.map((r) => (
                <li
                  key={r.id}
                  className="rounded-xl border border-radiant-border bg-radiant-card p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-radiant-red">{r.category}</p>
                      <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-gray-400">
                        {r.description}
                      </p>
                      <p className="mt-1 text-[10px] text-gray-600">
                        {r.createdAt.toLocaleString(undefined, {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col gap-1">
                      {canDeleteReport(r) && (
                        <button
                          type="button"
                          onClick={() => handleDelete(r)}
                          className="flex items-center justify-center gap-1 rounded-lg border border-red-500/35 bg-red-500/10 px-2 py-1.5 text-[10px] font-medium text-red-300 hover:border-red-400/50 hover:bg-red-500/20"
                        >
                          <Trash2 className="h-3 w-3" />
                          Delete
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          onViewMap(r);
                          onClose();
                        }}
                        className={cn(
                          "flex items-center justify-center gap-1 rounded-lg border border-radiant-border px-2 py-1.5",
                          "text-[10px] font-medium text-gray-400 transition-colors hover:border-gray-500 hover:text-white"
                        )}
                      >
                        <MapPin className="h-3 w-3" />
                        Map
                      </button>
                    </div>
                  </div>
                  {r.imageDataUrl && (
                    <div className="mt-2 flex items-center gap-1 text-[10px] text-gray-600">
                      <FileText className="h-3 w-3" />
                      Includes photo
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
