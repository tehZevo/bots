export type Tab =
  | "bots"
  | "teams"
  | "activity"
  | "roles"
  | "machines"
  | "integrations"
  | "skills"
  | "templates"
  | "projects"
  | "tags"
  | "secrets"
  | "settings";

export type BotModalTab = "general" | "triggers" | "logs" | "stats" | "files";

export interface RouteSnapshot {
  tab: Tab;
  chatBotId: string | null;
  detailOpen: boolean;
  openBotId: string | null;
  modalTab: BotModalTab;
  replayRunId: string | null;
}

export type SettingsTab = "general" | "providers" | "system";

export interface ApiKey {
  id: string;
  name: string;
  created_at: number;
  last_used_at: number | null;
}

export interface HookDestination {
  id: string;
  name: string;
  url: string;
  event_types: string[];
  enabled: number;
  created_at: number;
  has_secret: boolean;
}

export interface HookTestResult {
  ok: boolean;
  status: number | null;
  duration_ms: number;
  error: string | null;
}

export interface Bot {
  id: string;
  name: string;
  instructions: string;
  model_id: string | null;
  role_id: string | null;
  role_name?: string | null;
  tag_ids?: string[];
  machine_id: string | null;
  avatar_shape: number | null;
  avatar_color: number | null;
  sound: string | null;
  enabled: number;
  archived: number;
  created_at: number;
  run_state: "running" | "enabled" | "disabled";
  health: "green" | "blue" | "yellow" | "red" | "gray";
  status: string | null;
  status_level: "ok" | "issue" | "blocked" | null;
  current_task: string | null;
  current_task_updated_at: number | null;
  watchdog_hours?: number | null;
}

export interface OptimisticRunState {
  run_state: "running" | "enabled";
  health: "green" | "blue";
  authoritativeAt: number;
  expiresAt: number;
}

export type OptimisticRunStates = Record<string, OptimisticRunState>;

export interface GrantOption {
  id: string;
  name: string;
  description?: string;
}

export interface TemplateTrigger {
  message: string;
  schedule: string;
}

export interface Template {
  id: string;
  name: string;
  description: string;
  instructions: string;
  machine_id: string | null;
  role_id: string | null;
  triggers: TemplateTrigger[];
  created_at: number;
}

export interface Role {
  id: string;
  name: string;
  instructions: string;
  created_at: number;
  mcp_server_ids: string[];
  skill_ids: string[];
}

export interface TeamMember {
  bot_id: string;
  name: string;
  leader: boolean;
}

export interface Team {
  id: string;
  name: string;
  created_at: number;
  members: TeamMember[];
  project_ids: string[];
}

export interface Project {
  id: string;
  name: string;
  description: string;
  body: string;
  created_at: number;
}

export interface Tag {
  id: string;
  name: string;
  created_at: number;
  bot_count: number;
}

export interface Run {
  id: string;
  status: "running" | "ok" | "error";
  trigger: "schedule" | "manual" | "chat" | "webhook" | "dm" | "continuous";
  started_at: number;
  finished_at: number | null;
  output: string | null;
  error: string | null;
}

// specs/runs/drill-down.md — inline transcript replay under a Logs row.
export interface TranscriptStep {
  kind: "user" | "assistant" | "tool_call" | "tool_result";
  name?: string;
  text?: string;
  args?: string;
  duration_ms?: number | null;
  is_error?: boolean;
  retry_wait_ms?: number;
}

export interface NotificationItem {
  id: string;
  kind: string;
  title: string;
  body: string;
  bot_id: string | null;
  run_id?: string | null;
  target_path?: string | null;
  read: number;
  created_at: number;
}

export interface NotificationsResponse {
  items: NotificationItem[];
  unread_count: number;
}

export interface Trigger {
  id: string;
  kind: "schedule" | "webhook" | "continuous";
  name: string | null;
  message: string;
  schedule: string;
  next_run_at: number | null;
  enabled: number;
}

export interface Machine {
  id: string;
  name: string;
  description: string;
  dockerfile: string;
  image: string | null;
  build_error: string | null;
  builtin: boolean;
}

export interface Breaker {
  limit_tokens: number;
  tokens_30d: number;
  exceeded: boolean;
}

export interface Provider {
  id: string;
  name: string;
  base_url: string;
  models: string[];
  has_key: boolean;
  builtin?: boolean;
}

export interface BotGeneralSettings {
  default_provider_id: string | null;
  default_model: string | null;
}

export interface UsageTotals {
  input: number;
  output: number;
  cache_read: number;
  cache_write: number;
  total: number;
}

export interface ContextBreakdownData {
  context_window: number | null;
  categories: {
    system_prompt: number;
    tools: number;
    conversation: number;
  };
  used: number;
  free: number | null;
}

export interface WorkspaceEntry {
  name: string;
  type: "dir" | "file";
  size_bytes: number;
  modified_at: number;
}

export type SearchEntityType =
  | "bots"
  | "archived_bots"
  | "roles"
  | "skills"
  | "projects"
  | "tags"
  | "teams"
  | "templates";

export interface SearchMatch {
  type: SearchEntityType;
  id: string;
  name: string;
  subtitle: string | null;
}

export interface SearchGroupResponse {
  type: SearchEntityType;
  total: number;
  matches: SearchMatch[];
}

export type PendingEntityEditType = Exclude<
  SearchEntityType,
  "bots" | "archived_bots"
>;

export interface PendingEntityEdit {
  type: PendingEntityEditType;
  id: string;
}

export type ToolCallTurn = { name: string; input: unknown; output?: string };

export type ChatTurn = {
  role: string;
  text: string;
  thinking?: string;
  tool_calls?: ToolCallTurn[];
  injected?: boolean;
  source?: string;
};

export type OptimisticChatMessage = { id: string; text: string };

export type SkillUpdateStatus =
  | "up_to_date"
  | "update_available"
  | "source_unavailable";

export interface SkillUpdateState {
  status: SkillUpdateStatus | null;
  checked_at: number | null;
  modified: boolean;
  pinned: boolean;
}

export interface Skill {
  id: string;
  name: string;
  description: string;
  instructions: string;
  created_at: number;
  import_info?: string | null;
  update_state?: SkillUpdateState | null;
}

export type McpEnvMode = "literal" | "secret";

export interface McpSecretRef {
  secret: string;
}

export type McpEnvValue = string | McpSecretRef;

export interface McpServer {
  id: string;
  name: string;
  transport: "stdio";
  command: string;
  args: string[];
  env: Record<string, McpEnvValue>;
  enabled: number;
}

export interface McpEnvRow {
  key: string;
  mode: McpEnvMode;
  value: string;
}

export interface SecretMeta {
  id: string;
  name: string;
  key: string;
  created_at: number;
}

export interface SearchHit {
  id: string;
  source: string;
  skill_id: string;
  name: string;
  installs: number | null;
}

export interface SkillPreviewRow {
  folder: string;
  name: string;
  description: string;
  license: string | null;
  file_count: number;
  total_size: number;
  content_hash: string;
}
