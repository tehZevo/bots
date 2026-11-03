import type { Command } from "commander";
import { type Ctx, request } from "../http.ts";
import { CliError, EXIT, out, warn } from "../output.ts";
import { confirm } from "../safety.ts";
import {
  parseJsonArray,
  parseKeyValues,
  printList,
  printOne,
  readValue,
  resolveId,
  resolveRef,
} from "../util.ts";

type Opts = Record<string, string | string[] | boolean | undefined>;
type MakeCtx = () => Ctx & { quiet: boolean; yes: boolean };

interface CrudFlag {
  option: string;
  key: string;
  desc: string;
}

function collectBody(
  opts: Opts,
  flags: CrudFlag[],
  fileMap: Record<string, string>,
): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const flag of flags) {
    const value = opts[flag.key];
    if (value === undefined || value === false) continue;
    const target = fileMap[flag.key];
    if (target !== undefined) {
      body[target] = value;
      continue;
    }
    body[flag.key] = value;
  }
  return body;
}

function registerCrud(
  program: Command,
  make: MakeCtx,
  spec: {
    name: string;
    path: string;
    required: string[];
    flags: CrudFlag[];
    fileMap?: Record<string, string>;
    columns: string[];
  },
): void {
  const cmd = program.command(spec.name).description(`${spec.name} management`);
  cmd
    .command("list")
    .description(`list ${spec.name}s`)
    .action(async () => {
      const c = make();
      const res = await request(c, "GET", spec.path);
      printList(
        c.quiet,
        res.body as Record<string, unknown>[],
        Object.fromEntries(
          spec.columns.map((col) => [
            col,
            (r: Record<string, unknown>) => r[col],
          ]),
        ),
      );
    });
  cmd
    .command("get <ref>")
    .description(`show one ${spec.name}`)
    .action(async (ref: string) => {
      const c = make();
      const row = await resolveRef(c, spec.path, ref);
      printOne(c.quiet, row, ["id", ...spec.columns.slice(1)]);
    });
  const create = cmd.command("create").description(`create a ${spec.name}`);
  for (const flag of spec.flags) create.option(flag.option, flag.desc);
  create.action(async (opts: Opts) => {
    const c = make();
    const body = collectBody(opts, spec.flags, spec.fileMap ?? {});
    for (const req of spec.required)
      if (body[req] === undefined || body[req] === "")
        throw new CliError(`--${req} is required`, EXIT.usage);
    const res = await request(c, "POST", spec.path, { body });
    printOne(c.quiet, res.body as Record<string, unknown>, ["id", "name"]);
  });
  const update = cmd
    .command("update <ref>")
    .description(`update a ${spec.name}`);
  for (const flag of spec.flags) update.option(flag.option, flag.desc);
  update.action(async (ref: string, opts: Opts) => {
    const c = make();
    const id = await resolveId(c, spec.path, ref);
    const body = collectBody(opts, spec.flags, spec.fileMap ?? {});
    const res = await request(c, "PATCH", `${spec.path}/${id}`, { body });
    printOne(c.quiet, res.body as Record<string, unknown>, ["id", "name"]);
  });
  cmd
    .command("delete <ref>")
    .description(`delete a ${spec.name}`)
    .action(async (ref: string) => {
      const c = make();
      const id = await resolveId(c, spec.path, ref);
      await confirm(`delete ${spec.name} ${ref}`, undefined, c.yes);
      await request(c, "DELETE", `${spec.path}/${id}`);
      out(id);
    });
}

