import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Promise } from "@/data/index";

export default function PromiseCard({ promise }: { promise: Promise }) {
  return (
    <Card className="p-4 mb-4">
      <CardHeader className="flex flex-col max-md:pb-2 md:items-center md:justify-between md:flex-row">
        <CardTitle className="pb-2 md:pb-0">{promise.name}</CardTitle>
        <div className="flex flex-col items-start md:flex-row md:items-end">
          <div className="bg-muted px-2 py-1 mb-2 rounded-md md:mr-2 md:mb-0">
            Pågående
          </div>
          <div className="bg-muted px-2 py-1 rounded-md">{promise.party}</div>
        </div>
      </CardHeader>
      <CardContent>
        <span className="text-muted-foreground">{promise.description}</span>
      </CardContent>
      <CardFooter>
        {promise.tags.map((tag, index) => (
          <Badge key={index} variant="outline">
            {tag}
          </Badge>
        ))}
      </CardFooter>
    </Card>
  );
}
