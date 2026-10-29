import { readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { dataDir } from "./config.ts";
import {
  hasSecretMaterial,
  listStoredProviderApiKeys,
  listStoredSecretMaterials,
  listStoredSecretValues,
  setStoredProviderApiKey,
  setStoredSecretMaterialValue,
  setStoredSecretValue,
  VAPID_MATERIAL_NAME,
} from "./db.ts";
import {
  currentEncryptionKey,
  decryptWithKey,
  encryptWithKey,
  isEncrypted,
  previousEncryptionKey,
} from "./encryption.ts";

function materialLabel(name: string): string {
  return name === VAPID_MATERIAL_NAME
    ? "push VAPID key"
    : `encrypted material "${name}"`;
}

export async function migrateLegacyVapidFile(): Promise<void> {
  const current = currentEncryptionKey();
  if (!current || hasSecretMaterial(VAPID_MATERIAL_NAME)) return;

  let raw: string;
  try {
    raw = await readFile(join(dataDir, "vapid.json"), "utf8");
  } catch {
    return;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return;
  }
  if (
    !parsed ||
    typeof parsed !== "object" ||
    !("publicKey" in parsed) ||
    !("privateKey" in parsed)
  ) {
    return;
  }

  setStoredSecretMaterialValue(
    VAPID_MATERIAL_NAME,
    encryptWithKey(raw, current),
  );
  await unlink(join(dataDir, "vapid.json"));
}

export async function prepareSecretStorage(): Promise<void> {
  await migrateLegacyVapidFile();

  const failures: string[] = [];
  const current = currentEncryptionKey();
  const previous = previousEncryptionKey();

  function migrateValue(
    label: string,
    stored: string,
    rewrite: (value: string) => void,
  ): void {
    if (!stored) return;
    if (!isEncrypted(stored)) {
      if (current) rewrite(encryptWithKey(stored, current));
      return;
    }
    if (!current) {
      failures.push(label);
      return;
    }
    try {
      decryptWithKey(stored, current);
      return;
    } catch {
      // Try the rotation key below.
    }
    if (previous) {
      try {
        rewrite(encryptWithKey(decryptWithKey(stored, previous), current));
        return;
      } catch {
        // Both keys failed; report the material label without its value.
      }
    }
    failures.push(label);
  }

  for (const secret of listStoredSecretValues()) {
    migrateValue(`secret "${secret.name}"`, secret.value, (stored) =>
      setStoredSecretValue(secret.id, stored),
    );
  }
  for (const provider of listStoredProviderApiKeys()) {
    migrateValue(`provider "${provider.name}"`, provider.api_key, (stored) =>
      setStoredProviderApiKey(provider.id, stored),
    );
  }
  for (const material of listStoredSecretMaterials()) {
    migrateValue(materialLabel(material.name), material.value, (stored) =>
      setStoredSecretMaterialValue(material.name, stored),
    );
  }

  if (failures.length > 0) {
    throw new Error(
      `SECRETS_KEY cannot decrypt: ${[...new Set(failures)].join(", ")}`,
    );
  }
}
