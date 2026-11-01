/** The URL of an explorer view (P1, P10). Pure, so the rules are testable without a browser. */
export type UrlView = {
  year: number;
  nodeId: string | null;
  mindre: number;
  advanced: boolean;
  fasta: boolean;
};

/**
 * `nodeHref` is the href of the node when the trees are loaded, `pathname` the current location and
 * `fallback` the balance view's href. Without loaded trees a node view keeps the current path, so
 * flipping a flag on a static drill page never changes which page the URL points at.
 */
export function viewUrl(
  view: UrlView,
  latest: number,
  nodeHref: string | undefined,
  pathname: string,
  fallback: string,
): string {
  const params = new URLSearchParams();
  if (view.year !== latest) params.set('ar', String(view.year));
  let path: string;
  if (view.nodeId) {
    path = nodeHref ?? pathname;
    if (view.mindre > 0) params.set('mindre', String(view.mindre));
  } else {
    path = /\/budget\/(stat\/)?$/.test(pathname) ? pathname : fallback;
  }
  if (view.advanced) {
    params.set('avancerat', '1');
    if (view.fasta) params.set('priser', 'fasta');
  }
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}
