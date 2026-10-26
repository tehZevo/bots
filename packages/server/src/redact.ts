// specs/secrets/redaction.md — exact-value redaction of tool-result text at commit time.
import { listMcpServers, listProviders, redactionSecretsForBot } from "./db.ts";

const MIN_SECRET_LEN = 8;

export function redactionTargets(
  botId: string,
): { name: string; value: string }[] {
  const targets = new Map<string, { name: string; value: string }>();
  for (const s of redactionSecretsForBot(botId))
    if (!targets.has(s.name + "\u0000" + s.value))
      targets.set(s.name + "\u0000" + s.value, s);
  // Provider keys and MCP env values are redacted for every bot (spec).
  for (const p of listProviders())
    if (p.api_key)
      targets.set(`PROVIDER\u0000${p.api_key}`, {
        name: p.name,
        value: p.api_key,
      });
  for (const server of listMcpServers())
    for (const [key, value] of Object.entries(server.env ?? {}))
      if (value) targets.set(`${key}\u0000${value}`, { name: key, value });
  return [...targets.values()].sort((a, b) => b.value.length - a.value.length);
}

export function redactText(botId: string, text: string): string {
  try {
    if (!text) return text;
    let out = text;
    for (const t of redactionTargets(botId)) {
      if (t.value.length >= MIN_SECRET_LEN && out.includes(t.value))
        out = out.replaceAll(t.value, `[REDACTED:${t.name}]`);
    }
    return out;
  } catch {
    return text; // redaction failure never blocks a turn
  }
}

// Mutates tool-result messages in place so both persistence and later replays
// to the model see redacted text. Other roles are left untouched.
export function redactMessageForBot(botId: string, message: unknown): void {
  try {
    const msg = message as { role?: string; content?: unknown };
    if (msg?.role !== "toolResult" || !Array.isArray(msg.content)) return;
    for (const block of msg.content) {
      const b = block as { type?: string; text?: string };
      if (b && typeof b.text === "string") {
        const redacted = redactText(botId, b.text);
        if (redacted !== b.text) b.text = redacted;
      }
    }
  } catch {
    // keep the original text on any failure
  }
}
