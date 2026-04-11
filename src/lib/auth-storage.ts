import type { AuthUser } from "@/components/TopNav";

const ACCOUNTS_KEY = "radiant_accounts_v1";
const SESSION_KEY = "radiant_session_v1";

/** Pre-seeded for testing quick report (18+ verified). Only inserted if missing. */
export const DEMO_LOGIN = {
  email: "admin@gmail.com",
  password: "admin123",
} as const;

type StoredAccount = {
  email: string;
  password: string;
  name: string;
  /** ISO date string YYYY-MM-DD */
  dateOfBirth: string;
  over18Verified: boolean;
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function ageFromDateOfBirth(isoDate: string): number {
  const d = new Date(isoDate + "T12:00:00");
  if (Number.isNaN(d.getTime())) return 0;
  const today = new Date();
  let age = today.getFullYear() - d.getFullYear();
  const m = today.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age -= 1;
  return age;
}

function readAccounts(): StoredAccount[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(ACCOUNTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StoredAccount[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAccounts(accounts: StoredAccount[]) {
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
}

/** Overwrites any existing row for the demo email so password always matches DEMO_LOGIN. */
function upsertDemoAdminAccount(): void {
  if (typeof window === "undefined") return;
  const norm = normalizeEmail(DEMO_LOGIN.email);
  const next = readAccounts().filter((a) => normalizeEmail(a.email) !== norm);
  next.push({
    email: norm,
    password: DEMO_LOGIN.password,
    name: "Demo Admin",
    dateOfBirth: "1990-01-01",
    over18Verified: true,
  });
  writeAccounts(next);
}

/**
 * Ensures the demo admin account exists (correct password if email was reused).
 * Safe to call on every app load.
 */
export function ensureDemoAccounts(): void {
  upsertDemoAdminAccount();
}

/** One-click sign-in as demo admin — no form; fixes local account row and saves session. */
export function instantDemoLogin(): AuthUser {
  upsertDemoAdminAccount();
  const email = normalizeEmail(DEMO_LOGIN.email);
  const user: AuthUser = {
    id: email,
    email,
    name: "Demo Admin",
    over18Verified: true,
  };
  saveSession(user);
  return user;
}

export function registerAccount(input: {
  email: string;
  password: string;
  name: string;
  dateOfBirth: string;
}): { ok: true; user: AuthUser } | { ok: false; error: string } {
  const email = normalizeEmail(input.email);
  if (!email || !input.password || input.password.length < 6) {
    return { ok: false, error: "Valid email and password (6+ characters) required." };
  }
  if (!input.dateOfBirth) {
    return { ok: false, error: "Date of birth is required." };
  }
  const age = ageFromDateOfBirth(input.dateOfBirth);
  if (age < 18) {
    return { ok: false, error: "You must be 18 or older to create a reporting account." };
  }

  const accounts = readAccounts();
  if (accounts.some((a) => normalizeEmail(a.email) === email)) {
    return { ok: false, error: "An account with this email already exists." };
  }

  const account: StoredAccount = {
    email,
    password: input.password,
    name: input.name.trim() || email.split("@")[0],
    dateOfBirth: input.dateOfBirth,
    over18Verified: true,
  };
  accounts.push(account);
  writeAccounts(accounts);

  const user: AuthUser = {
    id: email,
    email,
    name: account.name,
    over18Verified: true,
  };
  return { ok: true, user };
}

export function loginAccount(
  email: string,
  password: string
): { ok: true; user: AuthUser } | { ok: false; error: string } {
  const norm = normalizeEmail(email);
  const accounts = readAccounts();
  const found = accounts.find((a) => normalizeEmail(a.email) === norm);
  if (!found || found.password !== password) {
    return { ok: false, error: "Invalid email or password." };
  }
  if (!found.over18Verified) {
    return { ok: false, error: "This account is not verified for 18+ reporting." };
  }
  const user: AuthUser = {
    id: norm,
    email: norm,
    name: found.name,
    over18Verified: found.over18Verified,
  };
  return { ok: true, user };
}

export function saveSession(user: AuthUser) {
  if (typeof window === "undefined") return;
  localStorage.setItem(SESSION_KEY, JSON.stringify(user));
}

export function loadSession(): AuthUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const u = JSON.parse(raw) as AuthUser;
    if (!u?.email || typeof u.over18Verified !== "boolean") return null;
    return {
      id: u.id ?? normalizeEmail(u.email),
      email: normalizeEmail(u.email),
      name: u.name ?? u.email.split("@")[0],
      over18Verified: u.over18Verified,
    };
  } catch {
    return null;
  }
}

export function clearSession() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(SESSION_KEY);
}
