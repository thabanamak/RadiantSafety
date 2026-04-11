"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import {
  AlertTriangle,
  X,
  MapPin,
  Navigation,
  Trash2,
  CheckCircle,
  Siren,
  ImagePlus,
  Loader2,
  Shield,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { explainGeoError, getCurrentPositionBestEffort } from "@/lib/geolocation";
import type { ReportCategory } from "@/lib/types";

const CATEGORIES: ReportCategory[] = [
  "Gang Activity",
  "Unsafe Vibe",
  "Poor Lighting",
  "Theft",
  "Harassment",
  "Suspicious Activity",
  "Vandalism",
  "Drug Activity",
];

export type PinLocation = {
  latitude: number;
  longitude: number;
  mode: "gps" | "dropped";
};

export type SubmittedReportPayload = {
  category: ReportCategory;
  description: string;
  location: PinLocation;
  /** Optional photo as data URL. */
  imageDataUrl?: string | null;
};

const PHOTO_GUIDELINE =
  "Add an optional photo of the scene only: lighting, street, building exterior, or signage. Please avoid faces, people in distress, injuries, or graphic content — help keep the feed respectful and useful for everyone.";

interface QuickReportFABProps {
  onPinLocation?: (pin: PinLocation | null) => void;
  onDropPinMode?: (active: boolean) => void;
  droppedPin?: { latitude: number; longitude: number } | null;
  /** Called when the user completes submit (location required). May be async (e.g. Supabase insert). */
  onReportSubmitted?: (report: SubmittedReportPayload) => void | Promise<void>;
  /** Called when the SOS button is tapped — opens the issue selection sheet */
  onSOSPress?: () => void;
  /** Called when the Safe Walk button is tapped — starts the check-in timer */
  onSafeWalkPress?: () => void;
  /** Only signed-in, eligible accounts can open the incident report flow */
  reportingAllowed?: boolean;
  /** When user tries to report without permission — e.g. open login */
  onRequireReportingAuth?: () => void;
}

