/** Moves JSON messages between the page and the plugin's Python layer. */
export interface BridgeTransport {
  send(message: unknown): void;
  onMessage(listener: (message: unknown) => void): void;
}

/** The bridge OrcaSlicer injects into plugin pages as `window.orca`. */
interface OrcaPageBridge {
  postMessage(data: unknown): void;
  onMessage(callback: (data: unknown) => void): void;
}

/** A transport over OrcaSlicer's injected `window.orca` bridge. */
export function windowOrcaTransport(): BridgeTransport {
  const bridge = (globalThis as { orca?: OrcaPageBridge }).orca;
  if (!bridge) {
    throw new Error('window.orca is missing: this page must run inside an OrcaSlicer plugin.');
  }
  return {
    send: (message) => bridge.postMessage(message),
    onMessage: (listener) => bridge.onMessage(listener),
  };
}
