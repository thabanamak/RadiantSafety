"use client";

import { useState, useRef } from "react";
import { X, Siren, Syringe, Stethoscope, HeartPulse, Camera, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/cn";

export type SOSIssueType = "allergy" | "medical" | "cpr";

export const SOS_ISSUE_LABELS: Record<SOSIssueType, { title: string; subtitle: string }> = {
  allergy: { title: "Allergy",            subtitle: "Epipen needed" },
  medical: { title: "Medical Assistance", subtitle: "Immediate help needed" },
  cpr:     { title: "CPR Needed",         subtitle: "Cardiac emergency" },
};

const ISSUES: {
  id: SOSIssueType;
  icon: React.ElementType;
  iconColor: string;
  accentBorder: string;
  accentBg: string;
  spinnerBorder: string;
}[] = [
  {
    id: "allergy",
    icon: Syringe,
    iconColor: "text-orange-400",
    accentBorder: "border-orange-500/30 hover:border-orange-400/70",
    accentBg: "bg-orange-500/10 hover:bg-orange-500/20",
    spinnerBorder: "border-orange-400",
  },
  {
    id: "medical",
    icon: Stethoscope,
    iconColor: "text-red-400",
    accentBorder: "border-red-500/30 hover:border-red-400/70",
    accentBg: "bg-red-500/10 hover:bg-red-500/20",
    spinnerBorder: "border-red-400",
  },
  {
    id: "cpr",
    icon: HeartPulse,
    iconColor: "text-rose-400",
    accentBorder: "border-rose-500/30 hover:border-rose-400/70",
    accentBg: "bg-rose-500/10 hover:bg-rose-500/20",
    spinnerBorder: "border-rose-400",
  },
];

interface SOSIssueSheetProps {
  /** Called when user completes both steps and taps Submit */
  onSubmit: (issue: SOSIssueType, description: string, photo: File | null) => void;
  onClose: () => void;
  /** True while photo is uploading + broadcasting — disables form */
  submitting?: boolean;
}

export default function SOSIssueSheet({ onSubmit, onClose, submitting = false }: SOSIssueSheetProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [issue, setIssue] = useState<SOSIssueType | null>(null);
  const [description, setDescription] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const selected = issue ? ISSUES.find((i) => i.id === issue) : null;

  const handleIssueClick = (id: SOSIssueType) => {
    setIssue(id);
    setStep(2);
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    if (!file) return;
    setPhoto(file);
    const reader = new FileReader();
    reader.onload = (ev) => setPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleBack = () => {
    setStep(1);
    setDescription("");
    setPhoto(null);
    setPreview(null);
  };

  const handleSubmit = () => {
    if (!issue || submitting) return;
    onSubmit(issue, description.trim(), photo);
  };

  return (
    <div className="pointer-events-auto fixed inset-0 z-[60] flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/65 backdrop-blur-sm"
        onClick={!submitting && step === 1 ? onClose : undefined} />

      <div className="relative w-full max-w-sm rounded-t-3xl border border-red-500/20 bg-black/95 p-5 shadow-2xl shadow-red-900/40 backdrop-blur-xl sm:mx-4 sm:rounded-3xl">

        {/* ── Step 1: Issue selection ── */}
        {step === 1 && (
          <>
            <div className="mb-5 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-500/20 ring-1 ring-red-500/30">
                  <Siren className="h-4 w-4 text-red-400" />
                </div>
                <div>
                  <p className="text-sm font-bold text-white">What&apos;s the emergency?</p>
                  <p className="text-[11px] text-gray-400">Select the type of help needed</p>
                </div>
              </div>
              <button onClick={onClose}
                className="rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-white/10 hover:text-gray-300"
                aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex flex-col gap-3">
              {ISSUES.map(({ id, icon: Icon, iconColor, accentBorder, accentBg }) => {
                const { title, subtitle } = SOS_ISSUE_LABELS[id];
                return (
                  <button key={id} onClick={() => handleIssueClick(id)}
                    className={cn(
                      "flex items-center gap-4 rounded-2xl border px-4 py-4 text-left transition-all active:scale-[0.98]",
                      accentBorder, accentBg
                    )}>
                    <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-black/40", iconColor)}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-white">{title}</p>
                      <p className="text-[11px] text-gray-400">{subtitle}</p>
                    </div>
                  </button>
                );
              })}
            </div>

            <p className="mt-4 text-center text-[10px] text-gray-600">
              You&apos;ll describe the issue on the next step
            </p>
          </>
        )}

        {/* ── Step 2: Description + photo ── */}
        {step === 2 && selected && issue && (
          <>
            {/* Header with selected issue */}
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-black/60 ring-1", selected.iconColor, selected.accentBorder)}>
                  <selected.icon className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-bold text-white">{SOS_ISSUE_LABELS[issue].title}</p>
                  <p className="text-[11px] text-gray-400">Add details for nearby helpers</p>
                </div>
              </div>
              {!submitting && (
                <button onClick={handleBack}
                  className="rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-white/10 hover:text-gray-300"
                  aria-label="Back">
                  <ArrowLeft className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Description */}
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={submitting}
              placeholder="Briefly describe what's happening… (optional)"
              rows={3}
              className="mb-3 w-full resize-none rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-gray-200 placeholder-gray-600 outline-none focus:border-white/25 disabled:opacity-50"
            />

            {/* Photo upload */}
            <div className="mb-4">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handlePhotoChange}
                disabled={submitting}
              />
              <button
                onClick={() => fileRef.current?.click()}
                disabled={submitting}
                className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/20 py-4 transition-colors hover:border-white/40 disabled:opacity-50"
              >
                {preview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={preview} alt="SOS photo" className="h-28 w-full rounded-lg object-cover" />
                ) : (
                  <>
                    <Camera className="h-5 w-5 text-gray-500" />
                    <p className="text-[11px] text-gray-500">Take or upload a photo (optional)</p>
                  </>
                )}
              </button>
              {preview && !submitting && (
                <button onClick={() => { setPhoto(null); setPreview(null); }}
                  className="mt-1 w-full text-center text-[10px] text-gray-600 hover:text-gray-400 transition-colors">
                  Remove photo
                </button>
              )}
            </div>

            {/* Submit */}
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className={cn(
                "flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-bold text-white transition-all",
                "bg-red-600 shadow-lg shadow-red-900/40 hover:bg-red-500 active:scale-[0.98]",
                "disabled:cursor-not-allowed disabled:opacity-60"
              )}
            >
              {submitting ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Alerting nearby users…
                </>
              ) : (
                "Submit & Alert Nearby"
              )}
            </button>

            <p className="mt-3 text-center text-[10px] text-gray-600">
              Your location will be shared with users within 1km
            </p>
          </>
        )}
      </div>
    </div>
  );
}
