import type { Comparison } from '@comparer/app';
import type { NormalizedValue, ResolvedProfile } from '@comparer/core';
import { useMemo, useState } from 'react';
import { useComparerApp } from '../../hooks/useComparerApp.ts';
import { unitFor } from './format.ts';

function ValueCell({
  profile,
  settingKey,
  value,
  unit,
}: {
  profile: ResolvedProfile;
  settingKey: string;
  value: NormalizedValue | undefined;
  unit: string | undefined;
}) {
  if (value === undefined) return <td>—</td>;
  const source = profile.settings.get(settingKey)?.definedBy;
  const isDefault = source === 'default';
  const shownUnit = unitFor(value, unit);
  return (
    <td
      className={isDefault ? 'is-default' : undefined}
      title={isDefault ? "OrcaSlicer's built-in default" : source && `Set in "${source.name}"`}
    >
      {value.join(', ')}
      {shownUnit && <span className="unit"> {shownUnit}</span>}
    </td>
  );
}

export function DiffView({ comparison }: { comparison: Comparison }) {
  const app = useComparerApp();
  const [onlyDifferences, setOnlyDifferences] = useState(true);
  // Keys the catalog doesn't know are ones OrcaSlicer ignores when it loads a profile
  // (e.g. leftovers from Bambu Studio in bundled profiles).
  const [hideUnknown, setHideUnknown] = useState(true);
  const [filter, setFilter] = useState('');

  const described = useMemo(
    () => comparison.rows.map((row) => ({ row, info: app.describeSetting(row.key) })),
    [app, comparison],
  );
  const unknownCount = described.filter(({ info }) => !info).length;
  const candidates = hideUnknown ? described.filter(({ info }) => info) : described;
  const differenceCount = candidates.filter(({ row }) => row.status !== 'same').length;

  const needle = filter.trim().toLowerCase();
  const rows = candidates
    .filter(({ row }) => !onlyDifferences || row.status !== 'same')
    .filter(
      ({ row, info }) =>
        needle === '' ||
        row.key.toLowerCase().includes(needle) ||
        (info?.label.toLowerCase().includes(needle) ?? false),
    );

  return (
    <section className="diff" aria-label="Differences">
      <div className="diff-toolbar">
        <input
          type="search"
          placeholder="Filter settings"
          aria-label="Filter settings"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        />
        <label className="toggle">
          <input
            type="checkbox"
            checked={onlyDifferences}
            onChange={(event) => setOnlyDifferences(event.target.checked)}
          />
          Only differences ({differenceCount})
        </label>
        {unknownCount > 0 && (
          <label
            className="toggle"
            title="Keys OrcaSlicer doesn't define. It ignores them when it loads a profile."
          >
            <input
              type="checkbox"
              checked={hideUnknown}
              onChange={(event) => setHideUnknown(event.target.checked)}
            />
            Hide settings OrcaSlicer doesn't use ({unknownCount})
          </label>
        )}
      </div>
      <table>
        <colgroup>
          <col className="setting-column" />
          <col />
          <col />
        </colgroup>
        <thead>
          <tr>
            <th scope="col">Setting</th>
            <th scope="col">{comparison.left.ref.name}</th>
            <th scope="col">{comparison.right.ref.name}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ row, info }) => (
            <tr key={row.key} data-status={row.status}>
              <th scope="row" title={info?.tooltip}>
                <span className="setting-label">{info?.label ?? row.key}</span>
                {info && info.label !== row.key && <code className="setting-key">{row.key}</code>}
              </th>
              <ValueCell
                profile={comparison.left}
                settingKey={row.key}
                value={row.left}
                unit={info?.unit}
              />
              <ValueCell
                profile={comparison.right}
                settingKey={row.key}
                value={row.right}
                unit={info?.unit}
              />
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p className="empty">No settings match.</p>}
    </section>
  );
}
