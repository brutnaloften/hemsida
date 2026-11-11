/**
 * Which betänkande decided which proposition. A betänkande's dokumentstatus XML lists the
 * documents it handles as `<referens>` blocks with `referenstyp` `behandlar`; the ones with
 * `ref_dok_typ` `prop` are the propositions it decides. Pure parsing; callers read the files.
 */

/** Proposition dok_ids a betänkande handles (empty for any other document type). */
export function propsHandledBy(xml: string): string[] {
  if (!/<doktyp>bet<\/doktyp>/.test(xml.slice(0, xml.indexOf('</dokument>')))) return [];
  const ids = new Set<string>();
  for (const block of xml.split('<referens>').slice(1)) {
    const body = block.split('</referens>')[0];
    if (!/<referenstyp>behandlar<\/referenstyp>/.test(body)) continue;
    if (!/<ref_dok_typ>prop<\/ref_dok_typ>/.test(body)) continue;
    const id = body.match(/<ref_dok_id>([^<]+)<\/ref_dok_id>/)?.[1];
    if (id) ids.add(id);
  }
  return [...ids];
}

/** Adds a betänkande's propositions to a prop dok_id -> deciding bet dok_ids map. */
export function addDecisions(map: Map<string, string[]>, betId: string, xml: string): void {
  for (const prop of propsHandledBy(xml)) {
    const list = map.get(prop) ?? [];
    if (!list.includes(betId)) list.push(betId);
    map.set(prop, list);
  }
}
