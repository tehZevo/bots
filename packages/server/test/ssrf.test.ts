import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const dataDir = mkdtempSync(join(tmpdir(), "bots-ssrf-data-"));
process.env.DATA_DIR = dataDir;
process.env.DATABASE_PATH = join(dataDir, "test.db");
delete process.env.BOTS_ALLOW_PRIVATE_NETWORK;

const { MAX_REDIRECTS, safeFetch } = await import("../src/ssrf.ts");
const { resolveSafeCloneUrl } = await import("../src/skillimport.ts");
const { buildTools } = await import("../src/tools.ts");

const publicLookup = async () => [{ address: "8.8.8.8", family: 4 as const }];

function redirect(location: string, status = 302) {
  return {
    status,
    headers: new Headers({ location }),
    body: "",
  };
}

async function startServer(
  handler: http.RequestListener,
): Promise<{ url: string; close(): Promise<void> }> {
  const server = http.createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("no port");
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      }),
  };
}

test("safeFetch refuses loopback, private, link-local and metadata addresses", async () => {
  const urls = [
    "http://127.0.0.1/",
    "http://[::ffff:127.0.0.1]/",
    "http://169.254.169.254/latest/meta-data/",
    "http://[fe80::1]/",
    "http://[fd00::1]/",
  ];
  for (const url of urls) {
    await assert.rejects(() => safeFetch(url), /host not allowed/);
  }
});

test("safeFetch revalidates redirect targets before connecting", async () => {
  const seen: string[] = [];
  await assert.rejects(
    () =>
      safeFetch("http://public.test/", {
        lookup: publicLookup,
        request: async (url) => {
          seen.push(url.pathname);
          return redirect("http://127.0.0.1/private");
        },
      }),
    /host not allowed/,
  );
  assert.deepEqual(seen, ["/"]);
});

test("safeFetch enforces the five-redirect limit", async () => {
  let requests = 0;
  await assert.rejects(
    () =>
      safeFetch("http://public.test/", {
        lookup: publicLookup,
        request: async (_url) => {
          requests++;
          return redirect(`http://public.test/${requests}`);
        },
      }),
    /too many redirects/,
  );
  assert.equal(requests, MAX_REDIRECTS + 1);
});

test("safeFetch follows local redirects when private networking is enabled", async () => {
  const started = await startServer((req, res) => {
    if (req.url === "/redirect") {
      const address = req.headers.host;
      res.writeHead(302, { location: `http://${address}/final` });
      res.end();
    } else {
      res.writeHead(200, { "content-type": "text/html" });
      res.end("<p>ok</p>");
    }
  });

  process.env.BOTS_ALLOW_PRIVATE_NETWORK = "1";
  try {
    const response = await safeFetch(`${started.url}/redirect`);
    assert.equal(response.status, 200);
    assert.equal(response.body, "<p>ok</p>");
  } finally {
    delete process.env.BOTS_ALLOW_PRIVATE_NETWORK;
    await started.close();
  }
});

test("web_fetch surfaces host refusal as a tool error", async () => {
  type FetchTool = {
    name: string;
    execute(
      id: string,
      params: { url: string },
      signal?: AbortSignal,
    ): Promise<unknown>;
  };
  const fetchTool = buildTools("ssrf-bot").find(
    (tool) => tool.name === "web_fetch",
  ) as unknown as FetchTool | undefined;
  assert.ok(fetchTool);

  await assert.rejects(
    () => fetchTool.execute("", { url: "http://127.0.0.1/" }),
    /host not allowed/,
  );
});

test("git clone URLs refuse file and private-network hosts", async () => {
  await assert.rejects(
    () => resolveSafeCloneUrl("file:///tmp/repo.git"),
    /source host not allowed/,
  );

  const started = await startServer((req, res) => {
    if (req.url?.endsWith("/repo.git/info/refs")) {
      res.writeHead(200, {
        "content-type": "application/x-git-upload-pack-advertisement",
      });
      res.end();
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  process.env.BOTS_ALLOW_PRIVATE_NETWORK = "1";
  try {
    assert.equal(
      await resolveSafeCloneUrl("file:///tmp/repo.git"),
      "file:///tmp/repo.git",
    );
    const resolved = await resolveSafeCloneUrl(`${started.url}/repo.git`);
    assert.equal(resolved, `${started.url}/repo.git`);

    delete process.env.BOTS_ALLOW_PRIVATE_NETWORK;
    await assert.rejects(
      () => resolveSafeCloneUrl(started.url),
      /source host not allowed/,
    );
  } finally {
    process.env.BOTS_ALLOW_PRIVATE_NETWORK = "1";
    await started.close();
    delete process.env.BOTS_ALLOW_PRIVATE_NETWORK;
  }
});
