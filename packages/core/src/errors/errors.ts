/**
 * Typed errors every layer can rely on. Adapters translate host failures (file system errors,
 * plugin audit denials, bridge errors) into these so the UI can explain them.
 */
export type ComparerErrorKind =
  | 'access-denied'
  | 'not-found'
  | 'invalid-profile'
  | 'inheritance-cycle'
  | 'unsupported'
  | 'host-error';

export class ComparerError extends Error {
  readonly kind: ComparerErrorKind;
  /** The file or preset the error is about, when there is one. */
  readonly subject: string | undefined;

  constructor(kind: ComparerErrorKind, message: string, subject?: string) {
    super(message);
    this.name = 'ComparerError';
    this.kind = kind;
    this.subject = subject;
  }
}

export function isComparerError(value: unknown): value is ComparerError {
  return value instanceof ComparerError;
}
