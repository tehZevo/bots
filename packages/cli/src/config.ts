import { randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { CliError, EXIT, warn } from "./output.ts";

export interface CliConfig {
  url?: string;
  email?: string;
  api_key?: string;
  key_id?: string | null;
  key_name?: string;
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

export function defaultConfigPath(): string {
  if (process.platform === "win32") {
    const appData = process.env.APPDATA;
    if (appData) return path.join(appData, "bots", "config.json");
  }
  const base =
    process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
  return path.join(base, "bots", "config.json");
}

export function configPath(explicit?: string): string {
  return explicit || process.env.BOTS_CONFIG || defaultConfigPath();
}

export function readConfig(file: string): CliConfig {
  try {
    const mode = fs.statSync(file).mode & 0o777;
    if (mode & 0o077) {
      warn(`${file} is group/world readable; tightening to 0600`);
      fs.chmodSync(file, 0o600);
    }
    return JSON.parse(fs.readFileSync(file, "utf8")) as CliConfig;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw err;
  }
}

export function writeConfig(file: string, config: CliConfig): void {
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const dirMode = fs.statSync(dir).mode & 0o777;
  if (dirMode & 0o077) {
    warn(`${dir} is group/world accessible; tightening to 0700`);
    fs.chmodSync(dir, 0o700);
  }
  const tmp = path.join(dir, `.config.${randomBytes(4).toString("hex")}.tmp`);
  fs.writeFileSync(tmp, `${JSON.stringify(config, null, 2)}\n`, {
    mode: 0o600,
  });
  fs.renameSync(tmp, file);
}

export function deleteConfig(file: string): void {
  fs.rmSync(file, { force: true });
}

export interface ResolvedTarget {
  url: string;
  apiKey: string;
  email?: string;
  keyId?: string | null;
  keyName?: string;
  source: "flag" | "environment" | "config";
}

// specs/cli/overview.md — flag > environment > file, and no silent localhost.
export function resolveTarget(options: {
  url?: string;
  apiKey?: string;
  config?: string;
  insecure?: boolean;
}): ResolvedTarget {
  const file = configPath(options.config);
  const stored = readConfig(file);
  const url = options.url || process.env.BOTS_URL || stored.url;
  const apiKey = options.apiKey || process.env.BOTS_API_KEY || stored.api_key;
  const source: ResolvedTarget["source"] =
    options.url || options.apiKey
      ? "flag"
      : process.env.BOTS_URL || process.env.BOTS_API_KEY
        ? "environment"
        : "config";
  if (!url || !apiKey) {
    throw new CliError(
      "not logged in: run `bots auth login` (or set --url/--api-key)",
      EXIT.auth,
    );
  }
  assertUrl(url, options.insecure === true);
  return {
    url: url.replace(/\/+$/, ""),
    apiKey,
    email: stored.email,
    keyId: stored.key_id,
    keyName: stored.key_name,
    source,
  };
}

export function assertUrl(raw: string, insecure: boolean): string {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new CliError(`url must be absolute: ${raw}`, EXIT.usage);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new CliError(
      `unsupported url scheme: ${parsed.protocol}`,
      EXIT.usage,
    );
  }
  if (parsed.protocol === "http:" && !LOCAL_HOSTS.has(parsed.hostname)) {
    if (!insecure) {
      throw new CliError(
        `${parsed.hostname} requires https; pass --insecure to allow http`,
        EXIT.usage,
      );
    }
    warn(`sending credentials over plain http to ${parsed.hostname}`);
  }
  return parsed.toString();
}
