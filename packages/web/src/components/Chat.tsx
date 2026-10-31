import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { mergeOptimisticChatTurns } from "../lib/chat.ts";

const INJECT_LABELS: Record<string, string> = {
  schedule: "schedule",
  manual: "manual run",
  webhook: "webhook",
};

import { Avatar } from "../components/Avatar.tsx";
import {
  CloseIcon,
  GearIcon,
  SendIcon,
  SpinnerIcon,
} from "../components/icons/index.ts";
import { usePolling } from "../hooks/usePolling.ts";
import { api } from "../lib/api.ts";
import { renderMarkdown } from "../markdown.ts";
import type { Bot, ChatTurn, OptimisticChatMessage } from "../types.ts";
import { ApprovalStrip } from "./ApprovalStrip.tsx";
export function ChatBar({ turn }: { turn: ChatTurn }) {
  return (
    <div className={`chat-bar ${turn.source ?? "trigger"}`}>
      <span className="who">
        {INJECT_LABELS[turn.source ?? ""] ?? turn.source ?? "trigger"}
      </span>
      <pre>{turn.text}</pre>
    </div>
  );
}

export function ChatTurnView({
  turn,
  botName,
}: {
  turn: ChatTurn;
  botName: string;
}) {
  return (
    <div className={`chat-turn ${turn.role}`}>
      <span className="who">{turn.role === "user" ? "you" : botName}</span>
      {turn.role === "user" ? (
        <pre>{turn.text}</pre>
      ) : (
        <>
          {turn.tool_calls?.map((c, j) => (
            <details className="turnsec" key={j}>
              <summary>tool: {c.name}</summary>
              <pre>{JSON.stringify(c.input, null, 2)}</pre>
              {c.output !== undefined && <pre>{c.output}</pre>}
            </details>
          ))}
          {!!turn.thinking?.trim() && (
            <details className="turnsec">
              <summary>thinking</summary>
              <pre>{turn.thinking}</pre>
            </details>
          )}
          {turn.text.trim() !== "" && (
            <div
              className="md"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(turn.text) }}
            />
          )}
        </>
      )}
    </div>
  );
}

export function ChatSidebar({
  bot,
  onRunAccepted,
  onSettings,
  onClose,
}: {
  bot: Bot | null;
  onRunAccepted?: () => void;
  onSettings: () => void;
  onClose: () => void;
}) {
  if (!bot) return null;
  return (
    <aside className="sidepanel" role="dialog" aria-label={`${bot.name} chat`}>
      <div className="viewhead">
        <Avatar
          name={bot.name}
          id={bot.id}
          shape={bot.avatar_shape}
          color={bot.avatar_color}
          health={bot.health}
        />
        <h2>{bot.name}</h2>
        <button
          type="button"
          aria-label={`${bot.name} settings`}
          onClick={onSettings}
        >
          <GearIcon size={16} />
        </button>
        <button
          type="button"
          className="close"
          aria-label="Close"
          onClick={onClose}
        >
          <CloseIcon size={18} />
        </button>
      </div>
      <Chat
        key={bot.id}
        botId={bot.id}
        botName={bot.name}
        enabled={bot.enabled === 1}
        working={bot.run_state === "running"}
        onRunAccepted={onRunAccepted}
      />
    </aside>
  );
}

export function Chat({
  botId,
  botName,
  enabled = true,
  working = false,
  onRunAccepted,
}: {
  botId: string;
  botName: string;
  enabled?: boolean;
  working?: boolean;
  onRunAccepted?: () => void;
}) {
  const [history, setHistory] = useState<ChatTurn[]>([]);
  const [pendingMessages, setPendingMessages] = useState<
    OptimisticChatMessage[]
  >([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [liveWorking, setLiveWorking] = useState<boolean | null>(null);
  const [streamActive, setStreamActive] = useState(false);
  const optimisticSeq = useRef(0);
  const botIsWorking = working || Boolean(liveWorking);

  const applyIncomingTurns = useCallback((incoming: ChatTurn[]) => {
    setHistory(incoming);
    setPendingMessages((prev) =>
      prev.length === 0
        ? prev
        : prev.filter(
            (pending) =>
              !incoming.some(
                (t) => t.role === "user" && t.text === pending.text,
              ),
          ),
    );
  }, []);

  const loadChat = useCallback(async () => {
    try {
      const fresh = await api<ChatTurn[]>(`/api/bots/${botId}/messages`);
      applyIncomingTurns(fresh);
    } catch {
      /* keep last */
    }
  }, [applyIncomingTurns, botId]);

  useEffect(() => {
    if (typeof EventSource === "undefined") return;
    let source: EventSource;
    try {
      source = new EventSource(`/api/bots/${botId}/messages/stream`);
    } catch {
      return;
    }

    source.onopen = () => setStreamActive(true);
    source.onerror = () => setStreamActive(false);
    source.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as {
          turns?: unknown;
          working?: boolean;
        };
        if (Array.isArray(data.turns))
          applyIncomingTurns(data.turns as ChatTurn[]);
        if (typeof data.working === "boolean") setLiveWorking(data.working);
      } catch {
        /* ignore malformed events */
      }
    };

    return () => {
      source.close();
      setStreamActive(false);
    };
  }, [applyIncomingTurns, botId]);

  usePolling(loadChat, botIsWorking ? 800 : 5000, { enabled: !streamActive });

  const turns = useMemo(
    () => mergeOptimisticChatTurns(history, pendingMessages),
    [history, pendingMessages],
  );
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const _scrollRevision = turns.reduce((total, turn) => {
    let sum =
      total + turns.length + turn.text.length + (turn.thinking?.length ?? 0);
    for (const call of turn.tool_calls ?? []) {
      sum += call.name.length + (call.output?.length ?? 0);
    }
    return sum;
  }, 0);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, []);

  const send = async () => {
    const text = draft.trim();
    if (!text || sending || !enabled) return;
    setSending(true);
    setErr(null);
    const optimisticId = `${Date.now()}-${optimisticSeq.current++}`;
    setPendingMessages((prev) => [...prev, { id: optimisticId, text }]);
    setDraft("");
    try {
      const result = await api<{ runId?: string | null }>(
        `/api/bots/${botId}/messages`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text }),
        },
      );
      if (result.runId) onRunAccepted?.();
      await loadChat();
    } catch (e) {
      setPendingMessages((prev) => prev.filter((p) => p.id !== optimisticId));
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="chat">
      <ApprovalStrip botId={botId} />
      <div className="chat-log">
        {turns.length === 0 && <p>No conversation yet. Say something below.</p>}
        {turns.map((t, i) =>
          t.injected ? (
            <ChatBar key={i} turn={t} />
          ) : (
            <ChatTurnView key={i} turn={t} botName={botName} />
          ),
        )}
        <div ref={bottomRef} />
      </div>
      {botIsWorking && (
        <div className="chat-working" aria-label="bot is working">
          <span className="who">{botName}</span>
          <span className="dots">
            <i />
            <i />
            <i />
          </span>
        </div>
      )}
      {err && <p className="error">{err}</p>}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
        className="chat-input"
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Message the bot…"
          disabled={sending || !enabled}
        />
        <button type="submit" disabled={sending || !enabled || !draft.trim()}>
          {sending ? <SpinnerIcon size={17} /> : <SendIcon size={17} />}
          <span className="sr-only">{sending ? "Sending…" : "Send"}</span>
        </button>
      </form>
    </section>
  );
}
