"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Shield } from "lucide-react";
import { useEffect, useState } from "react";
import type { AuthUser } from "@/lib/auth-storage";
import { getStoredUser } from "@/lib/auth-storage";

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    setUser(getStoredUser());
  }, []);

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
          Profile
        </span>
      </header>

      <main className="flex flex-1 flex-col items-center px-5 py-10">
        <div className="w-full max-w-md rounded-2xl border border-radiant-border bg-radiant-surface p-6 shadow-2xl">
          <div className="mb-6 flex items-center gap-2">
            <Shield className="h-5 w-5 text-radiant-red" />
            <span className="text-sm font-bold text-gray-100">Your profile</span>
          </div>

          {user ? (
            <dl className="space-y-4 text-sm">
              <div>
                <dt className="text-[11px] font-medium uppercase tracking-wider text-gray-500">
                  Display name
                </dt>
                <dd className="mt-1 text-gray-100">{user.name}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-medium uppercase tracking-wider text-gray-500">
                  Email
                </dt>
                <dd className="mt-1 text-gray-100">{user.email}</dd>
              </div>
            </dl>
          ) : (
            <p className="text-sm text-gray-400">
              You are not signed in.{" "}
              <button
                type="button"
                onClick={() => router.push("/login")}
                className="font-medium text-radiant-red hover:text-red-400"
              >
                Log in
              </button>
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
