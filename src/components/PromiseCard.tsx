import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Promise } from "@/data/index";
import { buttonVariants } from "./ui/button";
import { VERDICT_LABELS } from "@/schema/promise";

export default function PromiseCard({ promise }: { promise: Promise }) {
  return (
    <Card className="p-4 mb-4">
      <CardHeader className="flex flex-col max-md:pb-2 md:items-center md:justify-between md:flex-row">
        <CardTitle className="pb-2 md:pb-0">{promise.title}</CardTitle>
        <div className="flex flex-col items-start md:flex-row md:items-end">
          <Badge variant="secondary" className="mb-2 md:mr-2 md:mb-0">
            {VERDICT_LABELS[promise.verdict.value]}
          </Badge>
          {promise.parties.map((party) => (
            <Badge key={party} variant="secondary" className="md:ml-2">
              {party}
            </Badge>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        <span className="text-muted-foreground">{promise.description}</span>
        <div className="mt-3 flex flex-wrap gap-2">
          <a
            href={promise.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Källa
          </a>
          <a
            href={promise.sourceArchive}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Arkiv
          </a>
        </div>
      </CardContent>
      <CardFooter>
        <Badge variant="outline">{promise.area}</Badge>
      </CardFooter>
    </Card>
  );
}
