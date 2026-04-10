"""
CSA Recorded Offences Seeder
------------------------------
Parses the CSA 'Recorded Offences' Excel (Table 03) and pushes individual
jittered offence records into the Supabase `incidents` table.

Only 2025 data for Divisions A (Crimes against the person), B (Property and
deception offences), and C (Drug offences) are processed.

Processes a 15% random sample across qualifying rows. Each sampled row in the
Excel becomes ONE Supabase record. Gaussian (normal) jitter is applied so
points cluster naturally in urban centres and fade at the edges.

Usage (from RadiantSafety/ project root):
    py backend/app/scrapers/seed_csa_data.py
"""

from __future__ import annotations

import logging
import os
import random
import json
import time
from pathlib import Path

import openpyxl
from dotenv import load_dotenv
from supabase import create_client, Client
import requests

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

EXCEL_FILENAME = "Data_Tables_LGA_Recorded_Offences_Year_Ending_December_2025.xlsx"
SHEET_NAME = "Table 03"

SUPABASE_TABLE = "incidents"
SOURCE_LABEL = "CSA_Recorded_2025"
BATCH_SIZE = 500

SAMPLE_RATE = 0.15

# Gaussian jitter (standard deviation, degrees). 0.005° ≈ 550m.
GAUSS_SIGMA_DEFAULT = 0.005
GAUSS_SIGMA_TIGHT = 0.002
GAUSS_SIGMA_CORRIDOR = 0.0015

# Postcode fallback to make this state-wide. Cached on disk to avoid re-geocoding.
POSTCODE_CACHE_FILE = Path(__file__).resolve().parent / "_csa_postcode_coords.json"
# Keep this low-ish to avoid hammering the free geocoder.
GEOCODE_SLEEP_SECONDS = 0.25
MAX_GEOCODE_PER_RUN = 200

TARGET_YEAR = 2025
TARGET_DIVISIONS = {"A", "B", "C"}

DIVISION_INTENSITY: dict[str, int] = {
    "A": 9,  # Crimes against the person
    "B": 5,  # Property and deception
    "C": 4,  # Drug offences
}

# Special handling zones
HIGH_DENSITY_ZONES = {
    "Melbourne",
    "Frankston",
    "Dandenong",
    "Geelong",
    "Richmond",
    "St Kilda",
}

# Major CBD corridors (anchor points) for "Main Street" snapping.
# These are approximate intersections/landmarks across the CBD grid.
CBD_CORRIDORS: list[tuple[float, float]] = [
    (-37.8136, 144.9631),  # CBD centre
    (-37.8170, 144.9670),  # Flinders St / Swanston St
    (-37.8140, 144.9633),  # Bourke St / Swanston St
    (-37.8130, 144.9610),  # Collins St / Elizabeth St
    (-37.8100, 144.9620),  # La Trobe St / Swanston St
    (-37.8158, 144.9666),  # Federation Square vicinity
    (-37.8183, 144.9671),  # Flinders Street Station vicinity
    (-37.8184, 144.9526),  # Southern Cross Station vicinity
]

