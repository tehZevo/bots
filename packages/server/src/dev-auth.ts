import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  getUserByEmail,
  hashPassword,
  insertApiKey,
  insertUser,
  listAllApiKeys,
} from "./db.ts";

export const DEV_SEED_EMAIL = "dev@example.com";
export const DEV_SEED_PASSWORD = "devpassword";
export const DEV_SEED_KEY_NAME = "dev";

export interface DevSeedResult {
  userCreated: boolean;
  apiKey: string | null;
}

function flagEnabled(value: string | undefined): boolean {
  return value === "1" || value?.toLowerCase() === "true";
}

export function seedDevCredentials(
  env: NodeJS.ProcessEnv = process.env,
): DevSeedResult | null {
  if (!flagEnabled(env.DEV_SEED_AUTH)) return null;

  let user = getUserByEmail(DEV_SEED_EMAIL);
  const userCreated = !user;
  if (!user) {
    insertUser({
      id: randomUUID(),
      email: DEV_SEED_EMAIL,
      password_hash: hashPassword(DEV_SEED_PASSWORD),
      created_at: Date.now(),
    });
    user = getUserByEmail(DEV_SEED_EMAIL);
    if (!user) throw new Error("failed to seed dev account");
  }

  const existingKey = listAllApiKeys().some(
    (key) => key.name === DEV_SEED_KEY_NAME,
  );
  if (existingKey) return { userCreated, apiKey: null };

  const apiKey = `bots_${randomBytes(20).toString("hex")}`;
  insertApiKey({
    id: randomUUID(),
    name: DEV_SEED_KEY_NAME,
    hash: createHash("sha256").update(apiKey).digest("hex"),
    user_id: user.id,
    created_at: Date.now(),
  });

  return { userCreated, apiKey };
}
