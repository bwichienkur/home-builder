/** Coalesce high-frequency pointer updates to one callback per animation frame. */
export function rafThrottle<T extends (...args: any[]) => void>(fn: T): T & { cancel: () => void } {
  let frame = 0;
  let latest: Parameters<T> | null = null;
  const run = ((...args: Parameters<T>) => {
    latest = args;
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (latest) fn(...latest);
      latest = null;
    });
  }) as T & { cancel: () => void };
  run.cancel = () => {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    latest = null;
  };
  return run;
}
