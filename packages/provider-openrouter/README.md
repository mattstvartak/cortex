# @cortex/provider-openrouter

BYOK cloud LLM provider via OpenRouter. One API key, dozens of models.

Config:

```yaml
llm:
  providers:
    openrouter:
      package: "@cortex/provider-openrouter"
      enabled: true
      config:
        baseUrl: "https://openrouter.ai/api/v1"   # optional
        referer: "https://github.com/mattstvartak/cortex"
        appTitle: "Cortex"
```

Required secrets: `OPENROUTER_API_KEY`.

Model id examples: `anthropic/claude-haiku-4.5`, `google/gemini-flash-1.5`,
`openai/gpt-4o-mini`.
