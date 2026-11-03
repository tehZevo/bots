import type { Command } from "commander";
import { type Ctx, request } from "../http.ts";
import { CliError, EXIT, out, warn } from "../output.ts";
import { confirm } from "../safety.ts";
import { printList, printOne, readValue, resolveId } from "../util.ts";

type Opts = Record<string, string | string[] | boolean | undefined>;
type MakeCtx = () => Ctx & { quiet: boolean; yes: boolean };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseTimeout(value: string): number {
  const match = /^(\d+)(s|m|h)?$/.exec(value);
  if (!match) throw new CliError(`bad timeout '${value}'`, EXIT.usage);
  const unit = match[2] === "m" ? 60_000 : match[2] === "h" ? 3_600_000 : 1000;
  return Number(match[1]) * unit;
}

async function botRef(ctx: Ctx, ref: string): Promise<string> {
  return resolveId(ctx, "/api/bots", ref);
}

function botBody(opts: Opts, partial: boolean): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  const set = (key: string, flag: string): void => {
    if (opts[flag] !== undefined && opts[flag] !== false)
      body[key] = opts[flag];
  };
  if (!partial || opts.name !== undefined) set("name", "name");
  if (!partial || opts.instructions !== undefined)
    set("instructions", "instructions");
  set("model", "model");
  set("role_id", "role");
  set("machine_id", "machine");
  set("avatar_shape", "avatarShape");
  set("avatar_color", "avatarColor");
  set("sound", "sound");
  if (opts.disabled === true) body.enabled = false;
  if (partial && opts.enable === true) body.enabled = true;
  if (partial && opts.disable === true) body.enabled = false;
  if (partial && opts.clearRole === true) body.role_id = null;
  if (partial && opts.clearMachine === true) body.machine_id = null;
  if (partial && opts.clearModel === true) body.model = null;
  return body;
}

async function applyProjects(
  ctx: Ctx,
  botId: string,
  projects: string[] | undefined,
): Promise<void> {
  if (projects === undefined) return;
  const ids: string[] = [];
  for (const ref of projects)
    ids.push(await resolveId(ctx, "/api/projects", ref));
  await request(ctx, "PATCH", `/api/bots/${botId}`, {
    body: { project_ids: ids },
  });
}

async function messageText(opts: Opts): Promise<string | undefined> {
  const text = await readValue(opts.message as string | undefined);
  const file = await readValue(opts.messageFile as string | undefined);
  if (text !== undefined && file !== undefined)
    throw new CliError(
      "--message and --message-file are mutually exclusive",
      2,
    );
  return file ?? text;
}

async function followRun(
  make: MakeCtx,
  botId: string,
  runId: string,
  timeout: string | undefined,
): Promise<void> {
  const deadline = timeout ? Date.now() + parseTimeout(timeout) : undefined;
  let delay = 2000;
  for (;;) {
    await sleep(delay);
    let runs: Record<string, unknown>[];
    try {
      const c = make();
      const res = await request(c, "GET", `/api/bots/${botId}/runs`);
      runs = res.body as Record<string, unknown>[];
      delay = 2000;
    } catch (err) {
      delay = Math.min(delay * 2, 30_000);
      warn(err instanceof Error ? err.message : String(err));
      continue;
    }
    const run = runs.find((r) => r.id === runId);
    if (!run) throw new CliError(`run ${runId} not found`, EXIT.notFound);
    if (run.status === "ok" || run.status === "error") {
      const c = make();
      const t = await request(
        c,
        "GET",
        `/api/bots/${botId}/runs/${runId}/transcript`,
      );
      out(JSON.stringify(t.body, null, 2));
      if (run.status === "error")
        throw new CliError(String(run.error ?? "run failed"), EXIT.unexpected);
      return;
    }
    if (deadline && Date.now() > deadline)
      throw new CliError(`run ${runId} still running after ${timeout}`, 1);
  }
}

