/** Which links to show for a source: the original only while it is alive, the archive copy always. */
export interface SourceLinks {
  original: string | undefined;
  archive: string;
}

export function sourceLinks(source: {
  url: string;
  archive: string;
  urlDeadAsOf?: string | undefined;
}): SourceLinks {
  return {
    original: source.urlDeadAsOf ? undefined : source.url,
    archive: source.archive,
  };
}
