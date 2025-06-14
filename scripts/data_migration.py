#!/usr/bin/env python3
"""
data_migration.py – Utility to migrate CSV datasets into the web-interface project.

Usage:
  python data_migration.py --replace
  python data_migration.py --update

Before doing any work the script backs up the existing `csv` directory living next to
this file to `backup_<timestamp>` (a simple copy).  Two migration modes are supported:

replace – wipes the current database (the whole `csv` directory) and recreates it
          from the latest scraper output.
update  – only overwrites the files that already exist in `csv`, leaving everything
          else untouched.

Configuration
-------------
For each shop a separate CSV file must be present in the same directory as this
script.  The file name must look like `<shop>_cfg.csv`.  It must contain two
columns with headers exactly as below:           

  category_name,migrated_csv_name

Example (vkusvill_cfg.csv):
  hleb-vypechka,"Хлеб,выпечка"

Constants `SHOPS` below define how to translate a *shop code* (e.g. "vkusvill")
into display name folder (e.g. "Вкусвилл") and where to find scraper output.
Adjust them if your project layout changes.
"""

from __future__ import annotations

import argparse
import csv
import datetime as _dt
import logging
import shutil
from pathlib import Path
from typing import Dict

logging.basicConfig(
    level=logging.INFO,
    format="[%(levelname)s] %(message)s",
)

# ---------------------------------------------------------------------------
# Project-specific constants – adapt with care
# ---------------------------------------------------------------------------

BASE_DIR = Path(__file__).resolve().parent  # directory where the script resides
CSV_DIR = BASE_DIR / ".." / "csv"  # the database that powers the web-interface

# Absolute paths to scraper outputs (only _detailed.csv files are needed)
SHOPS: Dict[str, Dict[str, Path | str]] = {
    "vkusvill": {
        "display": "Вкусвилл",
        "data": BASE_DIR / ".." / "vkusvill-scraper" / "data",
        "cfg": BASE_DIR / "vkusvill_cfg.csv",
    },
    "ozon": {
        "display": "Озон",
        "data": BASE_DIR / ".." / "ozon-scraper" / "data",
        "cfg": BASE_DIR / "ozon_cfg.csv",
    },
}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def backup_database() -> None:
    """Copy the whole `csv` directory to `backup_<timestamp>`."""
    if not CSV_DIR.exists():
        logging.warning("csv directory %s does not exist – nothing to backup", CSV_DIR)
        return

    timestamp = _dt.datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_path = BASE_DIR / "backups" / f"backup_{timestamp}"
    logging.info("Creating backup %s", backup_path)
    shutil.copytree(CSV_DIR, backup_path)
    logging.info("Backup done")


def load_mapping(cfg_path: Path) -> Dict[str, str]:
    """Return mapping slug -> display_name from given cfg CSV."""
    mapping: Dict[str, str] = {}
    with cfg_path.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        if reader.fieldnames != ["category_name", "migrated_csv_name"]:
            raise ValueError(
                f"Unexpected header in {cfg_path}: {reader.fieldnames}, "
                "expected ['category_name', 'migrated_csv_name']"
            )
        for row in reader:
            slug = row["category_name"].strip()
            display = row["migrated_csv_name"].strip()
            if not slug or not display:
                continue  # skip incomplete rows
            mapping[slug] = display
    logging.debug("Loaded %d mappings from %s", len(mapping), cfg_path)
    return mapping


def copy_file(src: Path, dst: Path) -> None:
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dst)
    logging.info("Copied %s -> %s", src, dst)


def replace_database() -> None:
    """Re-create the entire CSV database from scratch."""
    if CSV_DIR.exists():
        logging.info("Removing old csv directory %s", CSV_DIR)
        shutil.rmtree(CSV_DIR)
    CSV_DIR.mkdir(parents=True)

    for code, info in SHOPS.items():
        mapping = load_mapping(info["cfg"])
        target_shop_dir = CSV_DIR / info["display"]
        for slug, display_name in mapping.items():
            src_file = info["data"] / slug / f"{slug}_detailed.csv"
            if not src_file.exists():
                logging.warning("Source file missing: %s", src_file)
                continue
            dst_file = target_shop_dir / f"{display_name}.csv"
            copy_file(src_file, dst_file)


def update_database() -> None:
    """Overwrite only the files that already exist in `csv`."""
    if not CSV_DIR.exists():
        logging.error("csv directory %s does not exist, cannot update", CSV_DIR)
        return

    for code, info in SHOPS.items():
        mapping = load_mapping(info["cfg"])
        target_shop_dir = CSV_DIR / info["display"]
        for slug, display_name in mapping.items():
            dst_file = target_shop_dir / f"{display_name}.csv"
            if not dst_file.exists():
                continue  # only update existing files
            src_file = info["data"] / slug / f"{slug}_detailed.csv"
            if not src_file.exists():
                logging.warning("Source file missing: %s", src_file)
                continue
            copy_file(src_file, dst_file)


# ---------------------------------------------------------------------------
# CLI entrypoint
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description="Migrate CSV datasets.")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--replace", action="store_true", help="Rebuild database from scratch.")
    group.add_argument("--update", action="store_true", help="Update existing files only.")
    args = parser.parse_args()

    backup_database()

    if args.replace:
        replace_database()
    elif args.update:
        update_database()

    logging.info("All done ✅")


if __name__ == "__main__":  # pragma: no cover – script mode
    main() 