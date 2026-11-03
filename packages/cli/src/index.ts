#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import {
  loginWithApiKey,
  loginWithDevice,
  loginWithPassword,
  logout,
  showStatus,
  signupAndLogin,
} from "./auth.ts";
import { registerAdmin } from "./commands/admin.ts";
import { registerBots } from "./commands/bots.ts";
import { registerContent } from "./commands/content.ts";
import { registerTeams } from "./commands/teams.ts";
import { registerTriggers } from "./commands/triggers.ts";
import { configPath, resolveTarget } from "./config.ts";
import { checkOriginPath, parseHeaders, request } from "./http.ts";
import { CliError, EXIT, fail, out, setColorEnabled, style } from "./output.ts";
import { prompt, promptHidden } from "./safety.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
  readFileSync(path.join(here, "..", "package.json"), "utf8"),
) as { version: string };

const program = new Command();

program
  .name("bots")
  .description("Command-line client for the bots REST API")
  .version(pkg.version, "--version", "print the CLI version")
  .option("--url <url>", "server url")
  .option("--api-key <key>", "api key")
  .option("--config <path>", "config file location")
  .option("--insecure", "allow plain http to non-localhost hosts")
  .option("--quiet", "print only ids")
  .option("--no-color", "disable ansi styling")
  .option("--verbose", "log method, url and status to stderr")
  .option("--yes", "skip destructive confirmations");

program.enablePositionalOptions();

const GLOBALS: [string, string][] = [
  ["--url <url>", "server url"],
  ["--api-key <key>", "api key"],
  ["--config <path>", "config file location"],
  ["--insecure", "allow plain http to non-localhost hosts"],
  ["--quiet", "print only ids"],
  ["--no-color", "disable ansi styling"],
  ["--verbose", "log method, url and status to stderr"],
  ["--yes", "skip destructive confirmations"],
];

// Global flags are accepted before or after the subcommand name.
function applyGlobals(command: Command): void {
  for (const [flags, description] of GLOBALS) {
    if (!command.options.some((o) => o.flags === flags)) {
      command.option(flags, description);
    }
  }
  for (const child of command.commands) applyGlobals(child);
}

let currentOpts: Record<string, string | boolean | undefined> = {};

program.hook("preAction", (_thisCommand, actionCommand) => {
  currentOpts = actionCommand.optsWithGlobals() as Record<
    string,
    string | boolean | undefined
  >;
});

function globalOpts(): Record<string, string | boolean | undefined> {
  return currentOpts;
}

function ctx() {
  const opts = globalOpts();
  const target = resolveTarget({
    url: opts.url as string | undefined,
    apiKey: opts.apiKey as string | undefined,
    config: opts.config as string | undefined,
    insecure: opts.insecure === true,
  });
  return {
    ...target,
    verbose: opts.verbose === true,
    quiet: opts.quiet === true,
    yes: opts.yes === true,
  };
}

