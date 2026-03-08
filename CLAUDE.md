# WLOGA — Without Loss of General (Audience)

A curated daily feed of accessible mathematics preprints from arXiv.

Site: https://wloga.xyz/

## Architecture Overview

No backend server. The entire site is a Vite-built SPA served as static files from S3 behind CloudFront. A daily cron job on a server fetches new arXiv papers using the python scripts below, evaluates them with an LLM, and uploads the results alongside the static assets.

```
arXiv RSS ──► fetch script ──► per-paper files ──► LLM evaluation ──► package JSON ──► S3
                                                                                       │
                                                                        Vite SPA ◄─────┘
```

## Data Pipeline

### 1. Fetch

A Python script pulls new math listings using the API.

Each paper is associated with a subdirectory.

```
data/
  2503/
    2503.04127/
      metadata.json    # title, authors, abstract, categories, arxiv url
    2503.04200/
      metadata.json
  2504/
    ...
```

The fetch step is idempotent. A future version may end up downloading
the `.tex` source of the papers and storing it in the same directory
with `metadata.json` files.

### 2. Evaluate

A second pass walks each paper that has `metadata.json` but no `evaluation.json` and sends the abstract (plus category info) to an LLM. The LLM returns a structured judgment:

```
data/2503/2503.04127/
  metadata.json
  evaluation.json    # { accessible: bool, reasoning: "...", tags: [...] }
```

Key design decisions:
- The prompt is stored in a separate file (`prompts/evaluate.txt`) so
  it can be iterated on without touching code.
- The LLM's reasoning is saved, not just the yes/no, to support
  debugging false positives/negatives.
- arXiv categories provide useful prior signal (math.HO and math.CO
  skew accessible; math.AG skews specialist). Pass categories as
  context.
- Evaluation is idempotent: papers with an existing `evaluation.json`
  are skipped.

### 3. Package

A final step walks the tree, collects all papers where
`evaluation.accessible == true`, and writes per-month JSON files:

```
output/
  data/
    index.json        # { months: ["2502", "2503", ...] }
    2503.json         # [{ id, title, authors, abstract, categories, arxivUrl, tags, reasoning }, ...]
```

### 4. Deploy

```bash
# Build the frontend
cd frontend && npm run build

# Sync everything to S3
aws s3 sync frontend/dist/ s3://wloga-bucket/ --delete
aws s3 sync output/data/ s3://wloga-bucket/data/
```

The Vite app fetches `/data/index.json` at runtime to discover
available dates, then fetches individual day files on demand.

## Frontend

Vite + vanilla JS. The SPA:

- Loads `index.json` to get the list of available dates.
- Defaults to showing today's papers.
- Lets the user browse by date.
- Displays each paper's title, authors, abstract, categories, and a
  link to the arXiv page.
- No user accounts, no voting, no comments.

Hosted as static files on S3 behind CloudFront. Domain `wloga.xyz` pointed at the bucket/distribution.

## Cron Job

A single daily cron entry runs the pipeline end to end:

```bash
0 8 * * * cd /path/to/wloga && python pipeline/pipeline.py fetch evaluate package deploy
```

Each stage is independently idempotent, so the whole pipeline can be
safely re-run on failure.

## Directory Structure

```
wloga/
  CLAUDE.md
  prompts/
    evaluate.txt           # LLM prompt template
  pipeline/
    fetch.py               # arXiv RSS → per-paper metadata.json
    evaluate.py            # metadata.json → evaluation.json via LLM
    package.py             # collect accessible papers → daily JSON
    deploy.py              # sync to S3
    pipeline.py            # orchestrates all stages
  frontend/
    index.html
    src/
      main.js
      ...
    vite.config.js
    package.json
  data/                    # local working directory (not committed)
    2503/
      2503.04127/
        metadata.json
        evaluation.json
  output/                  # packaged JSON ready for upload
    data/
      index.json
      2503.json
```
