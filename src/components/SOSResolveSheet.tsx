"use client";

import { useState, useRef } from "react";
import { X, CheckCircle, Camera } from "lucide-react";
import { cn } from "@/lib/cn";

interface SOSResolveSheetProps {
  onSubmit: (description: string, photo: File | null) => void;
  onClose: () => void;
  submitting?: boolean;
}

export default function SOSResolveSheet({ onSubmit, onClose, submitting = false }: SOSResolveSheetProps) {
  const [description, setDescription] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    if (!file) return;
    setPhoto(file);
    const reader = new FileReader();
    reader.onload = (ev) => setPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  return (
    <div className="pointer-events-auto fixed inset-0 z-[130] flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/65 backdrop-blur-sm"
        onClick={!submitting ? onClose : undefined} />

      <div className="relative w-full max-w-sm rounded-t-3xl border border-green-500/20 bg-black/95 p-5 shadow-2xl shadow-green-900/30 backdrop-blur-xl sm:mx-4 sm:rounded-3xl">

        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-500/20 ring-1 ring-green-500/30">
              <CheckCircle className="h-4 w-4 text-green-400" />
            </div>
            <div>
              <p className="text-sm font-bold text-white">Mark as Resolved</p>
              <p className="text-[11px] text-gray-400">Confirm the issue has been handled</p>
            </div>
          </div>
          {!submitting && (
            <button onClick={onClose}
              className="rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-white/10 hover:text-gray-300"
              aria-label="Close">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Description */}
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={submitting}
          placeholder="How was it resolved? e.g. &quot;Ambulance has arrived&quot;, &quot;Person is okay&quot;… (optional)"
          rows={3}
          className="mb-3 w-full resize-none rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-gray-200 placeholder-gray-600 outline-none focus:border-green-500/30 disabled:opacity-50"
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
            className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/20 py-4 transition-colors hover:border-green-500/40 disabled:opacity-50"
          >
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="Resolved photo" className="h-28 w-full rounded-lg object-cover" />
            ) : (
              <>
                <Camera className="h-5 w-5 text-gray-500" />
                <p className="text-[11px] text-gray-500">Take a photo to confirm (optional)</p>
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
          onClick={() => !submitting && onSubmit(description.trim(), photo)}
          disabled={submitting}
          className={cn(
            "flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-bold text-white transition-all",
            "bg-green-600 shadow-lg shadow-green-900/40 hover:bg-green-500 active:scale-[0.98]",
            "disabled:cursor-not-allowed disabled:opacity-60"
          )}
        >
          {submitting ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              Marking resolved…
            </>
          ) : (
            "Mark as Resolved"
          )}
        </button>
      </div>
    </div>
  );
}
