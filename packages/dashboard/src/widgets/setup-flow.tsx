"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { WizardForm } from "./wizard-form";

/**
 * Client-side orchestrator for the dashboard setup flow. Steps:
 *   1. Show current state (workspace? LLM? adapters?)
 *   2. If no LLM configured, offer wizards for ollama / openrouter
 *   3. Adapter catalog: pick from every registered wizard, configure
 *      one at a time
 *   4. Done — link to the main dashboard
 */

interface SetupState {
  workspace: string | null;
  workspacePath: string | null;
  hasLlmProvider: boolean;
  enabledAdapters: string[];
  needsSetup: boolean;
}

interface WizardSummary {
  id: string;
  name: string;
  category: "adapter" | "provider" | "memory" | "toolkit" | "webhook";
  description: string;
}

export function SetupFlow(): React.JSX.Element {
  const [state, setState] = useState<SetupState | undefined>();
  const [wizards, setWizards] = useState<WizardSummary[] | undefined>();
  const [selectedWizard, setSelectedWizard] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();

  async function refresh(): Promise<void> {
    setError(undefined);
    try {
      const [s, w] = await Promise.all([
        fetch("/api/cortex/setup/state", { cache: "no-store" }).then(
          (r) => r.json() as Promise<SetupState>,
        ),
        fetch("/api/cortex/wizards", { cache: "no-store" }).then(
          (r) => r.json() as Promise<{ wizards: WizardSummary[] }>,
        ),
      ]);
      setState(s);
      setWizards(w.wizards);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  if (error) {
    return (
      <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
        Couldn&apos;t reach the Cortex API: {error}. Is{" "}
        <code className="font-mono">cortex start</code> running?
      </p>
    );
  }
  if (!state || !wizards) {
    return <p className="text-sm text-muted-foreground">Loading setup state…</p>;
  }

  if (!state.workspace) {
    return (
      <NoWorkspaceCard />
    );
  }

  const providers = wizards.filter((w) => w.category === "provider");
  const adapters = wizards.filter((w) => w.category === "adapter");
  const activeWizard = selectedWizard
    ? wizards.find((w) => w.id === selectedWizard)
    : undefined;

  return (
    <div className="space-y-6">
      <StateCard state={state} />

      {!state.hasLlmProvider && (
        <section className="rounded-md border border-orange/40 bg-orange/10 p-4">
          <h2 className="text-base font-semibold text-orange">
            Step 1 · Pick an LLM provider
          </h2>
          <p className="mt-1 text-sm text-orange">
            Cortex needs at least one provider enabled before it can
            extract, synthesize, or classify anything. Pick one below.
          </p>
          <WizardPicker
            wizards={providers}
            onPick={(id) => setSelectedWizard(id)}
          />
        </section>
      )}

      <section className="rounded-md border border-border bg-card p-4 shadow-sm">
        <h2 className="text-base font-semibold">
          Step 2 · Enable source adapters
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Cortex ingests from these sources. You can enable more later
          — pick whichever you&apos;re ready to wire up now.
        </p>
        <WizardPicker
          wizards={adapters}
          enabled={new Set(state.enabledAdapters)}
          onPick={(id) => setSelectedWizard(id)}
        />
      </section>

      {activeWizard && (
        <section className="rounded-md border border-gold/30 bg-card p-4 shadow-sm">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-base font-semibold">
              Configure {activeWizard.name}
            </h2>
            <button
              type="button"
              onClick={() => setSelectedWizard(undefined)}
              className="text-xs text-muted-foreground underline hover:text-foreground"
            >
              cancel
            </button>
          </div>
          <WizardForm
            wizardId={activeWizard.id}
            onSuccess={() => {
              setSelectedWizard(undefined);
              void refresh();
            }}
          />
        </section>
      )}

      {state.hasLlmProvider && (
        <DoneCard />
      )}
    </div>
  );
}

function StateCard({ state }: { state: SetupState }): React.JSX.Element {
  return (
    <section className="rounded-md border border-border bg-card p-4 shadow-sm">
      <h2 className="text-base font-semibold">Current state</h2>
      <ul className="mt-2 space-y-1 text-sm">
        <li>
          <Check ok={!!state.workspace} />
          workspace:{" "}
          <span className="font-medium">{state.workspace ?? "(none)"}</span>
        </li>
        <li>
          <Check ok={state.hasLlmProvider} />
          LLM provider configured
        </li>
        <li>
          <Check ok={state.enabledAdapters.length > 0} />
          adapters: {state.enabledAdapters.length === 0
            ? "none yet"
            : state.enabledAdapters.join(", ")}
        </li>
      </ul>
    </section>
  );
}

function Check({ ok }: { ok: boolean }): React.JSX.Element {
  return (
    <span
      className={`mr-2 inline-block h-3 w-3 rounded-full ${
        ok ? "bg-mint" : "bg-muted"
      }`}
      aria-hidden
    />
  );
}

function WizardPicker({
  wizards,
  enabled,
  onPick,
}: {
  wizards: WizardSummary[];
  enabled?: Set<string>;
  onPick: (id: string) => void;
}): React.JSX.Element {
  if (wizards.length === 0) {
    return <p className="mt-2 text-sm text-muted-foreground">None registered.</p>;
  }
  return (
    <ul className="mt-3 grid gap-2 sm:grid-cols-2">
      {wizards.map((w) => {
        const on = enabled?.has(w.id) === true;
        return (
          <li key={w.id}>
            <button
              type="button"
              onClick={() => onPick(w.id)}
              className="flex w-full flex-col gap-1 rounded-md border border-border bg-card px-3 py-2 text-left transition hover:border-gold/50 hover:bg-gold/10"
            >
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-medium">{w.name}</span>
                {on && (
                  <span className="text-[10px] uppercase text-mint">
                    enabled
                  </span>
                )}
              </div>
              <span className="text-xs text-muted-foreground">{w.description}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function NoWorkspaceCard(): React.JSX.Element {
  return (
    <section className="rounded-md border border-orange/40 bg-orange/10 p-4">
      <h2 className="text-base font-semibold text-orange">
        No workspace yet
      </h2>
      <p className="mt-1 text-sm text-orange">
        Cortex needs a workspace to write config into. Create one from
        the terminal — one question, one keystroke:
      </p>
      <pre className="mt-3 overflow-x-auto rounded bg-orange/10 p-2 font-mono text-xs text-orange">
        cortex workspace add main
      </pre>
      <p className="mt-2 text-xs text-orange">
        Then refresh this page.
      </p>
    </section>
  );
}

function DoneCard(): React.JSX.Element {
  return (
    <section className="rounded-md border border-mint/40 bg-mint/10 p-4">
      <h2 className="text-base font-semibold text-mint">
        Ready to go
      </h2>
      <p className="mt-1 text-sm text-mint">
        Core config is in place. Configure more adapters above or finish
        setup and open the dashboard.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Link
          href="/"
          className="inline-flex items-center rounded-md bg-mint px-4 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-mint"
        >
          Finish setup → go to dashboard
        </Link>
        <span className="text-xs text-mint">
          Keep this tab open and come back any time.
        </span>
      </div>
      <p className="mt-3 text-xs text-mint">
        Heads-up: if <code className="font-mono">cortex start</code> was
        already running, restart it so the new providers + adapters load.
      </p>
    </section>
  );
}
