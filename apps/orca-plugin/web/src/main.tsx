// Composition root for the OrcaSlicer plugin page: the bridge to the plugin's Python layer.
import { createComparerApp } from '@comparer/app';
import { createOrcaHost, windowOrcaTransport } from '@comparer/host-orca';
import { createSettingCatalog } from '@comparer/setting-catalog';
import { ComparerRoot } from '@comparer/ui';
import '@comparer/ui/theme/orca.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

const root = createRoot(document.getElementById('root')!);

try {
  const app = createComparerApp({
    repository: await createOrcaHost(windowOrcaTransport()),
    catalog: createSettingCatalog(),
  });
  root.render(
    <StrictMode>
      <ComparerRoot app={app} />
    </StrictMode>,
  );
} catch (error) {
  root.render(<pre role="alert">Couldn't connect to the plugin: {String(error)}</pre>);
}
