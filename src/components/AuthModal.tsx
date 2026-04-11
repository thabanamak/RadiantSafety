"use client";

import { useState, useEffect } from "react";
import { X, Mail, Lock, User, Eye, EyeOff, Shield, Calendar } from "lucide-react";
import { cn } from "@/lib/cn";
import type { AuthUser } from "@/components/TopNav";
import {
  registerAccount,
  loginAccount,
  saveSession,
  ageFromDateOfBirth,
  instantDemoLogin,
} from "@/lib/auth-storage";

type AuthTab = "login" | "signup";

interface AuthModalProps {
  isOpen: boolean;
  initialTab?: AuthTab;
  onClose: () => void;
  onAuth: (user: AuthUser) => void;
}

export default function AuthModal({
  isOpen,
  initialTab = "login",
  onClose,
  onAuth,
}: AuthModalProps) {
  const [tab, setTab] = useState<AuthTab>(initialTab);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    dateOfBirth: "",
    confirm18: false,
  });

  useEffect(() => {
    if (isOpen) {
      setTab(initialTab);
      setError(null);
    }
  }, [isOpen, initialTab]);

  if (!isOpen) return null;

  const handleDemoLoginClick = () => {
    setError(null);
    const user = instantDemoLogin();
    onAuth(user);
    setForm({ name: "", email: "", password: "", dateOfBirth: "", confirm18: false });
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      if (tab === "signup") {
        if (!form.confirm18) {
          setError("Please confirm you are 18 or older.");
          setIsLoading(false);
          return;
        }
        if (!form.dateOfBirth) {
          setError("Date of birth is required.");
          setIsLoading(false);
          return;
        }
        const age = ageFromDateOfBirth(form.dateOfBirth);
        if (age < 18) {
          setError("You must be 18 or older to register as a reporter.");
          setIsLoading(false);
          return;
        }

        await new Promise((r) => setTimeout(r, 400));
        const result = registerAccount({
          email: form.email,
          password: form.password,
          name: form.name,
          dateOfBirth: form.dateOfBirth,
        });
        if (!result.ok) {
          setError(result.error);
          setIsLoading(false);
          return;
        }
        saveSession(result.user);
        onAuth(result.user);
        setForm({ name: "", email: "", password: "", dateOfBirth: "", confirm18: false });
        onClose();
      } else {
        await new Promise((r) => setTimeout(r, 400));
        const result = loginAccount(form.email, form.password);
        if (!result.ok) {
          setError(result.error);
          setIsLoading(false);
          return;
        }
        saveSession(result.user);
        onAuth(result.user);
        setForm({ name: "", email: "", password: "", dateOfBirth: "", confirm18: false });
        onClose();
      }
    } finally {
      setIsLoading(false);
    }
  };

  const updateField = (field: keyof typeof form, value: string | boolean) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative z-10 w-full max-w-sm rounded-2xl border border-radiant-border bg-radiant-surface p-6 shadow-2xl">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-radiant-red" />
            <span className="text-sm font-bold text-gray-100">RadiantSafety</span>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-gray-500 transition-colors hover:bg-radiant-card hover:text-gray-300"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mb-6 flex rounded-xl bg-radiant-card p-1">
          {(["login", "signup"] as AuthTab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                setTab(t);
                setError(null);
              }}
              className={cn(
                "flex-1 rounded-lg py-2 text-xs font-semibold transition-all",
                tab === t
                  ? "bg-radiant-dark text-gray-100 shadow-sm"
                  : "text-gray-500 hover:text-gray-300"
              )}
            >
              {t === "login" ? "Log In" : "Sign Up"}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={handleDemoLoginClick}
          className="mb-4 w-full rounded-xl border border-amber-500/50 bg-amber-500/15 py-2.5 text-sm font-semibold text-amber-100 shadow-sm transition-all hover:border-amber-400/60 hover:bg-amber-500/25"
        >
          Demo login
        </button>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {tab === "signup" && (
            <>
              <InputField
                icon={User}
                type="text"
                placeholder="Display name"
                value={form.name}
                onChange={(v) => updateField("name", v)}
              />
              <div className="flex items-center gap-2.5 rounded-xl border border-radiant-border bg-radiant-card px-3 py-2.5 transition-colors focus-within:border-gray-500">
                <Calendar className="h-3.5 w-3.5 shrink-0 text-gray-500" />
                <div className="flex flex-1 flex-col gap-0.5">
                  <label className="text-[10px] font-medium uppercase tracking-wide text-gray-500">
                    Date of birth
                  </label>
                  <input
                    type="date"
                    required
                    value={form.dateOfBirth}
                    onChange={(e) => updateField("dateOfBirth", e.target.value)}
                    className="w-full bg-transparent text-xs text-gray-200 outline-none"
                  />
                </div>
              </div>
              <p className="text-[10px] leading-relaxed text-gray-500">
                You must be 18 or older. Incident reporting is only available to verified adult accounts.
              </p>
            </>
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

          {tab === "signup" && (
            <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-radiant-border bg-radiant-card/80 px-3 py-2.5">
              <input
                type="checkbox"
                checked={form.confirm18}
                onChange={(e) => updateField("confirm18", e.target.checked)}
                className="mt-0.5 rounded border-radiant-border"
              />
              <span className="text-[11px] leading-relaxed text-gray-400">
                I confirm I am <span className="font-semibold text-gray-200">18 years of age or older</span> and the
                date of birth above is accurate.
              </span>
            </label>
          )}

          {error && (
            <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[11px] text-red-300">
              {error}
            </p>
          )}

          {tab === "login" && (
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
              "w-full rounded-xl py-2.5 text-sm font-semibold transition-all",
              "mt-2",
              isLoading
                ? "bg-gray-800 text-gray-600"
                : "bg-radiant-red text-white shadow-lg shadow-red-500/20 hover:shadow-red-500/40"
            )}
          >
            {isLoading
              ? "Please wait..."
              : tab === "login"
                ? "Log In"
                : "Create verified account"}
          </button>
        </form>

        <div className="my-5 flex items-center gap-3">
          <div className="h-px flex-1 bg-radiant-border" />
          <span className="text-[10px] uppercase tracking-widest text-gray-600">
            or continue with
          </span>
          <div className="h-px flex-1 bg-radiant-border" />
        </div>

        <div className="flex gap-2">
          <SocialButton label="Google" />
          <SocialButton label="GitHub" />
        </div>

        <p className="mt-5 text-center text-[11px] leading-relaxed text-gray-600">
          {tab === "signup"
            ? "Sign up with your real date of birth. Only 18+ verified accounts can file incident reports."
            : "Log in with the email and password you used at sign up."}
        </p>
      </div>
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

function SocialButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-radiant-border bg-radiant-card py-2.5 text-xs font-medium text-gray-400 transition-colors hover:border-gray-500 hover:text-gray-200"
    >
      {label}
    </button>
  );
}
