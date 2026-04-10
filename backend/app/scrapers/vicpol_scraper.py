"""
VicPol Breaking-News Scraper
-----------------------------
Fetches the latest breaking-news articles from Victoria Police via the
public Elasticsearch index that backs police.vic.gov.au/breaking-news,
scores each by intensity, extracts the suburb via regex, and upserts
the results into Supabase.

The breaking-news page is a Nuxt SPA (Ripple / Tide SDP) that renders
skeleton HTML and hydrates from Elasticsearch client-side.  We query
the same public ES endpoint directly, which is faster and immune to
frontend template changes.

Usage:
    python -m app.scrapers.vicpol_scraper        (from backend/)
    python vicpol_scraper.py                     (standalone)
"""

from __future__ import annotations

import logging
import os
import random
import re
from pathlib import Path
from typing import Optional

import requests
from dotenv import load_dotenv
from supabase import create_client, Client

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
VICPOL_BASE_URL = "https://www.police.vic.gov.au"
VICPOL_ES_HOST = (
    "https://e9a0d0eb1a70d8af188eab7954371209"
    ".sdp4.elastic.sdp.vic.gov.au"
)
VICPOL_ES_INDEX = "elasticsearch_index_production_node"
VICPOL_SITE_ID = 4
ES_PAGE_SIZE = 300

REQUEST_TIMEOUT = 30  # seconds

JITTER_RANGE = 0.002  # ~220 m at Melbourne's latitude

# Street-level coords for major CBD streets — checked FIRST for fine-grained
# placement so incidents in the CBD don't all stack on one point.
STREET_COORDS: dict[str, tuple[float, float]] = {
    # CBD grid
    "Swanston":        (-37.8124, 144.9648),
    "Flinders Lane":   (-37.8170, 144.9660),
    "Flinders":        (-37.8183, 144.9671),
    "Bourke":          (-37.8130, 144.9650),
    "Collins":         (-37.8150, 144.9660),
    "Lonsdale":        (-37.8100, 144.9610),
    "Elizabeth":        (-37.8115, 144.9620),
    "King":            (-37.8150, 144.9560),
    "Spring":          (-37.8130, 144.9730),
    "Russell":         (-37.8120, 144.9680),
    "Exhibition":      (-37.8100, 144.9700),
    "Spencer":         (-37.8170, 144.9530),
    "William":         (-37.8150, 144.9570),
    "Queen":           (-37.8140, 144.9600),
    "La Trobe":        (-37.8080, 144.9630),
    "Little Bourke":   (-37.8120, 144.9600),
    "Little Collins":  (-37.8140, 144.9590),
    "Little Lonsdale": (-37.8090, 144.9610),
    # Transport hubs
    "Southern Cross":  (-37.8185, 144.9525),
    "Frankston Station": (-38.1432, 145.1263),
    # Precincts / areas
    "Bayside":         (-38.1445, 145.1245),
    # Inner-suburb arterials
    "Chapel Street":   (-37.8530, 144.9920),
    "Smith Street":    (-37.7990, 144.9870),
    "Sydney Road":     (-37.7660, 144.9610),
    "High Street":     (-37.8490, 145.0040),
    "Bridge Road":     (-37.8180, 145.0010),
    "Swan Street":     (-37.8220, 144.9960),
    "Victoria Street": (-37.8070, 144.9770),
    "Brunswick Street": (-37.7980, 144.9780),
    "St Kilda Road":   (-37.8320, 144.9680),
}

_STREET_KEYS = sorted(STREET_COORDS.keys(), key=len, reverse=True)
_STREET_PATTERN = re.compile(
    r"\b(" + "|".join(re.escape(s) for s in _STREET_KEYS) + r")\b",
    re.IGNORECASE,
)

