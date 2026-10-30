import { useEffect, useRef } from "react";

interface PollingOptions {
  enabled?: boolean;
  immediate?: boolean;
  onError?: (err: unknown) => void;
}

// Run `fn` immediately then every `ms`; re-arms when fn/ms/enabled change and
// always clears on unmount. Rejections never escape — they go to `onError`.
export function usePolling(
  fn: () => Promise<unknown> | unknown,
  ms: number,
  options: PollingOptions = {},
): void {
  const { enabled = true, immediate = true } = options;
  const onErrorRef = useRef(options.onError);
  onErrorRef.current = options.onError;
  useEffect(() => {
    if (!enabled) return undefined;
    let stopped = false;
    const tick = () => {
      void Promise.resolve()
        .then(fn)
        .catch((err: unknown) => {
          if (!stopped && onErrorRef.current) onErrorRef.current(err);
        });
    };
    if (immediate) tick();
    const timer = setInterval(tick, ms);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [fn, ms, enabled, immediate]);
}
