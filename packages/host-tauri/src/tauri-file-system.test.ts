import { beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke }));
vi.mock('@tauri-apps/api/path', () => ({}));
vi.mock('@tauri-apps/plugin-fs', () => ({}));
const { tauriPresetLock } = await import('./tauri-file-system.ts');

describe('tauriPresetLock', () => {
  beforeEach(() => invoke.mockReset());

  it('runs the work under the lock, and always releases it', async () => {
    invoke.mockResolvedValueOnce(7).mockResolvedValueOnce(undefined);
    await expect(
      tauriPresetLock().withLock(() => Promise.reject(new Error('boom'))),
    ).rejects.toThrow('boom');
    expect(invoke.mock.calls).toEqual([
      ['lock_user_presets'],
      ['unlock_user_presets', { token: 7 }],
    ]);
  });

  it('reports a lock that stays taken as busy, without running the work', async () => {
    invoke.mockRejectedValueOnce('busy');
    const work = vi.fn();
    await expect(tauriPresetLock().withLock(work)).rejects.toMatchObject({ kind: 'busy' });
    expect(work).not.toHaveBeenCalled();
  });

  it('reports other lock failures as host errors', async () => {
    invoke.mockRejectedValueOnce('C:\\\\...\\\\user.lock: Access is denied.');
    await expect(tauriPresetLock().withLock(vi.fn())).rejects.toMatchObject({
      kind: 'host-error',
      message: expect.stringContaining('Access is denied'),
    });
  });
});
