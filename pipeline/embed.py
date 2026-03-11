#!/usr/bin/env nix-shell
#!nix-shell -i python3 -p "python3.withPackages (ps: [ ps.sentence-transformers ps.numpy ])"
"""
Generate vector embeddings for papers using Qwen3-Embedding.

Usage:
    ./embed.py [--model MODEL] [--limit N]

Walks data/ looking for papers with metadata.json but no embedding.npy,
generates embeddings using SentenceTransformers, and saves the results.

The embedding is generated from a formatted combination of title, authors,
abstract, and categories.
"""

import argparse
import json
import sys
from pathlib import Path

import numpy as np
from sentence_transformers import SentenceTransformer

# Project root is one level up from pipeline/
PROJECT_ROOT = Path(__file__).parent.parent
DATA_DIR = PROJECT_ROOT / "data"

DEFAULT_MODEL = "Qwen/Qwen3-Embedding-0.6B"
EMBEDDING_DIM = 128  # Truncated via Matryoshka Representation Learning


def format_paper_text(metadata: dict) -> str:
    """
    Format paper metadata into a single text string for embedding.

    The format is designed to capture the key semantic content:
    - Title (most important)
    - Authors
    - Categories (provides domain context)
    - Abstract (full content)
    """
    title = metadata.get("title", "")
    authors = ", ".join(metadata.get("authors", []))
    categories = ", ".join(metadata.get("categories", []))
    abstract = metadata.get("abstract", "")

    # Format as a structured document
    parts = [
        f"Title: {title}",
        f"Authors: {authors}",
        f"Categories: {categories}",
        f"Abstract: {abstract}",
    ]

    return "\n\n".join(parts)


def find_papers_to_embed() -> list[Path]:
    """Find all paper directories that need embeddings."""
    papers = []

    if not DATA_DIR.exists():
        return papers

    for month_dir in sorted(DATA_DIR.iterdir()):
        if not month_dir.is_dir():
            continue

        for paper_dir in sorted(month_dir.iterdir()):
            if not paper_dir.is_dir():
                continue

            metadata_path = paper_dir / "metadata.json"
            embedding_path = paper_dir / "embedding.npy"

            # Only process if metadata exists but embedding doesn't
            if metadata_path.exists() and not embedding_path.exists():
                papers.append(paper_dir)

    return papers


def generate_embedding(model: SentenceTransformer, paper_dir: Path) -> np.ndarray:
    """
    Generate embedding for a single paper.

    Returns the embedding as a numpy array.
    """
    metadata_path = paper_dir / "metadata.json"

    with open(metadata_path) as f:
        metadata = json.load(f)

    text = format_paper_text(metadata)

    # Generate embedding (returns a 2D array, we want the first row)
    # Truncate to EMBEDDING_DIM using Matryoshka representation
    embedding = model.encode(text, convert_to_numpy=True)

    return embedding[:EMBEDDING_DIM].astype(np.float32)


def save_embedding(paper_dir: Path, embedding: np.ndarray) -> None:
    """Save embedding to disk as .npy file."""
    embedding_path = paper_dir / "embedding.npy"
    np.save(embedding_path, embedding)


def main():
    parser = argparse.ArgumentParser(
        description="Generate vector embeddings for papers"
    )
    parser.add_argument(
        "--model",
        default=DEFAULT_MODEL,
        help=f"SentenceTransformer model to use (default: {DEFAULT_MODEL})",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Maximum number of papers to embed (default: all)",
    )
    args = parser.parse_args()

    # Find papers to embed
    papers = find_papers_to_embed()

    if not papers:
        print("No papers to embed.")
        return 0

    if args.limit:
        papers = papers[: args.limit]

    print(f"Loading model {args.model}...")
    model = SentenceTransformer(args.model)

    print(f"Embedding {len(papers)} papers...")

    stats = {"success": 0, "errors": 0}

    for i, paper_dir in enumerate(papers, 1):
        arxiv_id = paper_dir.name

        try:
            embedding = generate_embedding(model, paper_dir)
            save_embedding(paper_dir, embedding)

            stats["success"] += 1
            print(f"  [{i}/{len(papers)}] + {arxiv_id} ({embedding.shape[0]} dims)")

        except Exception as e:
            print(f"  [{i}/{len(papers)}] ! {arxiv_id}: Error: {e}", file=sys.stderr)
            stats["errors"] += 1

    print()
    print(f"Done! Success: {stats['success']}, Errors: {stats['errors']}")

    return 0 if stats["errors"] == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
