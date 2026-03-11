#!/usr/bin/env nix-shell
#!nix-shell -i python3 -p "python3.withPackages (ps: [ ps.numpy ])"
"""
Package papers into per-month JSON files and embeddings for the frontend.

Usage:
    ./package.py

Walks data/ looking for papers with metadata.json and writes:
  output/data/index.json           - list of available months
  output/data/YYMM.json            - papers for each month
  output/data/YYMM_embeddings.bin  - concatenated float32 embeddings
"""

import json
import sys
from collections import defaultdict
from pathlib import Path

import numpy as np

# Project root is one level up from pipeline/
PROJECT_ROOT = Path(__file__).parent.parent
DATA_DIR = PROJECT_ROOT / "data"
OUTPUT_DIR = PROJECT_ROOT / "output" / "data"


def collect_papers() -> tuple[dict[str, list[dict]], dict[str, list[np.ndarray]]]:
    """
    Collect all papers and their embeddings, grouped by month.

    Returns:
        - dict mapping month (e.g., "2603") to list of paper dicts
        - dict mapping month to list of embeddings (same order as papers)
    """
    papers_by_month = defaultdict(list)
    embeddings_by_month = defaultdict(list)

    if not DATA_DIR.exists():
        return papers_by_month, embeddings_by_month

    for month_dir in sorted(DATA_DIR.iterdir()):
        if not month_dir.is_dir():
            continue

        month = month_dir.name

        for paper_dir in sorted(month_dir.iterdir()):
            if not paper_dir.is_dir():
                continue

            metadata_path = paper_dir / "metadata.json"
            evaluation_path = paper_dir / "evaluation.json"
            embedding_path = paper_dir / "embedding.npy"

            # Skip if missing metadata
            if not metadata_path.exists():
                continue

            with open(metadata_path) as f:
                metadata = json.load(f)

            # Load evaluation if it exists
            evaluation = {}
            if evaluation_path.exists():
                with open(evaluation_path) as f:
                    evaluation = json.load(f)

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
                "accessible": evaluation.get("accessible"),
                "tags": evaluation.get("tags", []),
                "reasoning": evaluation.get("reasoning", ""),
            }

            papers_by_month[month].append(paper)

            # Load embedding if it exists
            if embedding_path.exists():
                embedding = np.load(embedding_path)
                embeddings_by_month[month].append(embedding)
            else:
                # Use None as placeholder - we'll handle this when writing
                embeddings_by_month[month].append(None)

    return papers_by_month, embeddings_by_month


def write_output(
    papers_by_month: dict[str, list[dict]],
    embeddings_by_month: dict[str, list[np.ndarray]],
) -> dict:
    """
    Write per-month JSON files, embedding binary files, and index.json.

    Embedding format (YYMM_embeddings.bin):
        - Binary file of concatenated float32 vectors
        - Each embedding is 128 floats (512 bytes), truncated via Matryoshka
        - Order matches the paper order in YYMM.json
        - Papers without embeddings have all zeros

    Returns stats dict.
    """
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    stats = {"months": 0, "papers": 0, "embeddings": 0}

    # Write per-month files
    months = sorted(papers_by_month.keys())

    for month in months:
        papers = papers_by_month[month]
        embeddings = embeddings_by_month.get(month, [])

        # Write paper JSON
        output_path = OUTPUT_DIR / f"{month}.json"
        with open(output_path, "w") as f:
            json.dump(papers, f, indent=2)

        # Write embeddings binary file
        embeddings_path = OUTPUT_DIR / f"{month}_embeddings.bin"
        embedding_count = 0

        with open(embeddings_path, "wb") as f:
            for i, paper in enumerate(papers):
                if i < len(embeddings) and embeddings[i] is not None:
                    # Write actual embedding
                    emb = embeddings[i].astype(np.float32)
                    f.write(emb.tobytes())
                    embedding_count += 1
                else:
                    # Write zeros as placeholder (128 floats, matching truncated dim)
                    f.write(np.zeros(128, dtype=np.float32).tobytes())

        stats["months"] += 1
        stats["papers"] += len(papers)
        stats["embeddings"] += embedding_count

        print(f"  {month}.json: {len(papers)} papers, {embedding_count} embeddings")

    # Write index.json
    index = {"months": months}
    index_path = OUTPUT_DIR / "index.json"

    with open(index_path, "w") as f:
        json.dump(index, f, indent=2)

    return stats


def main():
    print("Collecting papers...")

    papers_by_month, embeddings_by_month = collect_papers()

    if not papers_by_month:
        print("No papers found.")
        return 0

    print(f"Writing output to {OUTPUT_DIR}/")

    stats = write_output(papers_by_month, embeddings_by_month)

    print()
    print(
        f"Done! {stats['papers']} papers, {stats['embeddings']} embeddings "
        f"across {stats['months']} months"
    )

    return 0


if __name__ == "__main__":
    sys.exit(main())
