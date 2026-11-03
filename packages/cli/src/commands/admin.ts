import type { Command } from "commander";
import { request } from "../http.ts";
import { CliError, EXIT, out } from "../output.ts";
import { confirm } from "../safety.ts";
import type { MakeCtx } from "../types.ts";
import {
  printList,
  printOne,
  readValue,
  resolveId,
  resolveRef,
} from "../util.ts";

type Opts = Record<string, string | string[] | boolean | undefined>;

export function registerAdmin(program: Command, make: MakeCtx): void {
  const provider = program.command("provider").description("model providers");

  provider
    .command("list")
    .description("list providers (keys never printed)")
    .action(async () => {
      const c = make();
      const res = await request(c, "GET", "/api/providers");
      const rows = (res.body as Record<string, unknown>[]).map((row) => ({
        id: row.id,
        name: row.name,
        base_url: row.base_url,
        models: row.models,
      }));
      printList(c.quiet, rows, {
        id: (r: never) => (r as Record<string, unknown>).id,
        name: (r: never) => (r as Record<string, unknown>).name,
        base_url: (r: never) => (r as Record<string, unknown>).base_url,
        models: (r: never) => (r as Record<string, unknown>).models,
      });
    });

  provider
    .command("get <ref>")
    .description("show one provider")
    .action(async (ref: string) => {
      const c = make();
      const row = await resolveRef(c, "/api/providers", ref);
      const { api_key: _key, ...rest } = row;
      printOne(c.quiet, rest, ["id", "name", "base_url", "models"]);
    });

  provider
    .command("create")
    .description("create a provider")
    .option("--name <name>")
    .option("--base-url <url>")
    .option("--api-key <key>")
    .option("--api-key-stdin", "read the key from stdin")
    .option("--model <model...>")
    .action(async (opts: Opts) => {
      const c = make();
      if (!opts.name || !opts.baseUrl)
        throw new CliError("--name and --base-url are required", EXIT.usage);
      const body: Record<string, unknown> = {
        name: opts.name,
        base_url: opts.baseUrl,
      };
      const key = opts.apiKeyStdin
        ? await readValue("-")
        : (opts.apiKey as string | undefined);
      if (key !== undefined) body.api_key = key;
      if (opts.model !== undefined) body.models = opts.model;
      const res = await request(c, "POST", "/api/providers", { body });
      printOne(c.quiet, res.body as Record<string, unknown>, ["id", "name"]);
    });

  provider
    .command("update <ref>")
    .description("update a provider (omitted flags keep current values)")
    .option("--name <name>")
    .option("--base-url <url>")
    .option("--api-key <key>")
    .option("--api-key-stdin")
    .option("--model <model...>")
    .action(async (ref: string, opts: Opts) => {
      const c = make();
      const current = await resolveRef(c, "/api/providers", ref);
      const body: Record<string, unknown> = {
        name: opts.name ?? current.name,
        base_url: opts.baseUrl ?? current.base_url,
        models: opts.model ?? current.models,
      };
      const key = opts.apiKeyStdin
        ? await readValue("-")
        : (opts.apiKey as string | undefined);
      if (key !== undefined) body.api_key = key;
      const res = await request(c, "PUT", `/api/providers/${current.id}`, {
        body,
      });
      printOne(c.quiet, res.body as Record<string, unknown>, ["id", "name"]);
    });

  provider
    .command("delete <ref>")
    .description("delete a provider")
    .action(async (ref: string) => {
      const c = make();
      const id = await resolveId(c, "/api/providers", ref);
      await confirm(`delete provider ${ref}`, undefined, c.yes);
      await request(c, "DELETE", `/api/providers/${id}`);
      out(id);
    });

  provider
    .command("detect")
    .description("list models offered by a base url")
    .option("--base-url <url>")
    .option("--api-key <key>")
    .option("--api-key-stdin")
    .option("--id <id>", "existing provider id")
    .action(async (opts: Opts) => {
      const c = make();
      if (!opts.baseUrl && !opts.id)
        throw new CliError("--base-url or --id is required", EXIT.usage);
      const body: Record<string, unknown> = {};
      if (opts.baseUrl) body.base_url = opts.baseUrl;
      if (opts.id) body.id = opts.id;
      const key = opts.apiKeyStdin
        ? await readValue("-")
        : (opts.apiKey as string | undefined);
      if (key !== undefined) body.api_key = key;
      const res = await request(c, "POST", "/api/providers/detect", { body });
      const row = res.body as { models?: string[] };
      for (const model of [...(row.models ?? [])].sort()) out(model);
    });

  const setting = program.command("setting").description("server settings");

  setting
    .command("get")
    .description("print current settings")
    .action(async () => {
      const c = make();
      const res = await request(c, "GET", "/api/settings");
      out(JSON.stringify(res.body, null, 2));
    });

  setting
    .command("set")
    .description("update settings")
    .option("--default-provider <provider>")
    .option("--default-model <model>")
    .option("--idle-minutes <n>")
    .option("--control-mcp <on|off>")
    .option("--clear-default-provider")
    .option("--clear-default-model")
    .action(async (opts: Opts) => {
      const c = make();
      const body: Record<string, unknown> = {};
      if (opts.defaultProvider)
        body.default_provider_id = await resolveId(
          c,
          "/api/providers",
          String(opts.defaultProvider),
        );
      if (opts.defaultModel) body.default_model = opts.defaultModel;
      if (opts.idleMinutes !== undefined) {
        const n = Number(opts.idleMinutes);
        if (!Number.isInteger(n) || n < 0 || n > 1440)
          throw new CliError("--idle-minutes must be 0-1440", EXIT.usage);
        body.idle_minutes = n;
      }
      if (opts.controlMcp !== undefined) {
        if (opts.controlMcp !== "on" && opts.controlMcp !== "off")
          throw new CliError("--control-mcp must be on or off", EXIT.usage);
        body.control_mcp = opts.controlMcp === "on";
      }
      if (opts.clearDefaultProvider === true) body.default_provider_id = null;
      if (opts.clearDefaultModel === true) body.default_model = null;
      if (Object.keys(body).length === 0)
        throw new CliError("no settings supplied", EXIT.usage);
      const res = await request(c, "PUT", "/api/settings", { body });
      out(JSON.stringify(res.body, null, 2));
    });

  const key = program.command("key").description("api keys");

  key
    .command("list")
    .description("list api keys")
    .action(async () => {
      const c = make();
      const res = await request(c, "GET", "/api/api-keys");
      printList(c.quiet, res.body as Record<string, unknown>[], {
        id: (r: never) => (r as Record<string, unknown>).id,
        name: (r: never) => (r as Record<string, unknown>).name,
        created_at: (r: never) => (r as Record<string, unknown>).created_at,
      });
    });

  key
    .command("create")
    .description("create an api key (value printed once)")
    .option("--name <name>")
    .action(async (opts: Opts) => {
      const c = make();
      if (!opts.name) throw new CliError("--name is required", EXIT.usage);
      const res = await request(c, "POST", "/api/api-keys", {
        body: { name: opts.name },
      });
      const row = res.body as Record<string, unknown>;
      if (c.quiet) out(String(row.value ?? ""));
      else {
        out(`id: ${row.id}`);
        out(`value: ${row.value}`);
      }
    });

  key
    .command("revoke <keyId>")
    .description("revoke an api key")
    .action(async (id: string) => {
      const c = make();
      await confirm(`revoke key ${id}`, undefined, c.yes);
      await request(c, "DELETE", `/api/api-keys/${id}`);
      out(id);
    });

  const notification = program
    .command("notification")
    .description("in-app notifications");

  notification
    .command("list")
    .description("list notifications")
    .option("--limit <n>", "max rows (1-250)", "100")
    .option("--unread", "only unread")
    .action(async (opts: Opts) => {
      const c = make();
      const limit = Number(opts.limit);
      const res = await request(c, "GET", `/api/notifications?limit=${limit}`);
      let rows = res.body as Record<string, unknown>[];
      if (opts.unread === true) rows = rows.filter((n) => !n.read);
      printList(c.quiet, rows, {
        id: (r: never) => (r as Record<string, unknown>).id,
        kind: (r: never) => (r as Record<string, unknown>).kind,
        title: (r: never) => (r as Record<string, unknown>).title,
        read: (r: never) => (r as Record<string, unknown>).read,
        created_at: (r: never) => (r as Record<string, unknown>).created_at,
      });
    });

  notification
    .command("read <id>")
    .description("mark one notification read")
    .action(async (id: string) => {
      const c = make();
      const res = await request(c, "POST", `/api/notifications/${id}/read`);
      out(JSON.stringify(res.body));
    });

  notification
    .command("read-all")
    .description("mark all notifications read")
    .action(async () => {
      const c = make();
      const res = await request(c, "POST", "/api/notifications/read-all");
      out(JSON.stringify(res.body));
    });
}
