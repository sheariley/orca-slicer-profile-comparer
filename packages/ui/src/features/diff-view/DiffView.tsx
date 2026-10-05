import type { Comparison } from '@comparer/app';
import type { NormalizedValue } from '@comparer/core';
import { useMemo, useState } from 'react';
import { useComparerApp } from '../../hooks/useComparerApp.ts';

function formatValue(value: NormalizedValue | undefined): string {
  if (value === undefined) return '—';
  return value.join(', ');
}

export function DiffView({ comparison }: { comparison: Comparison }) {
  const app = useComparerApp();
  const [onlyDifferences, setOnlyDifferences] = useState(true);
  const [filter, setFilter] = useState('');

  const rows = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return comparison.rows
      .filter((row) => !onlyDifferences || row.status !== 'same')
      .map((row) => ({ row, info: app.describeSetting(row.key) }))
      .filter(
        ({ row, info }) =>
          needle === '' ||
          row.key.toLowerCase().includes(needle) ||
          (info?.label.toLowerCase().includes(needle) ?? false),
      );
  }, [app, comparison, filter, onlyDifferences]);

  const differenceCount = comparison.rows.filter((row) => row.status !== 'same').length;

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
              <td>
                {formatValue(row.left)}
                {row.left && info?.unit && <span className="unit"> {info.unit}</span>}
              </td>
              <td>
                {formatValue(row.right)}
                {row.right && info?.unit && <span className="unit"> {info.unit}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p className="empty">No settings match.</p>}
    </section>
  );
}
