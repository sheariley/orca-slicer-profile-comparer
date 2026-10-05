import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { methods, requestSchema, responseSchema, type Method } from './protocol.ts';

interface Exchange {
  name: string;
  request: unknown;
  response: unknown;
}

const samples = JSON.parse(
  readFileSync(path.join(import.meta.dirname, '..', 'samples', 'exchanges.json'), 'utf8'),
) as { exchanges: Exchange[] };

describe('bridge protocol samples', () => {
  it.each(samples.exchanges.map((exchange) => [exchange.name, exchange] as const))(
    '%s matches the schemas',
    (_, { request, response }) => {
      const parsedRequest = requestSchema.parse(request);
      const parsedResponse = responseSchema.parse(response);
      const method = methods[parsedRequest.method as Method];

      expect(parsedResponse.id).toBe(parsedRequest.id);
      method.params.parse(parsedRequest.params);
      if (parsedResponse.ok) method.result.parse(parsedResponse.result);
    },
  );
});
