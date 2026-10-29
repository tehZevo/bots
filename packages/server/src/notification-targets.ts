export function notificationTargetPath(input: {
  kind: string;
  botId?: string | null;
  runId?: string | null;
}): string | null {
  if (input.kind === "breaker") return "/settings?tab=system";
  if (!input.botId) return null;
  const chat = `/bots?bot=${encodeURIComponent(input.botId)}`;
  if (
    input.kind === "run_error" ||
    input.kind === "watchdog" ||
    input.kind === "blocked" ||
    input.kind === "recovered"
  ) {
    return input.runId
      ? `${chat}&run=${encodeURIComponent(input.runId)}`
      : chat;
  }
  return null;
}
