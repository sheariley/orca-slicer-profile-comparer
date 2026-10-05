import type { ComparerApp } from '@comparer/app';
import { use } from 'react';
import { AppContext } from '../providers/app-context.ts';

export function useComparerApp(): ComparerApp {
  const app = use(AppContext);
  if (!app) throw new Error('useComparerApp must be used inside <AppProvider>.');
  return app;
}
