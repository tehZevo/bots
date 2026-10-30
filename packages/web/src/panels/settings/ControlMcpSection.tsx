import { useEffect, useState } from "react";
import { SwitchToggle } from "../../components/ui/SwitchToggle.tsx";
import { api } from "../../lib/api.ts";

export function ControlMcpSection() {
  const [mcpEnabled, setMcpEnabled] = useState(true);

  useEffect(() => {
    void api<{ control_mcp_enabled?: boolean }>("/api/settings")
      .then((settings) => setMcpEnabled(settings.control_mcp_enabled !== false))
      .catch(() => undefined);
  }, []);

  return (
    <>
      <p className="muted">Control MCP server</p>
      <div className="tedithead">
        <SwitchToggle
          ariaLabel="Control MCP enabled"
          checked={mcpEnabled}
          onChange={() => {
            const next = !mcpEnabled;
            setMcpEnabled(next);
            api("/api/settings", {
              method: "PUT",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ control_mcp_enabled: next }),
            }).catch((e) => alert(e.message));
          }}
          stateLabel={mcpEnabled ? "Enabled" : "Disabled"}
        />
        <code>/mcp</code>
      </div>
    </>
  );
}
