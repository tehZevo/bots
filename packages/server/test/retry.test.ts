import assert from "node:assert/strict";
import { test } from "node:test";
import { retryFetch, retryPolicy } from "../src/retry.ts";

retryPolicy.baseMs = 15;

type Reply = Response | Error;

function stubFetch(replies: Reply[]): { calls: number; init: RequestInit[] } {
  const state = { calls: 0, init: [] as RequestInit[] };
  const original = globalThis.fetch;
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const reply = replies[Math.min(state.calls, replies.length - 1)];
    state.calls++;
    state.init.push(init ?? {});
    if (reply instanceof Error) throw reply;
    return reply.clone();
  }) as typeof fetch;
  (state as { restore?: () => void }).restore = () => {
    globalThis.fetch = original;
  };
  return state as typeof state & { restore: () => void };
}

test("429 then success retries and honors Retry-After", async () => {
  const stub = stubFetch([
    new Response("slow down", { status: 429, headers: { "retry-after": "0" } }),
    new Response("ok", { status: 200 }),
  ]);
  try {
    const res = await retryFetch("http://example.com/v1/chat");
    assert.equal(res.status, 200);
    assert.equal(stub.calls, 2);
  } finally {
    stub.restore();
  }
});

test("5xx responses are retried up to 3 times", async () => {
  const replies: Reply[] = [
    new Response("x", { status: 500 }),
    new Response("x", { status: 503 }),
    new Response("x", { status: 502 }),
    new Response("ok", { status: 200 }),
  ];
  const stub = stubFetch(replies);
  try {
    const started = Date.now();
    const res = await retryFetch("http://example.com/v1/chat");
    assert.equal(res.status, 200);
    assert.equal(stub.calls, 4);
    assert.ok(Date.now() - started >= 45, "applied backoff delays");
  } finally {
    stub.restore();
  }
});

test("exhausted retries return the final error response", async () => {
  const stub = stubFetch([new Response("boom", { status: 500 })]);
  try {
    const res = await retryFetch("http://example.com/v1/chat", {});
    assert.equal(res.status, 500);
    assert.equal(stub.calls, 4);
  } finally {
    stub.restore();
  }
});

test("non-429 4xx surfaces immediately without retry", async () => {
  const stub = stubFetch([new Response("bad", { status: 400 })]);
  try {
    const res = await retryFetch("http://example.com/v1/chat");
    assert.equal(res.status, 400);
    assert.equal(stub.calls, 1);
  } finally {
    stub.restore();
  }
});

test("connection errors are retried", async () => {
  const replies: Reply[] = [
    Object.assign(new Error("ECONNREFUSED"), { name: "TypeError" }),
    new Response("ok", { status: 200 }),
  ];
  const stub = stubFetch(replies);
  try {
    const res = await retryFetch("http://example.com/v1/chat");
    assert.equal(res.status, 200);
    assert.equal(stub.calls, 2);
  } finally {
    stub.restore();
  }
});

test("connection error after exhausted retries rethrows", async () => {
  const stub = stubFetch([new Error("ECONNREFUSED")]);
  try {
    await assert.rejects(
      retryFetch("http://example.com/v1/chat", {
        signal: AbortSignal.timeout(30_000),
      }),
      /ECONNREFUSED/,
    );
    assert.equal(stub.calls, 4);
  } finally {
    stub.restore();
  }
});

test("malformed Retry-After falls back to the computed delay", async () => {
  retryPolicy.baseMs = 1000;
  const replies: Reply[] = [
    new Response("x", { status: 429, headers: { "retry-after": "banana" } }),
    new Response("ok", { status: 200 }),
  ];
  const stub = stubFetch(replies);
  try {
    const started = Date.now();
    const res = await retryFetch("http://example.com/v1/chat");
    assert.equal(res.status, 200);
    assert.ok(Date.now() - started >= 900, "fell back to ~1s computed delay");
  } finally {
    retryPolicy.baseMs = 15;
    stub.restore();
  }
});

test("abort during backoff stops waiting immediately", async () => {
  retryPolicy.baseMs = 500;
  const replies: Reply[] = [new Response("x", { status: 500 })];
  const stub = stubFetch(replies);
  const controller = new AbortController();
  try {
    const started = Date.now();
    const inflight = retryFetch("http://example.com/v1/chat", {
      signal: controller.signal,
    });
    setTimeout(() => controller.abort(), 20);
    await assert.rejects(inflight, (err: Error) => err.name === "AbortError");
    assert.ok(Date.now() - started < 250, "did not wait out the backoff");
    assert.equal(stub.calls, 1);
  } finally {
    retryPolicy.baseMs = 15;
    stub.restore();
  }
});
