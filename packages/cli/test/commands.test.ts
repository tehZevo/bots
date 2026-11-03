import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const cliEntry = path.join(here, "..", "src", "index.ts");
const tsxLoader = path.join(
  here,
  "..",
  "..",
  "..",
  "packages",
  "server",
  "node_modules",
  "tsx",
  "dist",
  "loader.mjs",
);

const routes = new Map<string, { method: string; body: unknown }>();
const seen: string[] = [];

const server = http.createServer((req, res) => {
  const key = `${req.method} ${req.url}`;
  seen.push(key);
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    const hit = routes.get(key) ?? routes.get(`ANY ${req.url}`);
    if (!hit) {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "not found" }));
      return;
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(hit.body));
  });
});
await new Promise<void>((resolve) => server.listen(0, resolve));
const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;

function run(
  args: string[],
): Promise<{ status: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["--import", tsxLoader, cliEntry, ...args],
      {
        env: {
          ...process.env,
          BOTS_URL: url,
          BOTS_API_KEY: "test-key",
          BOTS_CONFIG: path.join(
            mkdtempSync(path.join(tmpdir(), "c-")),
            "c.json",
          ),
        },
      },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (c: string) => (stdout += c));
    child.stderr.on("data", (c: string) => (stderr += c));
    child.on("error", reject);
    child.on("close", (status) =>
      resolve({ status: status ?? 1, stdout, stderr }),
    );
  });
}

test.after(() => server.close());

test("bot list renders the table and --quiet prints ids", async () => {
  routes.set("GET /api/bots", {
    method: "GET",
    body: [
      { id: "b1", name: "Sable", status: "ok", enabled: 1 },
      { id: "b2", name: "Lark", status: null, enabled: 0 },
    ],
  });
  const table = await run(["bot", "list"]);
  assert.equal(table.status, 0);
  assert.match(table.stdout, /Sable/);
  const quiet = await run(["bot", "list", "--quiet"]);
  assert.equal(quiet.stdout, "b1\nb2\n");
});

test("ambiguous and unknown references exit 2 and 4", async () => {
  routes.set("GET /api/roles", {
    method: "GET",
    body: [
      { id: "r1", name: "dup" },
      { id: "r2", name: "dup" },
    ],
  });
  const ambiguous = await run(["role", "get", "dup"]);
  assert.equal(ambiguous.status, 2);
  assert.match(ambiguous.stderr, /ambiguous/);
  const missing = await run(["role", "get", "nope"]);
  assert.equal(missing.status, 4);
});

test("webhook trigger create forbids --schedule before sending", async () => {
  const before = seen.length;
  const res = await run([
    "trigger",
    "create",
    "b1",
    "--kind",
    "webhook",
    "--schedule",
    "@every 1m",
  ]);
  assert.equal(res.status, 2);
  assert.equal(seen.length, before);
});

test("webhook create prints the one-time secret", async () => {
  routes.set("POST /api/bots/b1/triggers", {
    method: "POST",
    body: {
      id: "t1",
      kind: "webhook",
      enabled: 1,
      secret: "whsec_abc",
      url: `${url}/api/webhooks/t1`,
    },
  });
  const res = await run(["trigger", "create", "b1", "--kind", "webhook"]);
  assert.equal(res.status, 0);
  assert.match(res.stdout, /whsec_abc/);
});

test("key create prints the one-time value", async () => {
  routes.set("POST /api/api-keys", {
    method: "POST",
    body: { id: "k1", name: "ci", value: "bots_secret" },
  });
  const res = await run(["key", "create", "--name", "ci"]);
  assert.equal(res.status, 0);
  assert.match(res.stdout, /bots_secret/);
});

test("machine rebuild exits 1 when build_error is set", async () => {
  routes.set("GET /api/machines", {
    method: "GET",
    body: [{ id: "m1", name: "node" }],
  });
  routes.set("POST /api/machines/m1/rebuild", {
    method: "POST",
    body: { id: "m1", build_error: "docker failed" },
  });
  const res = await run(["machine", "rebuild", "m1"]);
  assert.equal(res.status, 1);
  assert.match(res.stderr, /docker failed/);
});

test("run now reports the run id and steered flag", async () => {
  routes.set("GET /api/bots", {
    method: "GET",
    body: [{ id: "b1", name: "Sable" }],
  });
  routes.set("POST /api/bots/b1/run", {
    method: "POST",
    body: { runId: "r1", steered: true },
  });
  const res = await run(["run", "now", "Sable"]);
  assert.equal(res.status, 0);
  assert.match(res.stdout, /run r1 \(steered\)/);
});
