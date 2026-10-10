import type { PresetRef, ProfileType } from '@comparer/core';
import { useCallback, useState } from 'react';
import { Dialog } from './components/Dialog.tsx';
import { ErrorMessage } from './components/ErrorMessage.tsx';
import { InfoTip } from './components/InfoTip.tsx';
import { ComparisonEditor } from './features/editing/ComparisonEditor.tsx';
import { PresetPicker } from './features/preset-picker/PresetPicker.tsx';
import { useAsync } from './hooks/useAsync.ts';
import { useComparerApp } from './hooks/useComparerApp.ts';

const TYPES: readonly { type: ProfileType; label: string }[] = [
  { type: 'filament', label: 'Filament' },
  { type: 'process', label: 'Process' },
];

export function ComparerScreen() {
  const app = useComparerApp();
  const [type, setType] = useState<ProfileType>('filament');
  const [left, setLeft] = useState<PresetRef | null>(null);
  const [right, setRight] = useState<PresetRef | null>(null);

  const [dirty, setDirty] = useState(false);
  // A change of presets waiting for the user to confirm discarding unsaved changes.
  const [pendingChange, setPendingChange] = useState<(() => void) | null>(null);

  const presets = useAsync(type, () => app.listPresets({ type }));
  const comparisonKey = left && right ? `${left.id}\u0000${right.id}` : null;
  const session = useAsync(comparisonKey, () => app.openSession([left!, right!]));
  const onDirtyChange = useCallback((value: boolean) => setDirty(value), []);

  /** Runs a change that would close the current comparison, confirming first if it has edits. */
  const leaveComparison = (change: () => void) => {
    if (dirty) setPendingChange(() => change);
    else change();
  };
  const chooseType = (next: ProfileType) =>
    leaveComparison(() => {
      setType(next);
      setLeft(null);
      setRight(null);
    });

  const presetList = presets.status === 'done' ? presets.value : [];

  return (
    <div className="comparer">
      <header className="comparer-header">
        <h1>Profile Comparer</h1>
        <div className="type-tabs" role="tablist" aria-label="Profile type">
          {TYPES.map(({ type: value, label }) => (
            <button
              key={value}
              role="tab"
              aria-selected={type === value}
              onClick={() => type !== value && chooseType(value)}
            >
              {label}
            </button>
          ))}
        </div>
        {!app.capabilities.canSave && (
          <InfoTip
            subject="read-only mode"
            content="Saving isn't available here yet, so copying settings is turned off. You can still compare presets."
          >
            <span className="badge">Read-only</span>
          </InfoTip>
        )}
      </header>

      {presets.status === 'failed' ? (
        <ErrorMessage error={presets.error} />
      ) : (
        <div className="pickers">
          <PresetPicker
            label="Left"
            presets={presetList}
            value={left}
            onChange={(next) => leaveComparison(() => setLeft(next))}
          />
          <PresetPicker
            label="Right"
            presets={presetList}
            value={right}
            onChange={(next) => leaveComparison(() => setRight(next))}
          />
        </div>
      )}

      {session.status === 'loading' && <p className="status">Comparing…</p>}
      {session.status === 'failed' && <ErrorMessage error={session.error} />}
      {session.status === 'done' && (
        <ComparisonEditor
          key={comparisonKey}
          initial={session.value}
          left={left!}
          right={right!}
          onDirtyChange={onDirtyChange}
        />
      )}
      {session.status === 'idle' && (
        <p className="status">Choose two presets to see how they differ.</p>
      )}

      {pendingChange && (
        <Dialog
          title="Discard unsaved changes?"
          onClose={() => setPendingChange(null)}
          actions={
            <>
              <button type="button" onClick={() => setPendingChange(null)}>
                Keep editing
              </button>
              <button
                type="button"
                className="danger"
                onClick={() => {
                  pendingChange();
                  setDirty(false);
                  setPendingChange(null);
                }}
              >
                Discard changes
              </button>
            </>
          }
        >
          <p>Choosing other presets closes this comparison, and its unsaved changes are lost.</p>
        </Dialog>
      )}
    </div>
  );
}
