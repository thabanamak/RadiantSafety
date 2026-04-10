"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Mail, Lock, User, Eye, EyeOff, Shield } from "lucide-react";
import { cn } from "@/lib/cn";
import type { AuthUser } from "@/lib/auth-storage";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type AuthMode = "login" | "signup";

interface AuthFormProps {
  mode: AuthMode;
  onSuccess: (user: AuthUser) => void;
}

function displayNameFromUser(
  meta: Record<string, unknown> | undefined,
  email: string
): string {
  const full = meta?.full_name;
  const display = meta?.display_name;
  if (typeof full === "string" && full.trim()) return full.trim();
  if (typeof display === "string" && display.trim()) return display.trim();
  return email.split("@")[0] || "User";
}

export default function AuthForm({ mode, onSuccess }: AuthFormProps) {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage(null);
    setInfoMessage(null);

    const { client, error: configError } = getSupabaseBrowserClient();
    if (configError || !client) {
      setErrorMessage(configError ?? "Could not connect to authentication.");
      setIsLoading(false);
      return;
    }

    try {
      if (mode === "signup") {
        const { data, error } = await client.auth.signUp({
          email: form.email.trim(),
          password: form.password,
          options: {
            data: {
              full_name: form.name.trim(),
              display_name: form.name.trim(),
            },
            emailRedirectTo:
              typeof window !== "undefined"
                ? `${window.location.origin}/`
                : undefined,
          },
        });

        if (error) {
          setErrorMessage(error.message);
          return;
        }

        if (data.session?.user) {
          const u = data.session.user;
          onSuccess({
            name: displayNameFromUser(u.user_metadata, u.email ?? form.email),
            email: u.email ?? form.email,
          });
          setForm({ name: "", email: "", password: "" });
          return;
        }

        setInfoMessage(
          "Account created. If email confirmation is enabled, check your inbox to verify before signing in."
        );
        setForm({ name: "", email: "", password: "" });
        return;
      }

      const { data, error } = await client.auth.signInWithPassword({
        email: form.email.trim(),
        password: form.password,
      });

      if (error) {
        setErrorMessage(error.message);
        return;
      }

      const u = data.user;
      if (!u?.email) {
        setErrorMessage("Sign-in succeeded but no user email was returned.");
        return;
      }

      onSuccess({
        name: displayNameFromUser(u.user_metadata, u.email),
        email: u.email,
      });
      setForm({ name: "", email: "", password: "" });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Something went wrong. Try again.";
      setErrorMessage(message);
    } finally {
      setIsLoading(false);
    }
  };

  const updateField = (field: keyof typeof form, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  return (
    <div className="w-full rounded-2xl border border-radiant-border bg-radiant-surface p-6 shadow-2xl">
      <div className="mb-6 flex items-center gap-2">
        <Shield className="h-5 w-5 text-radiant-red" />
        <span className="text-sm font-bold text-gray-100">RadiantSafety</span>
      </div>

      <h1 className="mb-1 text-lg font-semibold text-gray-100">
        {mode === "login" ? "Log in" : "Create an account"}
      </h1>
      <p className="mb-6 text-xs text-gray-500">
        {mode === "login"
          ? "Welcome back. Sign in to continue."
          : "Join the community and build your safety reputation."}
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        {mode === "signup" && (
          <InputField
            icon={User}
            type="text"
            placeholder="Display name"
            value={form.name}
            onChange={(v) => updateField("name", v)}
          />
        )}

        <InputField
          icon={Mail}
          type="email"
          placeholder="Email address"
          value={form.email}
          onChange={(v) => updateField("email", v)}
          required
        />

        <div className="relative">
          <InputField
            icon={Lock}
            type={showPassword ? "text" : "password"}
            placeholder="Password"
            value={form.password}
            onChange={(v) => updateField("password", v)}
            required
            minLength={6}
          />
          <button
            type="button"
            onClick={() => setShowPassword((p) => !p)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
          >
            {showPassword ? (
              <EyeOff className="h-3.5 w-3.5" />
            ) : (
              <Eye className="h-3.5 w-3.5" />
            )}
          </button>
        </div>

        {mode === "login" && (
          <button
            type="button"
            className="self-end text-[11px] text-gray-500 hover:text-gray-300"
          >
            Forgot password?
          </button>
        )}

        <button
          type="submit"
          disabled={isLoading}
          className={cn(
            "mt-2 w-full rounded-xl py-2.5 text-sm font-semibold transition-all",
            isLoading
              ? "bg-gray-800 text-gray-600"
              : "bg-radiant-red text-white shadow-lg shadow-red-500/20 hover:shadow-red-500/40"
          )}
        >
          {isLoading
            ? "Please wait..."
            : mode === "login"
              ? "Log In"
              : "Create Account"}
        </button>
      </form>

      <p className="mt-4 text-center text-xs text-gray-500">
        {mode === "login" ? (
          <>
            No account?{" "}
            <Link
              href="/signup"
              className="font-medium text-radiant-red hover:text-red-400"
            >
              Sign up
            </Link>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <Link
              href="/login"
              className="font-medium text-radiant-red hover:text-red-400"
            >
              Log in
            </Link>
          </>
        )}
      </p>

      <div className="my-5 flex items-center gap-3">
        <div className="h-px flex-1 bg-radiant-border" />
        <span className="text-[10px] uppercase tracking-widest text-gray-600">
          or continue as guest
        </span>
        <div className="h-px flex-1 bg-radiant-border" />
      </div>

      <button
        type="button"
        onClick={() => router.push("/")}
        className="w-full rounded-xl border border-radiant-border bg-radiant-card py-2.5 text-xs font-medium text-gray-300 transition-colors hover:border-gray-500 hover:text-white"
      >
        Continue as guest
      </button>

      <p className="mt-5 text-center text-[11px] leading-relaxed text-gray-600">
        {mode === "signup"
          ? "Create an account to start building your safety reputation and join the trusted reporter network."
          : "Log in to access your reputation score and contribute verified reports."}
      </p>

      {(errorMessage || infoMessage) && (
        <div
          role="status"
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 border-t px-4 py-3 text-center text-xs sm:text-sm",
            errorMessage
              ? "border-red-500/40 bg-red-950/95 text-red-200"
              : "border-radiant-border bg-radiant-card/95 text-gray-300"
          )}
        >
          {errorMessage ?? infoMessage}
        </div>
      )}
    </div>
  );
}

function InputField({
  icon: Icon,
  type,
  placeholder,
  value,
  onChange,
  required,
  minLength,
}: {
  icon: typeof Mail;
  type: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  minLength?: number;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-radiant-border bg-radiant-card px-3 py-2.5 transition-colors focus-within:border-gray-500">
      <Icon className="h-3.5 w-3.5 shrink-0 text-gray-500" />
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        minLength={minLength}
        className="w-full bg-transparent text-xs text-gray-200 placeholder-gray-600 outline-none"
      />
    </div>
  );
}
