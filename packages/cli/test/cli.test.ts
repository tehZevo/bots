import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
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

interface Run {
  status: number;
  stdout: string;
  stderr: string;
}

function run(args: string[], env: Record<string, string> = {}): Promise<Run> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["--import", tsxLoader, cliEntry, ...args],
      { env: { ...process.env, ...env } },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => (stdout += chunk));
    child.stderr.on("data", (chunk: string) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (status) =>
      resolve({ status: status ?? 1, stdout, stderr }),
    );
  });
}

const { assertUrl, configPath, readConfig, resolveTarget, writeConfig } =
  await import("../src/config.ts");
const { exitForStatus } = await import("../src/output.ts");
const { checkOriginPath } = await import("../src/http.ts");
const { confirm } = await import("../src/safety.ts");

function tempConfig(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "bots-cli-"));
  return path.join(dir, "bots", "config.json");
}

test("config path follows XDG and BOTS_CONFIG", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "bots-cli-xdg-"));
  assert.equal(
    configPath(),
    path.join(
      process.env.XDG_CONFIG_HOME ||
        path.join(process.env.HOME ?? "", ".config"),
      "bots",
      "config.json",
    ),
  );
  assert.equal(configPath("/somewhere/else.json"), "/somewhere/else.json");
  const previous = process.env.BOTS_CONFIG;
  process.env.BOTS_CONFIG = path.join(dir, "env.json");
  assert.equal(configPath(), path.join(dir, "env.json"));
  if (previous === undefined) delete process.env.BOTS_CONFIG;
  else process.env.BOTS_CONFIG = previous;
});

test("config is written 0600 and loose permissions are tightened", () => {
  const file = tempConfig();
  writeConfig(file, { url: "http://localhost:8787", api_key: "bots_x" });
  assert.equal(statSync(file).mode & 0o777, 0o600);
  assert.equal(statSync(path.dirname(file)).mode & 0o777, 0o700);
  assert.deepEqual(readConfig(file), {
    url: "http://localhost:8787",
    api_key: "bots_x",
  });

  writeConfig(file, { url: "http://localhost:8787", api_key: "bots_x" });
  writeFileSync(file, JSON.stringify({ url: "http://localhost:8787" }));
  assert.equal(statSync(file).mode & 0o777, 0o600);
  assert.deepEqual(readConfig(file), { url: "http://localhost:8787" });
});

test("precedence is flag over environment over file", () => {
  const file = tempConfig();
  writeConfig(file, {
    url: "https://file.example",
    api_key: "bots_file",
    email: "file@example.com",
  });
  const previous = process.env.BOTS_URL;
  process.env.BOTS_URL = "https://env.example";
  const fromEnv = resolveTarget({ config: file });
  assert.equal(fromEnv.url, "https://env.example");
  assert.equal(fromEnv.source, "environment");
  const fromFlag = resolveTarget({ url: "https://flag.example", config: file });
  assert.equal(fromFlag.url, "https://flag.example");
  assert.equal(fromFlag.source, "flag");
  assert.equal(fromFlag.apiKey, "bots_file");
  if (previous === undefined) delete process.env.BOTS_URL;
  else process.env.BOTS_URL = previous;
});

test("missing credentials exit 3 with a login hint", () => {
  const file = path.join(
    mkdtempSync(path.join(tmpdir(), "bots-cli-empty-")),
    "missing.json",
  );
  assert.throws(
    () => resolveTarget({ config: file }),
    (err: Error & { code: number }) =>
      err.code === 3 && /auth login/.test(err.message),
  );
});

test("https is required off localhost unless --insecure", () => {
  assert.equal(
    assertUrl("http://localhost:8787", false),
    "http://localhost:8787/",
  );
  assert.equal(
    assertUrl("http://127.0.0.1:8787", false),
    "http://127.0.0.1:8787/",
  );
  assert.equal(
    assertUrl("https://bots.example.com", false),
    "https://bots.example.com/",
  );
  assert.throws(
    () => assertUrl("http://bots.example.com", false),
    (err: Error & { code: number }) => err.code === 2,
  );
  assert.equal(
    assertUrl("http://bots.example.com", true),
    "http://bots.example.com/",
  );
  assert.throws(
    () => assertUrl("bots.example.com", false),
    (err: Error & { code: number }) => err.code === 2,
  );
});

test("status codes map to the documented exit codes", () => {
  assert.equal(exitForStatus(400), 2);
  assert.equal(exitForStatus(401), 3);
  assert.equal(exitForStatus(403), 3);
  assert.equal(exitForStatus(404), 4);
  assert.equal(exitForStatus(409), 5);
  assert.equal(exitForStatus(422), 2);
  assert.equal(exitForStatus(413), 1);
  assert.equal(exitForStatus(429), 1);
  assert.equal(exitForStatus(500), 1);
});

test("api paths can never leave the configured origin", () => {
  assert.equal(checkOriginPath("/api/bots"), "/api/bots");
  for (const bad of ["//evil.example/x", "https://evil.example", "api/bots"]) {
    assert.throws(
      () => checkOriginPath(bad),
      (err: Error & { code: number }) => err.code === 2,
      bad,
    );
  }
});

test("destructive confirmation requires --yes without a tty", async () => {
  await assert.rejects(
    () => confirm("bot delete", undefined, false),
    (err: Error & { code: number }) =>
      err.code === 2 && /--yes/.test(err.message),
  );
  await confirm("bot delete", undefined, true);
});

test("version and --version print the package version", async () => {
  const pkg = JSON.parse(
    readFileSync(path.join(here, "..", "package.json"), "utf8"),
  ) as { version: string };
  assert.equal((await run(["version"])).stdout.trim(), pkg.version);
  assert.equal((await run(["--version"])).stdout.trim(), pkg.version);
});

test("commands reach the server and map failures to exit codes", async () => {
  const server = http.createServer((req, res) => {
    if (
      req.url === "/api/bots" &&
      req.headers.authorization === "Bearer bots_test"
    ) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify([{ id: "b1", name: "Nova" }]));
      return;
    }
    if (req.url === "/api/missing") {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "not found" }));
      return;
    }
    res.writeHead(401, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "no key" }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as { port: number };
  const url = `http://127.0.0.1:${address.port}`;
  try {
    const ok = await run([
      "api",
      "GET",
      "/api/bots",
      "--url",
      url,
      "--api-key",
      "bots_test",
    ]);
    assert.equal(ok.status, 0);
    assert.match(ok.stdout, /Nova/);

    const missing = await run([
      "api",
      "GET",
      "/api/missing",
      "--url",
      url,
      "--api-key",
      "bots_test",
    ]);
    assert.equal(missing.status, 4);
    assert.match(missing.stderr, /bots: 404 not found/);

    const denied = await run([
      "api",
      "GET",
      "/api/bots",
      "--url",
      url,
      "--api-key",
      "bots_wrong",
    ]);
    assert.equal(denied.status, 3);

    const bodyOnGet = await run([
      "api",
      "GET",
      "/api/bots",
      "--data",
      "{}",
      "--url",
      url,
      "--api-key",
      "bots_test",
    ]);
    assert.equal(bodyOnGet.status, 2);
  } finally {
    server.close();
  }
});

test("a bad api key shape is rejected before any request", async () => {
  const res = await run([
    "auth",
    "login",
    "--url",
    "http://127.0.0.1:1",
    "--api-key",
    "nope",
    "--config",
    path.join(mkdtempSync(path.join(tmpdir(), "bots-cli-key-")), "c.json"),
  ]);
  assert.equal(res.status, 2);
  assert.match(res.stderr, /40 hex/);
});
