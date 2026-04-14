# AI Pipeline for Automated Promise Tracking

## Overview

Automated pipeline that crawls Swedish news and political sources to discover, extract, and track political promises — then creates PRs for human review.

## Architecture

```
┌─────────────────┐
│    Discovery    │
│  (AI + search)  │
└────────┬────────┘
         │
         ▼
┌──────────────────┐
│    Extraction    │
│ (AI, per article)│
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│    Matching      │
│      (AI)        │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Status Evaluation│
│(AI, per promise) │
└────────┬─────────┘
         │
         ▼
┌─────────────────┐
│   PR Creation    │
│     (code)       │
└─────────────────┘
```

## Pipeline Steps

### 1. Discovery

- Broad web search for recent Swedish political news
- Sources: SVT, DN, SvD, Riksdag records, party websites
- Output: list of relevant URLs + snippets
- Runs with small context — just search queries and results

### 2. Extraction

- Runs **per article**, not per promise
- Takes one article, outputs structured data:
  - Who promised what
  - When
  - Source URL
  - Direct quotes if available
- Strict JSON schema validation on output

### 3. Matching

- AI step, but operates only on **already-validated structured data**
- Compares extracted promises against existing promise YAML files in the repo
- Handles rephrasing, indirect references, split/combined promises
- Output: "new promise" or "update to existing promise X"
- No raw web content at this stage — prompt injection surface is minimal

### 4. Status Evaluation

- Runs only for promises where new evidence was found
- Takes one existing promise + new evidence
- Evaluates if status changed (kept, broken, in progress, unclear)
- Requires **2+ independent sources** before changing status

### 5. PR Generation

- Pure code, no AI
- Writes/updates YAML files
- Creates GitHub PR with:
  - Summary of changes
  - Source links for each change
  - Confidence levels

## Implementation

- **Orchestration:** GitHub Actions (manual trigger, with optional scheduled cron)
- **AI calls:** Python scripts using the `anthropic` SDK (Claude API)
- **Each pipeline step** is a separate script (~50-100 lines)
- **Data format:** YAML files, one per promise

### Example data structure

```
data/
└── promises/
    ├── s-2022-hojd-minimilon.yml
    ├── m-2022-sanka-skatter.yml
    └── ...
```

### Example GitHub Actions workflow

```yaml
name: Update Promises
on:
  workflow_dispatch: # Manual trigger
  # schedule:
  #   - cron: '0 6 * * 1'  # Weekly on Mondays at 06:00

jobs:
  discover:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: python scripts/discover.py > discoveries.json
      - uses: actions/upload-artifact@v4
        with:
          name: discoveries
          path: discoveries.json

  extract:
    needs: discover
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/download-artifact@v4
      - run: python scripts/extract.py discoveries.json > extracted.json
      - uses: actions/upload-artifact@v4
        with:
          name: extracted
          path: extracted.json

  evaluate-and-pr:
    needs: extract
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/download-artifact@v4
      - run: python scripts/match.py extracted.json
      - run: python scripts/evaluate.py updates.json
      - run: python scripts/create_pr.py
```

## Prompt Injection Defenses

Web content is untrusted. Multiple layers of defense:

1. **Progressive sanitization** — each pipeline step strips away more raw content and passes only schema-validated structured data forward. By the matching step, no raw web content remains.
2. **Strict schema validation** — every AI step outputs JSON/YAML against rigid schemas; malformed output is rejected
3. **Separate readers from writers** — extraction only extracts facts, later steps only see structured data
4. **Sanitize input** — strip HTML, extract article text only, remove comment sections, truncate
5. **Corroboration** — require 2+ independent sources before changing promise status
6. **Anomaly detection** — flag runs that try to change too many promises at once, or flip statuses back and forth
7. **Human review** — every change goes through a PR with source links and diffs
8. **Prompt design** — untrusted content wrapped in clear delimiters with explicit instructions to ignore embedded instructions

## Future Considerations

- Rotate focus across parties/topics on different days
- Prioritize promises nearing deadlines
- Add more sources over time
- If pipeline grows complex, consider migrating orchestration to n8n
- Community can still submit PRs alongside the AI pipeline
