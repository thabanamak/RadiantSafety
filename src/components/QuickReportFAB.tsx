"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { AlertTriangle, X, MapPin, Navigation, PenLine, Trash2, CheckCircle, Siren } from "lucide-react";
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

interface QuickReportFABProps {
  onPinLocation?: (pin: PinLocation | null) => void;
  onDropPinMode?: (active: boolean) => void;
  droppedPin?: { latitude: number; longitude: number } | null;
  /** Called when the SOS button is tapped — opens the issue selection sheet */
  onSOSPress?: () => void;
}

export default function QuickReportFAB({
  onPinLocation,
  onDropPinMode,
  droppedPin,
  onSOSPress,
}: QuickReportFABProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [emergencyPinging, setEmergencyPinging] = useState(false);

  const [selected, setSelected] = useState<ReportCategory | null>(null);
  const [description, setDescription] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [step, setStep] = useState<"category" | "location" | "sign">("category");

  // Location state
  const [locMode, setLocMode] = useState<"none" | "gps" | "drop">("none");
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [pinnedLocation, setPinnedLocation] = useState<PinLocation | null>(null);
  const [dropPinActive, setDropPinActive] = useState(false);

  // Signature state — native canvas
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawing = useRef(false);
  const lastPos = useRef<{ x: number; y: number } | null>(null);
  const [hasSig, setHasSig] = useState(false);
  const [sigData, setSigData] = useState<string | null>(null);

  // When a dropped pin comes back from the map
  useEffect(() => {
    if (droppedPin && locMode === "drop") {
      const pin: PinLocation = { ...droppedPin, mode: "dropped" };
      setPinnedLocation(pin);
      onPinLocation?.(pin);
      setDropPinActive(false);
      onDropPinMode?.(false);
    }
  }, [droppedPin, locMode, onPinLocation, onDropPinMode]);

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
    onSOSPress?.();
  }, [onSOSPress]);

  const handleDropPin = useCallback(() => {
    setLocMode("drop");
    setDropPinActive(true);
    onDropPinMode?.(true);
    setIsOpen(false); // collapse FAB so map is visible
  }, [onDropPinMode]);

  const handleClearPin = useCallback(() => {
    setPinnedLocation(null);
    setLocMode("none");
    setDropPinActive(false);
    onPinLocation?.(null);
    onDropPinMode?.(false);
  }, [onPinLocation, onDropPinMode]);

  // Canvas drawing helpers
  const getPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const startDraw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    isDrawing.current = true;
    lastPos.current = getPos(e);
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
  };

  const draw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing.current || !canvasRef.current || !lastPos.current) return;
    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return;
    const pos = getPos(e);
    ctx.strokeStyle = "#ef4444";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    lastPos.current = pos;
    setHasSig(true);
  };

  const endDraw = () => {
    if (!isDrawing.current) return;
    isDrawing.current = false;
    lastPos.current = null;
    if (canvasRef.current) {
      setSigData(canvasRef.current.toDataURL());
    }
  };

  const clearCanvas = () => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext("2d");
    ctx?.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    setHasSig(false);
    setSigData(null);
  };

  const handleSubmit = () => {
    if (!selected) return;
    console.log("Report submitted:", {
      category: selected,
      description,
      location: pinnedLocation,
      signature: sigData,
    });
    setSubmitted(true);
    setTimeout(() => {
      setIsOpen(false);
      setSubmitted(false);
      setSelected(null);
      setDescription("");
      setStep("category");
      setPinnedLocation(null);
      setLocMode("none");
      setHasSig(false);
      setSigData(null);
      onPinLocation?.(null);
    }, 1800);
  };

  const handleClose = () => {
    setIsOpen(false);
    if (dropPinActive) {
      setDropPinActive(false);
      onDropPinMode?.(false);
    }
  };

  // Re-open FAB after drop-pin mode returns
  useEffect(() => {
    if (!dropPinActive && locMode === "drop" && droppedPin) {
      setIsOpen(true);
    }
  }, [dropPinActive, locMode, droppedPin]);

  if (!isOpen) {
    return (
      <div className="pointer-events-auto fixed bottom-6 right-6 z-50">
        {/* Mini actions */}
        {menuOpen && (
          <>
            {/* Top: Incident report */}
            <div className="group absolute right-0 bottom-0 -translate-y-[72px]">
              <div className="pointer-events-none absolute bottom-full right-1/2 mb-2 translate-x-1/2 opacity-0 transition-opacity group-hover:opacity-100">
                <div className="relative rounded-2xl border border-radiant-border bg-black/90 px-3.5 py-2 text-center text-[11px] font-semibold tracking-wide text-gray-50 shadow-2xl shadow-black/50 backdrop-blur-xl">
                  Incident Report
                  <span className="absolute left-1/2 top-full h-2 w-2 -translate-x-1/2 -translate-y-1 rotate-45 border border-radiant-border border-t-0 border-l-0 bg-black/90" />
                </div>
              </div>
              <button
                onClick={() => {
                  setMenuOpen(false);
                  setIsOpen(true);
                }}
                className="flex h-11 w-11 items-center justify-center rounded-full border border-radiant-border bg-radiant-surface/95 shadow-lg backdrop-blur-xl transition-transform hover:scale-105 active:scale-95"
                aria-label="Incident report"
              >
                <AlertTriangle className="h-5 w-5 text-radiant-red" />
              </button>
            </div>

            {/* Left: Emergency ping */}
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

        {/* Main button */}
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
          {/* Header */}
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-gray-100">Quick Report</h3>
              {/* Step pills */}
              <div className="flex gap-1">
                {(["category", "location", "sign"] as const).map((s, i) => (
                  <span
                    key={s}
                    className={cn(
                      "h-1.5 w-4 rounded-full transition-all",
                      step === s
                        ? "bg-radiant-red"
                        : i < ["category", "location", "sign"].indexOf(step)
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

          {/* Step 1 — Category + Description */}
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
                className="mb-4 w-full rounded-lg border border-radiant-border bg-radiant-card p-3 text-xs text-gray-200 placeholder-gray-600 outline-none focus:border-gray-500 resize-none"
                rows={3}
              />

              <button
                onClick={() => setStep("location")}
                disabled={!selected}
                className={cn(
                  "w-full rounded-xl py-2.5 text-sm font-semibold transition-all",
                  selected
                    ? "bg-radiant-red text-white shadow-lg shadow-red-500/20 hover:shadow-red-500/40"
                    : "bg-gray-800 text-gray-600 cursor-not-allowed"
                )}
              >
                Next: Add Location
              </button>
            </>
          )}

          {/* Step 2 — Location */}
          {step === "location" && (
            <>
              <p className="mb-3 text-xs text-gray-400">
                Pin where the incident happened so others can stay safe.
              </p>

              {/* GPS button */}
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

              {gpsError && (
                <p className="mb-2 text-xs text-red-400">{gpsError}</p>
              )}

              {/* Drop pin button */}
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
                  className="mb-3 flex w-full items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors"
                >
                  <Trash2 className="h-3 w-3" />
                  Clear pin
                </button>
              )}

              <div className="flex gap-2">
                <button
                  onClick={() => setStep("category")}
                  className="flex-1 rounded-xl border border-radiant-border py-2.5 text-sm font-semibold text-gray-400 hover:text-gray-200 transition-all"
                >
                  Back
                </button>
                <button
                  onClick={() => setStep("sign")}
                  className="flex-1 rounded-xl bg-radiant-red py-2.5 text-sm font-semibold text-white shadow-lg shadow-red-500/20 hover:shadow-red-500/40 transition-all"
                >
                  {pinnedLocation ? "Next: Sign" : "Skip & Sign"}
                </button>
              </div>
            </>
          )}

          {/* Step 3 — Signature */}
          {step === "sign" && (
            <>
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <PenLine className="h-3.5 w-3.5 text-gray-400" />
                  <p className="text-xs text-gray-400">Sign to verify your report</p>
                </div>
                <button
                  onClick={clearCanvas}
                  className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-gray-500 hover:text-gray-300 hover:bg-radiant-card transition-colors"
                >
                  <Trash2 className="h-3 w-3" />
                  Clear
                </button>
              </div>

              <div className="mb-4 overflow-hidden rounded-xl border border-radiant-border bg-radiant-card">
                {!hasSig && (
                  <p className="pointer-events-none absolute ml-3 mt-8 text-xs text-gray-600 select-none">
                    Draw your signature here…
                  </p>
                )}
                <canvas
                  ref={canvasRef}
                  width={270}
                  height={96}
                  className="w-full touch-none cursor-crosshair"
                  onPointerDown={startDraw}
                  onPointerMove={draw}
                  onPointerUp={endDraw}
                  onPointerLeave={endDraw}
                />
              </div>

              {sigData && (
                <div className="mb-3 flex items-center gap-1.5 rounded-lg bg-radiant-green/10 px-3 py-2">
                  <CheckCircle className="h-3.5 w-3.5 text-radiant-green" />
                  <span className="text-xs text-radiant-green">Signature captured</span>
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={() => setStep("location")}
                  className="flex-1 rounded-xl border border-radiant-border py-2.5 text-sm font-semibold text-gray-400 hover:text-gray-200 transition-all"
                >
                  Back
                </button>
                <button
                  onClick={handleSubmit}
                  className="flex-1 rounded-xl bg-radiant-red py-2.5 text-sm font-semibold text-white shadow-lg shadow-red-500/20 hover:shadow-red-500/40 transition-all"
                >
                  Submit Report
                </button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
