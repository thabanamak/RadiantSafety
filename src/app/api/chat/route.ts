import { NextRequest, NextResponse } from "next/server";

const GEMINI_KEY = process.env.GEMINI_CHATBOT_KEY ?? "";
const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

const SYSTEM_PROMPT = `You are RadiantSafety AI, a helpful safety assistant for Melbourne, Australia.
Your role:
- Answer questions about personal safety in Melbourne suburbs and areas.
- Give practical safety tips for walking at night, public transport, and high-risk zones.
- Provide context about crime trends when asked (use general knowledge, not real-time data).
- If asked about a specific area, give an honest but balanced safety assessment.
- Keep responses concise (2-4 short paragraphs max).
- Be empathetic and reassuring while being honest about risks.
- Never give legal advice. Recommend contacting Victoria Police (000 for emergencies) when appropriate.
- You can reference common Melbourne landmarks, train stations, and tram routes.`;

export async function POST(req: NextRequest) {
  if (!GEMINI_KEY) {
    return NextResponse.json(
      { error: "Gemini API key not configured" },
      { status: 500 }
    );
  }

  try {
    const { messages } = (await req.json()) as {
      messages: { role: "user" | "assistant"; content: string }[];
    };

    const geminiContents = [
      { role: "user", parts: [{ text: SYSTEM_PROMPT }] },
      { role: "model", parts: [{ text: "Understood. I'm RadiantSafety AI, ready to help with Melbourne safety questions." }] },
      ...messages.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      })),
    ];

    const res = await fetch(`${GEMINI_URL}?key=${GEMINI_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: geminiContents,
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 512,
        },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("Gemini API error:", err);
      return NextResponse.json(
        { error: "Failed to get response from AI" },
        { status: 502 }
      );
    }

    const data = await res.json();
    const text =
      data.candidates?.[0]?.content?.parts?.[0]?.text ??
      "Sorry, I couldn't generate a response. Please try again.";

    return NextResponse.json({ content: text });
  } catch (err) {
    console.error("Chat API error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
