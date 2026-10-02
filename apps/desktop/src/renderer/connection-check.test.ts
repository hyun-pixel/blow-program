import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkWithTimeout, connectionCheckMessage } from './connection-check.js';

afterEach(() => vi.useRealTimers());
describe('read-only connection checks', () => {
  it('returns successful checks and clears the timeout', async () => {
    vi.useFakeTimers();
    await expect(checkWithTimeout(async () => 'ready')).resolves.toBe('ready');
    expect(vi.getTimerCount()).toBe(0);
  });
  it('bounds a hung check without retrying it, and permits a new explicit check', async () => {
    vi.useFakeTimers();
    const read = vi.fn(() => new Promise<never>(() => {}));
    const pending = checkWithTimeout(read).catch(connectionCheckMessage);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(await pending).toContain('[CONNECTION_CHECK_TIMEOUT]');
    expect(read).toHaveBeenCalledTimes(1);
    await expect(checkWithTimeout(async () => 'recovered')).resolves.toBe('recovered');
    expect(vi.getTimerCount()).toBe(0);
  });
  it('handles synchronous and async failures without showing raw credentials', async () => {
    for (const read of [() => { throw new Error('private credential'); }, async () => { throw new Error('private credential'); }]) {
      const message = await checkWithTimeout(read).catch(connectionCheckMessage);
      expect(message).toContain('[CONNECTION_CHECK_FAILED]');
      expect(message).not.toContain('private credential');
    }
  });
});