function configFlag(): string {
  return configPath(globalOpts().config as string | undefined);
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

async function readValue(
  value: string | undefined,
): Promise<string | undefined> {
  if (value === undefined) return undefined;
  if (value === "-") return (await readStdin()).replace(/\n$/, "");
  if (value.startsWith("@")) {
    return readFileSync(value.slice(1), "utf8").replace(/\n$/, "");
  }
  return value;
}

program
  .command("version")
  .description("print the CLI version")
  .action(() => out(pkg.version));

program
  .command("health")
  .description("check the configured server")
  .action(async () => {
    const c = ctx();
    const res = await request(c, "GET", "/api/health");
    out(JSON.stringify(res.body));
  });

program
  .command("openapi")
  .description("print the server's OpenAPI document")
  .action(async () => {
    const c = ctx();
    const res = await request(c, "GET", "/api/openapi.json");
    out(JSON.stringify(res.body, null, 2));
  });

program
  .command("api")
  .argument("<method>", "http method")
  .argument("<path>", "path on the configured server")
  .option("--data <json>", "request body as json")
  .option("--file <path>", "request body from file, or - for stdin")
  .option("--header <kv...>", "extra header KEY=VALUE")
  .option("--raw", "print the response bytes unchanged")
  .action(
    async (
      method: string,
      apiPath: string,
      opts: Record<string, string | string[] | boolean>,
    ) => {
      const c = ctx();
      checkOriginPath(apiPath);
      if (opts.data !== undefined && opts.file !== undefined) {
        throw new CliError(
          "--data and --file are mutually exclusive",
          EXIT.usage,
        );
      }
      let body: unknown;
      const rawBody =
        opts.data !== undefined
          ? String(opts.data)
          : opts.file !== undefined
            ? await readValue(String(opts.file))
            : undefined;
      if (rawBody !== undefined) {
        try {
          body = JSON.parse(rawBody);
        } catch {
          throw new CliError("--data/--file must be valid json", EXIT.usage);
        }
      }
      const res = await request(c, method, apiPath, {
        body,
        headers: parseHeaders(opts.header as string[] | undefined),
        raw: opts.raw === true,
      });
      if (opts.raw === true || !res.isJson) {
        process.stdout.write(res.text);
        if (!res.text.endsWith("\n")) process.stdout.write("\n");
        return;
      }
      out(JSON.stringify(res.body, null, 2));
    },
  );

const auth = program.command("auth").description("authentication");

auth
  .command("login")
  .description("log in and store an api key")
  .option("--url <url>", "server url")
  .option("--email <email>", "account email")
  .option("--password <password>", "password (prefer --password-stdin)")
  .option("--password-stdin", "read the password from stdin")
  .option("--api-key <key>", "store an existing api key")
  .option("--api-key-stdin", "read an existing api key from stdin")
  .option("--key-name <name>", "name for the minted key")
  .option("--web", "use the browser device flow")
  .option("--no-browser", "print the device code instead of opening a browser")
  .action(async (opts: Record<string, string | boolean | undefined>) => {
    const globals = globalOpts();
    const url = (opts.url ?? globals.url) as string | undefined;
    const flags = [opts.web, opts.apiKey, opts.apiKeyStdin].filter(
      Boolean,
    ).length;
    if (flags > 1) {
      throw new CliError(
        "--web, --api-key and --api-key-stdin are mutually exclusive",
        EXIT.usage,
      );
    }
    if (!url) {
      throw new CliError("--url is required for the first login", EXIT.usage);
    }
    const file = configFlag();
    let next: Awaited<ReturnType<typeof loginWithApiKey>>;
    if (opts.apiKey || opts.apiKeyStdin) {
      const key = opts.apiKeyStdin
        ? (await readStdin()).replace(/\n$/, "")
        : String(opts.apiKey);
      next = await loginWithApiKey({ url, apiKey: key });
    } else if (opts.web) {
      next = await loginWithDevice({
        url,
        openBrowser: opts.browser !== false,
        clientName: opts.keyName as string | undefined,
      });
    } else {
      const email =
        (opts.email as string | undefined) ?? (await prompt("email: "));
      const password = opts.passwordStdin
        ? (await readStdin()).replace(/\n$/, "")
        : opts.password
          ? String(opts.password)
          : await promptHidden("password: ");
      if (!email || !password) {
        throw new CliError("email and password are required", EXIT.usage);
      }
      next = await loginWithPassword({
        url,
        email,
        password,
        keyName: opts.keyName as string | undefined,
      });
    }
    const { saveLogin } = await import("./auth.ts");
    saveLogin(file, next);
    out(`logged in to ${next.url} as ${next.email}`);
  });

auth
  .command("signup")
  .description("create an account and store an api key")
  .option("--url <url>", "server url")
  .option("--email <email>", "account email")
  .option("--password <password>", "password")
  .action(async (opts: Record<string, string | undefined>) => {
    const url = opts.url ?? (globalOpts().url as string | undefined);
    if (!url) throw new CliError("--url is required", EXIT.usage);
    const email = opts.email ?? (await prompt("email: "));
    const password = opts.password ?? (await promptHidden("password: "));
    const next = await signupAndLogin({ url, email, password });
    const { saveLogin } = await import("./auth.ts");
    saveLogin(configFlag(), next);
    out(`signed up and logged in to ${next.url}`);
  });

auth
  .command("status")
  .description("show the stored credentials and verify them")
  .action(async () => {
    const c = ctx();
    await showStatus(configFlag(), c.source);
  });

auth
  .command("logout")
  .description("remove local credentials and revoke the key")
  .option("--keep-key", "leave the api key valid")
  .action(async (opts: { keepKey?: boolean }) => {
    await logout(configFlag(), opts.keepKey === true);
  });

auth
  .command("config")
  .description("print the server's auth configuration")
  .action(async () => {
    const c = ctx();
    const res = await request(c, "GET", "/api/auth/config");
    out(JSON.stringify(res.body, null, 2));
  });

program
  .command("logout")
  .description("remove local credentials and revoke the key")
  .option("--keep-key", "leave the api key valid")
  .action(async (opts: { keepKey?: boolean }) => {
    await logout(configFlag(), opts.keepKey === true);
  });

registerBots(program, ctx);
registerTriggers(program, ctx);
registerTeams(program, ctx);
registerContent(program, ctx);
registerAdmin(program, ctx);

program
  .command("status")
  .description("server url, health, account and key name")
  .action(async () => {
    const c = ctx();
    const health = await request(c, "GET", "/api/health");
    const me = await request(c, "GET", "/api/auth/me");
    const email = (me.body as { email?: string })?.email ?? c.email;
    if (c.quiet) {
      out(String(health.status));
      return;
    }
    out(`server:  ${c.url}`);
    out(`health:  ${JSON.stringify(health.body)}`);
    out(`account: ${email ?? "(unknown)"}`);
    out(`key:     ${c.keyName ?? "(unnamed)"}`);
  });

process.stdout.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EPIPE") process.exit(0);
  throw err;
});

async function main(): Promise<void> {
  await program.parseAsync(process.argv);
  const opts = currentOpts;
  setColorEnabled(opts.color !== false && !process.env.NO_COLOR);
}

applyGlobals(program);

main().catch((err: unknown) => {
  if (err instanceof CliError) {
    process.stderr.write(`${style(`bots: ${err.message}`, "red")}\n`);
    process.exit(err.code);
  }
  if (process.env.BOTS_DEBUG === "1" || globalOpts().verbose) {
    throw err;
  }
  fail(err instanceof Error ? err.message : String(err));
});