export default function QuickReportFAB({
  onPinLocation,
  onDropPinMode,
  droppedPin,
  onReportSubmitted,
  onSOSPress,
  onSafeWalkPress,
  reportingAllowed = false,
  onRequireReportingAuth,
}: QuickReportFABProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [emergencyPinging, setEmergencyPinging] = useState(false);

  const [selected, setSelected] = useState<ReportCategory | null>(null);
  const [description, setDescription] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [step, setStep] = useState<"category" | "location">("category");

  const [locMode, setLocMode] = useState<"none" | "gps" | "drop">("none");
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [pinnedLocation, setPinnedLocation] = useState<PinLocation | null>(null);
  const [dropPinActive, setDropPinActive] = useState(false);

  const [attachedImageDataUrl, setAttachedImageDataUrl] = useState<string | null>(null);
  const [imageReadLoading, setImageReadLoading] = useState(false);
  const [imagePickError, setImagePickError] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  /** Prevents re-running the drop sync when parent still holds the same coords and locMode stays "drop". */
  const lastConsumedDropKeyRef = useRef<string | null>(null);

  const resetOptionalImage = useCallback(() => {
    setAttachedImageDataUrl(null);
    setImagePickError(null);
    setImageReadLoading(false);
    if (imageInputRef.current) imageInputRef.current.value = "";
  }, []);

  const handleImageFile = useCallback(async (file: File | null) => {
    setImagePickError(null);
    setAttachedImageDataUrl(null);
    if (!file) return;

    const mime = file.type;
    if (!["image/jpeg", "image/png", "image/webp"].includes(mime)) {
      setImagePickError("Please use a JPEG, PNG, or WebP image.");
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      setImagePickError("Image must be under 4 MB.");
      return;
    }

    setImageReadLoading(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = () => reject(new Error("read failed"));
        r.readAsDataURL(file);
      });
      if (!dataUrl.startsWith("data:")) throw new Error("invalid data url");
      setAttachedImageDataUrl(dataUrl);
    } catch {
      setImagePickError("Could not read this image. Try another file.");
    } finally {
      setImageReadLoading(false);
    }
  }, []);

  // When the user places a pin on the map, sync coords, exit map drop mode, and reopen the panel on the location step.
  useEffect(() => {
    if (!droppedPin || locMode !== "drop") {
      if (!droppedPin) lastConsumedDropKeyRef.current = null;
      return;
    }

    if (!reportingAllowed) {
      onRequireReportingAuth?.();
      lastConsumedDropKeyRef.current = null;
      onPinLocation?.(null);
      onDropPinMode?.(false);
      return;
    }

    const dropKey = `${droppedPin.latitude},${droppedPin.longitude}`;
    if (lastConsumedDropKeyRef.current === dropKey) return;
    lastConsumedDropKeyRef.current = dropKey;

    const pin: PinLocation = { ...droppedPin, mode: "dropped" };
    setPinnedLocation(pin);
    onPinLocation?.(pin);
    setDropPinActive(false);
    onDropPinMode?.(false);
    setStep("location");
    setIsOpen(true);
  }, [droppedPin, locMode, onPinLocation, onDropPinMode, reportingAllowed, onRequireReportingAuth]);

  const handleGPS = useCallback(async () => {
    setGpsLoading(true);
    setGpsError(null);
    try {
      const { latitude, longitude } = await getCurrentPositionBestEffort();
      const pin: PinLocation = { latitude, longitude, mode: "gps" };
      setPinnedLocation(pin);
      onPinLocation?.(pin);
      setLocMode("gps");
    } catch (err) {
      setGpsError(explainGeoError(err as GeolocationPositionError));
    } finally {
      setGpsLoading(false);
    }
  }, [onPinLocation]);

  const handleEmergencyPing = useCallback(() => {
    setMenuOpen(false);
    setEmergencyPinging(true);
    onSOSPress?.();
    window.setTimeout(() => setEmergencyPinging(false), 1600);
  }, [onSOSPress]);

  const handleDropPin = useCallback(() => {
    if (!reportingAllowed) {
      onRequireReportingAuth?.();
      return;
    }
    setPinnedLocation(null);
    onPinLocation?.(null);
    setLocMode("drop");
    setDropPinActive(true);
    onDropPinMode?.(true);
    setIsOpen(false);
  }, [onDropPinMode, onPinLocation, reportingAllowed, onRequireReportingAuth]);

  const handleClearPin = useCallback(() => {
    setPinnedLocation(null);
    setLocMode("none");
    setDropPinActive(false);
    onPinLocation?.(null);
    onDropPinMode?.(false);
  }, [onPinLocation, onDropPinMode]);

  const handleSubmit = async () => {
    if (!reportingAllowed) {
      onRequireReportingAuth?.();
      return;
    }
    if (!selected || !pinnedLocation) return;
    setSubmitted(true);
    try {
      await onReportSubmitted?.({
        category: selected,
        description,
        location: pinnedLocation,
        ...(attachedImageDataUrl ? { imageDataUrl: attachedImageDataUrl } : {}),
      });
    } finally {
      setTimeout(() => {
        setIsOpen(false);
        setSubmitted(false);
        setSelected(null);
        setDescription("");
        setStep("category");
        setPinnedLocation(null);
        setLocMode("none");
        resetOptionalImage();
        onPinLocation?.(null);
      }, 1800);
    }
  };

  const handleClose = () => {
    setIsOpen(false);
    resetOptionalImage();
    if (dropPinActive) {
      setDropPinActive(false);
      onDropPinMode?.(false);
    }
  };

  if (!isOpen) {
    return (
      <div className="pointer-events-auto fixed bottom-6 right-6 z-50">
        {menuOpen && (
          <>
            {/* Safe Walk — top (above incident report) */}
            <div className="group absolute right-0 bottom-0 -translate-y-[144px]">
              <div className="pointer-events-none absolute bottom-full right-1/2 mb-2 translate-x-1/2 opacity-0 transition-opacity group-hover:opacity-100">
                <div className="relative rounded-2xl border border-radiant-border bg-black/90 px-3.5 py-2 text-center text-[11px] font-semibold tracking-wide text-gray-50 shadow-2xl shadow-black/50 backdrop-blur-xl">
                  Safe Walk
                  <span className="absolute left-1/2 top-full h-2 w-2 -translate-x-1/2 -translate-y-1 rotate-45 border border-radiant-border border-t-0 border-l-0 bg-black/90" />
                </div>
              </div>
              <button
                onClick={() => { setMenuOpen(false); onSafeWalkPress?.(); }}
                className="flex h-11 w-11 items-center justify-center rounded-full border border-green-500/40 bg-radiant-surface/95 shadow-lg backdrop-blur-xl transition-transform hover:scale-105 active:scale-95"
                aria-label="Safe Walk timer"
              >
                <Shield className="h-5 w-5 text-green-400" />
              </button>
            </div>

            {/* Incident Report */}
            <div className="group absolute right-0 bottom-0 -translate-y-[72px]">
              <div className="pointer-events-none absolute bottom-full right-1/2 mb-2 translate-x-1/2 opacity-0 transition-opacity group-hover:opacity-100">
                <div className="relative rounded-2xl border border-radiant-border bg-black/90 px-3.5 py-2 text-center text-[11px] font-semibold tracking-wide text-gray-50 shadow-2xl shadow-black/50 backdrop-blur-xl">
                  Incident Report
                  <span className="absolute left-1/2 top-full h-2 w-2 -translate-x-1/2 -translate-y-1 rotate-45 border border-radiant-border border-t-0 border-l-0 bg-black/90" />
                </div>
              </div>
              <button
                onClick={() => {
                  if (!reportingAllowed) {
                    onRequireReportingAuth?.();
                    return;
                  }
                  setMenuOpen(false);
                  setIsOpen(true);
                }}
                className="flex h-11 w-11 items-center justify-center rounded-full border border-radiant-border bg-radiant-surface/95 shadow-lg backdrop-blur-xl transition-transform hover:scale-105 active:scale-95"
                aria-label="Incident report"
              >
                <AlertTriangle className="h-5 w-5 text-radiant-red" />
              </button>
            </div>

            {/* SOS */}
            <div className="group absolute right-0 bottom-0 -translate-x-[72px]">
              <div className="pointer-events-none absolute bottom-full right-1/2 mb-2 translate-x-1/2 opacity-0 transition-opacity group-hover:opacity-100">
                <div className="relative rounded-2xl border border-radiant-border bg-black/90 px-3.5 py-2 text-center text-[11px] font-semibold tracking-wide text-gray-50 shadow-2xl shadow-black/50 backdrop-blur-xl">
                  SOS
                  <span className="absolute left-1/2 top-full h-2 w-2 -translate-x-1/2 -translate-y-1 rotate-45 border border-radiant-border border-t-0 border-l-0 bg-black/90" />
                </div>
              </div>
              <button
                onClick={handleEmergencyPing}
                className={cn(
                  "flex h-11 w-11 items-center justify-center rounded-full border border-radiant-border bg-radiant-surface/95 shadow-lg backdrop-blur-xl transition-transform hover:scale-105 active:scale-95",
                  emergencyPinging && "animate-pulse"
                )}
                aria-label="SOS"
              >
                <Siren className={cn("h-5 w-5", emergencyPinging ? "text-red-300" : "text-red-400")} />
              </button>
            </div>
          </>
        )}

        <button
          onClick={() => setMenuOpen((p) => !p)}
          className={cn(
            "flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-all hover:scale-105 active:scale-95",
            dropPinActive
              ? "animate-pulse bg-amber-500 shadow-amber-500/40 hover:shadow-amber-500/60"
              : "bg-radiant-red shadow-red-500/30 hover:shadow-red-500/50"
          )}
          aria-label={dropPinActive ? "Drop pin on map — tap to return" : "Open report menu"}
        >
          {dropPinActive ? (
            <MapPin className="h-6 w-6 text-white" />
          ) : (
            <AlertTriangle className="h-6 w-6 text-white" />
          )}
        </button>
      </div>
    );
  }

  const STEPS = ["category", "location"] as const;

  return (
    <div className="pointer-events-auto fixed bottom-6 right-6 z-50 w-80 rounded-2xl border border-radiant-border bg-radiant-surface/95 p-5 shadow-2xl backdrop-blur-xl">
      {submitted ? (
        <div className="flex flex-col items-center gap-2 py-6">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-radiant-green/20">
            <CheckCircle className="h-5 w-5 text-radiant-green" />
          </div>
          <p className="text-sm font-semibold text-radiant-green">Report Submitted</p>
          <p className="text-xs text-gray-400">Thank you for keeping Melbourne safe</p>
        </div>
      ) : (
        <>
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-gray-100">Quick Report</h3>
              <div className="flex gap-1">
                {STEPS.map((s, i) => (
                  <span
                    key={s}
                    className={cn(
                      "h-1.5 w-4 rounded-full transition-all",
                      step === s
                        ? "bg-radiant-red"
                        : i < STEPS.indexOf(step)
                        ? "bg-radiant-red/40"
                        : "bg-gray-700"
                    )}
                  />
                ))}
              </div>
            </div>
            <button
              onClick={handleClose}
              className="rounded-lg p-1 text-gray-500 hover:bg-radiant-card hover:text-gray-300"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {step === "category" && (
            <>
              <div className="mb-4 grid grid-cols-2 gap-2">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setSelected(cat)}
                    className={cn(
                      "rounded-lg border px-3 py-2 text-xs font-medium transition-all",
                      selected === cat
                        ? "border-radiant-red bg-radiant-red/10 text-radiant-red"
                        : "border-radiant-border text-gray-400 hover:border-gray-500 hover:text-gray-200"
                    )}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe what you see (optional)..."
                className="mb-3 w-full resize-none rounded-lg border border-radiant-border bg-radiant-card p-3 text-xs text-gray-200 placeholder-gray-600 outline-none focus:border-gray-500"
                rows={3}
              />

              <div className="mb-3 rounded-lg border border-sky-500/25 bg-sky-500/5 p-3">
                <p className="text-[11px] font-semibold text-sky-200">Before you add a photo</p>
                <p className="mt-1.5 text-[11px] leading-relaxed text-gray-400">{PHOTO_GUIDELINE}</p>
              </div>

              <div className="mb-4">
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  id="quick-report-photo"
                  disabled={imageReadLoading}
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    void handleImageFile(f);
                  }}
                />
                <label
                  htmlFor="quick-report-photo"
                  className={cn(
                    "flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-radiant-border py-2.5 text-xs font-medium text-gray-400 transition-colors hover:border-gray-500 hover:text-gray-200",
                    imageReadLoading && "pointer-events-none opacity-60"
                  )}
                >
                  {imageReadLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ImagePlus className="h-4 w-4" />
                  )}
                  {imageReadLoading ? "Loading photo…" : "Add photo (optional)"}
                </label>

                {imagePickError && (
                  <p className="mt-2 text-[11px] text-red-400">{imagePickError}</p>
                )}

                {attachedImageDataUrl && (
                  <div className="mt-3 flex items-start gap-2 rounded-lg border border-radiant-border bg-radiant-card/80 p-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={attachedImageDataUrl}
                      alt="Report attachment preview"
                      className="h-14 w-14 shrink-0 rounded-md object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-medium text-gray-300">Photo attached</p>
                      <button
                        type="button"
                        onClick={resetOptionalImage}
                        className="mt-1 text-[11px] text-gray-500 underline-offset-2 hover:text-gray-300 hover:underline"
                      >
                        Remove photo
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <button
                onClick={() => setStep("location")}
                disabled={!selected}
                className={cn(
                  "w-full rounded-xl py-2.5 text-sm font-semibold transition-all",
                  selected
                    ? "bg-radiant-red text-white shadow-lg shadow-red-500/20 hover:shadow-red-500/40"
                    : "cursor-not-allowed bg-gray-800 text-gray-600"
                )}
              >
                Next: Add Location
              </button>
            </>
          )}

          {step === "location" && (
            <>
              <p className="mb-3 text-xs text-gray-400">
                Pin where the incident happened so others can stay safe.
              </p>

              <button
                onClick={handleGPS}
                disabled={gpsLoading}
                className={cn(
                  "mb-2 flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-sm font-medium transition-all",
                  locMode === "gps" && pinnedLocation
                    ? "border-radiant-green bg-radiant-green/10 text-radiant-green"
                    : "border-radiant-border text-gray-300 hover:border-gray-500 hover:bg-radiant-card"
                )}
              >
                <Navigation
                  className={cn(
                    "h-4 w-4 shrink-0",
                    gpsLoading && "animate-spin",
                    locMode === "gps" && pinnedLocation && "text-radiant-green"
                  )}
                />
                <span className="flex-1 text-left">
                  {gpsLoading
                    ? "Getting your location…"
                    : locMode === "gps" && pinnedLocation
                    ? `Pinned: ${pinnedLocation.latitude.toFixed(4)}, ${pinnedLocation.longitude.toFixed(4)}`
                    : "Ping My Location"}
                </span>
                {locMode === "gps" && pinnedLocation && (
                  <CheckCircle className="h-4 w-4 text-radiant-green" />
                )}
              </button>

              {gpsError && <p className="mb-2 text-xs text-red-400">{gpsError}</p>}

              <button
                onClick={handleDropPin}
                className={cn(
                  "mb-2 flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-sm font-medium transition-all",
                  locMode === "drop" && pinnedLocation
                    ? "border-amber-500 bg-amber-500/10 text-amber-400"
                    : "border-radiant-border text-gray-300 hover:border-gray-500 hover:bg-radiant-card"
                )}
              >
                <MapPin className="h-4 w-4 shrink-0" />
                <span className="flex-1 text-left">
                  {locMode === "drop" && pinnedLocation
                    ? `Dropped: ${pinnedLocation.latitude.toFixed(4)}, ${pinnedLocation.longitude.toFixed(4)}`
                    : "Drop Pin on Map"}
                </span>
                {locMode === "drop" && pinnedLocation && (
                  <CheckCircle className="h-4 w-4 text-amber-400" />
                )}
              </button>

              {pinnedLocation && (
                <button
                  onClick={handleClearPin}
                  className="mb-3 flex w-full items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs text-gray-500 transition-colors hover:text-gray-300"
                >
                  <Trash2 className="h-3 w-3" />
                  Clear pin
                </button>
              )}

              <div className="flex gap-2">
                <button
                  onClick={() => setStep("category")}
                  className="flex-1 rounded-xl border border-radiant-border py-2.5 text-sm font-semibold text-gray-400 transition-colors hover:text-gray-200"
                >
                  Back
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={!pinnedLocation}
                  className={cn(
                    "flex-1 rounded-xl py-2.5 text-sm font-semibold shadow-lg transition-all",
                    pinnedLocation
                      ? "bg-radiant-red text-white shadow-red-500/20 hover:shadow-red-500/40"
                      : "cursor-not-allowed bg-gray-800 text-gray-600 shadow-none"
                  )}
                >
                  Submit report
                </button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
