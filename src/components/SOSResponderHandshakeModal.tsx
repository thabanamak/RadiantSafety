"use client";

import { X, Siren, MapPin, Navigation, CheckCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";
import type { SOSAlert } from "@/components/SOSAreaPanel";
import type { SOSIssueType } from "@/components/SOSIssueSheet";
import { SOS_ISSUE_LABELS } from "@/components/SOSIssueSheet";

interface SOSResponderHandshakeModalProps {
  alert: SOSAlert | null;
  open: boolean;
  onClose: () => void;
  authUserId: string | undefined;
  onAccept: (alertId: string) => Promise<boolean>;
  onRequestDirections: (lat: number, lng: number) => void;
  onMarkResolved: (alertId: string) => void;
  accepting: boolean;
  acceptError: string;
}

export default function SOSResponderHandshakeModal({
  alert,
  open,
  onClose,
  authUserId,
  onAccept,
  onRequestDirections,
  onMarkResolved,
  accepting,
  acceptError,
}: SOSResponderHandshakeModalProps) {
  if (!open || !alert) return null;

  const status = alert.status ?? "pending";
  const isAssignee = Boolean(authUserId && alert.responder_id === authUserId);
  /** Until resolved, any verified responder can accept again (re-assigns responder_id). */
  const showAcceptTask = status === "pending" || status === "accepted";
  const issue = alert.issue as SOSIssueType;
  const title = SOS_ISSUE_LABELS[issue]?.title ?? "SOS";

  return (
    <div className="pointer-events-auto fixed inset-0 z-[125] flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div className="relative m-4 w-full max-w-sm rounded-2xl border border-red-500/30 bg-black/95 p-5 shadow-2xl shadow-red-950/50 backdrop-blur-xl">
        <div className="mb-4 flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-500/20 ring-1 ring-red-500/40">
              <Siren className="h-5 w-5 text-red-400" />
            </div>
            <div>
              <p className="text-sm font-bold text-white">{title}</p>
              <p className="text-[11px] text-gray-500">
                {status === "pending" && "Awaiting responder"}
                {status === "accepted" && isAssignee && "You are the assigned responder"}
                {status === "accepted" && !isAssignee && "Accepted — you can accept again to assign yourself"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-white/10 hover:text-gray-300"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {alert.description && (
          <p className="mb-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-gray-300">
            {alert.description}
          </p>
        )}

        <div className="mb-4 flex items-center gap-2 text-[11px] text-gray-500">
          <MapPin className="h-3.5 w-3.5 shrink-0 text-gray-600" />
          <span>
            {Math.round(alert.distance_meters)}m away ·{" "}
            {new Date(alert.created_at).toLocaleTimeString()}
          </span>
        </div>

        {acceptError && (
          <p className="mb-3 text-center text-[11px] text-red-400">{acceptError}</p>
        )}

        <div className="flex flex-col gap-2">
          {showAcceptTask && (
            <button
              type="button"
              disabled={accepting}
              onClick={() => void onAccept(alert.id)}
              className={cn(
                "flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold text-white transition-colors",
                "bg-red-600 hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
              )}
            >
              {accepting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Accepting…
                </>
              ) : (
                "ACCEPT TASK"
              )}
            </button>
          )}

          {status === "accepted" && isAssignee && (
            <>
              <button
                type="button"
                onClick={() => {
                  onRequestDirections(alert.location_lat, alert.location_lng);
                  onClose();
                }}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-cyan-500/40 bg-cyan-500/15 py-3 text-sm font-bold text-cyan-200 transition-colors hover:bg-cyan-500/25"
              >
                <Navigation className="h-4 w-4" />
                GET DIRECTIONS
              </button>

              <button
                type="button"
                onClick={() => {
                  onMarkResolved(alert.id);
                  onClose();
                }}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-green-500/40 bg-green-500/10 py-2.5 text-xs font-semibold text-green-300 transition-colors hover:bg-green-500/20"
              >
                <CheckCircle className="h-4 w-4" />
                MARK AS RESOLVED
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
