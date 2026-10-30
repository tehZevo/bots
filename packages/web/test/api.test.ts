import assert from "node:assert/strict";
import { it as test } from "vitest";
import { api } from "../src/lib/api.ts";

test("api passes method, headers, and serialized body through to fetch", async () => {
  const calls: [RequestInfo | URL, RequestInit | undefined][] = [];
  const real = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push([input, init]);
    return Response.json({ ok: true });
  }) as typeof globalThis.fetch;
  try {
    const body = await api("/api/bots", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Atlas" }),
    });
    assert.deepEqual(body, { ok: true });
    assert.equal(calls.length, 1);
    const [path, init] = calls[0];
    assert.equal(path, "/api/bots");
    assert.equal(init?.method, "POST");
    assert.equal(
      (init?.headers as Record<string, string>)["content-type"],
      "application/json",
    );
    assert.equal(init?.body, JSON.stringify({ name: "Atlas" }));
  } finally {
    globalThis.fetch = real;
  }
});

test("api surfaces the server error message on non-2xx responses", async () => {
  const real = globalThis.fetch;
  globalThis.fetch = (async () =>
    Response.json(
      { error: "name taken" },
      { status: 409 },
    )) as typeof globalThis.fetch;
  try {
    await assert.rejects(() => api("/api/bots"), /name taken/);
  } finally {
    globalThis.fetch = real;
  }
});

test("api falls back to the status text when no error body is given", async () => {
  const real = globalThis.fetch;
  globalThis.fetch = (async () =>
    Response.json({}, { status: 500 })) as typeof globalThis.fetch;
  try {
    await assert.rejects(() => api("/api/runs"), /500/);
  } finally {
    globalThis.fetch = real;
  }
});
