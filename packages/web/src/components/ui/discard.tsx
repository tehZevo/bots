import { createContext, useContext, useEffect } from "react";

const dirtyEditors = new Map<string, string>();
const dirtyListeners = new Set<() => void>();

function bumpDirty(): void {
  for (const l of dirtyListeners) l();
}

export function anyDirtyLabel(): string | null {
  for (const label of dirtyEditors.values()) return label;
  return null;
}

export function clearAllDirty(): void {
  dirtyEditors.clear();
  bumpDirty();
}

export function formDirty(
  snapshot: Record<string, unknown>,
  current: Record<string, unknown>,
): boolean {
  for (const key of Object.keys(snapshot))
    if (snapshot[key] !== current[key]) return true;
  return false;
}

export const NavGuardContext = createContext<(fn: () => void) => void>((fn) =>
  fn(),
);

export function useNavGuard(): (fn: () => void) => void {
  return useContext(NavGuardContext);
}

export function UnsavedNote({ dirty }: { dirty: boolean }) {
  if (!dirty) return null;
  return (
    <span className="unsavednote" role="status">
      Unsaved changes
    </span>
  );
}

export function useDirtyGuard(label: string, dirty: boolean): void {
  useEffect(() => {
    if (dirty) dirtyEditors.set(label, label);
    else dirtyEditors.delete(label);
    bumpDirty();
    return () => {
      dirtyEditors.delete(label);
      bumpDirty();
    };
  }, [label, dirty]);
}

export function useDiscardGuard(
  label: string,
  dirty: boolean,
  close: () => void,
): () => void {
  const guard = useNavGuard();
  useDirtyGuard(label, dirty);
  return () => guard(close);
}
