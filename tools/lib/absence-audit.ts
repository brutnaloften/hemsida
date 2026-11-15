/**
 * Pure helpers for tools/audit-absence-claims.ts: choose the passages of the cited documents that
 * best match the topic of an absence claim.
 */
export interface Passage {
  designation: string;
  text: string;
  score: number;
}

/** Search stems from the model: lower-cased, trimmed, at least three characters. */
export function cleanStems(stems: readonly string[]): string[] {
  return stems.map((s) => s.toLowerCase().trim()).filter((s) => s.length >= 3);
}

/**
 * The best passages across the documents: a paragraph scores one point per distinct stem it
 * contains; each document contributes at most `perDoc` paragraphs and the result has at most `total`.
 */
export function pickPassages(
  docs: readonly { designation: string; paragraphs: readonly string[] }[],
  stems: readonly string[],
  perDoc = 5,
  total = 12,
): Passage[] {
  const picked: Passage[] = [];
  for (const d of docs) {
    const hits: Passage[] = [];
    for (const text of d.paragraphs) {
      const l = text.toLowerCase();
      const score = stems.filter((s) => l.includes(s)).length;
      if (score > 0) hits.push({ designation: d.designation, text, score });
    }
    hits.sort((a, b) => b.score - a.score);
    picked.push(...hits.slice(0, perDoc));
  }
  return picked.sort((a, b) => b.score - a.score).slice(0, total);
}
