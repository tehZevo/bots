import { useEffect, useMemo, useRef, useState } from "react";
import { nextReveal, revealStep } from "../lib/typewriter.ts";
import type { ChatTurn } from "../types.ts";

type Revealed = { text: string; thinking: string };

const EMPTY: Revealed = { text: "", thinking: "" };
// A reveal converges in far fewer frames than this; the cap only exists so a
// stalled or faked frame clock can never keep a loop alive forever.
const MAX_FRAMES = 1000;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Smooths the trailing assistant turn so a reply that arrives while the chat is
 * open is written out character by character instead of landing in
 * provider-sized chunks. Text already on screen when the turn was first seen
 * (opening a chat, switching bots) is never retyped, and only the last turn is
 * touched — everything else is returned unchanged.
 */
export function useSmoothedTurns(turns: ChatTurn[]): ChatTurn[] {
  const index = turns.length - 1;
  const last = index >= 0 ? turns[index] : undefined;
  const streaming = last?.role === "assistant";
  const targetText = streaming ? last.text : "";
  const targetThinking = streaming ? (last.thinking ?? "") : "";
  const [revealed, setRevealed] = useState<Revealed>(EMPTY);
  const shown = useRef<Revealed>(EMPTY);
  const seen = useRef<{ index: number; text: string; thinking: string } | null>(
    null,
  );

  useEffect(() => {
    const previous = seen.current;
    const growing =
      streaming &&
      previous !== null &&
      previous.index === index &&
      targetText.startsWith(previous.text) &&
      targetThinking.startsWith(previous.thinking);
    seen.current = streaming
      ? { index, text: targetText, thinking: targetThinking }
      : null;

    const snap = streaming
      ? { text: targetText, thinking: targetThinking }
      : EMPTY;
    if (
      !growing ||
      !streaming ||
      prefersReducedMotion() ||
      typeof requestAnimationFrame !== "function"
    ) {
      if (shown.current !== snap) {
        shown.current = snap;
        setRevealed(snap);
      }
      return;
    }

    let cancelled = false;
    let frames = 0;
    let handle = 0;
    const tick = () => {
      if (cancelled) return;
      const prev = shown.current;
      const next: Revealed = {
        text: nextReveal(
          targetText,
          prev.text,
          revealStep(targetText.length - prev.text.length),
        ),
        thinking: nextReveal(
          targetThinking,
          prev.thinking,
          revealStep(targetThinking.length - prev.thinking.length),
        ),
      };
      if (next.text !== prev.text || next.thinking !== prev.thinking) {
        shown.current = next;
        setRevealed(next);
      }
      frames += 1;
      const caughtUp =
        next.text === targetText && next.thinking === targetThinking;
      if (!caughtUp && frames < MAX_FRAMES)
        handle = requestAnimationFrame(tick);
    };
    handle = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(handle);
    };
  }, [streaming, index, targetText, targetThinking]);

  return useMemo(() => {
    if (!streaming || !last) return turns;
    if (revealed.text === last.text && revealed.thinking === targetThinking)
      return turns;
    return [
      ...turns.slice(0, -1),
      { ...last, text: revealed.text, thinking: revealed.thinking },
    ];
  }, [turns, streaming, last, revealed, targetThinking]);
}
