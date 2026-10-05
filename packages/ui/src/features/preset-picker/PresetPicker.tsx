import type { PresetRef } from '@comparer/core';
import { useId } from 'react';

interface PresetPickerProps {
  readonly label: string;
  readonly presets: readonly PresetRef[];
  readonly value: PresetRef | null;
  readonly onChange: (preset: PresetRef | null) => void;
}

function optionLabel(preset: PresetRef): string {
  const origin = preset.origin === 'user' ? 'User' : (preset.vendor ?? 'System');
  return `${preset.name} — ${origin}`;
}

export function PresetPicker({ label, presets, value, onChange }: PresetPickerProps) {
  const id = useId();
  return (
    <div className="picker">
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        value={value?.id ?? ''}
        onChange={(event) => onChange(presets.find((p) => p.id === event.target.value) ?? null)}
      >
        <option value="">Choose a preset…</option>
        {presets.map((preset) => (
          <option key={preset.id} value={preset.id}>
            {optionLabel(preset)}
          </option>
        ))}
      </select>
    </div>
  );
}
