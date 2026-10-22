const ACTIVE = "scr-active";

// Shows a pane's scrollbar while it scrolls and retracts it when idle
// (specs/ui/layout.md). Returns a detach function.
export function attachScrollIndicators(
  root: Document | ShadowRoot = document,
  idleMs = 900,
): () => void {
  const timers = new WeakMap<Element, ReturnType<typeof setTimeout>>();
  const onScroll = (event: Event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    target.classList.add(ACTIVE);
    clearTimeout(timers.get(target));
    timers.set(
      target,
      setTimeout(() => {
        target.classList.remove(ACTIVE);
      }, idleMs),
    );
  };
  root.addEventListener("scroll", onScroll, true);
  return () => root.removeEventListener("scroll", onScroll, true);
}
