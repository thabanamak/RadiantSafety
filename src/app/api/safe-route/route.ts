import { NextResponse } from "next/server";

/**
 * Proxies to the FastAPI router (POST /route): Mapbox Directions geometry
 * with heat scored along the line; A* grid fallback when needed.
 * Set SAFETY_ROUTING_URL in .env.local, e.g. http://127.0.0.1:8000
 */
export async function POST(request: Request) {
  const base = (process.env.SAFETY_ROUTING_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");
  const body = await request.text();

  try {
    const res = await fetch(`${base}/route`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      signal: AbortSignal.timeout(120_000),
    });
    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Routing service unreachable";
    return NextResponse.json(
      { detail: msg, hint: "Start the backend: cd backend && uvicorn app.main:app --reload --port 8000" },
      { status: 503 }
    );
  }
}
