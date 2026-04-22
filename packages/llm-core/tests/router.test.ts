import { describe, expect, it, vi } from "vitest";
import { LLMError } from "../src/types.js";
import { LLMRouter } from "../src/router.js";
import type { LLMProvider } from "../src/provider.js";

function makeProvider(
  id: string,
  impl: (model: string) => Promise<string> | string,
): LLMProvider {
  return {
    id,
    name: id,
    version: "0.0.0",
    configSchema: { parse: (x: unknown) => x } as never,
    requiredSecrets: [],
    init: vi.fn(async () => undefined),
    healthCheck: vi.fn(async () => ({ healthy: true, message: "" })),
    shutdown: vi.fn(async () => undefined),
    complete: vi.fn(async (req) => {
      const content = await impl(req.model);
      return {
        content,
        model: req.model,
        provider: id,
        latencyMs: 1,
      };
    }),
  };
}

describe("LLMRouter", () => {
  it("routes tasks to their configured provider", async () => {
    const ollama = makeProvider("ollama", () => "from-ollama");
    const router = new LLMRouter({
      providers: { ollama },
      tasks: {
        default: { provider: "ollama", model: "qwen3:14b" },
        structural: { provider: "ollama", model: "qwen3:14b" },
      },
      fallbackChain: [],
    });

    const res = await router.complete({
      task: "structural",
      messages: [{ role: "user", content: "hi" }],
    });
    expect(res.content).toBe("from-ollama");
    expect(res.provider).toBe("ollama");
  });

  it("falls back to the next provider on retryable error", async () => {
    const ollama = makeProvider("ollama", () => {
      throw new LLMError("down", "unreachable", "ollama");
    });
    const openrouter = makeProvider("openrouter", () => "from-openrouter");
    const router = new LLMRouter({
      providers: { ollama, openrouter },
      tasks: {
        default: { provider: "ollama", model: "qwen3:14b" },
        synthesis: {
          provider: "openrouter",
          model: "anthropic/claude-haiku-4.5",
        },
      },
      fallbackChain: ["openrouter"],
    });

    const res = await router.complete({
      task: "default",
      messages: [{ role: "user", content: "hi" }],
    });
    expect(res.provider).toBe("openrouter");
    // Fallback should pick the openrouter task binding's model.
    expect(res.model).toBe("anthropic/claude-haiku-4.5");
  });

  it("rethrows non-retryable errors immediately without fallback", async () => {
    const ollama = makeProvider("ollama", () => {
      throw new LLMError("bad key", "auth", "ollama");
    });
    const openrouter = makeProvider("openrouter", () => "never");
    const openrouterSpy = openrouter.complete as ReturnType<typeof vi.fn>;
    const router = new LLMRouter({
      providers: { ollama, openrouter },
      tasks: {
        default: { provider: "ollama", model: "qwen3:14b" },
      },
      fallbackChain: ["openrouter"],
    });

    await expect(
      router.complete({
        task: "default",
        messages: [{ role: "user", content: "hi" }],
      }),
    ).rejects.toSatisfy((e) => e instanceof LLMError && e.kind === "auth");
    expect(openrouterSpy).not.toHaveBeenCalled();
  });

  it("rejects config that references an unknown provider", () => {
    const ollama = makeProvider("ollama", () => "x");
    expect(
      () =>
        new LLMRouter({
          providers: { ollama },
          tasks: {
            default: { provider: "ollama", model: "qwen3:14b" },
            structural: { provider: "missing", model: "x" },
          },
          fallbackChain: [],
        }),
    ).toThrow(/unknown provider 'missing'/);
  });
});