# ---------------------------------------------------------------------------
# Suburb/town → (lat, lng)  — same master list used by seed_historical_data.py
# ---------------------------------------------------------------------------
SUBURB_COORDS: dict[str, tuple[float, float]] = {
    # ---- Inner Melbourne ----
    "Melbourne":        (-37.8136,  144.9631),
    "Southbank":        (-37.8226,  144.9584),
    "Docklands":        (-37.8145,  144.9460),
    "South Yarra":      (-37.8388,  144.9930),
    "St Kilda":         (-37.8676,  144.9809),
    "Richmond":         (-37.8183,  144.9984),
    "Fitzroy":          (-37.7990,  144.9780),
    "Collingwood":      (-37.7980,  144.9870),
    "Carlton":          (-37.7950,  144.9670),
    "Prahran":          (-37.8494,  144.9924),
    "Footscray":        (-37.7998,  144.8995),
    "Brunswick":        (-37.7666,  144.9600),
    "North Melbourne":  (-37.7980,  144.9430),
    "East Melbourne":   (-37.8120,  144.9870),
    "West Melbourne":   (-37.8080,  144.9450),
    "South Melbourne":  (-37.8320,  144.9580),
    "Port Melbourne":   (-37.8380,  144.9320),
    "Albert Park":      (-37.8440,  144.9560),
    "Toorak":           (-37.8430,  145.0120),
    "Cremorne":         (-37.8270,  144.9940),
    "Abbotsford":       (-37.8060,  144.9990),
    "Windsor":          (-37.8560,  144.9910),
    "Flemington":       (-37.7880,  144.9340),
    "Ascot Vale":       (-37.7780,  144.9200),
    "Fitzroy North":    (-37.7880,  144.9780),
    "Northcote":        (-37.7690,  145.0000),
    "Thornbury":        (-37.7540,  145.0060),
    "Hawthorn":         (-37.8230,  145.0340),
    "Kew":              (-37.8070,  145.0350),
    "Camberwell":       (-37.8420,  145.0700),
    "Malvern East":     (-37.8730,  145.0620),
    "Glen Iris":        (-37.8600,  145.0600),
    "Moonee Ponds":     (-37.7670,  144.9200),
    "Essendon":         (-37.7540,  144.9170),
    "Coburg":           (-37.7430,  144.9660),
    "Brunswick West":   (-37.7640,  144.9450),
    "Brunswick East":   (-37.7720,  144.9730),
    "Coburg North":     (-37.7270,  144.9660),
    "Maribyrnong":      (-37.7740,  144.8890),
    # ---- Northern suburbs ----
    "Preston":          (-37.7490,  145.0130),
    "Reservoir":        (-37.7170,  145.0080),
    "Epping":           (-37.6500,  145.0130),
    "Craigieburn":      (-37.5980,  144.9460),
    "Broadmeadows":     (-37.6830,  144.9180),
    "Thomastown":       (-37.6820,  145.0140),
    "Roxburgh Park":    (-37.6400,  144.9280),
    "Mill Park":        (-37.6630,  145.0600),
    "Bundoora":         (-37.6980,  145.0600),
    "Glenroy":          (-37.7030,  144.9260),
    "Campbellfield":    (-37.6660,  144.9600),
    "Lalor":            (-37.6670,  145.0130),
    "South Morang":     (-37.6500,  145.0920),
    "Mernda":           (-37.6050,  145.0960),
    "Meadow Heights":   (-37.6520,  144.9180),
    "Sunbury":          (-37.5770,  144.7260),
    "Heidelberg":       (-37.7560,  145.0670),
    "Heidelberg West":  (-37.7430,  145.0420),
    "Greensborough":    (-37.7040,  145.1040),
    "Wallan":           (-37.4170,  144.9790),
    # ---- Eastern suburbs ----
    "Box Hill":         (-37.8192,  145.1200),
    "Ringwood":         (-37.8150,  145.2290),
    "Doncaster":        (-37.7830,  145.1260),
    "Glen Waverley":    (-37.8780,  145.1640),
    "Mount Waverley":   (-37.8770,  145.1280),
    "Wantirna South":   (-37.8800,  145.2200),
    "Ferntree Gully":   (-37.8880,  145.2930),
    "Croydon":          (-37.7950,  145.2820),
    "Boronia":          (-37.8610,  145.2870),
    "Lilydale":         (-37.7560,  145.3540),
    "Rowville":         (-37.9230,  145.2320),
    "Bayswater":        (-37.8430,  145.2660),
    "Clayton":          (-37.9200,  145.1220),
    "Mulgrave":         (-37.9260,  145.1730),
    "Cheltenham":       (-37.9560,  145.0480),
    "Bentleigh East":   (-37.9210,  145.0380),
    "Highett":          (-37.9470,  145.0410),
    "Moorabbin":        (-37.9380,  145.0440),
    "Brighton":         (-37.9070,  145.0020),
    "Oakleigh":         (-37.8990,  145.0930),
    "Ormond":           (-37.9050,  145.0380),
    # ---- South-eastern suburbs ----
    "Dandenong":        (-37.9875,  145.2160),
    "Noble Park":       (-37.9700,  145.1650),
    "Springvale":       (-37.9490,  145.1530),
    "Keysborough":      (-37.9910,  145.1740),
    "Narre Warren":     (-37.9930,  145.3020),
    "Berwick":          (-38.0350,  145.3500),
    "Cranbourne":       (-38.0990,  145.2830),
    "Cranbourne North": (-38.0710,  145.2870),
    "Cranbourne West":  (-38.0860,  145.2520),
    "Hampton Park":     (-38.0320,  145.2620),
    "Endeavour Hills":  (-37.9780,  145.2570),
    "Hallam":           (-38.0170,  145.2630),
    "Doveton":          (-37.9930,  145.2310),
    "Dandenong North":  (-37.9630,  145.2150),
    "Dandenong South":  (-38.0250,  145.2120),
    "Narre Warren South": (-38.0260, 145.2970),
    "Pakenham":         (-38.0710,  145.4870),
    "Clyde North":      (-38.0910,  145.3530),
    # ---- South / bayside ----
    "Frankston":        (-38.1440,  145.1250),
    "Seaford":          (-38.1030,  145.1300),
    "Carrum Downs":     (-38.0980,  145.1750),
    "Mornington":       (-38.2180,  145.0380),
    "Hastings":         (-38.3000,  145.1850),
    "Rosebud":          (-38.3570,  144.9140),
    # ---- Western suburbs ----
    "Werribee":         (-37.9050,  144.6620),
    "Hoppers Crossing": (-37.8830,  144.7000),
    "Sunshine":         (-37.7880,  144.8330),
    "St Albans":        (-37.7430,  144.8000),
    "Deer Park":        (-37.7680,  144.7700),
    "Tarneit":          (-37.8380,  144.6960),
    "Point Cook":       (-37.9050,  144.7470),
    "Braybrook":        (-37.7860,  144.8560),
    "Sunshine West":    (-37.7940,  144.8120),
    "Sunshine North":   (-37.7680,  144.8380),
    "Truganina":        (-37.8270,  144.7360),
    "Altona North":     (-37.8370,  144.8530),
    "Williamstown":     (-37.8600,  144.8930),
    "Taylors Lakes":    (-37.6990,  144.7870),
    "Melton":           (-37.6840,  144.5830),
    "Melton South":     (-37.7050,  144.5780),
    "Melton West":      (-37.6860,  144.5540),
    "Caroline Springs": (-37.7350,  144.7350),
    "Wyndham Vale":     (-37.8910,  144.6340),
    "Tullamarine":      (-37.6950,  144.8790),
    # ---- Geelong / Surf Coast ----
    "Geelong":          (-38.1499,  144.3617),
    "Corio":            (-38.0770,  144.3770),
    "Norlane":          (-38.0930,  144.3590),
    "Belmont":          (-38.1780,  144.3440),
    "Sebastopol":       (-37.5820,  143.8330),
    # ---- Ballarat ----
    "Ballarat Central": (-37.5600,  143.8630),
    "Wendouree":        (-37.5340,  143.8310),
    # ---- Bendigo ----
    "Bendigo":          (-36.7580,  144.2800),
    "Kangaroo Flat":    (-36.7910,  144.2440),
    # ---- Gippsland ----
    "Morwell":          (-38.2350,  146.3960),
    "Traralgon":        (-38.1950,  146.5400),
    "Moe":              (-38.1760,  146.2600),
    "Sale":             (-38.1110,  147.0670),
    "Warragul":         (-38.1590,  145.9300),
    "Drouin":           (-38.1370,  145.8600),
    "Bairnsdale":       (-37.8230,  147.6100),
    # ---- Murray / Hume / North-east ----
    "Shepparton":       (-36.3800,  145.3990),
    "Mooroopna":        (-36.3920,  145.3580),
    "Wodonga":          (-36.1210,  146.8880),
    "Wangaratta":       (-36.3580,  146.3100),
    "Benalla":          (-36.5520,  145.9820),
    "Echuca":           (-36.1280,  144.7520),
    "Seymour":          (-37.0270,  145.1390),
    # ---- Western Victoria ----
    "Warrnambool":      (-38.3810,  142.4870),
    "Horsham":          (-36.7120,  142.1990),
    "Portland":         (-38.3440,  141.6040),
    "Colac":            (-38.3400,  143.5850),
    "Ararat":           (-37.2840,  142.9280),
    "Hamilton":         (-37.7440,  142.0210),
    # ---- North-west ----
    "Mildura":          (-34.1850,  142.1620),
    "Swan Hill":        (-35.3380,  143.5540),
    "Ouyen":            (-35.0700,  142.3200),
    # ---- Other ----
    "Merrijig":         (-37.1400,  146.2700),
}

