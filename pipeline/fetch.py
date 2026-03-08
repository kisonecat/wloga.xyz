#!/usr/bin/env nix-shell
#!nix-shell -i python3 -p "python3.withPackages (ps: [ ps.arxiv ])"
"""
Fetch recent math papers from arXiv and store metadata locally.

Usage:
    ./fetch.py [--days N] [--max-results N]

Each paper is stored in data/YYMM/YYMM.NNNNN/metadata.json
"""

import argparse
import json
import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import arxiv

# Project root is one level up from pipeline/
PROJECT_ROOT = Path(__file__).parent.parent
DATA_DIR = PROJECT_ROOT / "data"


def extract_arxiv_id(entry_id: str) -> str:
    """
    Extract the arXiv ID from the entry URL.

    Example: "http://arxiv.org/abs/2503.04127v1" -> "2503.04127"
    """
    match = re.search(r"(\d{4}\.\d{4,5})", entry_id)
    if match:
        return match.group(1)
    raise ValueError(f"Could not extract arXiv ID from: {entry_id}")


def get_paper_dir(arxiv_id: str) -> Path:
    """
    Get the directory path for a paper.

    Example: "2503.04127" -> data/2503/2503.04127/
    """
    month_prefix = arxiv_id.split(".")[0]
    return DATA_DIR / month_prefix / arxiv_id


def paper_exists(arxiv_id: str) -> bool:
    """Check if we already have metadata for this paper."""
    return (get_paper_dir(arxiv_id) / "metadata.json").exists()


def save_paper_metadata(paper: arxiv.Result) -> bool:
    """
    Save paper metadata to disk.

    Returns True if saved, False if already exists.
    """
    arxiv_id = extract_arxiv_id(paper.entry_id)

    if paper_exists(arxiv_id):
        return False

    paper_dir = get_paper_dir(arxiv_id)
    paper_dir.mkdir(parents=True, exist_ok=True)

    metadata = {
        "id": arxiv_id,
        "title": paper.title.replace("\n", " ").strip(),
        "authors": [author.name for author in paper.authors],
        "abstract": paper.summary.replace("\n", " ").strip(),
        "categories": paper.categories,
        "primary_category": paper.primary_category,
        "arxiv_url": paper.entry_id,
        "pdf_url": paper.pdf_url,
        "published": paper.published.isoformat(),
        "updated": paper.updated.isoformat(),
    }

    metadata_path = paper_dir / "metadata.json"
    with open(metadata_path, "w") as f:
        json.dump(metadata, f, indent=2)

    return True


def fetch_recent_math_papers(days: int = 3, max_results: int = 500) -> dict:
    """
    Fetch recent math papers from arXiv.

    Args:
        days: Fetch papers from the last N days
        max_results: Maximum number of papers to fetch

    Returns:
        Dictionary with counts of new and skipped papers
    """
    # Query for all math papers, sorted by submission date (newest first)
    search = arxiv.Search(
        query="cat:math.*",
        max_results=max_results,
        sort_by=arxiv.SortCriterion.SubmittedDate,
        sort_order=arxiv.SortOrder.Descending,
    )

    # Calculate cutoff date
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)

    client = arxiv.Client(
        page_size=100,
        delay_seconds=3.0,  # Respect arXiv rate limits
        num_retries=3,
    )

    stats = {"new": 0, "skipped": 0, "too_old": 0}

    print(f"Fetching math papers from the last {days} days...")
    print(f"Cutoff date: {cutoff.date()}")

    for paper in client.results(search):
        # Stop if we've gone past the cutoff date
        if paper.published < cutoff:
            stats["too_old"] += 1
            # Keep going a bit in case of out-of-order results
            if stats["too_old"] > 10:
                break
            continue

        # Only process papers with math as primary category
        if not paper.primary_category.startswith("math."):
            continue

        arxiv_id = extract_arxiv_id(paper.entry_id)

        if save_paper_metadata(paper):
            stats["new"] += 1
            print(f"  + {arxiv_id}: {paper.title[:60]}...")
        else:
            stats["skipped"] += 1

    return stats


def main():
    parser = argparse.ArgumentParser(
        description="Fetch recent math papers from arXiv"
    )
    parser.add_argument(
        "--days",
        type=int,
        default=3,
        help="Fetch papers from the last N days (default: 3)",
    )
    parser.add_argument(
        "--max-results",
        type=int,
        default=500,
        help="Maximum number of papers to fetch (default: 500)",
    )
    args = parser.parse_args()

    DATA_DIR.mkdir(parents=True, exist_ok=True)

    stats = fetch_recent_math_papers(days=args.days, max_results=args.max_results)

    print()
    print(f"Done! New: {stats['new']}, Skipped: {stats['skipped']}")

    return 0 if stats["new"] > 0 or stats["skipped"] > 0 else 1


if __name__ == "__main__":
    sys.exit(main())
