import { describe, expect, it } from "vitest";
import { cortexConfigSchema, expandEnv } from "../src/config.js";

describe("expandEnv", () => {
  it("substitutes process.env matches", () => {
    process.env.TEST_FOO = "bar";
    expect(expandEnv("host: ${TEST_FOO}")).toBe("host: bar");
    delete process.env.TEST_FOO;
  });

  it("throws with a readable list of missing vars", () => {
    delete process.env.NOT_SET_XYZ;
    delete process.env.ALSO_UNSET;
    expect(() => expandEnv("a: ${NOT_SET_XYZ}\nb: ${ALSO_UNSET}")).toThrow(
      /NOT_SET_XYZ, ALSO_UNSET/,
    );
  });

  it("treats empty string as missing", () => {
    process.env.EMPTY_TEST = "";
    expect(() => expandEnv("x: ${EMPTY_TEST}")).toThrow(/EMPTY_TEST/);
    delete process.env.EMPTY_TEST;
  });
});

describe("cortexConfigSchema", () => {
  it("accepts a minimal valid config", () => {
    const parsed = cortexConfigSchema.parse({
      llm: {
        providers: {
          ollama: {
            package: "@cortex/provider-ollama",
            enabled: true,
            config: { host: "http://localhost:11434" },
          },
        },
        tasks: {
          default: { provider: "ollama", model: "qwen3:14b" },
        },
        fallbackChain: [],
      },
      adapters: {},
    });
    expect(parsed.llm.providers.ollama?.enabled).toBe(true);
  });

  it("rejects configs without a default task", () => {
    expect(() =>
      cortexConfigSchema.parse({
        llm: {
          providers: {},
          tasks: {
            structural: { provider: "ollama", model: "qwen3:14b" },
          },
        },
        adapters: {},
      }),
    ).toThrow(/default/);
  });
});
