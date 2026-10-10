import type { TargetSaveResult } from '@comparer/app';
import { ErrorMessage } from '../../components/ErrorMessage.tsx';

interface SaveResultsProps {
  readonly results: readonly TargetSaveResult[];
  readonly retrying: boolean;
  /** Saves the failed presets again (their edits are still pending). */
  readonly onRetry: () => void;
  readonly onDismiss: () => void;
}

/** The outcome of a save, per preset, and what the user has to do next. */
export function SaveResults({ results, retrying, onRetry, onDismiss }: SaveResultsProps) {
  const saved = results.filter((result) => result.status === 'saved');
  const failed = results.filter((result) => result.status === 'failed');
  const restart = saved.some((result) => result.reloadRequired === 'restart');
  const reselect = saved.some((result) => result.reloadRequired === 'reselect-preset');

  const summary = [
    saved.length > 0 && `Saved ${saved.length} of ${results.length}.`,
    failed.length > 0 && `${failed.length} failed.`,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <section className="save-results" aria-label="Save results">
      <p role="status">
        <strong>{summary || 'Nothing was saved.'}</strong>
        {restart && ' Restart OrcaSlicer to see the changes.'}
        {!restart && reselect && ' Re-select the presets in OrcaSlicer to see the changes.'}
      </p>
      <ul>
        {results.map((result) => (
          <li key={result.target.id} data-status={result.status}>
            {result.status === 'saved' && (
              <>
                Saved {result.target.name}.
                {result.reformatted && " The file was rewritten in OrcaSlicer's layout."}
              </>
            )}
            {result.status === 'needs-user-preset' && (
              <>
                {result.target.name} is a system preset, which can't be changed. Saving it as a new
                user preset isn't available yet, so its changes stay unsaved.
              </>
            )}
            {result.status === 'failed' && (
              <>
                Couldn't save {result.target.name}; its changes stay unsaved.
                <ErrorMessage error={result.error} />
              </>
            )}
          </li>
        ))}
      </ul>
      <div className="save-results-actions">
        {failed.length > 0 && (
          <button type="button" onClick={onRetry} disabled={retrying}>
            {retrying ? 'Saving…' : 'Try again'}
          </button>
        )}
        <button type="button" onClick={onDismiss}>
          Dismiss
        </button>
      </div>
    </section>
  );
}