# Case-insensitive lookup index
_SUBURB_LOOKUP: dict[str, str] = {k.lower(): k for k in SUBURB_COORDS}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _find_file(filename: str) -> Path:
    candidates = [Path.cwd() / filename, Path(__file__).resolve().parent / filename]
    current = Path(__file__).resolve().parent
    for _ in range(8):
        candidates.append(current / filename)
        current = current.parent
    for path in candidates:
        if path.is_file():
            return path
    raise FileNotFoundError(f"Could not locate '{filename}'.")


def _find_env_file() -> Path:
    current = Path(__file__).resolve().parent
    for _ in range(10):
        candidate = current / ".env.local"
        if candidate.is_file():
            return candidate
        current = current.parent
    raise FileNotFoundError("Could not locate .env.local")


def _init_supabase() -> Client:
    env_path = _find_env_file()
    load_dotenv(dotenv_path=env_path)
    log.info("Loaded environment from %s", env_path)
    url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
    if not url or not key:
        raise EnvironmentError("Missing SUPABASE_URL / SUPABASE_SERVICE_KEY")
    return create_client(url, key)


def _gauss(base: float, sigma: float) -> float:
    return base + random.gauss(0, sigma)


def _snap_point(suburb: str, lat: float, lng: float) -> tuple[float, float]:
    """
    Gaussian Urban Snapping:
    - Default: sigma=0.005
    - High-density zones: 50% snap near CBD corridors, 50% tighter sigma around suburb centre.
    """
    if suburb in HIGH_DENSITY_ZONES:
        if random.random() < 0.5:
            c_lat, c_lng = random.choice(CBD_CORRIDORS)
            return _gauss(c_lat, GAUSS_SIGMA_CORRIDOR), _gauss(c_lng, GAUSS_SIGMA_CORRIDOR)
        return _gauss(lat, GAUSS_SIGMA_TIGHT), _gauss(lng, GAUSS_SIGMA_TIGHT)
    return _gauss(lat, GAUSS_SIGMA_DEFAULT), _gauss(lng, GAUSS_SIGMA_DEFAULT)


