// The message format between the plugin UI (host-orca) and the plugin's Python layer.
//
// The page sends a request; Python answers with a response carrying the same id. Every
// message names the protocol version, and the first request is always `hello`. Python can't
// use these zod schemas, so samples/ holds example messages both sides test against.
import { z } from 'zod';

export const PROTOCOL_VERSION = 1;

export const profileTypeSchema = z.enum(['filament', 'process', 'machine']);

export const presetRefSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  type: profileTypeSchema,
  origin: z.enum(['system', 'user', 'file']),
  vendor: z.string().optional(),
});

const contentSchema = z.record(z.string(), z.unknown());

const capabilitiesSchema = z.object({
  canSave: z.boolean(),
  canBrowseFiles: z.boolean(),
  canWatchForChanges: z.boolean(),
});

/** Each method's params and result. */
export const methods = {
  hello: {
    params: z.object({ protocolVersion: z.number().int() }),
    result: z.object({ protocolVersion: z.number().int(), capabilities: capabilitiesSchema }),
  },
  listPresets: {
    params: z.object({ type: profileTypeSchema.optional() }),
    result: z.object({ presets: z.array(presetRefSchema) }),
  },
  readDocument: {
    params: z.object({ ref: presetRefSchema }),
    result: z.object({ content: contentSchema }),
  },
  resolveParent: {
    params: z.object({ child: presetRefSchema, parentName: z.string() }),
    result: z.object({ ref: presetRefSchema.nullable() }),
  },
  saveDocument: {
    params: z.object({ ref: presetRefSchema, content: contentSchema }),
    result: z.object({ reloadRequired: z.enum(['none', 'reselect-preset', 'restart']) }),
  },
} as const;

export type Method = keyof typeof methods;
export type Params<M extends Method> = z.infer<(typeof methods)[M]['params']>;
export type Result<M extends Method> = z.infer<(typeof methods)[M]['result']>;

const methodNames = Object.keys(methods) as [Method, ...Method[]];

export const requestSchema = z.object({
  protocol: z.literal(PROTOCOL_VERSION),
  id: z.string().min(1),
  method: z.enum(methodNames),
  params: z.unknown(),
});

export const errorSchema = z.object({
  kind: z.enum([
    'access-denied',
    'not-found',
    'invalid-profile',
    'inheritance-cycle',
    'unsupported',
    'host-error',
  ]),
  message: z.string(),
  subject: z.string().optional(),
});

export const responseSchema = z.discriminatedUnion('ok', [
  z.object({
    protocol: z.literal(PROTOCOL_VERSION),
    id: z.string(),
    ok: z.literal(true),
    result: z.unknown(),
  }),
  z.object({
    protocol: z.literal(PROTOCOL_VERSION),
    id: z.string(),
    ok: z.literal(false),
    error: errorSchema,
  }),
]);

export type BridgeRequest = z.infer<typeof requestSchema>;
export type BridgeResponse = z.infer<typeof responseSchema>;
export type BridgeError = z.infer<typeof errorSchema>;
