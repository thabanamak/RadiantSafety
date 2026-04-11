import { NextResponse } from "next/server";
import { MELBOURNE_AREAS } from "@/lib/melbourne-areas";

const ES_HOST =
  "https://e9a0d0eb1a70d8af188eab7954371209.sdp4.elastic.sdp.vic.gov.au";
const ES_INDEX = "elasticsearch_index_production_node";
const VICPOL_BASE = "https://www.police.vic.gov.au";
const PAGE_SIZE = 300;

interface EsHit {
  _source: {
    title?: string[];
    url?: string[];
    created?: string[];
  };
}

interface VicPolIncident {
  id: string;
  title: string;
  url: string;
  suburb: string | null;
  latitude: number | null;
  longitude: number | null;
  intensity: number;
  trustScore: number;
}

const INTENSITY_RULES: Array<{ score: number; keywords: string[] }> = [
  { score: 10, keywords: ["homicide", "murder", "shooting", "shot", "firearm", "terror"] },
  { score: 9,  keywords: ["stabbing", "armed", "sexual assault", "rape", "arson"] },
  { score: 8,  keywords: ["aggravated burglary", "brawl", "affray", "carjacking"] },
  { score: 6,  keywords: ["fatal", "crash", "collision", "fire", "drug"] },
  { score: 4,  keywords: ["burglary", "stolen car", "theft of motor vehicle", "vandalism"] },
  { score: 2,  keywords: ["theft", "speeding", "impounded", "missing", "arrested", "rescue"] },
];

function calculateIntensity(title: string): number {
  const lower = title.toLowerCase();
  for (const rule of INTENSITY_RULES) {
    if (rule.keywords.some((kw) => lower.includes(kw))) return rule.score;
  }
  return 3;
}

const JITTER = 0.002; // ~220 m at Melbourne's latitude

function jitter(lat: number, lng: number): { latitude: number; longitude: number } {
  return {
    latitude: lat + (Math.random() * 2 - 1) * JITTER,
    longitude: lng + (Math.random() * 2 - 1) * JITTER,
  };
}

// Street-level coords — checked FIRST so CBD incidents don't all stack
const STREET_COORDS: Record<string, { latitude: number; longitude: number }> = {
  "swanston":        { latitude: -37.8110, longitude: 144.9640 },
  "flinders lane":   { latitude: -37.8170, longitude: 144.9660 },
  "flinders":        { latitude: -37.8183, longitude: 144.9671 },
  "bourke":          { latitude: -37.8130, longitude: 144.9600 },
  "lonsdale":        { latitude: -37.8100, longitude: 144.9610 },
  "elizabeth":       { latitude: -37.8120, longitude: 144.9610 },
  "king":            { latitude: -37.8150, longitude: 144.9560 },
  "collins":         { latitude: -37.8150, longitude: 144.9580 },
  "spring":          { latitude: -37.8130, longitude: 144.9730 },
  "russell":         { latitude: -37.8120, longitude: 144.9680 },
  "exhibition":      { latitude: -37.8100, longitude: 144.9700 },
  "spencer":         { latitude: -37.8170, longitude: 144.9530 },
  "william":         { latitude: -37.8150, longitude: 144.9570 },
  "queen":           { latitude: -37.8140, longitude: 144.9600 },
  "la trobe":        { latitude: -37.8080, longitude: 144.9630 },
  "little bourke":   { latitude: -37.8120, longitude: 144.9600 },
  "little collins":  { latitude: -37.8140, longitude: 144.9590 },
  "little lonsdale": { latitude: -37.8090, longitude: 144.9610 },
  "chapel street":   { latitude: -37.8530, longitude: 144.9920 },
  "smith street":    { latitude: -37.7990, longitude: 144.9870 },
  "sydney road":     { latitude: -37.7660, longitude: 144.9610 },
  "high street":     { latitude: -37.8490, longitude: 145.0040 },
  "bridge road":     { latitude: -37.8180, longitude: 145.0010 },
  "swan street":     { latitude: -37.8220, longitude: 144.9960 },
  "victoria street": { latitude: -37.8070, longitude: 144.9770 },
  "brunswick street": { latitude: -37.7980, longitude: 144.9780 },
  "st kilda road":   { latitude: -37.8320, longitude: 144.9680 },
};

// Sorted longest-first so "Flinders Lane" matches before "Flinders"
const STREET_KEYS = Object.keys(STREET_COORDS).sort((a, b) => b.length - a.length);

