"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Loader2, Mail } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { isEmailLinkCallback } from "@/lib/auth-callback-url";
import type { User } from "@supabase/supabase-js";
import { isEmailConfirmed } from "@/lib/supabase-user";
import { syncProfileFromAuthUser } from "@/lib/supabase/profile-sync";
import { setStoredUser } from "@/lib/auth-storage";

function WaitingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const emailHint = searchParams.get("email") ?? "";

  const [status, setStatus] = useState<"checking" | "error">("checking");
  const [resendMsg, setResendMsg] = useState<string | null>(null);
  const hasRedirected = useRef(false);

  const goToDashboardWithWelcome = useCallback(
    async (user: User) => {
      if (hasRedirected.current) return;
      const { client, error } = getSupabaseBrowserClient();
      if (error || !client) return;
      try {
        const authUser = await syncProfileFromAuthUser(client, user);
        if (hasRedirected.current) return;
        hasRedirected.current = true;
        setStoredUser(authUser);
        router.replace("/?welcome=1");
      } catch (e) {
        console.error(e);
      }
    },
    [router]
  );

  useEffect(() => {
    const { client, error } = getSupabaseBrowserClient();
    if (error || !client) {
      setStatus("error");
      return;
    }

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((event, session) => {
      const user = session?.user;
      if (!user || !isEmailConfirmed(user)) return;

      // Do not redirect from a stale session restored on load (INITIAL_SESSION) unless
      // this page load includes tokens from the confirmation email link.
      if (event === "INITIAL_SESSION" && !isEmailLinkCallback()) {
        return;
      }

      // After the user opens the email link, Supabase emits SIGNED_IN, or INITIAL_SESSION
      // when this load includes tokens in the URL. Do not use TOKEN_REFRESHED / polling /
      // getUser() on mount — those can fire for an old session and skip the email step.
      if (
        event === "SIGNED_IN" ||
        (event === "INITIAL_SESSION" && isEmailLinkCallback())
      ) {
        void goToDashboardWithWelcome(user);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [goToDashboardWithWelcome]);

  const handleResend = async () => {
    setResendMsg(null);
    const { client, error: configError } = getSupabaseBrowserClient();
    if (configError || !client || !emailHint.trim()) {
      setResendMsg("Could not resend — check your email address or try again.");
      return;
    }
    const { error } = await client.auth.resend({
      type: "signup",
      email: emailHint.trim(),
      options: {
        emailRedirectTo:
          typeof window !== "undefined"
            ? `${window.location.origin}/?welcome=1`
            : undefined,
      },
    });
    if (error) {
      setResendMsg(error.message);
      return;
    }
    setResendMsg("Another confirmation email has been sent.");
  };

  return (
    <div className="flex min-h-screen flex-col bg-radiant-dark">
      <header className="flex items-center gap-3 border-b border-radiant-border px-5 py-4">
        <Link
          href="/login"
          className="flex items-center gap-2 rounded-lg border border-radiant-border px-3 py-1.5 text-xs font-medium text-gray-300 transition-colors hover:border-gray-500 hover:text-white"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to sign in
        </Link>
        <span className="text-xs font-medium uppercase tracking-widest text-gray-500">
          Verify email
        </span>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-5 py-10">
        <div className="w-full max-w-md rounded-2xl border border-radiant-border bg-radiant-surface p-8 text-center shadow-2xl">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-radiant-red/15 text-radiant-red">
            <Mail className="h-7 w-7" strokeWidth={1.75} />
          </div>
          <h1 className="text-lg font-semibold text-gray-100">
            Confirm your email
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-gray-400">
            We sent a confirmation link
            {emailHint ? (
              <>
                {" "}
                to <span className="text-gray-200">{emailHint}</span>
              </>
            ) : (
              " to your inbox"
            )}
            . Open the link to go straight to your dashboard and finish signing
            in.
          </p>

          <div className="mt-6 flex items-center justify-center gap-2 text-xs text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            {status === "error"
              ? "Could not reach authentication. Check your environment variables."
              : "Waiting for you to open the confirmation link…"}
          </div>

          {emailHint && (
            <button
              type="button"
              onClick={() => void handleResend()}
              className="mt-6 text-xs font-medium text-radiant-red hover:text-red-400"
            >
              Resend confirmation email
            </button>
          )}
          {resendMsg && (
            <p className="mt-3 text-xs text-gray-400">{resendMsg}</p>
          )}
        </div>
      </main>
    </div>
  );
}

export default function WaitingPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-radiant-dark text-sm text-gray-400">
          Loading…
        </div>
      }
    >
      <WaitingContent />
    </Suspense>
  );
}
