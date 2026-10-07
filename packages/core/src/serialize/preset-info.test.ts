import { describe, expect, it } from 'vitest';
import { markPresetInfoForSync } from './preset-info.ts';

// As OrcaSlicer writes it on Windows (text mode: CRLF).
const synced =
  'sync_info = \r\nuser_id = b8b6\r\nsetting_id = 4d92\r\nbase_id = D6O8\r\nupdated_time = 1784832828\r\n';

describe('markPresetInfoForSync', () => {
  it('queues a synced preset for upload, keeping every other byte', () => {
    expect(markPresetInfoForSync(synced)).toBe(
      synced.replace('sync_info = \r\n', 'sync_info = update\r\n'),
    );
  });

  it('leaves presets already queued, not yet created in the cloud, or being deleted alone', () => {
    for (const state of ['update', 'create', 'delete']) {
      const text = synced.replace('sync_info = ', `sync_info = ${state}`);
      expect(markPresetInfoForSync(text)).toBe(text);
    }
  });

  it('replaces other states (e.g. "save" after a cloud pull, "hold" after a failed upload)', () => {
    for (const state of ['save', 'hold']) {
      const text = synced.replace('sync_info = ', `sync_info = ${state}`);
      expect(markPresetInfoForSync(text)).toContain('sync_info = update\r\n');
    }
  });

  it('keeps LF line endings in files saved on macOS or Linux', () => {
    const lf = synced.replace(/\r\n/g, '\n');
    expect(markPresetInfoForSync(lf)).toBe(lf.replace('sync_info = \n', 'sync_info = update\n'));
  });

  it('adds the line if it is missing', () => {
    expect(markPresetInfoForSync('user_id = x\r\n')).toBe('sync_info = update\r\nuser_id = x\r\n');
  });
});
