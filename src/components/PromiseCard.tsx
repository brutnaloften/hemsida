import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { Promise } from '@/data/index';
import { buttonVariants } from './ui/button';
import { VERDICT_LABELS, type RiksdagEvidence } from '@/schema/promise';
import { sourceLinks } from '@/lib/source-link';
import { promisePath } from '@/lib/timeline';
import { EVIDENCE_KIND_LABELS, TYPE_LABELS, VERDICT_STYLES, partyName } from '@/lib/promise-labels';

export default function PromiseCard({ promise }: { promise: Promise }) {
  const { verdict } = promise;
  // Riksdag documents only: an agreement entry is not a pipeline stage. ISO dates sort lexicographically.
  const latest: RiksdagEvidence | undefined = promise.evidence
    .filter((e): e is RiksdagEvidence => e.kind !== 'agreement')
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  const links = sourceLinks({
    url: promise.sourceUrl,
    archive: promise.sourceArchive,
    urlDeadAsOf: promise.sourceUrlDeadAsOf,
  });
  return (
    <Card className="p-4 mb-4">
      <CardHeader className="flex flex-col max-md:pb-2 md:items-center md:justify-between md:flex-row">
        <CardTitle className="pb-2 md:pb-0">
          <a href={promisePath(promise.id)} className="hover:underline underline-offset-2">
            {promise.title}
          </a>
        </CardTitle>
        <div className="flex flex-wrap items-start gap-2 md:items-end md:justify-end">
          <Badge
            variant="outline"
            className={VERDICT_STYLES[verdict.value]}
            data-verdict={verdict.value}
          >
            {VERDICT_LABELS[verdict.value]}
          </Badge>
          {promise.parties.map((party) => (
            <Badge key={party} variant="secondary">
              {partyName(party)}
            </Badge>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        <span className="text-muted-foreground">{promise.description}</span>
        {verdict.reasoning.trim() !== '' && (
          <p className="mt-3 text-sm">
            <span className="font-medium">Motivering:</span> {verdict.reasoning}
          </p>
        )}
        <p className="mt-3 text-sm text-muted-foreground">
          {latest ? (
            <>
              Senaste dokument ({latest.date}):{' '}
              <a
                href={latest.url}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2"
              >
                {EVIDENCE_KIND_LABELS[latest.kind]} {latest.designation}
              </a>{' '}
              &ndash; {latest.title}
            </>
          ) : (
            'Inga riksdagsdokument kopplade till löftet ännu.'
          )}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {links.original && (
            <a
              href={links.original}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              Källa
            </a>
          )}
          <a
            href={links.archive}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonVariants({ variant: 'default', size: 'sm' })}
          >
            Arkiv
          </a>
        </div>
      </CardContent>
      <CardFooter className="flex flex-wrap gap-2">
        <Badge variant="outline">{TYPE_LABELS[promise.type]}</Badge>
        <Badge variant="outline">{promise.area}</Badge>
        {promise.committee && <Badge variant="outline">Utskott: {promise.committee}</Badge>}
      </CardFooter>
    </Card>
  );
}