def _load_postcode_cache() -> dict[str, tuple[float, float]]:
    try:
        if POSTCODE_CACHE_FILE.is_file():
            raw = json.loads(POSTCODE_CACHE_FILE.read_text(encoding="utf-8"))
            cache: dict[str, tuple[float, float]] = {}
            for k, v in raw.items():
                if isinstance(v, list) and len(v) == 2:
                    cache[str(k)] = (float(v[0]), float(v[1]))
            return cache
    except Exception:
        pass
    return {}


def _save_postcode_cache(cache: dict[str, tuple[float, float]]) -> None:
    try:
        POSTCODE_CACHE_FILE.write_text(
            json.dumps({k: [v[0], v[1]] for k, v in cache.items()}, indent=2),
            encoding="utf-8",
        )
    except Exception:
        log.warning("Failed to write postcode cache: %s", POSTCODE_CACHE_FILE)


def _geocode_postcode(postcode: int) -> tuple[float, float] | None:
    """
    Geocode a Victorian postcode to a coordinate (centroid-ish).
    Uses OSM Nominatim with a conservative rate limit and disk cache.
    """
    pc = str(int(postcode))
    url = "https://nominatim.openstreetmap.org/search"
    params = {
        "q": f"{pc}, Victoria, Australia",
        "format": "json",
        "limit": 1,
    }
    headers = {
        "User-Agent": "RadiantSafety/1.0 (seed_csa_data.py; contact=local)",
    }
    try:
        time.sleep(GEOCODE_SLEEP_SECONDS)
        resp = requests.get(url, params=params, headers=headers, timeout=20)
        resp.raise_for_status()
        data = resp.json()
        if not data:
            return None
        return float(data[0]["lat"]), float(data[0]["lon"])
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Extraction
# ---------------------------------------------------------------------------

