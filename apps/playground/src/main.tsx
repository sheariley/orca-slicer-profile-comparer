// Composition root for the browser playground: the in-memory host seeded with the profile
// fixtures from packages/core. For fast UI work without Tauri or OrcaSlicer.
import { createComparerApp } from '@comparer/app';
import type { ProfileDocument, ProfileType } from '@comparer/core';
import { createMemoryHost } from '@comparer/host-memory';
import { createSettingCatalog } from '@comparer/setting-catalog';
import { ComparerRoot } from '@comparer/ui';
import '@comparer/ui/theme/desktop.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

const fixtures = import.meta.glob<Record<string, unknown>>(
  '../../../packages/core/test/fixtures/**/*.json',
  { eager: true, import: 'default' },
);

/** fixtures/system/<vendor>/<type>/<file> or fixtures/user/<user_id>/<type>/<file> */
function toDocument([path, content]: [string, Record<string, unknown>]): ProfileDocument {
  const id = path.slice(path.indexOf('/fixtures/') + '/fixtures/'.length);
  const [origin, owner, type] = id.split('/');
  return {
    ref: {
      id,
      name: String(content['name']),
      type: type as ProfileType,
      origin: origin === 'system' ? 'system' : 'user',
      ...(origin === 'system' && owner ? { vendor: owner } : {}),
    },
    content,
  };
}

const app = createComparerApp({
  repository: createMemoryHost({ documents: Object.entries(fixtures).map(toDocument) }),
  catalog: createSettingCatalog(),
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ComparerRoot app={app} />
  </StrictMode>,
);
