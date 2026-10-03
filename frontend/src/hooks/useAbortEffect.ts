import { useEffect, useRef } from "react";
import { isAbortError } from "./isAbortError";

/**
 * Standard AbortController pattern for raw axios fetches in useEffect.
 *
 * Long-term direction (documented decision):
 * - Prefer React Query (`useQuery`) for list/detail pages touched or added going
 *   forward — it is already configured in main.tsx (staleTime 30s).
 * - Keep this hook for pages that stay on raw axios so cancellation is consistent.
 *
 * Usage:
 *   const signal = useAbortEffect(() => { void load(signalRef...); }, [deps]);
 * Or inside an effect:
 *   useAbortEffect((signal) => { api.get(url, { signal }); }, [deps]);
 */
export function useAbortEffect(
  effect: (signal: AbortSignal) => void | (() => void),
  deps: React.DependencyList,
): void {
  const effectRef = useRef(effect);
  effectRef.current = effect;

  useEffect(() => {
    const controller = new AbortController();
    const cleanup = effectRef.current(controller.signal);
    return () => {
      controller.abort();
      if (typeof cleanup === "function") cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/**
 * Wrap an async loader so cancellation is ignored instead of surfacing as an error.
 * Returns false if the request was aborted (caller should not update state).
 */
export async function runAbortable<T>(
  signal: AbortSignal | undefined,
  fn: (signal: AbortSignal) => Promise<T>,
  onError?: (error: unknown) => void,
): Promise<T | undefined> {
  try {
    return await fn(signal as AbortSignal);
  } catch (error) {
    if (signal?.aborted || isAbortError(error)) return undefined;
    onError?.(error);
    return undefined;
  }
}
