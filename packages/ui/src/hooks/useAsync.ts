import { useEffect, useState } from 'react';

export type AsyncState<T> =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'done'; readonly value: T }
  | { readonly status: 'failed'; readonly error: unknown };

/**
 * Runs `load` whenever `key` changes and tracks its state. A null key means "nothing to load".
 * Results from superseded runs are dropped.
 */
export function useAsync<T>(key: string | null, load: () => Promise<T>): AsyncState<T> {
  const [state, setState] = useState<{ key: string | null; value: AsyncState<T> }>({
    key: null,
    value: { status: 'idle' },
  });

  useEffect(() => {
    if (key === null) return;
    let current = true;
    load().then(
      (value) => current && setState({ key, value: { status: 'done', value } }),
      (error: unknown) => current && setState({ key, value: { status: 'failed', error } }),
    );
    return () => {
      current = false;
    };
    // `load` is expected to change with `key`; keying on it alone avoids reload loops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (key === null) return { status: 'idle' };
  return state.key === key ? state.value : { status: 'loading' };
}
