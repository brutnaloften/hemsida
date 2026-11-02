# Jev spike: exhaustive promise × document scoring

Bead: `hemsida-4np.12` (child of the Riksdag epic `hemsida-4np`). Status: research spike, nothing built yet. This document records what we learned before starting, so the spike begins from facts and not from memory.

## Goal

Find out whether Jev can score every promise against every Riksdag document cheaply enough to replace keyword retrieval as the first pass, with an LLM (Haiku or Sonnet) judging only the top-scoring pairs.

## What Jev is

TypeSafe AI's first "System One Model", in early access. It does not generate text. Given a text state and typed questions (choice, score, yes/no) it returns calibrated probabilities. Sources: the [launch post](https://typesafe.ai/blog/introducing-system-one-models-and-jev) and a third-party [limits page](https://opentweet.io/jev/limits) (read 2026-11-02, dated 18 Sept 2026; verify against TypeSafe's own docs).

- Price: $0.042 per million input tokens, output free and unmetered.
- Latency: 70–500 ms per call.
- Context: 64k tokens per request in total (state plus every question); state plus the longest question at most 32k.
- Choice questions: up to 255 options. Score questions: 2–10 levels. Questions per request: undocumented, only the 64k budget constrains it.
- Rate limits (account-wide, adjustable): 1,200 requests/min, 250k input tokens/s (15M/min). The two caps cross at 12,500 input tokens per request.
- Text only. Default SDK timeout 10 s.
- **Not stated anywhere:** Swedish support, endpoint or SDK details, batch API, whether state is billed once or per question.

## Alternatives considered

- **Laya** ([post](https://flowtivity.ai/blog/laya-open-source-jev-alternative/)): open source (Apache 2.0), self-hosted. The multilingual checkpoint (322M parameters, 100+ languages, 1024-token context) is the only Swedish candidate, but Swedish is not named. Zero-shot accuracy is reported below the majority-class baseline, so it needs fine-tuning. It needs a GPU (49 s median per prediction on 4 vCPU). Weak past about 20 options. Not pursued here.
- **Swedish encoders (KB-BERT, KBLab sentence-BERT):** a distilled student classifier is a poor main classifier for "does this bet fulfil this promise, partly or not". It is capped by its teacher and noisy on "partial", and cost is not the bottleneck. A Swedish sentence embedding model is a better fit for _retrieval_ than for classification.
- **Fine-tune a small model on Sonnet labels:** valid fallback, only if the measured Haiku/Sonnet bill or error rate is a problem.

## Current pipeline and its weaknesses

Facts from the repo as of 2026-11-02.

- 274 Tidö promises, each with up to 5 Swedish `keywords` and a `committee`. The 1,190 `val2022-*` manifesto promises are not searched; they inherit matches through links to Tidö promises.
- Local store `tools/out/riksdag-store/2022-2026.json`: 3,547 documents (1,470 bet, 952 prop, 557 dir, 442 sou, 126 ds), metadata plus a `text` snippet (subtitle, summary, notice) capped at 1,500 characters, about 610 characters on average. This is not the document body.
- `match-riksdag-candidates.ts` does a local substring match of keywords over title and snippet and keeps the top 15 per promise. 272 candidate files hold 4,080 pairs; every file is at the cap of 15, so the cap is binding.
- Nothing is quadratic: the LLM matcher (`hemsida-4np.5`) sees about 4,080 pairs, roughly 0.4% of the full cross product (274 × 3,547 ≈ 972k pairs).

Known recall losses: vocabulary mismatch between promise keywords and Riksdag wording; broad budget documents crowding out narrow ones; snippet-only text (`hemsida-4np.11`: no stored document mentions "visitationszon", so the Säkerhetszoner proposition is missed locally); negative promises ("don't do X", "repeal Y"). **Nothing measures what is missed:** the 50 eval pairs (`hemsida-4np.4`) only cover pairs that were already candidates.

## Proposed request shape

One request per Riksdag document:

- **State:** the document text.
- **Questions:** one yes/no per promise, 274 per request.
- **Optional:** two passes per document, 137 promises each, to stay near the 12.5k-token crossover and to leave headroom.

Estimates (unmeasured; the promise `description` field was not counted, assume about 3 characters per token for Swedish):

| Quantity                          | Estimate                                                   |
| --------------------------------- | ---------------------------------------------------------- |
| All 274 promises as questions     | about 25k tokens                                           |
| One snippet-only document         | about 200 tokens                                           |
| One pass over snippet-only corpus | about 700k tokens, about $0.03                             |
| 3,547 requests × 25k tokens       | about 89M tokens, about $3.70, about 6 min (token-bound)   |
| Full cross product as 972k pairs  | about 290M tokens, about $12; too slow serially (19–135 h) |

The per-document layout needs only 3,547 requests, which fits the 1,200 requests/min cap in minutes.

## Missing input: full Riksdag text

The stored snippets are too thin; they are also the reason for the recall problem in `hemsida-4np.11`. Full text is available:

- Per document: `https://data.riksdagen.se/dokument/{dok_id}.html` (also `.xml`, `.text`; `.text` is XML in practice). One request per document at 1 request/s is about 1 hour for 3,547 documents.
- Bulk dumps per type and period, for example `https://data.riksdagen.se/dataset/dokument/bet-2022-2025.json.zip` (`bet` about 90 MB). See `docs/riksdag-api.md` ("Bulk dumps").

Constraints:

- A betänkande can be about 1 MB of XML. Jev's state limit is 32k tokens, so long documents must be truncated or chunked (for example per section or per "förslag till riksdagsbeslut"), with the chunk scores aggregated per document by max.
- Keep the full text out of git (gitignored under `tools/out/`, like the existing store). Only derived, reviewable output (candidate files, evidence) gets committed.
- Prefer dumps over 3,547 requests if the files are per period; verify the file names on the Riksdag open data page first.

## Spike plan

1. Fetch full text for the 2022–2026 documents into a new gitignored store (extend `tools/lib/riksdag-ingest.ts` or add a sibling tool), with HTML stripped and sections kept.
2. Label the 50 eval pairs (`node --experimental-strip-types tools/label-eval-set.ts`, see `docs/eval-set.md`). This is a prerequisite for any quality statement.
3. Smoke test the API with one document and a few hundred promise questions: does it accept that many, what does it bill, how long does it take, what is the Swedish quality on obvious cases.
4. Score the 50 labelled pairs with Jev, Haiku and Sonnet. Report agreement with the human labels and cost.
5. Run the exhaustive pass on the full store. Measure recall against the keyword candidates: how many of Jev's top-scoring pairs per promise (and how many judged `match` or `partial` by Haiku) are missing from the 15-per-promise keyword files.
6. Report: cost, time, precision at the top-k, recall gain over keywords, and a recommendation (adopt as first pass, use as a pre-filter, or drop). If adopted, file follow-up beads for the real tool, a provider-agnostic scorer interface next to `tools/lib/claude.ts`, and the weekly job.

## Risks and open questions

- Swedish quality of Jev is untested and is the main risk.
- The questions-per-request cap and billing of repeated state are undocumented.
- The limits page is third-party and may be stale; rate limits "may change without notice".
- Precision: a cheap model scoring about a million pairs yields many false positives unless its probabilities are well calibrated on this task.
- Sending promise and document text to an early-access third-party API: both are public data, so acceptable here; reconsider before sending anything non-public.
- Other sources (government actions outside the Riksdag, `hemsida-l8h`) need their own retrieval step; a shared scorer interface would let them reuse the same approach.