const SUBURB_ALIASES: Record<string, { suburb: string; latitude: number; longitude: number }> = {
  "box hill":       { suburb: "Box Hill",       latitude: -37.8192, longitude: 145.1200 },
  "dandenong":      { suburb: "Dandenong",      latitude: -37.9875, longitude: 145.2160 },
  "frankston":      { suburb: "Frankston",      latitude: -38.1440, longitude: 145.1250 },
  "clayton":        { suburb: "Clayton",        latitude: -37.9200, longitude: 145.1220 },
  "werribee":       { suburb: "Werribee",       latitude: -37.9050, longitude: 144.6620 },
  "noble park":     { suburb: "Noble Park",     latitude: -37.9700, longitude: 145.1650 },
  "roxburgh park":  { suburb: "Roxburgh Park",  latitude: -37.6400, longitude: 144.9280 },
  "geelong":        { suburb: "Geelong",        latitude: -38.1499, longitude: 144.3617 },
  "oakleigh":       { suburb: "Oakleigh",       latitude: -37.8990, longitude: 145.0930 },
  "merrijig":       { suburb: "Merrijig",       latitude: -37.1400, longitude: 146.2700 },
  "ouyen":          { suburb: "Ouyen",          latitude: -35.0700, longitude: 142.3200 },
  "shepparton":     { suburb: "Shepparton",     latitude: -36.3800, longitude: 145.3990 },
  "southbank":      { suburb: "Southbank",      latitude: -37.8226, longitude: 144.9584 },
  "ormond":         { suburb: "Ormond",         latitude: -37.9050, longitude: 145.0380 },
};

function resolveLocation(
  title: string
): { suburb: string; latitude: number; longitude: number } {
  const lower = title.toLowerCase();

  // 1. Street-level (highest granularity)
  for (const key of STREET_KEYS) {
    if (lower.includes(key)) {
      const c = STREET_COORDS[key];
      const j = jitter(c.latitude, c.longitude);
      return { suburb: key.replace(/\b\w/g, (ch) => ch.toUpperCase()), ...j };
    }
  }

  // 2. MELBOURNE_AREAS (shared suburb list)
  const areaMatch = MELBOURNE_AREAS.find((a) => lower.includes(a.name.toLowerCase()));
  if (areaMatch) {
    const j = jitter(areaMatch.latitude, areaMatch.longitude);
    return { suburb: areaMatch.name, ...j };
  }

  // 3. Extended suburb aliases
  for (const [key, val] of Object.entries(SUBURB_ALIASES)) {
    if (lower.includes(key)) {
      const j = jitter(val.latitude, val.longitude);
      return { suburb: val.suburb, ...j };
    }
  }

  // 4. Fallback: Melbourne CBD with jitter
  const j = jitter(-37.8136, 144.9631);
  return { suburb: "Melbourne", ...j };
}

export async function GET() {
  const esUrl = `${ES_HOST}/${ES_INDEX}/_search`;

  const body = {
    query: {
      bool: {
        must: [
          { match: { field_node_site: 4 } },
          { match: { type: "news" } },
          { match: { field_topic_name: "Breaking News" } },
        ],
        filter: [{ term: { status: true } }],
      },
    },
    size: PAGE_SIZE,
    sort: [{ created: { order: "desc" } }],
    _source: ["title", "url", "created"],
  };

  try {
    const res = await fetch(esUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      next: { revalidate: 300 }, // cache for 5 min
    });

    if (!res.ok) {
      return NextResponse.json({ items: [], error: `ES returned ${res.status}` });
    }

    const data = (await res.json()) as { hits: { hits: EsHit[] } };
    const hits = data?.hits?.hits ?? [];

    const items: VicPolIncident[] = hits.flatMap((hit, idx) => {
      const src = hit._source;
      const title = src.title?.[0] ?? "";
      const rawUrl = src.url?.[0] ?? "";
      if (!title) return [];

      const intensity = calculateIntensity(title);
      const loc = resolveLocation(title);
      const slug = rawUrl.replace(/^\/site-\d+\//, "/");

      return [
        {
          id: rawUrl || String(idx),
          title,
          url: `${VICPOL_BASE}${slug}`,
          suburb: loc.suburb,
          latitude: loc.latitude,
          longitude: loc.longitude,
          intensity,
          trustScore: intensity / 10,
        } satisfies VicPolIncident,
      ];
    });

    return NextResponse.json({ items });
  } catch (e) {
    return NextResponse.json(
      { items: [], error: e instanceof Error ? e.message : "Failed to fetch VicPol data" },
      { status: 200 }
    );
  }
}