# Suburb name → (latitude, longitude)
SUBURB_COORDS: dict[str, tuple[float, float]] = {
    "Melbourne":      (-37.8136,  144.9631),
    "CBD":            (-37.8136,  144.9631),
    "Richmond":       (-37.8183,  144.9984),
    "Clayton":        (-37.9200,  145.1220),
    "Dandenong":      (-37.9875,  145.2160),
    "Frankston":      (-38.1440,  145.1250),
    "St Kilda":       (-37.8676,  144.9809),
    "Footscray":      (-37.7998,  144.8995),
    "Box Hill":       (-37.8192,  145.1200),
    "Werribee":       (-37.9050,  144.6620),
    "Fitzroy":        (-37.7990,  144.9780),
    "Collingwood":    (-37.7980,  144.9870),
    "Carlton":        (-37.7950,  144.9670),
    "Brunswick":      (-37.7666,  144.9600),
    "Prahran":        (-37.8494,  144.9924),
    "South Yarra":    (-37.8388,  144.9930),
    "Southbank":      (-37.8226,  144.9584),
    "Docklands":      (-37.8145,  144.9460),
    "North Melbourne":(-37.7980,  144.9430),
    "East Melbourne": (-37.8120,  144.9870),
    "West Melbourne": (-37.8080,  144.9450),
    "South Melbourne":(-37.8320,  144.9580),
    "Port Melbourne": (-37.8380,  144.9320),
    "Albert Park":    (-37.8440,  144.9560),
    "Toorak":         (-37.8430,  145.0120),
    "Cremorne":       (-37.8270,  144.9940),
    "Abbotsford":     (-37.8060,  144.9990),
    "Oakleigh":       (-37.8990,  145.0930),
    "Noble Park":     (-37.9700,  145.1650),
    "Roxburgh Park":  (-37.6400,  144.9280),
    "Ormond":         (-37.9050,  145.0380),
    "Geelong":        (-38.1499,  144.3617),
    "Shepparton":     (-36.3800,  145.3990),
    "Merrijig":       (-37.1400,  146.2700),
    "Ouyen":          (-35.0700,  142.3200),
}

# Build regex from all known suburb names (longest first avoids partial matches)
_SUBURB_KEYS = sorted(SUBURB_COORDS.keys(), key=len, reverse=True)
_SUBURB_PATTERN = re.compile(
    r"\b(" + "|".join(re.escape(s) for s in _SUBURB_KEYS) + r")\b",
    re.IGNORECASE,
)

INTENSITY_RULES: list[tuple[int, list[str]]] = [
    (10, ["homicide", "shooting", "firearm"]),
    (9,  ["stabbing", "armed", "sexual assault"]),
    (8,  ["aggravated burglary", "brawl", "carjacking"]),
    (6,  ["fatal", "crash", "collision", "fire"]),
    (3,  ["theft", "shoplifting", "speeding", "missing"]),
]
DEFAULT_INTENSITY = 4

SUPABASE_TABLE = "incidents"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _find_env_file() -> Path:
    """Walk up from this script's directory to locate ``.env.local``."""
    current = Path(__file__).resolve().parent
    for _ in range(10):
        candidate = current / ".env.local"
        if candidate.is_file():
            return candidate
        current = current.parent
    raise FileNotFoundError(
        "Could not locate .env.local in any ancestor directory"
    )


def _init_supabase() -> Client:
    """Load env vars and return an authenticated Supabase client."""
    env_path = _find_env_file()
    load_dotenv(dotenv_path=env_path)
    log.info("Loaded environment from %s", env_path)

    url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")

    if not url or not key:
        raise EnvironmentError(
            "Missing SUPABASE_URL / SUPABASE_SERVICE_KEY in .env.local"
        )

    return create_client(url, key)


def _jitter(lat: float, lng: float) -> tuple[float, float]:
    """Add random offset so co-located incidents spread across the block."""
    return (
        lat + random.uniform(-JITTER_RANGE, JITTER_RANGE),
        lng + random.uniform(-JITTER_RANGE, JITTER_RANGE),
    )


def extract_location(title: str) -> tuple[str, float, float]:
    """
    Resolve the best coordinates for an article title.

    Priority:
      1. Street-level match (CBD streets like Flinders, Bourke, etc.)
      2. Suburb-level match (Richmond, Dandenong, etc.)
      3. Melbourne CBD fallback

    A random jitter (±~220 m) is always applied so same-street or
    same-suburb incidents don't stack on a single pixel.
    """
    # --- 1. Street-level (highest granularity) ---
    street_match = _STREET_PATTERN.search(title)
    if street_match:
        name = street_match.group(1)
        key = next((k for k in STREET_COORDS if k.lower() == name.lower()), name)
        coords = STREET_COORDS.get(key, SUBURB_COORDS["Melbourne"])
        lat, lng = _jitter(coords[0], coords[1])
        return key, lat, lng

    # --- 2. Suburb-level ---
    suburb_match = _SUBURB_PATTERN.search(title)
    if suburb_match:
        name = suburb_match.group(1).title()
        key = next((k for k in SUBURB_COORDS if k.lower() == name.lower()), name)
        coords = SUBURB_COORDS.get(key, SUBURB_COORDS["Melbourne"])
        lat, lng = _jitter(coords[0], coords[1])
        return key, lat, lng

    # --- 3. Fallback: Melbourne CBD ---
    lat, lng = _jitter(*SUBURB_COORDS["Melbourne"])
    return "Melbourne", lat, lng


