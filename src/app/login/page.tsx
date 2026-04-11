"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import AuthForm from "@/components/AuthForm";
import { setStoredUser } from "@/lib/auth-storage";

function RegisteredBanner() {
  const searchParams = useSearchParams();
  if (searchParams.get("registered") !== "1") return null;

  return (
    <div
      role="status"
      className="mb-4 rounded-xl border border-emerald-500/35 bg-emerald-950/50 px-4 py-3 text-center text-xs leading-relaxed text-emerald-100 sm:text-sm"
    >
      Account created. Sign in with your email and password to continue.
    </div>
  );
}

export default function LoginPage() {
  const router = useRouter();

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
          Log in
        </span>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-5 py-10">
        <div className="w-full max-w-sm space-y-4">
          <Suspense fallback={null}>
            <RegisteredBanner />
          </Suspense>
          <AuthForm
            mode="login"
            onAuthenticated={(user) => {
              setStoredUser(user);
              router.push("/");
            }}
          />
        </div>
      </main>
    </div>
  );
}
