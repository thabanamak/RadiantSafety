import { NextResponse } from "next/server";

function isAllowedUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    // SSRF guard: restrict to VicPol site articles
    return u.hostname === "www.police.vic.gov.au" || u.hostname === "police.vic.gov.au";
  } catch {
    return false;
  }
}

function stripHtml(html: string): string {
  // Remove non-content blocks first
  const withoutBlocks = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<header[\s\S]*?<\/header>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ");

  // Prefer article/main body if present
  const articleMatch =
    withoutBlocks.match(/<article[\s\S]*?<\/article>/i) ??
    withoutBlocks.match(/<main[\s\S]*?<\/main>/i) ??
    withoutBlocks.match(/<body[\s\S]*?<\/body>/i);

  const scope = articleMatch?.[0] ?? withoutBlocks;

  // Replace breaks/paragraphs with whitespace (not dots), then strip tags.
  // We’ll do sentence splitting later on clean text.
  const text = scope
    .replace(/<(br|br\/)\s*>/gi, " ")
    .replace(/<\/p>/gi, " ")
    .replace(/<\/h\d>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();

  // De-boilerplate: drop common footer/byline chunks that pollute VicPol pages
  return text
    .replace(/\bMedia Unit\b/gi, " ")
    .replace(/\bVictoria Police\b/gi, " ")
    // Names + "Media Unit" + reference numbers (often at the end)
    .replace(/\b(Media\s+Unit)\s+\d+\b/gi, " ")
    .replace(/\b(Acting\s+)?(Sergeant|Senior\s+Constable|Detective|Inspector|Superintendent)\b[^.]{0,120}\bMedia\s+Unit\b[^.]{0,60}\b/gi, " ")
    // Long runs of reference numbers
    .replace(/\b\d{5,}\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normaliseText(text: string): string {
  // Remove dot spam and odd separators, keep punctuation for clean sentence splitting
  return text
    .replace(/\s*[•|·]\s*/g, " ")
    .replace(/\.{2,}/g, ".")
    .replace(/\s+/g, " ")
    .trim();
}

function toSentences(text: string): string[] {
  const t = normaliseText(text);
  // Match sentences ending in ., !, ? (keeps punctuation)
  const matches = t.match(/[^.!?]+[.!?]+(?:["')\]]+)?/g) ?? [];
  return matches
    .map((s) => s.trim().replace(/\s+/g, " "))
    .filter((s) => s.length >= 25); // avoid tiny fragments
}

function clampSentences(sentences: string[], min: number, max: number): string[] {
  const picks: string[] = [];
  for (const s of sentences) {
    picks.push(s);
    if (picks.length >= max) break;
  }
  // If we filtered too aggressively, fall back to shorter fragments
  if (picks.length < min) {
    return sentences.slice(0, max);
  }
  return picks;
}

function summarise(title: string, text: string): string {
  const cleaned = normaliseText(text);
  const sentences = toSentences(cleaned);

  // Fallback if extraction failed
  if (sentences.length === 0) {
    return `Summary unavailable for "${title}". Open the source link for full details.`;
  }

  // Pick 2–3 proper sentences, then enforce a concise length cap (no ellipsis).
  const MAX_LEN = 320;
  let picks = clampSentences(sentences, 2, 3);
  let summary = picks.join(" ").replace(/\s+/g, " ").trim();

  // If too long, prefer 2 sentences; if still too long, hard-trim without dots/ellipsis.
  if (summary.length > MAX_LEN) {
    picks = clampSentences(sentences, 2, 2);
    summary = picks.join(" ").replace(/\s+/g, " ").trim();
  }
  if (summary.length > MAX_LEN) {
    summary = summary.slice(0, MAX_LEN).trimEnd();
    summary = summary.replace(/[,.!?;:\s]+$/g, "");
    summary = summary + ".";
  }

  return summary;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const url = searchParams.get("url") ?? "";
  const title = searchParams.get("title") ?? "Untitled";

  if (!url || !isAllowedUrl(url)) {
    return NextResponse.json(
      { summary: `Invalid or disallowed URL for "${title}".` },
      { status: 200 }
    );
  }

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-AU,en;q=0.9",
      },
      // Cache short-lived to avoid hammering source
      next: { revalidate: 600 },
    });

    if (!res.ok) {
      return NextResponse.json(
        { summary: `Could not fetch article content for "${title}".` },
        { status: 200 }
      );
    }

    const html = await res.text();
    const text = stripHtml(html);
    const summary = summarise(title, text);
    return NextResponse.json({ summary });
  } catch (e) {
    return NextResponse.json(
      { summary: e instanceof Error ? e.message : `Failed to summarise "${title}".` },
      { status: 200 }
    );
  }
}

