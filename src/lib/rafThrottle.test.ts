import { describe, expect, it, vi } from 'vitest';
import { rafThrottle } from './rafThrottle';

describe('rafThrottle', () => {
  it('invokes once per animation frame with the latest args', () => {
    const queue: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      queue.push(cb);
      return queue.length;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {});
    const spy = vi.fn();
    const throttled = rafThrottle(spy);
    throttled('a');
    throttled('b');
    throttled('c');
    expect(spy).not.toHaveBeenCalled();
    expect(queue).toHaveLength(1);
    queue[0](0);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith('c');
    vi.unstubAllGlobals();
  });
});
