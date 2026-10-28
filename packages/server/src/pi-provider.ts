import type {
  AssistantMessageEventStream,
  Model,
  SimpleStreamOptions,
  TranscriptContext,
} from "@earendil-works/pi-ai";
import {
  stream as openAiStream,
  streamSimple as openAiStreamSimple,
} from "@earendil-works/pi-ai/api/openai-completions";
import type { MutableModels, Provider } from "@earendil-works/pi-ai/models";
import {
  getProvider,
  getSetting,
  listBots,
  listProviders,
  type ProviderRow,
} from "./db.ts";
import { toOpenAiModel } from "./llm.ts";

export const BOTS_PROVIDER_ID = "bots";

function configuredDefaultProvider(): ProviderRow | undefined {
  const providerId = getSetting("default_provider_id");
  return providerId ? getProvider(providerId) : undefined;
}

function providerForModel(modelId: string): ProviderRow | undefined {
  const providers = listProviders();
  if (providers.length === 0) return undefined;
  return (
    providers.find((provider) => provider.models.includes(modelId)) ??
    configuredDefaultProvider() ??
    providers[0]
  );
}

function addModel(
  catalog: Model<"openai-completions">[],
  seen: Set<string>,
  provider: ProviderRow,
  modelId: string,
): void {
  if (seen.has(modelId)) return;
  seen.add(modelId);
  catalog.push(toOpenAiModel(provider, modelId));
}

export function botsModelCatalog(): readonly Model<"openai-completions">[] {
  const providers = listProviders();
  const catalog: Model<"openai-completions">[] = [];
  const seen = new Set<string>();
  for (const provider of providers) {
    for (const modelId of provider.models)
      addModel(catalog, seen, provider, modelId);
  }

  const defaultProvider = configuredDefaultProvider();
  const defaultModel = getSetting("default_model");
  if (defaultProvider && defaultModel) {
    addModel(catalog, seen, defaultProvider, defaultModel);
  }

  for (const bot of listBots()) {
    if (!bot.model_id) continue;
    const provider = providerForModel(bot.model_id);
    if (provider) addModel(catalog, seen, provider, bot.model_id);
  }
  return catalog;
}

function resolveStreamedModel(modelId: string): {
  model: Model<"openai-completions">;
  apiKey: string;
} | null {
  const provider = providerForModel(modelId);
  if (!provider) return null;
  return { model: toOpenAiModel(provider, modelId), apiKey: provider.api_key };
}

export function registerBotsProvider(models: MutableModels): void {
  const provider = {
    id: BOTS_PROVIDER_ID,
    name: "Bots",
    auth: {
      apiKey: {
        name: "Configured providers",
        check: async () => {
          return listProviders().length > 0 ? { type: "api_key" } : undefined;
        },
        resolve: async () => {
          const provider =
            configuredDefaultProvider() ??
            listProviders().find((row) => row.api_key.trim()) ??
            listProviders()[0];
          if (!provider) return undefined;
          return {
            auth: { apiKey: provider.api_key },
            source: `bots:${provider.id}`,
          };
        },
      },
    },
    getModels() {
      return botsModelCatalog();
    },
    stream(
      model: Model<"openai-completions">,
      context: TranscriptContext,
      options?: Record<string, unknown>,
    ): AssistantMessageEventStream {
      const resolved = resolveStreamedModel(model.id);
      if (!resolved)
        throw new Error(`no configured provider for model ${model.id}`);
      return openAiStream(resolved.model as never, context, {
        ...options,
        apiKey: resolved.apiKey,
        maxRetries: 0,
      } as never);
    },
    streamSimple(
      model: Model<"openai-completions">,
      context: TranscriptContext,
      options?: SimpleStreamOptions,
    ): AssistantMessageEventStream {
      const resolved = resolveStreamedModel(model.id);
      if (!resolved)
        throw new Error(`no configured provider for model ${model.id}`);
      return openAiStreamSimple(resolved.model as never, context, {
        ...options,
        apiKey: resolved.apiKey,
        maxRetries: 0,
      } as never);
    },
  };

  models.setProvider(provider as unknown as Provider);
}
