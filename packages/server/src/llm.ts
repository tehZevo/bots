import type { Model } from "@earendil-works/pi-ai";
import { config } from "./config.ts";

export function resolveModel(
  modelId: string | null,
): Model<"openai-completions"> {
  const id = modelId ?? config.llm.modelId;
  return {
    id,
    name: id,
    api: "openai-completions",
    provider: "bots",
    baseUrl: config.llm.baseUrl,
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: config.llm.contextWindow,
    maxTokens: config.llm.maxTokens,
  };
}
