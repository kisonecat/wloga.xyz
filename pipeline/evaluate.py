#!/usr/bin/env nix-shell
#!nix-shell -i python3 -p "python3.withPackages (ps: [ ps.openai ])"
"""
Evaluate papers for accessibility using an LLM.

Usage:
    ./evaluate.py [--model MODEL] [--limit N]

Walks data/ looking for papers with metadata.json but no evaluation.json,
sends them to OpenAI for evaluation, and saves the results.

API key is read from ~/.netrc (machine api.openai.com) or OPENAI_API_KEY env var.
"""

import argparse
import json
import netrc
import os
import sys
from pathlib import Path

from openai import OpenAI

# Project root is one level up from pipeline/
PROJECT_ROOT = Path(__file__).parent.parent
DATA_DIR = PROJECT_ROOT / "data"
PROMPT_FILE = PROJECT_ROOT / "prompts" / "evaluate.txt"


def get_api_key() -> str | None:
    """
    Get OpenAI API key from environment or .netrc.

    Checks OPENAI_API_KEY env var first, then falls back to .netrc
    looking for machine api.openai.com (password field).
    """
    # Check environment first
    if api_key := os.environ.get("OPENAI_API_KEY"):
        return api_key

    # Try .netrc
    try:
        netrc_path = Path.home() / ".netrc"
        if netrc_path.exists():
            nrc = netrc.netrc(str(netrc_path))
            auth = nrc.authenticators("api.openai.com")
            if auth:
                # auth is (login, account, password) - we want password
                return auth[2]
    except (netrc.NetrcParseError, OSError):
        pass

    return None


def load_prompt_template() -> str:
    """Load the evaluation prompt template."""
    with open(PROMPT_FILE) as f:
        return f.read()


def find_papers_to_evaluate() -> list[Path]:
    """Find all paper directories that need evaluation."""
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
            evaluation_path = paper_dir / "evaluation.json"

            # Only process if metadata exists but evaluation doesn't
            if metadata_path.exists() and not evaluation_path.exists():
                papers.append(paper_dir)

    return papers


def evaluate_paper(client: OpenAI, model: str, prompt_template: str, paper_dir: Path) -> dict:
    """
    Evaluate a single paper using OpenAI.

    Returns the evaluation result dict.
    """
    metadata_path = paper_dir / "metadata.json"

    with open(metadata_path) as f:
        metadata = json.load(f)

    # Format the prompt with paper details
    prompt = prompt_template.format(
        title=metadata["title"],
        categories=", ".join(metadata["categories"]),
        abstract=metadata["abstract"],
    )

    response = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "user", "content": prompt}
        ],
        temperature=0.3,  # Lower temperature for more consistent judgments
        response_format={"type": "json_object"},  # Force valid JSON output
    )

    response_text = response.choices[0].message.content.strip()
    return json.loads(response_text)


def save_evaluation(paper_dir: Path, evaluation: dict) -> None:
    """Save evaluation result to disk."""
    evaluation_path = paper_dir / "evaluation.json"

    with open(evaluation_path, "w") as f:
        json.dump(evaluation, f, indent=2)


def main():
    parser = argparse.ArgumentParser(
        description="Evaluate papers for accessibility using OpenAI"
    )
    parser.add_argument(
        "--model",
        default="gpt-4o-mini",
        help="OpenAI model to use (default: gpt-4o-mini)",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Maximum number of papers to evaluate (default: all)",
    )
    args = parser.parse_args()

    # Get API key from .netrc or environment
    api_key = get_api_key()
    if not api_key:
        print("Error: No API key found. Set OPENAI_API_KEY or add to ~/.netrc:", file=sys.stderr)
        print("  machine api.openai.com", file=sys.stderr)
        print("  password sk-...", file=sys.stderr)
        return 1

    # Load prompt template
    if not PROMPT_FILE.exists():
        print(f"Error: Prompt file not found: {PROMPT_FILE}", file=sys.stderr)
        return 1

    prompt_template = load_prompt_template()

    # Find papers to evaluate
    papers = find_papers_to_evaluate()

    if not papers:
        print("No papers to evaluate.")
        return 0

    if args.limit:
        papers = papers[:args.limit]

    print(f"Evaluating {len(papers)} papers using {args.model}...")

    client = OpenAI(api_key=api_key)

    stats = {"accessible": 0, "not_accessible": 0, "errors": 0}

    for i, paper_dir in enumerate(papers, 1):
        arxiv_id = paper_dir.name

        try:
            evaluation = evaluate_paper(client, args.model, prompt_template, paper_dir)
            save_evaluation(paper_dir, evaluation)

            status = "+" if evaluation.get("accessible") else "-"
            stats["accessible" if evaluation.get("accessible") else "not_accessible"] += 1

            print(f"  [{i}/{len(papers)}] {status} {arxiv_id}: {evaluation.get('reasoning', '')[:60]}...")

        except json.JSONDecodeError as e:
            print(f"  [{i}/{len(papers)}] ! {arxiv_id}: Failed to parse response: {e}", file=sys.stderr)
            stats["errors"] += 1
        except Exception as e:
            import traceback
            print(f"  [{i}/{len(papers)}] ! {arxiv_id}: Error: {e}", file=sys.stderr)
            traceback.print_exc()
            stats["errors"] += 1

    print()
    print(f"Done! Accessible: {stats['accessible']}, Not accessible: {stats['not_accessible']}, Errors: {stats['errors']}")

    return 0 if stats["errors"] == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
