import type { ComparerApp } from '@comparer/app';
import { ComparerScreen } from './ComparerScreen.tsx';
import { AppProvider } from './providers/AppProvider.tsx';
import './theme/base.css';

/** The whole UI. Composition roots render this with an app wired to their host. */
export function ComparerRoot({ app }: { app: ComparerApp }) {
  return (
    <AppProvider app={app}>
      <ComparerScreen />
    </AppProvider>
  );
}
