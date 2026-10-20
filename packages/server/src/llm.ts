import type { Model } from "@earendil-works/pi-ai";
import type { ProviderRow } from "./db.ts";
import { getProvider, getSetting } from "./db.ts";

export interface ResolvedLlm {
  model: Model<"openai-completions">;
  apiKey: string;
}

export function resolveDefault(
  modelOverride?: string | null,
): ResolvedLlm | null {
  const providerId = getSetting("default_provider_id");
  if (!providerId) return null;
  const provider = getProvider(providerId);
  if (!provider) return null;
  const modelId = modelOverride ?? getSetting("default_model");
  if (!modelId) return null;
  return { model: toModel(provider, modelId), apiKey: provider.api_key };
}

function toModel(
  provider: ProviderRow,
  modelId: string,
): Model<"openai-completions"> {
  return {
    id: modelId,
    name: modelId,
    api: "openai-completions",
    provider: "bots",
    baseUrl: provider.base_url,
    reasoning: true,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: Number(process.env.LLM_CONTEXT_WINDOW ?? 64000),
    maxTokens: Number(process.env.LLM_MAX_TOKENS ?? 4096),
  };
}