export function registerBots(program: Command, make: MakeCtx): void {
  const bot = program.command("bot").description("bot management");

  const list = (cmd: Command): void => {
    cmd.description("list bots").action(async () => {
      const c = make();
      const res = await request(c, "GET", "/api/bots");
      printList(c.quiet, res.body as Record<string, unknown>[], {
        id: (r: never) => (r as Record<string, unknown>).id,
        name: (r: never) => (r as Record<string, unknown>).name,
        health: (r: never) => (r as Record<string, unknown>).status,
        run: (r: never) => (r as Record<string, unknown>).current_task,
        role: (r: never) => (r as Record<string, unknown>).role_name,
        machine: (r: never) => (r as Record<string, unknown>).machine_id,
        enabled: (r: never) => (r as Record<string, unknown>).enabled,
      });
    });
  };
  list(bot.command("list").alias("ls"));

  bot
    .command("get <bot>")
    .description("show one bot by name or id")
    .action(async (ref: string) => {
      const c = make();
      const id = await botRef(c, ref);
      const res = await request(c, "GET", `/api/bots/${id}`);
      printOne(c.quiet, res.body as Record<string, unknown>, [
        "id",
        "name",
        "instructions",
        "model",
        "role_id",
        "machine_id",
        "enabled",
        "project_ids",
      ]);
    });

  const create = (cmd: Command): void => {
    cmd
      .description("create a bot")
      .option("--name <name>")
      .option("--instructions <text>")
      .option("--instructions-file <path>")
      .option("--model <model>")
      .option("--role <role>")
      .option("--machine <machine>")
      .option("--avatar-shape <shape>")
      .option("--avatar-color <color>")
      .option("--sound <sound>")
      .option("--disabled")
      .option("--project <project...>")
      .option("--file <path>", "body json, or - for stdin")
      .action(async (opts: Opts) => {
        const c = make();
        let body: Record<string, unknown>;
        if (opts.file !== undefined) {
          const raw = await readValue(String(opts.file));
          for (const flag of [
            "name",
            "instructions",
            "model",
            "role",
            "machine",
          ])
            if (opts[flag] !== undefined)
              throw new CliError(
                `--file and --${flag} are mutually exclusive`,
                EXIT.usage,
              );
          body = JSON.parse(raw ?? "{}");
        } else {
          body = botBody(opts, false);
          const instructions = await readValue(
            opts.instructionsFile as string | undefined,
          );
          if (instructions !== undefined) body.instructions = instructions;
          if (typeof body.name !== "string" || !body.name)
            throw new CliError("--name is required", EXIT.usage);
        }
        if (body.role_id)
          body.role_id = await resolveId(c, "/api/roles", String(body.role_id));
        if (body.machine_id)
          body.machine_id = await resolveId(
            c,
            "/api/machines",
            String(body.machine_id),
          );
        const res = await request(c, "POST", "/api/bots", { body });
        const row = res.body as { id: string };
        if (opts.project !== undefined) {
          try {
            await applyProjects(c, row.id, opts.project as string[]);
          } catch (err) {
            warn(
              `bot ${row.id} created but projects failed: ${err instanceof Error ? err.message : err}`,
            );
          }
        }
        printOne(c.quiet, row, ["id", "name"]);
      });
  };
  create(bot.command("create").alias("new"));

  const update = (cmd: Command): void => {
    cmd
      .description("update a bot")
      .option("--name <name>")
      .option("--instructions <text>")
      .option("--instructions-file <path>")
      .option("--model <model>")
      .option("--role <role>")
      .option("--machine <machine>")
      .option("--avatar-shape <shape>")
      .option("--avatar-color <color>")
      .option("--sound <sound>")
      .option("--enable")
      .option("--disable")
      .option("--clear-role")
      .option("--clear-machine")
      .option("--clear-model")
      .option("--project <project...>")
      .option("--clear-projects")
      .option("--file <path>", "body json, or - for stdin")
      .action(async (ref: string, opts: Opts) => {
        const c = make();
        const id = await botRef(c, ref);
        let body: Record<string, unknown>;
        if (opts.file !== undefined) {
          body = JSON.parse((await readValue(String(opts.file))) ?? "{}");
        } else {
          body = botBody(opts, true);
          const instructions = await readValue(
            opts.instructionsFile as string | undefined,
          );
          if (instructions !== undefined) body.instructions = instructions;
          if (opts.role)
            body.role_id = await resolveId(c, "/api/roles", String(opts.role));
          if (opts.machine)
            body.machine_id = await resolveId(
              c,
              "/api/machines",
              String(opts.machine),
            );
        }
        const res = await request(c, "PATCH", `/api/bots/${id}`, { body });
        if (opts.clearProjects === true)
          await request(c, "PATCH", `/api/bots/${id}`, {
            body: { project_ids: [] },
          });
        else if (opts.project !== undefined)
          await applyProjects(c, id, opts.project as string[]);
        printOne(c.quiet, res.body as Record<string, unknown>, ["id", "name"]);
      });
  };
  update(bot.command("update").alias("edit"));

  bot
    .command("delete <bot>")
    .description("delete a bot")
    .action(async (ref: string) => {
      const c = make();
      const id = await botRef(c, ref);
      await confirm(
        `delete bot ${ref}`,
        "removes the bot and its history",
        c.yes,
      );
      await request(c, "DELETE", `/api/bots/${id}`);
      out(id);
    });

  bot
    .command("restart-machine <bot>")
    .description("recreate the bot's container, interrupting any live run")
    .action(async (ref: string) => {
      const c = make();
      const id = await botRef(c, ref);
      await confirm(
        `restart machine for ${ref}`,
        "interrupts any live run",
        c.yes,
      );
      const res = await request(c, "POST", `/api/bots/${id}/restart-machine`);
      out(JSON.stringify(res.body));
    });

  bot
    .command("teams <bot>")
    .description("list the teams a bot belongs to")
    .action(async (ref: string) => {
      const c = make();
      const id = await botRef(c, ref);
      const res = await request(c, "GET", "/api/teams");
      const rows = (res.body as Record<string, unknown>[]).filter((team) =>
        ((team.members ?? []) as Record<string, unknown>[]).some(
          (m) => m.bot_id === id,
        ),
      );
      printList(c.quiet, rows, {
        id: (r: never) => (r as Record<string, unknown>).id,
        name: (r: never) => (r as Record<string, unknown>).name,
        leader: (r: never) =>
          (
            (r as Record<string, unknown>).members as Record<string, unknown>[]
          ).find((m) => m.bot_id === id)?.leader ?? false,
      });
    });

  const run = program.command("run").description("runs");

  run
    .command("now <bot>")
    .description("start a run")
    .option("--message <text>")
    .option("--message-file <path>")
    .option("--follow")
    .option("--timeout <duration>", "e.g. 30m", undefined)
    .action(async (ref: string, opts: Opts) => {
      const c = make();
      const id = await botRef(c, ref);
      const text = await messageText(opts);
      const res = await request(c, "POST", `/api/bots/${id}/run`, {
        body: text === undefined ? {} : { message: text },
      });
      const { runId, steered } = res.body as {
        runId: string;
        steered: boolean;
      };
      if (c.quiet) out(runId);
      else out(`run ${runId}${steered ? " (steered)" : ""}`);
      if (opts.follow === true)
        await followRun(make, id, runId, opts.timeout as string | undefined);
    });

  run
    .command("list <bot>")
    .description("list recent runs")
    .option("--limit <n>", "max rows", "20")
    .action(async (ref: string, opts: Opts) => {
      const c = make();
      const id = await botRef(c, ref);
      const res = await request(c, "GET", `/api/bots/${id}/runs`);
      const rows = (res.body as Record<string, unknown>[]).slice(
        0,
        Number(opts.limit),
      );
      printList(c.quiet, rows, {
        id: (r: never) => (r as Record<string, unknown>).id,
        status: (r: never) => (r as Record<string, unknown>).status,
        started: (r: never) => (r as Record<string, unknown>).started_at,
        trigger: (r: never) => (r as Record<string, unknown>).trigger,
        output: (r: never) =>
          String((r as Record<string, unknown>).output ?? "").slice(0, 60),
      });
    });

  run
    .command("show <bot> <runId>")
    .description("show one run")
    .action(async (ref: string, runId: string) => {
      const c = make();
      const id = await botRef(c, ref);
      const res = await request(c, "GET", `/api/bots/${id}/runs`);
      const run = (res.body as Record<string, unknown>[]).find(
        (r) => r.id === runId,
      );
      if (!run) throw new CliError(`run ${runId} not found`, EXIT.notFound);
      printOne(c.quiet, run, [
        "id",
        "status",
        "trigger",
        "started_at",
        "finished_at",
        "error",
        "output",
      ]);
    });

  run
    .command("logs <bot>")
    .description("print terminal runs, then poll for new ones")
    .option("--follow", "keep polling until Ctrl-C")
    .action(async (ref: string, opts: Opts) => {
      const c = make();
      const id = await botRef(c, ref);
      const seen = new Set<string>();
      const emit = async (): Promise<void> => {
        const res = await request(c, "GET", `/api/bots/${id}/runs`);
        for (const r of (res.body as Record<string, unknown>[]).reverse()) {
          if (r.status === "running" || seen.has(String(r.id))) continue;
          seen.add(String(r.id));
          out(
            `${r.id} ${r.status} ${String(r.output ?? r.error ?? "").slice(0, 120)}`,
          );
        }
      };
      await emit();
      if (opts.follow !== true) return;
      try {
        for (;;) {
          await sleep(2000);
          await emit();
        }
      } catch {
        process.exit(0);
      }
    });

  run
    .command("interrupt <bot>")
    .description("interrupt the live run")
    .action(async (ref: string) => {
      const c = make();
      const id = await botRef(c, ref);
      const res = await request(c, "POST", `/api/bots/${id}/interrupt`);
      out(JSON.stringify(res.body));
    });

  const message = program.command("message").description("chat messages");

  message
    .command("list <bot>")
    .description("list recent messages")
    .option("--limit <n>", "max rows", "50")
    .action(async (ref: string, opts: Opts) => {
      const c = make();
      const id = await botRef(c, ref);
      const res = await request(c, "GET", `/api/bots/${id}/messages`);
      const rows = (res.body as Record<string, unknown>[]).slice(
        0,
        Number(opts.limit),
      );
      printList(c.quiet, rows, {
        id: (r: never) => (r as Record<string, unknown>).id,
        role: (r: never) => (r as Record<string, unknown>).role,
        text: (r: never) =>
          String((r as Record<string, unknown>).content ?? "").slice(0, 80),
      });
    });

  message
    .command("send <bot>")
    .description("send a chat message")
    .option("--text <text>")
    .option("--file <path>", "message text from file, or - for stdin")
    .action(async (ref: string, opts: Opts) => {
      const c = make();
      const id = await botRef(c, ref);
      const text =
        (await readValue(opts.file as string | undefined)) ??
        (opts.text as string | undefined);
      if (!text) throw new CliError("--text or --file is required", EXIT.usage);
      const res = await request(c, "POST", `/api/bots/${id}/messages`, {
        body: { text },
      });
      const { runId, steered } = res.body as {
        runId: string | null;
        steered: boolean;
      };
      out(
        c.quiet
          ? String(runId ?? "")
          : `run ${runId ?? "held"}${steered ? " (steered)" : ""}`,
      );
    });

  message
    .command("clear <bot>")
    .description("clear the bot's memory")
    .action(async (ref: string) => {
      const c = make();
      const id = await botRef(c, ref);
      await confirm(`clear messages of ${ref}`, "resets runtime state", c.yes);
      await request(c, "DELETE", `/api/bots/${id}/messages`);
      out(id);
    });
}
