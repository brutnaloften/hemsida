import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Promise } from "@/data/index";
import { buttonVariants } from "./ui/button";

export default function PromiseCard({ promise }: { promise: Promise }) {
  return (
    <Card className="p-4 mb-4">
      <CardHeader className="flex flex-col max-md:pb-2 md:items-center md:justify-between md:flex-row">
        <CardTitle className="pb-2 md:pb-0">{promise.name}</CardTitle>
        <div className="flex flex-col items-start md:flex-row md:items-end">
          <Badge variant="secondary" className="mb-2 md:mr-2 md:mb-0">
            {promise.status}
          </Badge>
          <Badge variant="secondary">{promise.party}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <span className="text-muted-foreground">{promise.description}</span>
        {promise.sources.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {promise.sources.map((source, i) => (
              <div key={i} className="flex items-center gap-1">
                <a
                  href={source.broken ? source.archive : source.value}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  Källa
                </a>
              </div>
            ))}
          </div>
        )}
      </CardContent>
      <CardFooter>
        {promise.tags.map((tag) => (
          <Badge key={tag} variant="outline">
            {tag}
          </Badge>
        ))}
      </CardFooter>
    </Card>
  );
}
