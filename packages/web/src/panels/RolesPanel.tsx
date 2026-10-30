import {
  type FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { GrantDualList } from "../components/GrantDualList.tsx";
import { CloseIcon } from "../components/icons/CloseIcon.tsx";
import { ConfirmDialog } from "../components/ui/ConfirmDialog.tsx";
import {
  UnsavedNote,
  useDiscardGuard,
  useNavGuard,
} from "../components/ui/discard.tsx";
import { ModalForm } from "../components/ui/Modal.tsx";
import type { TabNavTab } from "../components/ui/TabNav.tsx";
import { TabNav } from "../components/ui/TabNav.tsx";
import { useEscape } from "../components/ui/useEscape.ts";
import { api } from "../lib/api.ts";
import type { GrantOption, Role } from "../types.ts";

const ROLE_FORM_TABS: readonly TabNavTab[] = [
  { id: "general", label: "General" },
  { id: "mcp", label: "MCP" },
  { id: "skills", label: "Skills" },
];

export function RolesPanel({
  openId,
  onOpened,
}: {
  openId?: string | null;
  onOpened?: () => void;
} = {}) {
  const [roles, setRoles] = useState<Role[]>([]);
  const navGuard = useNavGuard();
  const [query, setQuery] = useState("");
  const [formRole, setFormRole] = useState<Role | null>(null);
  const [creating, setCreating] = useState(false);

  const loadRoles = useCallback(async () => {
    setRoles(await api<Role[]>("/api/roles").catch(() => []));
  }, []);

  useEffect(() => {
    void loadRoles();
  }, [loadRoles]);

  useEffect(() => {
    if (!openId) return;
    const role = roles.find((candidate) => candidate.id === openId);
    if (!role) return;
    setFormRole(role);
    setCreating(false);
    onOpened?.();
  }, [onOpened, openId, roles]);

  const q = query.trim().toLowerCase();
  const visible = roles.filter(
    (role) =>
      !q ||
      role.name.toLowerCase().includes(q) ||
      role.instructions.toLowerCase().includes(q),
  );

  return (
    <section>
      <div className="viewhead">
        <h2>Roles</h2>
        <button type="button" onClick={() => setCreating(true)}>
          Create role
        </button>
      </div>
      <input
        placeholder="Search roles"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {roles.length === 0 && (
        <p className="muted">No roles yet — press "Create role".</p>
      )}
      {roles.length > 0 && visible.length === 0 && (
        <p className="muted">No roles match "{query}".</p>
      )}
      <div className="cards">
        {visible.map((role) => (
          <button
            type="button"
            key={role.id}
            className="card"
            onClick={() => navGuard(() => setFormRole(role))}
          >
            <strong>{role.name}</strong>
            <span className="preview">{role.instructions}</span>
          </button>
        ))}
      </div>
      {(creating || formRole) && (
        <RoleFormModal
          role={formRole}
          onClose={() => {
            setCreating(false);
            setFormRole(null);
          }}
          onSaved={() => {
            setCreating(false);
            setFormRole(null);
            void loadRoles();
          }}
        />
      )}
    </section>
  );
}

export function RoleFormModal({
  role,
  onClose,
  onSaved,
}: {
  role: Role | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(role?.name ?? "");
  const [instructions, setInstructions] = useState(role?.instructions ?? "");
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [roleTab, setRoleTab] = useState<"general" | "mcp" | "skills">(
    "general",
  );
  const [mcpOptions, setMcpOptions] = useState<GrantOption[]>([]);
  const [skillOptions, setSkillOptions] = useState<GrantOption[]>([]);
  const [mcpIds, setMcpIds] = useState<string[]>(role?.mcp_server_ids ?? []);
  const [skillIds, setSkillIds] = useState<string[]>(role?.skill_ids ?? []);
  const dirty =
    name !== (role?.name ?? "") ||
    instructions !== (role?.instructions ?? "") ||
    mcpIds.join(",") !== (role?.mcp_server_ids ?? []).join(",") ||
    skillIds.join(",") !== (role?.skill_ids ?? []).join(",");
  const attemptClose = useDiscardGuard(
    role ? `role ${role.name}` : "this new role",
    dirty,
    onClose,
  );

  useEffect(() => {
    void api<{ id: string; name: string; command?: unknown }[]>(
      "/api/mcp-servers",
    )
      .then((servers) =>
        setMcpOptions(
          servers.map((server) => ({
            id: server.id,
            name: server.name,
            description:
              typeof server.command === "string" ? server.command : undefined,
          })),
        ),
      )
      .catch(() => setMcpOptions([]));
    void api<{ id: string; name: string; description?: unknown }[]>(
      "/api/skills",
    )
      .then((skills) =>
        setSkillOptions(
          skills.map((skill) => ({
            id: skill.id,
            name: skill.name,
            description:
              typeof skill.description === "string"
                ? skill.description
                : undefined,
          })),
        ),
      )
      .catch(() => setSkillOptions([]));
  }, []);

  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  useEscape(() => {
    if (!confirmDel) attemptClose();
  }, true);

  async function submitRole(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const body = JSON.stringify({
        name,
        instructions,
        mcp_server_ids: mcpIds,
        skill_ids: skillIds,
      });
      if (role)
        await api(`/api/roles/${role.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body,
        });
      else
        await api("/api/roles", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body,
        });
      onSaved();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <>
      <ModalForm
        scrimOnCancel={attemptClose}
        className="dialog"
        role="dialog"
        aria-label={role ? "Edit role" : "Create role"}
        onSubmit={submitRole}
      >
        <div className="viewhead">
          <h2>{role ? "Edit role" : "Create role"}</h2>
          <button
            type="button"
            className="close"
            aria-label="Cancel"
            onClick={attemptClose}
          >
            <CloseIcon size={18} />
          </button>
        </div>
        <TabNav
          tabs={ROLE_FORM_TABS}
          selected={roleTab}
          onSelect={(id) => setRoleTab(id as "general" | "mcp" | "skills")}
        />
        {roleTab === "general" && (
          <>
            <input
              ref={nameRef}
              placeholder="role name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
            <textarea
              placeholder="instructions added to assigned bots' prompts"
              rows={5}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              required
            />
          </>
        )}
        {roleTab === "mcp" && (
          <GrantDualList
            label="MCP servers"
            options={mcpOptions}
            selected={mcpIds}
            onChange={setMcpIds}
            emptyText="No MCP servers — add one in Integrations."
          />
        )}
        {roleTab === "skills" && (
          <GrantDualList
            label="Skills"
            options={skillOptions}
            selected={skillIds}
            onChange={setSkillIds}
            emptyText="No skills — add one in Skills."
          />
        )}
        <div className="actions">
          <button type="submit" disabled={busy}>
            {role ? "Save role" : "Create role"}
          </button>
          <UnsavedNote dirty={dirty} />
          {role && (
            <button
              type="button"
              className="danger"
              disabled={busy}
              onClick={() => setConfirmDel(true)}
            >
              Delete role
            </button>
          )}
          <button type="button" onClick={attemptClose}>
            Cancel
          </button>
        </div>
      </ModalForm>
      {role && confirmDel && (
        <ConfirmDialog
          text={`Delete role ${role.name}? Bots using it fall back to their own prompts.`}
          confirmLabel="Delete role"
          onCancel={() => setConfirmDel(false)}
          onConfirm={() => {
            setConfirmDel(false);
            void (async () => {
              setBusy(true);
              try {
                await api(`/api/roles/${role.id}`, { method: "DELETE" });
                onSaved();
              } catch (err) {
                alert(err instanceof Error ? err.message : String(err));
                setBusy(false);
              }
            })();
          }}
        />
      )}
    </>
  );
}
