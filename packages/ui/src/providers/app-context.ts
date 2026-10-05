import type { ComparerApp } from '@comparer/app';
import { createContext } from 'react';

export const AppContext = createContext<ComparerApp | null>(null);
