import assert from "node:assert/strict";
import { test } from "node:test";
import type { AgentEvent, EntryRecord } from "@earendil-works/pi-durable";
import { ChatStreamReducer } from "../src/chat-stream.ts";

function event(value: unknown): AgentEvent {
  return value as AgentEvent;
}

test("chat stream reducer replays partial assistant text and live tool output", () => {
  const user = {
    id: "1",
    model: [{ role: "user", content: "[chat 2026-10-29]\nhi" }],
  } as unknown as EntryRecord;

  const reducer = new ChatStreamReducer();
  reducer.setEntries([user]);
  reducer.applyEvent(
    event({
      type: "snapshot",
      entries: [],
      run: { inputs: ["s1"] },
      tools: [],
      nestedTools: [],
      compactions: [],
      inbox: [],
      agent: {},
      usage: { models: {} },
    }),
  );

  let state = reducer.state();
  assert.equal(state.working, true);
  assert.deepEqual(
    state.turns.map((turn) => turn.role),
    ["user"],
  );

  for (const value of [
    {
      type: "message_update",
      usage: {},
      changes: [{ type: "text_start", contentIndex: 0, block: {} }],
    },
    {
      type: "message_update",
      usage: {},
      changes: [{ type: "text_delta", contentIndex: 0, delta: "hello" }],
    },
    {
      type: "message_update",
      usage: {},
      changes: [
        {
          type: "toolcall_start",
          contentIndex: 1,
          block: {
            type: "toolCall",
            id: "c1",
            name: "shell",
            arguments: { command: "ls" },
          },
        },
      ],
    },
    {
      type: "tool_execution_update",
      toolCallId: "c1",
      toolName: "shell",
      output: { append: "file.txt\n" },
    },
  ]) {
    reducer.applyEvent(event(value));
  }

  state = reducer.state();
  assert.equal(state.working, true);
  assert.deepEqual(
    state.turns.map((turn) => turn.role),
    ["user", "assistant"],
  );
  assert.equal(state.turns[1].text, "hello");
  assert.equal(state.turns[1].tool_calls?.[0]?.name, "shell");
  assert.deepEqual(state.turns[1].tool_calls?.[0]?.input, { command: "ls" });
  assert.equal(state.turns[1].tool_calls?.[0]?.output, "file.txt\n");

  const assistant = {
    id: "2",
    model: [
      {
        role: "assistant",
        content: [
          { type: "text", text: "hello" },
          {
            type: "toolCall",
            id: "c1",
            name: "shell",
            arguments: { command: "ls" },
          },
        ],
      },
    ],
  } as unknown as EntryRecord;
  const toolResult = {
    id: "3",
    model: [
      {
        role: "toolResult",
        toolCallId: "c1",
        content: [{ type: "text", text: "file.txt" }],
        isError: false,
      },
    ],
  } as unknown as EntryRecord;

  reducer.applyEvent(event({ type: "message_end", entry: assistant }));
  reducer.applyEvent(event({ type: "entry_appended", entry: toolResult }));
  reducer.addEntry(assistant);
  reducer.applyEvent(event({ type: "run_end", inputs: ["s1"] }));

  state = reducer.state();
  assert.equal(state.working, false);
  assert.deepEqual(
    state.turns.map((turn) => turn.role),
    ["user", "assistant"],
  );
  assert.equal(state.turns[1].tool_calls?.[0]?.output, "file.txt");
});
