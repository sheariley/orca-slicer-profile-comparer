import { getCurrentWindow } from '@tauri-apps/api/window';
import type { CloseGuard } from '@comparer/core';

/**
 * CloseGuard over the Tauri window. With a close-requested listener, Tauri closes the window
 * only if the listener doesn't call preventDefault. `destroy` closes without asking again
 * (needs `core:window:allow-destroy` in capabilities/).
 */
export function tauriCloseGuard(): CloseGuard {
  const window = getCurrentWindow();
  return {
    onCloseRequested(mayClose) {
      const unlisten = window.onCloseRequested((event) => {
        if (!mayClose()) event.preventDefault();
      });
      return () => void unlisten.then((stop) => stop());
    },
    close: () => void window.destroy(),
  };
}
