import { fetchWidgetServer } from "@/lib/api";

export interface CodeActivityRow {
  project: string;
  count: number;
  languages: Array<{ language: string; count: number }>;
  lastTouchedIso: string;
  lastFile?: string;
  lastUrl?: string;
  lastSource?: string;
}

export interface CodeActivityData {
  since: string;
  rows: CodeActivityRow[];
  total: number;
  note?: string;
}

export async function CodeActivityWidget({
  days = 3,
  limit = 10,
  workspace,
}: {
  days?: number;
  limit?: number;
  workspace?: string;
}): Promise<React.JSX.Element> {
  let data: CodeActivityData | undefined;
  let error: string | undefined;
  try {
    const params: Record<string, string | number> = { days, limit };
    if (workspace) params.workspace = workspace;
    data = await fetchWidgetServer<CodeActivityData>("code-activity", params);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <section className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <header className="mb-3 flex items-baseline justify-between">
        <h2 className="text-lg font-semibold">Code activity</h2>
        {data && (
          <span className="text-xs text-muted-foreground">
            last {days}d · {data.total} files
          </span>
        )}
      </header>

      {error && (
        <p className="text-sm text-destructive">
          Couldn&apos;t reach the Cortex API: {error}
        </p>
      )}

      {data?.note && data.rows.length === 0 && (
        <p className="text-sm text-muted-foreground">{data.note}</p>
      )}

      {data && data.rows.length > 0 && (
        <ul className="space-y-2">
          {data.rows.map((row) => (
            <li
              key={row.project}
              className="rounded-md border border-border px-3 py-2"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-sm font-medium">
                  {row.project === "_unassigned" ? "Unassigned" : row.project}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {row.count} file{row.count === 1 ? "" : "s"} ·{" "}
                  {formatRelative(row.lastTouchedIso)}
                </span>
              </div>
              {row.languages.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {row.languages.map((l) => (
                    <span
                      key={l.language}
                      className="rounded bg-muted/40 px-1.5 py-0.5 text-[10px] font-medium text-foreground"
                    >
                      {l.language} × {l.count}
                    </span>
                  ))}
                </div>
              )}
              {row.lastFile && (
                <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
                  {row.lastUrl ? (
                    <a
                      className="underline underline-offset-2"
                      href={row.lastUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {row.lastFile}
                    </a>
                  ) : (
                    row.lastFile
                  )}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const diff = Date.now() - then;
  if (diff < 60 * 60 * 1000) {
    const mins = Math.max(1, Math.round(diff / 60_000));
    return `${mins}m ago`;
  }
  if (diff < 24 * 60 * 60 * 1000) {
    return `${Math.round(diff / 3_600_000)}h ago`;
  }
  return `${Math.round(diff / 86_400_000)}d ago`;
}
