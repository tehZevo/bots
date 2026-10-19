type Json = Record<string, unknown>;

const ref = (name: string): Json => ({ $ref: `#/components/schemas/${name}` });
const str = { type: "string" };
const numOrNone = { type: ["integer", "null"] as never };
const strOrNone = { type: ["string", "null"] as never };

const error4xx = (desc: string): Json => ({
  description: desc,
  content: { "application/json": { schema: { type: "object" } } },
});

export function openApiDoc(): Json {
  const paths: Record<string, Record<string, Json>> = {};
  const add = (
    path: string,
    method: string,
    summary: string,
    opts: { body?: Json; res?: Json; params?: string[] } = {},
  ): void => {
    paths[path] ??= {};
    paths[path][method] = {
      summary,
      ...(opts.params
        ? {
            parameters: opts.params.map((name) => ({
              name,
              in: "path",
              required: true,
              schema: str,
            })),
          }
        : {}),
      ...(opts.body
        ? {
            requestBody: {
              content: { "application/json": { schema: opts.body } },
            },
          }
        : {}),
      responses: {
        "200": {
          description: "ok",
          content: {
            "application/json": { schema: opts.res ?? { type: "object" } },
          },
        },
        ...(opts.body ? { 400: error4xx("validation error") } : {}),
      },
    };
  };

  add("/api/health", "get", "Liveness probe");
  add("/api/settings", "get", "Read app settings");
  add("/api/settings", "put", "Update app settings", { body: ref("Settings") });
  add("/api/bots", "get", "List bots with health and run state", {
    res: { type: "array", items: ref("Bot") },
  });
  add("/api/bots", "post", "Create a bot", {
    body: ref("BotInput"),
    res: ref("Bot"),
  });
  add("/api/bots/{id}", "get", "Read one bot", {
    params: ["id"],
    res: ref("Bot"),
  });
  add("/api/bots/{id}", "patch", "Update a bot", {
    params: ["id"],
    body: ref("BotInput"),
    res: ref("Bot"),
  });
  add("/api/bots/{id}", "delete", "Delete a bot and its history", {
    params: ["id"],
  });
  add("/api/bots/{id}/run", "post", "Inject a manual run message", {
    params: ["id"],
    body: { type: "object" },
  });
  add("/api/bots/{id}/interrupt", "post", "Interrupt the running loop", {
    params: ["id"],
  });
  add(
    "/api/bots/{id}/restart-machine",
    "post",
    "Restart the bot's sandbox machine",
    {
      params: ["id"],
    },
  );
  add("/api/bots/{id}/runs", "get", "Run history", { params: ["id"] });
  add("/api/bots/{id}/messages", "get", "Conversation memory", {
    params: ["id"],
  });
  add("/api/bots/{id}/messages", "post", "Send a chat message", {
    params: ["id"],
    body: { type: "object" },
  });
  add("/api/bots/{id}/messages", "delete", "Clear conversation memory", {
    params: ["id"],
  });
  add("/api/bots/{id}/triggers", "get", "List triggers (secrets hidden)", {
    params: ["id"],
  });
  add("/api/bots/{id}/triggers", "post", "Create a trigger", {
    params: ["id"],
    body: ref("TriggerInput"),
  });
  add("/api/triggers/{triggerId}", "patch", "Update a trigger", {
    params: ["triggerId"],
    body: ref("TriggerInput"),
  });
  add("/api/triggers/{triggerId}", "delete", "Delete a trigger", {
    params: ["triggerId"],
  });
  add(
    "/api/triggers/{triggerId}/rotate-secret",
    "post",
    "Rotate webhook secret",
    {
      params: ["triggerId"],
    },
  );
  add(
    "/api/webhooks/{triggerId}",
    "post",
    "Fire a webhook trigger (Bearer secret)",
    {
      params: ["triggerId"],
    },
  );
  add("/api/roles", "get", "List roles", {
    res: { type: "array", items: ref("Role") },
  });
  add("/api/roles", "post", "Create a role", { body: ref("Role") });
  add("/api/roles/{roleId}", "patch", "Update a role", {
    params: ["roleId"],
    body: ref("Role"),
  });
  add("/api/roles/{roleId}", "delete", "Delete a role", { params: ["roleId"] });
  add("/api/skills", "get", "List skills");
  add("/api/skills", "post", "Create a skill", { body: ref("Skill") });
  add("/api/skills/{skillId}", "patch", "Update a skill", {
    params: ["skillId"],
    body: ref("Skill"),
  });
  add("/api/skills/{skillId}", "delete", "Delete a skill", {
    params: ["skillId"],
  });
  add("/api/mcp-servers", "get", "List MCP servers");
  add("/api/mcp-servers", "post", "Create an MCP server", {
    body: ref("McpServer"),
  });
  add("/api/mcp-servers/{serverId}", "patch", "Update an MCP server", {
    params: ["serverId"],
    body: ref("McpServer"),
  });
  add("/api/mcp-servers/{serverId}", "delete", "Delete an MCP server", {
    params: ["serverId"],
  });
  add("/api/machines", "get", "List machines");
  add("/api/machines", "post", "Create a machine", { body: ref("Machine") });
  add("/api/machines/{machineId}", "patch", "Update a machine", {
    params: ["machineId"],
    body: ref("Machine"),
  });
  add("/api/machines/{machineId}", "delete", "Delete a machine", {
    params: ["machineId"],
  });
  add(
    "/api/machines/default/repull",
    "post",
    "Repull the default sandbox image",
  );
  add("/api/machines/{machineId}/rebuild", "post", "Rebuild a machine image", {
    params: ["machineId"],
  });
  add("/api/providers", "get", "List providers (keys masked)");
  add("/api/providers", "post", "Create a provider", { body: ref("Provider") });
  add("/api/providers/{id}", "put", "Replace a provider", {
    params: ["id"],
    body: ref("Provider"),
  });
  add("/api/providers/{id}", "delete", "Delete a provider", { params: ["id"] });
  add("/api/providers/detect", "post", "Probe a provider's model list");
  add("/api/notifications", "get", "List notifications with unread count");
  add("/api/notifications/read-all", "post", "Mark all notifications read");
  add("/api/notifications/{id}/read", "post", "Mark one notification read", {
    params: ["id"],
  });
  add("/api/api-keys", "get", "List API keys (values not stored)", {
    res: { type: "array", items: ref("ApiKey") },
  });
  add("/api/api-keys", "post", "Create an API key; value shown once", {
    body: { type: "object", required: ["name"], properties: { name: str } },
    res: { allOf: [ref("ApiKey"), { properties: { value: str } }] },
  });
  add("/api/api-keys/{keyId}", "delete", "Revoke an API key", {
    params: ["keyId"],
  });

  return {
    openapi: "3.1.0",
    info: {
      title: "bots control API",
      version: "1.0.0",
      description:
        "The same surface the web UI uses. Authenticate with a session cookie or Authorization: Bearer <api key> (see /api/api-keys).",
    },
    components: {
      securitySchemes: { bearerAuth: { type: "http", scheme: "bearer" } },
      schemas: {
        Bot: {
          type: "object",
          properties: {
            id: str,
            name: str,
            instructions: str,
            model_id: strOrNone,
            role_id: strOrNone,
            machine_id: strOrNone,
            sound: strOrNone,
            enabled: { type: "integer" },
            created_at: { type: "integer" },
            health: { enum: ["green", "blue", "yellow", "red", "gray"] },
            run_state: { enum: ["running", "enabled", "disabled"] },
          },
        },
        BotInput: {
          type: "object",
          required: ["name"],
          properties: {
            name: str,
            instructions: str,
            model_id: strOrNone,
            role_id: strOrNone,
            machine_id: strOrNone,
            sound: strOrNone,
            enabled: { type: "boolean" },
          },
        },
        Role: {
          type: "object",
          properties: {
            id: str,
            name: str,
            instructions: str,
            mcp_server_ids: { type: "array", items: str },
            skill_ids: { type: "array", items: str },
          },
        },
        Skill: {
          type: "object",
          properties: {
            id: str,
            name: str,
            description: str,
            instructions: str,
          },
        },
        McpServer: {
          type: "object",
          properties: {
            id: str,
            name: str,
            command: str,
            args: { type: "array", items: str },
            env: { type: "object" },
            enabled: { type: "integer" },
          },
        },
        Machine: {
          type: "object",
          properties: { id: str, name: str, description: str, dockerfile: str },
        },
        Provider: {
          type: "object",
          properties: {
            id: str,
            name: str,
            base_url: str,
            models: { type: "array", items: str },
            has_key: { type: "boolean" },
          },
        },
        TriggerInput: {
          type: "object",
          properties: {
            kind: { enum: ["schedule", "webhook"] },
            message: str,
            schedule: str,
            enabled: { type: "boolean" },
          },
        },
        Settings: {
          type: "object",
          properties: {
            sandbox_idle_minutes: { type: "integer" },
            default_provider_id: numOrNone,
            default_model: strOrNone,
          },
        },
        ApiKey: {
          type: "object",
          properties: {
            id: str,
            name: str,
            created_at: { type: "integer" },
            last_used_at: numOrNone,
          },
        },
      },
    },
    paths,
  };
}
