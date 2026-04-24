import { ProvidersList } from "./providers-list";

export const dynamic = "force-dynamic";

export default function ProvidersPage(): React.JSX.Element {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">LLM Providers</h1>
        <p className="text-sm text-muted-foreground">
          Pick which provider handles each task. OpenRouter is BYOK cloud;
          Ollama is local and needs a GPU (or Docker Desktop reaching a host
          Ollama via <code className="font-mono text-xs">host.docker.internal</code>).
        </p>
      </div>
      <ProvidersList />
    </div>
  );
}
