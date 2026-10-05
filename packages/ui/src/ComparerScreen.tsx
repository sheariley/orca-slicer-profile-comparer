import type { PresetRef, ProfileType } from '@comparer/core';
import { useState } from 'react';
import { ErrorMessage } from './components/ErrorMessage.tsx';
import { DiffView } from './features/diff-view/DiffView.tsx';
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

  const presets = useAsync(type, () => app.listPresets({ type }));
  const comparisonKey = left && right ? `${left.id}\u0000${right.id}` : null;
  const comparison = useAsync(comparisonKey, () => app.compare(left!, right!));

  const chooseType = (next: ProfileType) => {
    setType(next);
    setLeft(null);
    setRight(null);
  };

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
              onClick={() => chooseType(value)}
            >
              {label}
            </button>
          ))}
        </div>
        {!app.capabilities.canSave && <span className="badge">Read-only</span>}
      </header>

      {presets.status === 'failed' ? (
        <ErrorMessage error={presets.error} />
      ) : (
        <div className="pickers">
          <PresetPicker label="Left" presets={presetList} value={left} onChange={setLeft} />
          <PresetPicker label="Right" presets={presetList} value={right} onChange={setRight} />
        </div>
      )}

      {comparison.status === 'loading' && <p className="status">Comparing…</p>}
      {comparison.status === 'failed' && <ErrorMessage error={comparison.error} />}
      {comparison.status === 'done' && <DiffView comparison={comparison.value} />}
      {comparison.status === 'idle' && (
        <p className="status">Choose two presets to see how they differ.</p>
      )}
    </div>
  );
}
