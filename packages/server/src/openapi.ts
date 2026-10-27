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
  for (const [p, m, d] of [
    ["/api/auth/config", "get", "Registration availability and user presence"],
    [
      "/api/auth/signup",
      "post",
      "Create an account (when ALLOW_REGISTRATION=true)",
    ],
    [
      "/api/auth/login",
      "post",
      "Sign in with email + password; sets session cookie",
    ],
    ["/api/auth/me", "get", "Current identity"],
    ["/api/auth/logout", "post", "End the session"],
    [
      "/api/auth/password",
      "post",
      "Change own password; evicts other sessions",
    ],
  ] as const)
    add(p, m, d);

  paths["/api/auth/me"].get = {
    summary: "Current identity; key_id is present for API-key requests",
    responses: {
      "200": {
        description: "ok",
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: { email: str, key_id: strOrNone },
            },
          },
        },
      },
    },
  };

  paths["/api/auth/device/code"] = {
    post: {
      summary:
        "Start a device authorization grant (RFC 8628); public like login",
      requestBody: {
        content: {
          "application/json": {
            schema: { type: "object", properties: { client_name: str } },
          },
        },
      },
      responses: {
        "200": {
          description: "ok",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  device_code: str,
                  user_code: str,
                  verification_uri: str,
                  verification_uri_complete: str,
                  expires_in: { type: "integer" },
                  interval: { type: "integer" },
                },
              },
            },
          },
        },
        429: error4xx("rate_limited"),
      },
    },
  };
  paths["/api/auth/device/pending"] = {
    get: {
      summary: "Resolve a live user_code for the approval page (session)",
      parameters: [
        { name: "user_code", in: "query", required: true, schema: str },
      ],
      responses: {
        "200": {
          description: "ok",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  client_name: str,
                  key_name: strOrNone,
                  expires_at: { type: "integer" },
                },
              },
            },
          },
        },
        404: error4xx("unknown, expired or consumed code"),
      },
    },
  };
  paths["/api/auth/device/approve"] = {
    post: {
      summary: "Approve or deny a pending grant (session, CSRF)",
      requestBody: {
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["user_code", "decision"],
              properties: {
                user_code: str,
                decision: { enum: ["approve", "deny"] },
                key_name: strOrNone,
              },
            },
          },
        },
      },
      responses: {
        200: error4xx("ok"),
        404: error4xx("unknown, expired or consumed code"),
        409: error4xx("already decided"),
      },
    },
  };
  paths["/api/auth/device/token"] = {
    post: {
      summary:
        "Poll for the one-time API key; public like login. Errors carry an OAuth error code",
      requestBody: {
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["device_code"],
              properties: { device_code: str },
            },
          },
        },
      },
      responses: {
        "200": {
          description: "first successful poll only",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  api_key: str,
                  key_id: str,
                  key_name: str,
                  email: str,
                },
              },
            },
          },
        },
        400: error4xx(
          '{"error": "authorization_pending" | "slow_down" | "expired_token" | "access_denied"}',
        ),
        429: error4xx("rate_limited"),
      },
    },
  };

  add("/api/settings", "get", "Read app settings");
  add("/api/settings", "put", "Update app settings", { body: ref("Settings") });
  add("/api/pause", "get", "Read the global pause state", {
    res: {
      type: "object",
      properties: { paused: { type: "boolean" } },
    },
  });
  add("/api/pause", "post", "Pause or resume all bots", {
    body: {
      type: "object",
      required: ["paused"],
      properties: { paused: { type: "boolean" } },
    },
    res: {
      type: "object",
      properties: { paused: { type: "boolean" } },
    },
  });
  add("/api/stop-all", "post", "Emergency stop: interrupt all running bots and arm the global pause", {
    res: { type: "object", properties: { stopped: { type: "number" } } },
  });
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
  add("/api/bots/{id}/runs/{runId}/transcript", "get", "Ordered replay steps for one run", {
    params: ["id", "runId"],
  });
  add(
    "/api/bots/{id}/usage",
    "get",
    "Lifetime and trailing-30-day token totals plus the configured budget",
    {
      params: ["id"],
    },
  );
  add(
    "/api/bots/{id}/context-usage",
    "get",
    "Estimated context split (system prompt, tools, conversation, free)",
    {
      params: ["id"],
    },
  );
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
  add("/api/teams", "get", "List teams with members", {
    res: { type: "array", items: ref("Team") },
  });
  add("/api/teams", "post", "Create a team", { body: ref("Team") });
  add("/api/teams/{teamId}", "patch", "Rename a team", {
    params: ["teamId"],
    body: ref("Team"),
  });
  add(
    "/api/teams/{teamId}",
    "delete",
    "Delete a team (members keep existing)",
    {
      params: ["teamId"],
    },
  );
  add("/api/teams/{teamId}/members", "put", "Add member or set leader flag", {
    params: ["teamId"],
  });
  add("/api/teams/{teamId}/members/{botId}", "delete", "Remove member", {
    params: ["teamId", "botId"],
  });

  add("/api/projects", "get", "List shared-context projects", {
    res: { type: "array", items: ref("Project") },
  });
  add("/api/projects", "post", "Create a project (name + body required)", {
    body: ref("Project"),
  });
  add("/api/projects/{projectId}", "get", "Read one project", {
    params: ["projectId"],
  });
  add(
    "/api/projects/{projectId}",
    "patch",
    "Update name, description or body",
    {
      params: ["projectId"],
      body: ref("Project"),
    },
  );
  add("/api/projects/{projectId}", "delete", "Delete a project", {
    params: ["projectId"],
  });

  add("/api/tags", "get", "List tags with bot counts", {
    res: { type: "array", items: ref("Tag") },
  });
  add("/api/tags", "post", "Create a tag (unique name required)", {
    body: ref("Tag"),
  });
  add("/api/tags/{tagId}", "patch", "Rename a tag", {
    params: ["tagId"],
    body: ref("Tag"),
  });
  add("/api/tags/{tagId}", "delete", "Delete a tag and its attachments", {
    params: ["tagId"],
  });

  add("/api/skills", "get", "List skills");
  add("/api/skills", "post", "Create a skill", { body: ref("Skill") });
  add("/api/skills/{skillId}", "patch", "Update a skill", {
    params: ["skillId"],
    body: ref("Skill"),
  });
  add("/api/skills/{skillId}", "delete", "Delete a skill", {
    params: ["skillId"],
  });

  paths["/api/skills/search"] = {
    get: {
      summary: "Look up skills.sh candidates by name or keyword (never writes)",
      parameters: [{ name: "q", in: "query", required: true, schema: str }],
      responses: {
        "200": {
          description: "ok",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  results: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        id: str,
                        source: str,
                        skill_id: str,
                        name: str,
                        installs: numOrNone,
                      },
                    },
                  },
                },
              },
            },
          },
        },
        502: error4xx("skills.sh unreachable"),
      },
    },
  };

  const previewSchema = {
    type: "object",
    properties: {
      folder: str,
      name: str,
      description: str,
      license: strOrNone,
      file_count: { type: "integer" },
      total_size: { type: "integer" },
      content_hash: str,
    },
  };

  paths["/api/skills/preview"] = {
    post: {
      summary:
        "Resolve a source (owner/repo, repo URL, /tree/ref/path, @skill filter, #ref) into previews (never writes)",
      requestBody: {
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["source"],
              properties: { source: str },
            },
          },
        },
      },
      responses: {
        "200": {
          description: "ok",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  source: str,
                  requested_ref: strOrNone,
                  resolved_commit: str,
                  skills: { type: "array", items: previewSchema },
                },
              },
            },
          },
        },
        400: error4xx("unrecognized source or nothing discoverable"),
        502: error4xx("source unreachable or private"),
      },
    },
  };

  paths["/api/skills/import"] = {
    post: {
      summary:
        "Store the selected bundles with immutable provenance; rejects over-limit or invalid bundles saving nothing",
      requestBody: {
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["source", "folders"],
              properties: {
                source: str,
                folders: { type: "array", items: str },
              },
            },
          },
        },
      },
      responses: {
        201: error4xx("created skills"),
        400: error4xx("invalid selection, frontmatter or oversized bundle"),
        502: error4xx("source unreachable or private"),
      },
    },
  };
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
  add("/api/push/key", "get", "VAPID public key for browser push", {
    res: { type: "object", properties: { key: str } },
  });
  add("/api/push/subscription", "put", "Register a browser push subscription", {
    body: {
      type: "object",
      required: ["endpoint", "p256dh", "auth"],
      properties: { endpoint: str, p256dh: str, auth: str },
    },
  });
  add(
    "/api/push/subscription",
    "delete",
    "Remove a browser push subscription",
    {
      params: ["endpoint"],
    },
  );

  add("/api/secrets", "get", "List secrets (values hidden)", {
    res: { type: "array", items: ref("Secret") },
  });
  add("/api/secrets", "post", "Create secret (unique name required)", {
    body: ref("SecretInput"),
  });
  add("/api/secrets/{secretId}", "get", "Get secret metadata (value hidden)", {
    params: ["secretId"],
  });
  add("/api/secrets/{secretId}/value", "get", "Reveal secret value", {
    params: ["secretId"],
  });
  add(
    "/api/secrets/{secretId}",
    "patch",
    "Update secret (destructive on value change)",
    {
      params: ["secretId"],
      body: ref("SecretInput"),
    },
  );
  add(
    "/api/secrets/{secretId}",
    "delete",
    "Delete secret and its assignments",
    {
      params: ["secretId"],
    },
  );

  return {
    openapi: "3.1.0",
    info: {
      title: "bots control API",
      version: "1.0.0",
      description:
        "The same surface the web UI uses. Authenticate with a session cookie or Authorization: Bearer <api key> (see /api/api-keys).",
    },
    security: [{ bearerAuth: [] }, { sessionCookie: [] }],
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer" },
        sessionCookie: { type: "apiKey", in: "cookie", name: "bots_session" },
      },
      schemas: {
        Team: {
          type: "object",
          properties: {
            id: str,
            name: str,
            created_at: { type: "integer" },
            members: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  bot_id: str,
                  name: str,
                  leader: { type: "boolean" },
                },
              },
            },
            project_ids: { type: "array", items: str },
          },
        },
        Bot: {
          type: "object",
          properties: {
            id: str,
            name: str,
            instructions: str,
            model_id: strOrNone,
            role_id: strOrNone,
            role_name: strOrNone,
            machine_id: strOrNone,
            sound: strOrNone,
            enabled: { type: "integer" },
            token_budget: { type: ["integer", "null"] },
            watchdog_hours: { type: ["integer", "null"] },
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
            token_budget: { type: ["integer", "null"] },
            watchdog_hours: { type: ["integer", "null"] },
          },
        },
        Tag: {
          type: "object",
          properties: {
            id: str,
            name: str,
            created_at: { type: "integer" },
            bot_count: { type: "integer" },
          },
        },
        Secret: {
          type: "object",
          properties: {
            id: str,
            name: str,
            key: str,
            created_at: { type: "integer" },
          },
        },
        SecretInput: {
          type: "object",
          required: ["name", "key", "value"],
          properties: {
            name: str,
            key: str,
            value: str,
          },
        },
        Project: {
          type: "object",
          properties: {
            id: str,
            name: str,
            description: str,
            body: str,
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
            kind: { enum: ["schedule", "webhook", "continuous"] },
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