def calculate_intensity(title: str) -> int:
    """Return an intensity score (1-10) based on keyword presence in *title*."""
    lower = title.lower()
    for score, keywords in INTENSITY_RULES:
        if any(kw in lower for kw in keywords):
            return score
    return DEFAULT_INTENSITY


# ---------------------------------------------------------------------------
# Elasticsearch data fetcher
# ---------------------------------------------------------------------------

def _build_es_query(size: int = ES_PAGE_SIZE) -> dict:
    """Construct the Elasticsearch request body for breaking-news articles."""
    return {
        "query": {
            "bool": {
                "must": [
                    {"match": {"field_node_site": VICPOL_SITE_ID}},
                    {"match": {"type": "news"}},
                    {"match": {"field_topic_name": "Breaking News"}},
                ],
                "filter": [
                    {"term": {"status": True}},
                ],
            }
        },
        "size": size,
        "sort": [{"created": {"order": "desc"}}],
        "_source": ["title", "url", "created"],
    }


def _es_url_to_public(raw_url: str) -> str:
    """
    Convert the ES path (``/site-4/slug``) to the public-facing URL.
    """
    slug = re.sub(r"^/site-\d+/", "/", raw_url)
    return f"{VICPOL_BASE_URL}{slug}"


def fetch_articles() -> list[dict]:
    """Query Victoria Police Elasticsearch for the latest breaking-news articles."""
    es_url = f"{VICPOL_ES_HOST}/{VICPOL_ES_INDEX}/_search"
    body = _build_es_query()

    log.info("Querying VicPol ES index (%s articles) ...", body["size"])

    resp = requests.post(
        es_url,
        json=body,
        headers={"Content-Type": "application/json"},
        timeout=REQUEST_TIMEOUT,
    )
    resp.raise_for_status()

    data = resp.json()
    hits = data.get("hits", {}).get("hits", [])
    total = data.get("hits", {}).get("total", {}).get("value", "?")
    log.info("ES returned %s hits (total in index: %s)", len(hits), total)

    if not hits:
        log.warning("No articles returned from Elasticsearch.")
        return []

    enriched: list[dict] = []
    for hit in hits:
        src = hit.get("_source", {})
        title = (src.get("title") or [""])[0]
        raw_url = (src.get("url") or [""])[0]

        if not title:
            continue

        suburb, lat, lng = extract_location(title)
        enriched.append({
            "title": title,
            "link": _es_url_to_public(raw_url),
            "suburb": suburb,
            "location_lat": lat,
            "location_lng": lng,
            "intensity": calculate_intensity(title),
            "source": "VicPol_Live",
            "is_verified": True,
            "votes": 0,
        })

    log.info("Parsed %d articles from VicPol Breaking News", len(enriched))
    return enriched


# ---------------------------------------------------------------------------
# Supabase persistence (duplicate-safe insert)
# ---------------------------------------------------------------------------

def push_to_supabase(articles: list[dict], client: Optional[Client] = None) -> int:
    """
    Insert *articles* into Supabase, skipping duplicates by title.

    Returns the count of rows successfully written.
    """
    if not articles:
        log.info("Nothing to push – article list is empty.")
        return 0

    if client is None:
        client = _init_supabase()

    pushed = 0
    for art in articles:
        row = {
            "title": art["title"],
            "suburb": art["suburb"],
            "location_lat": art["location_lat"],
            "location_lng": art["location_lng"],
            "intensity": art["intensity"],
            "source": art["source"],
            "is_verified": art["is_verified"],
            "votes": art["votes"],
        }

        try:
            existing = (
                client.table(SUPABASE_TABLE)
                .select("id")
                .eq("title", art["title"])
                .limit(1)
                .execute()
            )

            if existing.data:
                log.info("Skipped (duplicate): %s", art["title"])
                continue

            client.table(SUPABASE_TABLE).insert(row).execute()
            pushed += 1
            log.info("Successfully pushed [%s] to Supabase.", art["title"])

        except Exception:
            log.exception("Failed to upsert article: %s", art["title"])

    log.info("Push complete – %d / %d articles written.", pushed, len(articles))
    return pushed


# ---------------------------------------------------------------------------
# Entry-point
# ---------------------------------------------------------------------------

def run() -> None:
    """Full pipeline: fetch → enrich → persist."""
    log.info("=" * 60)
    log.info("VicPol Breaking-News Scraper – starting run")
    log.info("=" * 60)

    articles = fetch_articles()
    if not articles:
        log.warning("Scraper produced 0 articles. Exiting.")
        return

    pushed = push_to_supabase(articles)
    log.info("Run finished. %d new articles persisted.", pushed)


if __name__ == "__main__":
    run()
