import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

export { repoRoot };
export const dataDir = resolve(
  process.env.DATA_DIR ?? resolve(repoRoot, "data"),
);

export const devFakeLlm = process.env.DEV_FAKE_LLM === "1";

export const config = {
  port: Number(process.env.PORT ?? 8075),
  databasePath: process.env.DATABASE_PATH
    ? resolve(process.env.DATABASE_PATH)
    : resolve(dataDir, "bots.db"),
  compaction: {
    // null = automatic: compact at COMPACTION_RATIO of the model's context window
    tokenThreshold: process.env.COMPACTION_TOKEN_THRESHOLD
      ? Number(process.env.COMPACTION_TOKEN_THRESHOLD)
      : null,
    ratio: Number(process.env.COMPACTION_RATIO ?? 0.75),
    keepRecent: Number(process.env.COMPACTION_KEEP_RECENT ?? 16),
  },
};
