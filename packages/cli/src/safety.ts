import { createInterface } from "node:readline";
import { CliError, EXIT } from "./output.ts";

function ask(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: process.stdout.isTTY === true,
    });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

export function prompt(question: string): Promise<string> {
  return ask(question);
}

export function promptHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    if (!process.stdin.isTTY) {
      resolve("");
      return;
    }
    process.stdout.write(question);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    let answer = "";
    const onData = (chunk: Buffer): void => {
      for (const byte of chunk) {
        if (byte === 13 || byte === 10) {
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdin.removeListener("data", onData);
          process.stdout.write("\n");
          resolve(answer);
          return;
        }
        if (byte === 3) {
          process.stdin.setRawMode(false);
          process.stdout.write("\n");
          process.exit(130);
        }
        if (byte === 127) {
          answer = answer.slice(0, -1);
          continue;
        }
        answer += String.fromCharCode(byte);
      }
    };
    process.stdin.on("data", onData);
  });
}

// specs/cli/safety.md — destructive commands confirm on a TTY and refuse
// without --yes when stdin is not interactive.
export async function confirm(
  target: string,
  effect: string | undefined,
  assumeYes: boolean,
): Promise<void> {
  if (assumeYes) return;
  if (!process.stdin.isTTY) {
    throw new CliError(
      `${target} needs confirmation; pass --yes to run it non-interactively`,
      EXIT.usage,
    );
  }
  const suffix = effect ? ` (${effect})` : "";
  const answer = await ask(`Confirm ${target}${suffix}? [y/N] `);
  if (!/^y(es)?$/i.test(answer)) {
    throw new CliError("aborted", EXIT.unexpected);
  }
}
