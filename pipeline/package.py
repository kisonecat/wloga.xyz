#!/usr/bin/env nix-shell
#!nix-shell -i python3 -p python3
"""
Package accessible papers into per-month JSON files for the frontend.

Usage:
    ./package.py

Walks data/ looking for papers with evaluation.accessible == true,
and writes:
  output/data/index.json   - list of available months
  output/data/YYMM.json    - papers for each month
"""

import json
import sys
from collections import defaultdict
from pathlib import Path

# Project root is one level up from pipeline/
PROJECT_ROOT = Path(__file__).parent.parent
DATA_DIR = PROJECT_ROOT / "data"
OUTPUT_DIR = PROJECT_ROOT / "output" / "data"


def collect_accessible_papers() -> dict[str, list[dict]]:
    """
    Collect all accessible papers, grouped by month.

    Returns a dict mapping month (e.g., "2603") to list of paper dicts.
    """
    papers_by_month = defaultdict(list)

    if not DATA_DIR.exists():
        return papers_by_month

    for month_dir in sorted(DATA_DIR.iterdir()):
        if not month_dir.is_dir():
            continue

        month = month_dir.name

        for paper_dir in sorted(month_dir.iterdir()):
            if not paper_dir.is_dir():
                continue

            metadata_path = paper_dir / "metadata.json"
            evaluation_path = paper_dir / "evaluation.json"

            # Skip if missing either file
            if not metadata_path.exists() or not evaluation_path.exists():
                continue

            with open(metadata_path) as f:
                metadata = json.load(f)

            with open(evaluation_path) as f:
                evaluation = json.load(f)

            # Only include accessible papers
            if not evaluation.get("accessible", False):
                continue

            # Combine metadata and evaluation into output format
            paper = {
                "id": metadata["id"],
                "title": metadata["title"],
                "authors": metadata["authors"],
                "abstract": metadata["abstract"],
                "categories": metadata["categories"],
                "arxivUrl": metadata["arxiv_url"],
                "pdfUrl": metadata["pdf_url"],
                "published": metadata["published"],
                "tags": evaluation.get("tags", []),
                "reasoning": evaluation.get("reasoning", ""),
            }

            papers_by_month[month].append(paper)

    return papers_by_month


def write_output(papers_by_month: dict[str, list[dict]]) -> dict:
    """
    Write per-month JSON files and index.json.

    Returns stats dict.
    """
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    stats = {"months": 0, "papers": 0}

    # Write per-month files
    months = sorted(papers_by_month.keys())

    for month in months:
        papers = papers_by_month[month]
        output_path = OUTPUT_DIR / f"{month}.json"

        with open(output_path, "w") as f:
            json.dump(papers, f, indent=2)

        stats["months"] += 1
        stats["papers"] += len(papers)

        print(f"  {month}.json: {len(papers)} papers")

    # Write index.json
    index = {"months": months}
    index_path = OUTPUT_DIR / "index.json"

    with open(index_path, "w") as f:
        json.dump(index, f, indent=2)

    return stats


def main():
    print("Collecting accessible papers...")

    papers_by_month = collect_accessible_papers()

    if not papers_by_month:
        print("No accessible papers found.")
        return 0

    print(f"Writing output to {OUTPUT_DIR}/")

    stats = write_output(papers_by_month)

    print()
    print(f"Done! {stats['papers']} papers across {stats['months']} months")

    return 0


if __name__ == "__main__":
    sys.exit(main())
