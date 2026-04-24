import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Construction } from "lucide-react";

/**
 * Standard "this route exists but isn't built yet" page. Gives the
 * sidebar navigation a destination for every route so nothing looks
 * broken while the settings/logs/MCP/status pages are being built out.
 */
export function PlaceholderPage({
  title,
  description,
  hint,
}: {
  title: string;
  description: string;
  hint?: string;
}): React.JSX.Element {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      </div>
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
              <Construction className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <CardTitle className="text-base">Under construction</CardTitle>
              <CardDescription>{description}</CardDescription>
            </div>
          </div>
        </CardHeader>
        {hint && (
          <CardContent>
            <p className="text-sm text-muted-foreground">{hint}</p>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
