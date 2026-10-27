import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const data = mkdtempSync(join(tmpdir(), "bots-skillfiles-"));
process.env.DATABASE_PATH = join(data, "t.db");
process.env.DATA_DIR = join(data, "data");

const dbm = await import("../src/db.ts");
const { effectiveSystemPrompt } = await import("../src/agent.ts");
const { buildTools } = await import("../src/tools.ts");

function mkSkill(id: string, name: string, description: string, body: string) {
  dbm.insertSkill({
    id,
    name,
    description,
    instructions: body,
    created_at: Date.now(),
  });
}

dbm.insertRole({
  id: "role-1",
  name: "Worker",
  instructions: "",
  mcp_server_ids: [],
  skill_ids: ["s-zeta", "s-alpha"],
  created_at: Date.now(),
});
mkSkill("s-zeta", "Zeta", "zeta desc", "ZETA BODY INSTRUCTIONS");
mkSkill("s-alpha", "Alpha", "alpha desc", "ALPHA BODY INSTRUCTIONS");
dbm.insertBot({
  id: "adv-bot",
  name: "Adv",
  instructions: "",
  enabled: 1,
  created_at: Date.now(),
});
dbm.insertBot({
  id: "plain-bot",
  name: "Plain",
  instructions: "",
  enabled: 1,
  role_id: "role-1",
  created_at: Date.now(),
} as never);

test("granted skills are advertised by name order with description and id", () => {
  const bot = dbm.getBot("plain-bot");
  assert.ok(bot);
  const prompt = effectiveSystemPrompt(bot);
  assert.match(prompt, /## Skills/);
  assert.match(
    prompt,
    /- Alpha — description: alpha desc — id: s-alpha — files at \/workspace\/\.skills\/Alpha\//,
  );
  assert.match(prompt, /- Zeta — description: zeta desc — id: s-zeta/);
  assert.ok(
    prompt.indexOf("- Alpha") < prompt.indexOf("- Zeta"),
    "ordered by skill name",
  );
  assert.doesNotMatch(prompt, /ZETA BODY INSTRUCTIONS/, "text not injected");
});

test("no grants means no skills section", () => {
  const bot = dbm.getBot("adv-bot");
  assert.ok(bot);
  assert.ok(!effectiveSystemPrompt(bot).includes("## Skills"));
  const tools = buildTools(bot.id);
  assert.ok(!tools.some((t) => t.name === "read_skill_file"));
});

type Tool = Awaited<ReturnType<typeof buildTools>>[number];

async function readTool(tools: Tool[], args: Record<string, unknown>) {
  const tool = tools.find((t) => t.name === "read_skill_file");
  assert.ok(tool, "read_skill_file present");
  return (
    await tool.execute!("call-1", args as never, undefined as never, () => {})
  ).content[0]?.text;
}

test("hand-written skills serve a synthesized SKILL.md", async () => {
  const granted = [dbm.getSkill("s-alpha")];
  const tools = buildTools("adv-bot", undefined, granted as never);
  const text: string = await readTool(tools, { skill_id: "s-alpha" });
  assert.match(text, /^---\nname: Alpha\n/);
  assert.match(text, /ALPHA BODY INSTRUCTIONS/);
});

test("bundle files are read byte-for-byte and guards reject bad reads", async () => {
  const bundle = join(data, "data", "skills", "s-zeta");
  mkdirSync(join(bundle, "scripts"), { recursive: true });
  writeFileSync(join(bundle, "SKILL.md"), "# Zeta bundle\n");
  writeFileSync(join(bundle, "scripts", "ref.txt"), "REF CONTENT");
  const granted = [dbm.getSkill("s-zeta")];
  const tools = buildTools("adv-bot", undefined, granted as never);

  assert.equal(
    await readTool(tools, { skill_id: "s-zeta" }),
    "# Zeta bundle\n",
  );
  assert.equal(
    await readTool(tools, { skill_id: "s-zeta", path: "scripts/ref.txt" }),
    "REF CONTENT",
  );

  const bad = (args: Record<string, unknown>) =>
    assert.rejects(readTool(tools, args), /./);
  await bad({ skill_id: "s-alpha" }); // not granted to this call's grant set
  await bad({ skill_id: "s-zeta", path: "../secrets" }); // escapes the bundle
  await bad({ skill_id: "s-zeta", path: "/etc/passwd" }); // absolute path
  await bad({ skill_id: "s-zeta", path: "scripts" }); // directory
});

test("oversized skill files truncate like other tool output", async () => {
  const bundle = join(data, "data", "skills", "s-zeta");
  writeFileSync(join(bundle, "big.txt"), "x".repeat(20_000));
  const granted = [dbm.getSkill("s-zeta")];
  const tools = buildTools("adv-bot", undefined, granted as never);
  const text: string = await readTool(tools, {
    skill_id: "s-zeta",
    path: "big.txt",
  });
  assert.match(text, /\[truncated/);
});
