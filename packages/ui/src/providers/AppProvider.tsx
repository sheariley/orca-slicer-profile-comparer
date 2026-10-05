import type { ComparerApp } from '@comparer/app';
import type { ReactNode } from 'react';
import { AppContext } from './app-context.ts';

/** Supplies the wired-up app layer. Each composition root picks the host behind it. */
export function AppProvider({ app, children }: { app: ComparerApp; children: ReactNode }) {
  return <AppContext value={app}>{children}</AppContext>;
}
