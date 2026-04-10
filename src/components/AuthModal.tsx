"use client";

import { useState } from "react";
import { X, Mail, Lock, User, Eye, EyeOff, Shield } from "lucide-react";
import { cn } from "@/lib/cn";

type AuthTab = "login" | "signup";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuth: (user: { name: string; email: string }) => void;
}

export default function AuthModal({ isOpen, onClose, onAuth }: AuthModalProps) {
  const [tab, setTab] = useState<AuthTab>("login");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
  });

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    // TODO: Replace with Supabase auth / FastAPI call
    await new Promise((r) => setTimeout(r, 800));

    onAuth({ name: form.name || form.email.split("@")[0], email: form.email });
    setIsLoading(false);
    setForm({ name: "", email: "", password: "" });
    onClose();
  };

  const updateField = (field: keyof typeof form, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative z-10 w-full max-w-sm rounded-2xl border border-radiant-border bg-radiant-surface p-6 shadow-2xl">
        {/* Header */}
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

        {/* Tabs */}
        <div className="mb-6 flex rounded-xl bg-radiant-card p-1">
          {(["login", "signup"] as AuthTab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
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

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {tab === "signup" && (
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
              "mt-2 w-full rounded-xl py-2.5 text-sm font-semibold transition-all",
              isLoading
                ? "bg-gray-800 text-gray-600"
                : "bg-radiant-red text-white shadow-lg shadow-red-500/20 hover:shadow-red-500/40"
            )}
          >
            {isLoading
              ? "Please wait..."
              : tab === "login"
                ? "Log In"
                : "Create Account"}
          </button>
        </form>

        {/* Divider */}
        <div className="my-5 flex items-center gap-3">
          <div className="h-px flex-1 bg-radiant-border" />
          <span className="text-[10px] uppercase tracking-widest text-gray-600">
            or continue with
          </span>
          <div className="h-px flex-1 bg-radiant-border" />
        </div>

        {/* Social buttons */}
        <div className="flex gap-2">
          <SocialButton label="Google" />
          <SocialButton label="GitHub" />
        </div>

        {/* Reputation hint */}
        <p className="mt-5 text-center text-[11px] leading-relaxed text-gray-600">
          {tab === "signup"
            ? "Create an account to start building your safety reputation and join the trusted reporter network."
            : "Log in to access your reputation score and contribute verified reports."}
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