export function registerContent(program: Command, make: MakeCtx): void {
  registerCrud(program, make, {
    name: "project",
    path: "/api/projects",
    required: ["name", "body"],
    flags: [
      { option: "--name <name>", key: "name", desc: "project name" },
      {
        option: "--description <text>",
        key: "description",
        desc: "short description",
      },
      { option: "--body <text>", key: "body", desc: "project body" },
      {
        option: "--body-file <path>",
        key: "bodyFile",
        desc: "body from file or - for stdin",
      },
    ],
    fileMap: { bodyFile: "body" },
    columns: ["id", "name", "description"],
  });
  registerCrud(program, make, {
    name: "role",
    path: "/api/roles",
    required: ["name", "instructions"],
    flags: [
      { option: "--name <name>", key: "name", desc: "role name" },
      {
        option: "--instructions <text>",
        key: "instructions",
        desc: "role instructions",
      },
      {
        option: "--instructions-file <path>",
        key: "instructionsFile",
        desc: "instructions from file or -",
      },
    ],
    fileMap: { instructionsFile: "instructions" },
    columns: ["id", "name"],
  });
  registerCrud(program, make, {
    name: "skill",
    path: "/api/skills",
    required: ["name", "instructions"],
    flags: [
      { option: "--name <name>", key: "name", desc: "skill name" },
      {
        option: "--description <text>",
        key: "description",
        desc: "skill description",
      },
      {
        option: "--instructions <text>",
        key: "instructions",
        desc: "skill instructions",
      },
      {
        option: "--instructions-file <path>",
        key: "instructionsFile",
        desc: "instructions from file or -",
      },
    ],
    fileMap: { instructionsFile: "instructions" },
    columns: ["id", "name", "description"],
  });

  const template = program.command("template").description("bot templates");
  template
    .command("list")
    .description("list templates")
    .action(async () => {
      const c = make();
      const res = await request(c, "GET", "/api/templates");
      printList(c.quiet, res.body as Record<string, unknown>[], {
        id: (r: never) => (r as Record<string, unknown>).id,
        name: (r: never) => (r as Record<string, unknown>).name,
        description: (r: never) => (r as Record<string, unknown>).description,
      });
    });
  template
    .command("get <ref>")
    .description("show one template")
    .action(async (ref: string) => {
      const c = make();
      const id = await resolveId(c, "/api/templates", ref);
      const res = await request(c, "GET", `/api/templates/${id}`);
      out(JSON.stringify(res.body, null, 2));
    });
  template
    .command("create")
    .description("create a template")
    .option("--name <name>")
    .option("--description <text>")
    .option("--instructions <text>")
    .option("--instructions-file <path>")
    .option("--machine <machine>")
    .option("--role <role>")
    .option("--trigger <json...>", '{"message":"...","schedule":"..."}')
    .action(async (opts: Opts) => {
      const c = make();
      if (!opts.name) throw new CliError("--name is required", EXIT.usage);
      const body: Record<string, unknown> = { name: opts.name };
      for (const key of ["description", "instructions", "machine", "role"]) {
        const value = await readValue(opts[key] as string | undefined);
        if (value !== undefined) body[key] = value;
      }
      const instructions = await readValue(
        opts.instructionsFile as string | undefined,
      );
      if (instructions !== undefined) body.instructions = instructions;
      const triggers = parseJsonArray(
        opts.trigger as string[] | undefined,
        "--trigger",
      );
      if (triggers !== undefined) body.triggers = triggers;
      const res = await request(c, "POST", "/api/templates", { body });
      printOne(c.quiet, res.body as Record<string, unknown>, ["id", "name"]);
    });
  template
    .command("update <ref>")
    .description("update a template")
    .option("--name <name>")
    .option("--description <text>")
    .option("--instructions <text>")
    .option("--machine <machine>")
    .option("--role <role>")
    .action(async (ref: string, opts: Opts) => {
      const c = make();
      const id = await resolveId(c, "/api/templates", ref);
      const body: Record<string, unknown> = {};
      for (const key of [
        "name",
        "description",
        "instructions",
        "machine",
        "role",
      ])
        if (opts[key] !== undefined) body[key] = opts[key];
      const res = await request(c, "PATCH", `/api/templates/${id}`, { body });
      printOne(c.quiet, res.body as Record<string, unknown>, ["id", "name"]);
    });
  template
    .command("delete <ref>")
    .description("delete a template")
    .action(async (ref: string) => {
      const c = make();
      const id = await resolveId(c, "/api/templates", ref);
      await confirm(`delete template ${ref}`, undefined, c.yes);
      await request(c, "DELETE", `/api/templates/${id}`);
      out(id);
    });
  template
    .command("apply <template>")
    .description("create a bot from a template")
    .option("--name <name>", "new bot name")
    .option("--no-triggers", "skip templated triggers")
    .option("--dry-run", "print the payload without sending")
    .action(async (ref: string, opts: Opts) => {
      const c = make();
      if (!opts.name) throw new CliError("--name is required", EXIT.usage);
      const id = await resolveId(c, "/api/templates", ref);
      const tplRes = await request(c, "GET", `/api/templates/${id}`);
      const tpl = tplRes.body as Record<string, unknown>;
      const payload: Record<string, unknown> = {
        name: opts.name,
        instructions: tpl.instructions ?? "",
      };
      if (tpl.machine_id) payload.machine_id = tpl.machine_id;
      if (tpl.role_id) payload.role_id = tpl.role_id;
      const triggers =
        opts.triggers === false
          ? []
          : ((tpl.triggers ?? []) as Record<string, unknown>[]).filter(
              (t) => (t.kind ?? "schedule") === "schedule",
            );
      if (opts.dryRun === true) {
        out(JSON.stringify({ bot: payload, triggers }, null, 2));
        return;
      }
      const botRes = await request(c, "POST", "/api/bots", { body: payload });
      const bot = botRes.body as { id: string };
      out(bot.id);
      const failed: string[] = [];
      for (const t of triggers) {
        try {
          const tRes = await request(
            c,
            "POST",
            `/api/bots/${bot.id}/triggers`,
            {
              body: t,
            },
          );
          out((tRes.body as { id: string }).id);
        } catch (err) {
          failed.push(String(t.message ?? t.schedule ?? "?"));
          warn(err instanceof Error ? err.message : String(err));
        }
      }
      if (failed.length > 0)
        throw new CliError(
          `bot ${bot.id} created but triggers failed: ${failed.join("; ")}`,
          EXIT.unexpected,
        );
    });

  const mcp = program.command("mcp").description("MCP servers");
  mcp
    .command("list")
    .description("list MCP servers (env values masked)")
    .action(async () => {
      const c = make();
      const res = await request(c, "GET", "/api/mcp-servers");
      const rows = (res.body as Record<string, unknown>[]).map((row) => ({
        ...row,
        env: row.env ? Object.keys(row.env as object) : [],
      }));
      printList(c.quiet, rows, {
        id: (r: never) => (r as Record<string, unknown>).id,
        name: (r: never) => (r as Record<string, unknown>).name,
        command: (r: never) => (r as Record<string, unknown>).command,
        enabled: (r: never) => (r as Record<string, unknown>).enabled,
      });
    });
  mcp
    .command("get <ref>")
    .description("show one MCP server")
    .action(async (ref: string) => {
      const c = make();
      const id = await resolveId(c, "/api/mcp-servers", ref);
      const res = await request(c, "GET", "/api/mcp-servers");
      const row = (res.body as Record<string, unknown>[]).find(
        (m) => m.id === id,
      );
      if (!row) throw new CliError(`no server '${ref}'`, EXIT.notFound);
      const { env, ...rest } = row;
      rest.env = env ? Object.keys(env as object) : [];
      printOne(c.quiet, rest, ["id", "name", "command", "enabled"]);
    });
  mcp
    .command("create")
    .description("create an MCP server")
    .option("--name <name>")
    .option("--command <command>")
    .option("--arg <arg...>")
    .option("--env <KEY=VALUE...>")
    .option("--enable")
    .option("--disable")
    .action(async (opts: Opts) => {
      const c = make();
      if (!opts.name || !opts.command)
        throw new CliError("--name and --command are required", EXIT.usage);
      const body: Record<string, unknown> = {
        name: opts.name,
        command: opts.command,
      };
      if (opts.arg !== undefined) body.args = opts.arg;
      const env = parseKeyValues(opts.env as string[] | undefined);
      if (env !== undefined) body.env = env;
      if (opts.enable === true) body.enabled = true;
      if (opts.disable === true) body.enabled = false;
      const res = await request(c, "POST", "/api/mcp-servers", { body });
      printOne(c.quiet, res.body as Record<string, unknown>, ["id", "name"]);
    });
  mcp
    .command("update <ref>")
    .description("update an MCP server")
    .option("--name <name>")
    .option("--command <command>")
    .option("--arg <arg...>")
    .option("--env <KEY=VALUE...>")
    .option("--enable")
    .option("--disable")
    .action(async (ref: string, opts: Opts) => {
      const c = make();
      const id = await resolveId(c, "/api/mcp-servers", ref);
      const body: Record<string, unknown> = {};
      if (opts.name !== undefined) body.name = opts.name;
      if (opts.command !== undefined) body.command = opts.command;
      if (opts.arg !== undefined) body.args = opts.arg;
      const env = parseKeyValues(opts.env as string[] | undefined);
      if (env !== undefined) body.env = env;
      if (opts.enable === true) body.enabled = true;
      if (opts.disable === true) body.enabled = false;
      const res = await request(c, "PATCH", `/api/mcp-servers/${id}`, { body });
      printOne(c.quiet, res.body as Record<string, unknown>, ["id", "name"]);
    });
  mcp
    .command("delete <ref>")
    .description("delete an MCP server")
    .action(async (ref: string) => {
      const c = make();
      const id = await resolveId(c, "/api/mcp-servers", ref);
      await confirm(`delete mcp ${ref}`, undefined, c.yes);
      await request(c, "DELETE", `/api/mcp-servers/${id}`);
      out(id);
    });
  mcp
    .command("test <ref>")
    .description("connect and count discovered tools")
    .action(async (ref: string) => {
      const c = make();
      const id = await resolveId(c, "/api/mcp-servers", ref);
      const res = await request(c, "POST", `/api/mcp-servers/${id}/test`);
      const row = res.body as {
        ok?: boolean;
        tools?: unknown[];
        error?: string;
      };
      if (row.ok === false)
        throw new CliError(row.error ?? "test failed", EXIT.unexpected);
      out(`${(row.tools ?? []).length} tools`);
    });
}
