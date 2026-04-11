"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import AuthForm from "@/components/AuthForm";

export default function SignupPage() {
  return (
    <div className="flex min-h-screen flex-col bg-radiant-dark">
      <header className="flex items-center gap-3 border-b border-radiant-border px-5 py-4">
        <Link
          href="/"
          className="flex items-center gap-2 rounded-lg border border-radiant-border px-3 py-1.5 text-xs font-medium text-gray-300 transition-colors hover:border-gray-500 hover:text-white"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back
        </Link>
        <span className="text-xs font-medium uppercase tracking-widest text-gray-500">
          Sign up
        </span>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-5 py-10">
        <div className="w-full max-w-sm space-y-4">
          <AuthForm mode="signup" />
        </div>
      </main>
    </div>
  );
}
