"use client";

import { useState } from "react";
import { AlertTriangle, X, Send } from "lucide-react";
import { cn } from "@/lib/cn";
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

export default function QuickReportFAB() {
  const [isOpen, setIsOpen] = useState(false);
  const [selected, setSelected] = useState<ReportCategory | null>(null);
  const [description, setDescription] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = () => {
    if (!selected) return;

    // TODO: POST to FastAPI backend
    console.log("Report submitted:", { category: selected, description });
    setSubmitted(true);
    setTimeout(() => {
      setIsOpen(false);
      setSubmitted(false);
      setSelected(null);
      setDescription("");
    }, 1500);
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="pointer-events-auto fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-radiant-red shadow-lg shadow-red-500/30 transition-all hover:scale-105 hover:shadow-red-500/50 active:scale-95"
        aria-label="Quick Report"
      >
        <AlertTriangle className="h-6 w-6 text-white" />
      </button>
    );
  }

  return (
    <div className="pointer-events-auto fixed bottom-6 right-6 z-50 w-80 rounded-2xl border border-radiant-border bg-radiant-surface/95 p-5 shadow-2xl backdrop-blur-xl">
      {submitted ? (
        <div className="flex flex-col items-center gap-2 py-6">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-radiant-green/20">
            <Send className="h-5 w-5 text-radiant-green" />
          </div>
          <p className="text-sm font-semibold text-radiant-green">Report Submitted</p>
          <p className="text-xs text-gray-400">Thank you for keeping Melbourne safe</p>
        </div>
      ) : (
        <>
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-bold text-gray-100">Quick Report</h3>
            <button
              onClick={() => setIsOpen(false)}
              className="rounded-lg p-1 text-gray-500 hover:bg-radiant-card hover:text-gray-300"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

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
            onClick={handleSubmit}
            disabled={!selected}
            className={cn(
              "w-full rounded-xl py-2.5 text-sm font-semibold transition-all",
              selected
                ? "bg-radiant-red text-white shadow-lg shadow-red-500/20 hover:shadow-red-500/40"
                : "bg-gray-800 text-gray-600 cursor-not-allowed"
            )}
          >
            Submit Report
          </button>
        </>
      )}
    </div>
  );
}