def extract_records(excel_path: Path) -> list[dict]:
    """
    Parse Table 03 and return one dict per qualifying row.
    Only 2025 rows in divisions A, B, C whose suburb matches SUBURB_COORDS.
    """
    log.info("Opening workbook: %s", excel_path)
    wb = openpyxl.load_workbook(str(excel_path), read_only=True, data_only=True)
    log.info("Workbook opened. Reading sheet '%s' ...", SHEET_NAME)
    ws = wb[SHEET_NAME]

    records: list[dict] = []
    skipped_suburbs: set[str] = set()
    skipped_postcodes: set[int] = set()
    rows_scanned = 0
    rows_sampled = 0

    postcode_cache = _load_postcode_cache()
    geocoded = 0
    last_progress_at = time.time()

    for i, row in enumerate(ws.iter_rows(values_only=True)):
        if i == 0:
            continue

        year = row[0]
        suburb_raw: str | None = row[4]
        division_raw: str | None = row[5]
        offence_subgroup: str | None = row[7]
        offence_count = row[8]

        if year != TARGET_YEAR or not suburb_raw or not division_raw or not offence_count:
            continue

        div_letter = division_raw[0]
        if div_letter not in TARGET_DIVISIONS:
            continue

        rows_scanned += 1

        # Periodic progress so it doesn't look "stuck"
        if rows_scanned % 5000 == 0 or (time.time() - last_progress_at) > 10:
            log.info(
                "Progress: scanned=%d sampled=%d records=%d geocoded_this_run=%d cache_size=%d",
                rows_scanned,
                rows_sampled,
                len(records),
                geocoded,
                len(postcode_cache),
            )
            last_progress_at = time.time()

        # 15% sample
        if random.random() > SAMPLE_RATE:
            continue
        rows_sampled += 1
        suburb_name = suburb_raw.strip()
        canonical = _SUBURB_LOOKUP.get(suburb_name.lower())

        # Base coordinate from suburb dictionary, else fallback to postcode centroid.
        if canonical is not None:
            base_lat, base_lng = SUBURB_COORDS[canonical]
            suburb_for_row = canonical
        else:
            postcode = row[3]
            if postcode is None:
                skipped_suburbs.add(suburb_name)
                continue
            try:
                pc_int = int(postcode)
            except Exception:
                skipped_suburbs.add(suburb_name)
                continue

            pc_key = str(pc_int)
            if pc_key not in postcode_cache:
                if geocoded >= MAX_GEOCODE_PER_RUN:
                    skipped_postcodes.add(pc_int)
                    skipped_suburbs.add(suburb_name)
                    continue
                coords = _geocode_postcode(pc_int)
                if coords is None:
                    skipped_postcodes.add(pc_int)
                    skipped_suburbs.add(suburb_name)
                    continue
                postcode_cache[pc_key] = coords
                geocoded += 1
                # Save progressively so long runs don't lose progress
                if geocoded % 25 == 0:
                    _save_postcode_cache(postcode_cache)

            base_lat, base_lng = postcode_cache[pc_key]
            suburb_for_row = suburb_name

        intensity = DIVISION_INTENSITY[div_letter]
        count = int(offence_count)
        title = f"{suburb_for_row} | {offence_subgroup or division_raw} ({count})"

        lat, lng = _snap_point(suburb_for_row, base_lat, base_lng)
        records.append({
            "title": title,
            "suburb": suburb_for_row,
            "location_lat": round(lat, 6),
            "location_lng": round(lng, 6),
            "intensity": intensity,
            "source": SOURCE_LABEL,
            "is_verified": True,
            "votes": 0,
        })

    wb.close()
    _save_postcode_cache(postcode_cache)

    if skipped_suburbs:
        log.info(
            "Skipped %d unmatched suburbs (no coords): %s …",
            len(skipped_suburbs),
            ", ".join(sorted(skipped_suburbs)[:15]),
        )
    if skipped_postcodes:
        log.info(
            "Skipped %d postcodes that could not be geocoded: %s …",
            len(skipped_postcodes),
            ", ".join(str(x) for x in sorted(skipped_postcodes)[:15]),
        )

    log.info(
        "Scanned %d qualifying rows → sampled %d rows → %d jittered records",
        rows_scanned,
        rows_sampled,
        len(records),
    )
    return records


# ---------------------------------------------------------------------------
# Supabase persistence
# ---------------------------------------------------------------------------

def push_to_supabase(records: list[dict], client: Client | None = None) -> int:
    if not records:
        log.info("Nothing to push.")
        return 0

    if client is None:
        client = _init_supabase()

    pushed = 0
    total_batches = (len(records) + BATCH_SIZE - 1) // BATCH_SIZE

    for i in range(0, len(records), BATCH_SIZE):
        batch = records[i : i + BATCH_SIZE]
        batch_num = i // BATCH_SIZE + 1
        try:
            client.table(SUPABASE_TABLE).insert(batch).execute()
            pushed += len(batch)
            log.info(
                "Batch %d/%d: inserted %d records  (%d/%d total)",
                batch_num,
                total_batches,
                len(batch),
                pushed,
                len(records),
            )
        except Exception:
            log.exception("Batch %d failed – falling back to row-by-row", batch_num)
            for rec in batch:
                try:
                    client.table(SUPABASE_TABLE).insert(rec).execute()
                    pushed += 1
                except Exception:
                    log.exception("Failed: %s", rec["title"][:60])

    log.info("Push complete – %d / %d records written.", pushed, len(records))
    return pushed


# ---------------------------------------------------------------------------
# Entry-point
# ---------------------------------------------------------------------------

def run() -> None:
    log.info("=" * 60)
    log.info("CSA Recorded Offences Seeder – starting run")
    log.info("=" * 60)

    excel_path = _find_file(EXCEL_FILENAME)
    log.info("Using Excel file: %s", excel_path)

    records = extract_records(excel_path)
    if not records:
        log.warning("No records to push.")
        return

    pushed = push_to_supabase(records)
    log.info("Run finished. %d new records persisted.", pushed)


if __name__ == "__main__":
    run()
