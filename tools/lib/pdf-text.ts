/**
 * Normalisation and page joining for text extracted from a manifesto PDF (see
 * docs/manifesto-extraction.md, "Extracting the page text"). Kept free of I/O so it is testable
 * offline: the extraction CLI hands it the raw per-page strings from pypdf.
 */

/** Characters that start a bullet item when they stand alone between words. */
const BULLET = /\s*[•●▪◦▶►■]\s+/gu;

/**
 * One page of raw extractor output to clean text: NFKC (fl/fi ligatures, non-breaking spaces),
 * all whitespace collapsed (some PDFs come out with one word per line), and each bullet moved to
 * the start of its own line. Soft hyphens are kept; the validator decides how to read them.
 */
export function normalizePageText(raw: string): string {
  const flat = raw.normalize('NFKC').replace(/\s+/g, ' ').trim();
  return flat.replace(BULLET, '\n• ').trim();
}

/**
 * Per-page text joined with form feeds, so page N of the PDF is the Nth piece (matching what
 * `pdftotext` writes and what the validator's `--pages-text` reads). Every page, including blank
 * ones, keeps its slot; the output ends with a form feed like pdftotext's.
 */
export function joinPages(rawPages: string[]): string {
  return rawPages.map(normalizePageText).join('\f') + '\f';
}
