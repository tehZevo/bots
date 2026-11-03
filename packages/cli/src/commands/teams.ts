import type { Command } from "commander";
import { type Ctx, request } from "../http.ts";
import { CliError, EXIT, out } from "../output.ts";
import { confirm } from "../safety.ts";
import { printList, printOne, readValue, resolveId } from "../util.ts";

type Opts = Record<string, string | string[] | boolean | undefined>;
type MakeCtx = () => Ctx & { quiet: boolean; yes: boolean };

export function registerTeams(program: Command, make: MakeCtx): void {
  const team = program.command("team").description("teams");

  team
    .command("list")
    .description("list teams")
    .action(async () => {
      const c = make();
      const res = await request(c, "GET", "/api/teams");
      printList(c.quiet, res.body as Record<string, unknown>[], {
        id: (r: never) => (r as Record<string, unknown>).id,
        name: (r: never) => (r as Record<string, unknown>).name,
        members: (r: never) =>
          ((r as Record<string, unknown>).members as unknown[])?.length ?? 0,
      });
    });

  team
    .command("get <team>")
    .description("show one team")
    .action(async (ref: string) => {
      const c = make();
      const id = await resolveId(c, "/api/teams", ref);
      const res = await request(c, "GET", `/api/teams/${id}`);
      out(JSON.stringify(res.body, null, 2));
    });

  team
    .command("create")
    .description("create a team")
    .option("--name <name>")
    .action(async (opts: Opts) => {
      const c = make();
      if (!opts.name) throw new CliError("--name is required", EXIT.usage);
      const res = await request(c, "POST", "/api/teams", {
        body: { name: opts.name },
      });
      printOne(c.quiet, res.body as Record<string, unknown>, ["id", "name"]);
    });

  team
    .command("update <team>")
    .description("rename a team")
    .option("--name <name>")
    .action(async (ref: string, opts: Opts) => {
      const c = make();
      const id = await resolveId(c, "/api/teams", ref);
      if (!opts.name) throw new CliError("--name is required", EXIT.usage);
      const res = await request(c, "PATCH", `/api/teams/${id}`, {
        body: { name: opts.name },
      });
      printOne(c.quiet, res.body as Record<string, unknown>, ["id", "name"]);
    });

  team
    .command("delete <team>")
    .description("delete a team (member bots are untouched)")
    .action(async (ref: string) => {
      const c = make();
      const id = await resolveId(c, "/api/teams", ref);
      await confirm(`delete team ${ref}`, "member bots are untouched", c.yes);
      await request(c, "DELETE", `/api/teams/${id}`);
      out(id);
    });

  const member = team.command("member").description("team membership");

  member
    .command("set <team> <bot>")
    .description("add or update a member")
    .option("--leader")
    .option("--no-leader")
    .action(async (teamRef: string, botRef: string, opts: Opts) => {
      const c = make();
      const teamId = await resolveId(c, "/api/teams", teamRef);
      const botId = await resolveId(c, "/api/bots", botRef);
      const res = await request(c, "PUT", `/api/teams/${teamId}/members`, {
        body: {
          bot_id: botId,
          leader: opts.leader === true,
        },
      });
      out(JSON.stringify(res.body, null, 2));
    });

  member
    .command("remove <team> <bot>")
    .description("remove a member")
    .action(async (teamRef: string, botRef: string) => {
      const c = make();
      const teamId = await resolveId(c, "/api/teams", teamRef);
      const botId = await resolveId(c, "/api/bots", botRef);
      await confirm(`remove ${botRef} from ${teamRef}`, undefined, c.yes);
      const res = await request(
        c,
        "DELETE",
        `/api/teams/${teamId}/members/${botId}`,
      );
      out(JSON.stringify(res.body, null, 2));
    });

  const machine = program.command("machine").description("machines");

  machine
    .command("list")
    .description("list machines")
    .action(async () => {
      const c = make();
      const res = await request(c, "GET", "/api/machines");
      printList(c.quiet, res.body as Record<string, unknown>[], {
        id: (r: never) => (r as Record<string, unknown>).id,
        name: (r: never) => (r as Record<string, unknown>).name,
        description: (r: never) => (r as Record<string, unknown>).description,
      });
    });

  machine
    .command("get <machine>")
    .description("show one machine")
    .action(async (ref: string) => {
      const c = make();
      const res = await request(c, "GET", "/api/machines");
      const row = (res.body as Record<string, unknown>[]).find(
        (m) => m.id === ref || m.name === ref,
      );
      if (!row) throw new CliError(`no machine '${ref}'`, EXIT.notFound);
      printOne(c.quiet, row, ["id", "name", "description", "dockerfile"]);
    });

  machine
    .command("create")
    .description("create a machine")
    .option("--name <name>")
    .option("--description <text>")
    .option("--dockerfile <text>")
    .option("--dockerfile-file <path>")
    .action(async (opts: Opts) => {
      const c = make();
      const dockerfile =
        (await readValue(opts.dockerfileFile as string | undefined)) ??
        (opts.dockerfile as string | undefined);
      if (!opts.name || !dockerfile)
        throw new CliError("--name and --dockerfile are required", EXIT.usage);
      const body: Record<string, unknown> = {
        name: opts.name,
        dockerfile,
      };
      if (opts.description !== undefined) body.description = opts.description;
      const res = await request(c, "POST", "/api/machines", { body });
      printOne(c.quiet, res.body as Record<string, unknown>, ["id", "name"]);
    });

  machine
    .command("update <machine>")
    .description("update a machine (not the default)")
    .option("--name <name>")
    .option("--description <text>")
    .option("--dockerfile <text>")
    .option("--dockerfile-file <path>")
    .action(async (ref: string, opts: Opts) => {
      const c = make();
      const id = await resolveId(c, "/api/machines", ref);
      const body: Record<string, unknown> = {};
      if (opts.name !== undefined) body.name = opts.name;
      if (opts.description !== undefined) body.description = opts.description;
      const dockerfile = await readValue(
        opts.dockerfileFile as string | undefined,
      );
      if (dockerfile !== undefined) body.dockerfile = dockerfile;
      else if (opts.dockerfile !== undefined) body.dockerfile = opts.dockerfile;
      const res = await request(c, "PATCH", `/api/machines/${id}`, { body });
      printOne(c.quiet, res.body as Record<string, unknown>, ["id", "name"]);
    });

  machine
    .command("delete <machine>")
    .description("delete a machine")
    .action(async (ref: string) => {
      const c = make();
      const id = await resolveId(c, "/api/machines", ref);
      await confirm(`delete machine ${ref}`, undefined, c.yes);
      await request(c, "DELETE", `/api/machines/${id}`);
      out(id);
    });

  machine
    .command("rebuild <machine>")
    .description("rebuild a machine image")
    .action(async (ref: string) => {
      const c = make();
      const id = await resolveId(c, "/api/machines", ref);
      const res = await request(c, "POST", `/api/machines/${id}/rebuild`);
      const row = res.body as Record<string, unknown>;
      out(JSON.stringify(row, null, 2));
      if (row.build_error)
        throw new CliError(String(row.build_error), EXIT.unexpected);
    });

  machine
    .command("repull")
    .description("repull the default machine image")
    .action(async () => {
      const c = make();
      const res = await request(c, "POST", "/api/machines/default/repull");
      out(JSON.stringify(res.body));
    });
}
