import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LLMError } from "@cortex/llm-core";
import { OllamaProvider, ollamaConfigSchema } from "../src/provider.js";

const baseCfg = ollamaConfigSchema.parse({
  host: "http://fake.local:11434",
  defaultModel: "qwen3:14b",
});

describe("OllamaProvider", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("posts to /api/generate and parses the response", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          model: "qwen3:14b",
          response: "hello world",
          done: true,
          prompt_eval_count: 10,
          eval_count: 2,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const provider = new OllamaProvider(baseCfg);
    const res = await provider.complete({
      model: "qwen3:14b",
      messages: [
        { role: "system", content: "be brief" },
        { role: "user", content: "say hi" },
      ],
    });

    expect(res.content).toBe("hello world");
    expect(res.provider).toBe("ollama");
    expect(res.usage).toEqual({ prompt: 10, completion: 2, total: 12 });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(String(url)).toBe("http://fake.local:11434/api/generate");
    expect(init?.method).toBe("POST");
    const body = JSON.parse(String(init?.body));
    expect(body.model).toBe("qwen3:14b");
    expect(body.system).toBe("be brief");
    expect(body.prompt).toContain("say hi");
    expect(body.stream).toBe(false);
  });

  it("maps non-2xx responses to LLMError.invalid_request / provider_error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("boom", { status: 500, statusText: "Server Error" }),
    );
    const provider = new OllamaProvider(baseCfg);
    await expect(
      provider.complete({
        model: "qwen3:14b",
        messages: [{ role: "user", content: "hi" }],
      }),
    ).rejects.toMatchObject({
      name: "LLMError",
      kind: "provider_error",
    });
  });

  it("maps unreachable host to LLMError.unreachable", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(
      Object.assign(new Error("ECONNREFUSED"), { name: "TypeError" }),
    );
    const provider = new OllamaProvider(baseCfg);
    await expect(
      provider.complete({
        model: "qwen3:14b",
        messages: [{ role: "user", content: "hi" }],
      }),
    ).rejects.toSatisfy((e) => e instanceof LLMError && e.kind === "unreachable");
  });

  it("listModels returns names from /api/tags", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          models: [{ name: "qwen3:14b" }, { name: "llama3:8b" }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const provider = new OllamaProvider(baseCfg);
    await expect(provider.listModels()).resolves.toEqual([
      "qwen3:14b",
      "llama3:8b",
    ]);
  });

  it("healthCheck succeeds when tags responds and reports hasDefault", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ models: [{ name: "qwen3:14b" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const provider = new OllamaProvider(baseCfg);
    const health = await provider.healthCheck();
    expect(health.healthy).toBe(true);
    expect(health.details?.hasDefault).toBe(true);
  });

  it("healthCheck fails when tags errors", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("nope", { status: 500 }),
    );
    const provider = new OllamaProvider(baseCfg);
    const health = await provider.healthCheck();
    expect(health.healthy).toBe(false);
    expect(health.message).toMatch(/HTTP 500/);
  });
});
