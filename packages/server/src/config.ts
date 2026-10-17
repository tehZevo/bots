import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

export { repoRoot };
export const dataDir = resolve(
  process.env.DATA_DIR ?? resolve(repoRoot, "data"),
);

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var ${name}`);
  return value;
}

export const config = {
  port: Number(process.env.PORT ?? 8787),
  databasePath: process.env.DATABASE_PATH
    ? resolve(process.env.DATABASE_PATH)
    : resolve(dataDir, "bots.db"),
  llm: {
    baseUrl: required("LLM_BASE_URL"),
    apiKey: required("LLM_API_KEY"),
    modelId: required("LLM_MODEL"),
    contextWindow: Number(process.env.LLM_CONTEXT_WINDOW ?? 64000),
    maxTokens: Number(process.env.LLM_MAX_TOKENS ?? 4096),
  },
  compaction: {
    // null = automatic: compact at COMPACTION_RATIO of the model's context window
    tokenThreshold: process.env.COMPACTION_TOKEN_THRESHOLD
      ? Number(process.env.COMPACTION_TOKEN_THRESHOLD)
      : null,
    ratio: Number(process.env.COMPACTION_RATIO ?? 0.75),
    keepRecent: Number(process.env.COMPACTION_KEEP_RECENT ?? 16),
  },
};
