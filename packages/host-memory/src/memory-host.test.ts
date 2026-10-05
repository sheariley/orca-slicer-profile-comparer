import { describeProfileRepositoryContract } from '@comparer/host-contract-tests';
import { createMemoryHost } from './memory-host.ts';

describeProfileRepositoryContract('host-memory', (documents) => createMemoryHost({ documents }));

describeProfileRepositoryContract('host-memory (read-only)', (documents) =>
  createMemoryHost({ documents, capabilities: { canSave: false } }),
);
