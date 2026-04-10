import Parser from "rss-parser";
import { NextResponse } from "next/server";
import { MELBOURNE_AREAS } from "@/lib/melbourne-areas";

export type NewsIncident = {
  id: string;
  outlet: string | null;
  title: string;
  url: string;
  publishedAt: string | null;
  areaName: string | null;
  latitude: number | null;
  longitude: number | null;
};

function guessMelbourneArea(text: string) {
  const haystack = text.toLowerCase();
  return (
    MELBOURNE_AREAS.find((a) => haystack.includes(a.name.toLowerCase())) ?? null
  );
}

export async function GET() {
  const rssUrl =
    process.env.NEWS_RSS_URL ??
    process.env.NEXT_PUBLIC_NEWS_RSS_URL ??
    "";

  if (!rssUrl) {
    return NextResponse.json(
      {
        items: [],
        error:
          "Missing RSS URL. Set NEWS_RSS_URL (server) or NEXT_PUBLIC_NEWS_RSS_URL.",
      },
      { status: 200 }
    );
  }

  const parser = new Parser();

  try {
    const feed = await parser.parseURL(rssUrl);
    const outlet = feed.title?.trim() || null;

    const items: NewsIncident[] = (feed.items ?? [])
      .slice(0, 50)
      .map((item, idx) => {
        const title = item.title?.trim() || "Untitled";
        const url = item.link?.trim() || "";
        const publishedAt = item.isoDate ?? item.pubDate ?? null;
        const blob = `${title}\n${item.contentSnippet ?? ""}\n${
          item.content ?? ""
        }`;
        const area = guessMelbourneArea(blob);

        return {
          id: (item.guid || url || `${idx}`) as string,
          outlet,
          title,
          url,
          publishedAt,
          areaName: area?.name ?? null,
          latitude: area?.latitude ?? null,
          longitude: area?.longitude ?? null,
        };
      });

    return NextResponse.json({ items });
  } catch (e) {
    return NextResponse.json(
      { items: [], error: e instanceof Error ? e.message : "Failed to load RSS" },
      { status: 200 }
    );
  }
}

