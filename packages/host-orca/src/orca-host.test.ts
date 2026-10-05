import {
  methods,
  PROTOCOL_VERSION,
  requestSchema,
  type BridgeRequest,
  type BridgeResponse,
} from '@comparer/bridge-protocol';
import { isComparerError, type ProfileRepository } from '@comparer/core';
import { describeProfileRepositoryContract } from '@comparer/host-contract-tests';
import { createMemoryHost } from '@comparer/host-memory';
import { describe, expect, it } from 'vitest';
import { createOrcaHost } from './orca-host.ts';
import type { BridgeTransport } from './transport.ts';

/**
 * A stand-in for the Python layer: answers bridge requests from a backing repository. The real
 * Python handlers are tested against the shared samples in packages/bridge-protocol.
 */
function fakePluginTransport(backend: ProfileRepository): BridgeTransport {
  let listener: (message: unknown) => void = () => {};

  const handle = async ({ method, params }: BridgeRequest): Promise<unknown> => {
    switch (method) {
      case 'hello':
        return { protocolVersion: PROTOCOL_VERSION, capabilities: backend.capabilities };
      case 'listPresets':
        return { presets: await backend.listPresets(methods.listPresets.params.parse(params)) };
      case 'readDocument': {
        const { ref } = methods.readDocument.params.parse(params);
        return { content: (await backend.readDocument(ref)).content };
      }
      case 'resolveParent': {
        const { child, parentName } = methods.resolveParent.params.parse(params);
        return { ref: (await backend.resolveParent(child, parentName)) ?? null };
      }
      case 'saveDocument': {
        const { ref, content } = methods.saveDocument.params.parse(params);
        return await backend.saveDocument({ ref, content });
      }
    }
  };

  return {
    onMessage: (next) => {
      listener = next;
    },
    send: (message) => {
      const request = requestSchema.parse(message);
      void handle(request).then(
        (result) => reply({ protocol: PROTOCOL_VERSION, id: request.id, ok: true, result }),
        (error: unknown) =>
          reply({
            protocol: PROTOCOL_VERSION,
            id: request.id,
            ok: false,
            error: isComparerError(error)
              ? {
                  kind: error.kind,
                  message: error.message,
                  ...(error.subject ? { subject: error.subject } : {}),
                }
              : { kind: 'host-error', message: String(error) },
          }),
      );
    },
  };

  function reply(response: BridgeResponse) {
    queueMicrotask(() => listener(response));
  }
}

describeProfileRepositoryContract('host-orca over the bridge', (documents) =>
  createOrcaHost(
    fakePluginTransport(createMemoryHost({ documents, capabilities: { canSave: false } })),
  ),
);

describe('createOrcaHost', () => {
  it('times out when the plugin never answers', async () => {
    const silent: BridgeTransport = { send: () => {}, onMessage: () => {} };

    await expect(createOrcaHost(silent, { timeoutMs: 10 })).rejects.toMatchObject({
      kind: 'host-error',
    });
  });

  it('ignores messages that are not bridge responses', async () => {
    let listener: (message: unknown) => void = () => {};
    const transport: BridgeTransport = {
      onMessage: (next) => {
        listener = next;
      },
      send: (message) => {
        const { id } = requestSchema.parse(message);
        listener({ unrelated: true });
        listener({
          protocol: PROTOCOL_VERSION,
          id,
          ok: true,
          result: {
            protocolVersion: PROTOCOL_VERSION,
            capabilities: { canSave: false, canBrowseFiles: false, canWatchForChanges: false },
          },
        });
      },
    };

    const host = await createOrcaHost(transport);
    expect(host.capabilities.canSave).toBe(false);
  });
});
