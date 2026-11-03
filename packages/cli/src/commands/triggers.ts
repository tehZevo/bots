import type { Command } from "commander";
import { configPath, readConfig } from "../config.ts";
import { type Ctx, request } from "../http.ts";
import { CliError, EXIT, out } from "../output.ts";
import { confirm } from "../safety.ts";
import { printList, printOne, readValue, resolveId } from "../util.ts";

type Opts = Record<string, string | string[] | boolean | undefined>;
type MakeCtx = () => Ctx & { quiet: boolean; yes: boolean };

function triggerRow(t: Record<string, unknown>): Record<string, unknown> {
  return {
    id: t.id,
    kind: t.kind,
    name: t.name ?? "",
    message: String(t.message ?? "").slice(0, 60),
    schedule: t.schedule ?? t.url ?? "",
    enabled: t.enabled,
    next_run: t.next_run ?? "",
  };
}

// specs/cli/triggers.md — firing works without a stored API key; only the
// server url is needed, and it comes from the same places as everything else.
function webhookUrl(): string {
  const url = process.env.BOTS_URL || readConfig(configPath()).url || "";
  if (!url)
    throw new CliError(
      "no server url: pass --url, set BOTS_URL, or log in first",
      EXIT.auth,
    );
  return url.replace(/\/+$/, "");
}

export function registerTriggers(program: Command, make: MakeCtx): void {
  const trigger = program.command("trigger").description("triggers");

  trigger
    .command("list <bot>")
    .description("list a bot's triggers (secrets never printed)")
    .action(async (ref: string) => {
      const c = make();
      const botId = await resolveId(c, "/api/bots", ref);
      const res = await request(c, "GET", `/api/bots/${botId}/triggers`);
      const rows = (res.body as Record<string, unknown>[]).map(triggerRow);
      printList(c.quiet, rows, {
        id: (r: never) => (r as Record<string, unknown>).id,
        kind: (r: never) => (r as Record<string, unknown>).kind,
        name: (r: never) => (r as Record<string, unknown>).name,
        message: (r: never) => (r as Record<string, unknown>).message,
        schedule: (r: never) => (r as Record<string, unknown>).schedule,
        enabled: (r: never) => (r as Record<string, unknown>).enabled,
        next_run: (r: never) => (r as Record<string, unknown>).next_run,
      });
    });

  trigger
    .command("create <bot>")
    .description("create a trigger")
    .option("--message <text>", "trigger message", undefined)
    .option("--kind <kind>", "schedule|webhook", "schedule")
    .option("--name <name>")
    .option("--schedule <expr>")
    .action(async (ref: string, opts: Opts) => {
      const c = make();
      const kind = String(opts.kind);
      if (kind !== "schedule" && kind !== "webhook")
        throw new CliError("--kind must be schedule or webhook", EXIT.usage);
      if (kind === "webhook" && opts.schedule !== undefined)
        throw new CliError("--kind webhook forbids --schedule", EXIT.usage);
      if (kind === "schedule" && opts.schedule === undefined)
        throw new CliError("--schedule is required for schedule triggers", 2);
      const body: Record<string, unknown> = {
        kind,
        message: opts.message ?? "",
      };
      if (opts.name !== undefined) body.name = opts.name;
      if (opts.schedule !== undefined) body.schedule = opts.schedule;
      const botId = await resolveId(c, "/api/bots", ref);
      const res = await request(c, "POST", `/api/bots/${botId}/triggers`, {
        body,
      });
      const row = res.body as Record<string, unknown>;
      const secret = (row.secret as string | null | undefined) ?? undefined;
      const url = (row.url as string | null | undefined) ?? undefined;
      delete row.secret;
      printOne(c.quiet, triggerRow(row), [
        "id",
        "kind",
        "name",
        "schedule",
        "enabled",
      ]);
      if (secret !== undefined) {
        out(`secret: ${secret}`);
        if (url !== undefined) out(`url: ${url}`);
      }
    });

  trigger
    .command("update <triggerId>")
    .description("update a trigger")
    .option("--message <text>")
    .option("--name <name>")
    .option("--clear-name")
    .option("--schedule <expr>")
    .option("--enable")
    .option("--disable")
    .action(async (id: string, opts: Opts) => {
      const c = make();
      const body: Record<string, unknown> = {};
      if (opts.message !== undefined) body.message = opts.message;
      if (opts.name !== undefined) body.name = opts.name;
      if (opts.clearName === true) body.name = null;
      if (opts.schedule !== undefined) body.schedule = opts.schedule;
      if (opts.enable === true) body.enabled = true;
      if (opts.disable === true) body.enabled = false;
      const res = await request(c, "PATCH", `/api/triggers/${id}`, { body });
      printOne(c.quiet, triggerRow(res.body as Record<string, unknown>), [
        "id",
        "kind",
        "name",
        "schedule",
        "enabled",
      ]);
    });

  trigger
    .command("delete <triggerId>")
    .description("delete a trigger")
    .action(async (id: string) => {
      const c = make();
      await confirm(`delete trigger ${id}`, undefined, c.yes);
      await request(c, "DELETE", `/api/triggers/${id}`);
      out(id);
    });

  trigger
    .command("rotate-secret <triggerId>")
    .description("rotate a webhook secret (printed once)")
    .action(async (id: string) => {
      const c = make();
      await confirm(
        `rotate secret of ${id}`,
        "invalidates the old secret",
        c.yes,
      );
      const res = await request(c, "POST", `/api/triggers/${id}/rotate-secret`);
      const row = res.body as Record<string, unknown>;
      out(c.quiet ? String(row.secret ?? "") : `secret: ${row.secret}`);
    });

  trigger
    .command("fire <triggerId>")
    .description("fire a webhook with its secret")
    .option("--secret <value>")
    .option("--secret-stdin", "read the secret from stdin")
    .option("--body <text>")
    .option("--file <path>", "body from file, or - for stdin")
    .action(async (id: string, opts: Opts) => {
      const secret = opts.secretStdin
        ? ((await readValue("-")) ?? "")
        : ((opts.secret as string | undefined) ?? "");
      if (!secret)
        throw new CliError(
          "--secret or --secret-stdin is required",
          EXIT.usage,
        );
      const body =
        (await readValue(opts.file as string | undefined)) ??
        (opts.body as string | undefined);
      const url = webhookUrl();
      const res = await fetch(`${url}/api/webhooks/${id}`, {
        method: "POST",
        headers: { authorization: `Bearer ${secret}` },
        body,
      }).catch((err: Error) => {
        throw new CliError(`network error: ${err.message}`, EXIT.unexpected);
      });
      const text = await res.text();
      if (!res.ok) throw new CliError(`${res.status} ${text}`, EXIT.unexpected);
      out(text.trim());
    });
}
