import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { dataDir } from "./config.ts";
import {
  listPushSubscriptions,
  type PushSubscriptionRow,
  removePushSubscription,
  setOnNewNotification,
} from "./db.ts";

let transport: typeof fetch | null = null;

export function setPushTransport(f: typeof fetch | null): void {
  transport = f;
}

const b64url = (b: ArrayBuffer | Uint8Array) =>
  Buffer.from(new Uint8Array(b)).toString("base64url");

interface VapidKeys {
  publicKey: string;
  privateKey: JsonWebKey;
}

let cached: VapidKeys | null = null;
let signingKey: CryptoKey | null = null;

const keyFile = () => join(dataDir, "vapid.json");

export async function vapidPublicKey(): Promise<string> {
  return (await keys()).publicKey;
}

async function keys(): Promise<VapidKeys> {
  if (cached) return cached;
  let loaded: VapidKeys | null = null;
  try {
    const parsed = JSON.parse(await readFile(keyFile(), "utf8")) as VapidKeys;
    if (parsed.publicKey && parsed.privateKey) loaded = parsed;
  } catch {
    // fall through to generation below
  }
  if (!loaded) {
    const pair = await crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign", "verify"],
    );
    loaded = {
      publicKey: b64url(await crypto.subtle.exportKey("raw", pair.publicKey)),
      privateKey: (await crypto.subtle.exportKey(
        "jwk",
        pair.privateKey,
      )) as JsonWebKey,
    };
  }
  cached = loaded;
  try {
    await mkdir(dataDir, { recursive: true });
    await writeFile(keyFile(), JSON.stringify(cached));
  } catch {
    // key stays in memory only; regenerated on next boot
  }
  return cached;
}

async function getSigningKey(): Promise<CryptoKey> {
  if (signingKey) return signingKey;
  const k = await keys();
  signingKey = await crypto.subtle.importKey(
    "jwk",
    k.privateKey,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  return signingKey;
}

// WebCrypto ECDSA signatures are already raw r||s; this converts DER just in case.
function derToRaw(der: Uint8Array): Uint8Array {
  if (der.length === 64) return der;
  let i = 0;
  if (der[i] !== 0x30) throw new Error("bad signature");
  i++;
  if (der[i] === 0x81) i += 2;
  else i++;
  const readInt = (): Uint8Array => {
    if (der[i] !== 0x02) throw new Error("bad signature");
    const len = der[i + 1];
    let bytes = der.subarray(i + 2, i + 2 + len);
    i += 2 + len;
    while (bytes.length > 0 && bytes[0] === 0x00) bytes = bytes.subarray(1);
    return bytes;
  };
  const r = readInt();
  const s = readInt();
  const out = new Uint8Array(64);
  out.set(r, 32 - r.length);
  out.set(s, 64 - s.length);
  return out;
}

async function vapidAuthHeader(endpoint: string): Promise<string> {
  const k = await keys();
  const encoder = new TextEncoder();
  const header = b64url(
    encoder.encode(JSON.stringify({ alg: "ES256", typ: "JWT" })),
  );
  const payload = b64url(
    encoder.encode(
      JSON.stringify({
        aud: new URL(endpoint).origin,
        exp: Math.floor(Date.now() / 1000) + 3_600,
        sub: process.env.PUSH_CONTACT ?? "mailto:bots@localhost",
      }),
    ),
  );
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    await getSigningKey(),
    encoder.encode(`${header}.${payload}`),
  );
  return `vapid t=${header}.${payload}.${b64url(derToRaw(new Uint8Array(sig)))}, k=${k.publicKey}`;
}

async function sendPush(sub: PushSubscriptionRow): Promise<void> {
  try {
    const doFetch = transport ?? fetch;
    const res = await doFetch(sub.endpoint, {
      method: "POST",
      headers: {
        authorization: await vapidAuthHeader(sub.endpoint),
        ttl: "86400",
      },
    });
    if (res.status === 404 || res.status === 410)
      removePushSubscription(sub.endpoint);
  } catch {
    // delivery is fire-and-forget; a dead push service must not break runs
  }
}

export async function dispatchNewNotification(): Promise<void> {
  await Promise.all(listPushSubscriptions().map((s) => sendPush(s)));
}

export function attachPushNotifications(): void {
  setOnNewNotification(() => {
    void dispatchNewNotification();
  });
}
