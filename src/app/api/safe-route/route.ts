import { NextResponse } from "next/server";

/**
 * Proxies to the FastAPI router (POST /route): Mapbox Directions geometry
 * with heat scored along the line; A* grid fallback when needed.
 * Set SAFETY_ROUTING_URL in .env.local, e.g. http://127.0.0.1:8000
 */
function errorChain(e: unknown): string {
  if (!(e instanceof Error)) return String(e);
  const parts = [e.message];
  let c: unknown = e.cause;
  let depth = 0;
  while (c instanceof Error && depth < 5) {
    parts.push(c.message);
    c = c.cause;
    depth++;
  }
  return parts.join(" → ");
}

export async function POST(request: Request) {
  const configured = (process.env.SAFETY_ROUTING_URL ?? "").trim().replace(/\/$/, "");
  // In production (e.g. Vercel), never default to localhost — that makes the
  // serverless function try to reach 127.0.0.1:8000 and hang for a long TCP
  // timeout while the browser waits on /api/safe-route.
  const base =
    configured ||
    (process.env.NODE_ENV === "development" ? "http://127.0.0.1:8000" : "");
  const body = await request.text();

  if (!base) {
    return NextResponse.json(
      {
        error_code: "BACKEND_NOT_CONFIGURED",
        detail: "SAFETY_ROUTING_URL is not set in this deployment.",
        hint: "Deploy the Python router and set SAFETY_ROUTING_URL to its public base URL, or set NEXT_PUBLIC_SAFE_ROUTE_ENGINE=client so routing stays in the browser.",
        steps: [
          "Vercel: add SAFETY_ROUTING_URL (https://your-router.example.com) or NEXT_PUBLIC_SAFE_ROUTE_ENGINE=client.",
          "Local: cd backend && uvicorn app.main:app --reload --port 8000 (defaults to http://127.0.0.1:8000 in dev).",
        ],
      },
      { status: 503 }
    );
  }

  const routeUrl = `${base}/route`;

  try {
    const res = await fetch(routeUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      signal: AbortSignal.timeout(45_000),
    });
    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    const detail = errorChain(e);
    return NextResponse.json(
      {
        error_code: "BACKEND_UNAVAILABLE",
        detail,
        attemptedUrl: routeUrl,
        hint: "Next.js could not reach the Python routing service (connection refused, DNS, or timeout).",
        steps: [
          "Start it: cd backend && source .venv/bin/activate 2>/dev/null || true && uvicorn app.main:app --reload --port 8000",
          "If it runs elsewhere, set SAFETY_ROUTING_URL in .env.local to that base URL (no trailing slash) and restart next dev.",
          "No Python? Set NEXT_PUBLIC_SAFE_ROUTE_ENGINE=client in .env.local for in-browser grid routing only, then restart next dev.",
        ],
      },
      { status: 503 }
    );
  }
}
