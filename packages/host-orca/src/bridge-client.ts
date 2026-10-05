import {
  methods,
  PROTOCOL_VERSION,
  responseSchema,
  type Method,
  type Params,
  type Result,
} from '@comparer/bridge-protocol';
import { ComparerError } from '@comparer/core';
import type { BridgeTransport } from './transport.ts';

interface Pending {
  readonly method: Method;
  readonly resolve: (result: unknown) => void;
  readonly reject: (error: ComparerError) => void;
  readonly timer: ReturnType<typeof setTimeout>;
}

export interface BridgeClient {
  call<M extends Method>(method: M, params: Params<M>): Promise<Result<M>>;
}

/** Request/response over a transport: correlates ids, validates replies, maps errors. */
export function createBridgeClient(transport: BridgeTransport, timeoutMs = 15_000): BridgeClient {
  const pending = new Map<string, Pending>();
  let nextId = 1;

  transport.onMessage((message) => {
    const parsed = responseSchema.safeParse(message);
    if (!parsed.success) return; // Not a bridge response; ignore it.
    const response = parsed.data;
    const request = pending.get(response.id);
    if (!request) return;
    pending.delete(response.id);
    clearTimeout(request.timer);

    if (!response.ok) {
      const { kind, message: text, subject } = response.error;
      request.reject(new ComparerError(kind, text, subject));
      return;
    }
    const result = methods[request.method].result.safeParse(response.result);
    if (result.success) request.resolve(result.data);
    else request.reject(new ComparerError('host-error', `Malformed ${request.method} result.`));
  });

  return {
    call(method, params) {
      const id = String(nextId++);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new ComparerError('host-error', `The plugin didn't answer ${method} in time.`));
        }, timeoutMs);
        pending.set(id, { method, resolve: resolve as (result: unknown) => void, reject, timer });
        transport.send({ protocol: PROTOCOL_VERSION, id, method, params });
      });
    },
  };
}
