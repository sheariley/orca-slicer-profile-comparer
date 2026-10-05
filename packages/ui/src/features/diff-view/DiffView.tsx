import type { Comparison } from '@comparer/app';
import type { NormalizedValue, ResolvedProfile } from '@comparer/core';
import { useMemo, useState } from 'react';
import { InfoTip } from '../../components/InfoTip.tsx';
import { useComparerApp } from '../../hooks/useComparerApp.ts';
import { unitFor } from './format.ts';

/** Where a preset's value for a setting came from, in words. */
function sourceText(profile: ResolvedProfile, settingKey: string): string {
  const source = profile.settings.get(settingKey)?.definedBy;
  if (source === undefined) return 'not set';
  return source === 'default' ? "OrcaSlicer's built-in default" : `set in "${source.name}"`;
}

/** A row's tip: the setting's description, then where each side's value came from. */
function RowTip({
  comparison,
  settingKey,
  description,
}: {
  comparison: Comparison;
  settingKey: string;
  description: string | undefined;
}) {
  return (
    <>
      {description && <p>{description}</p>}
      <p>
        {comparison.left.ref.name}: {sourceText(comparison.left, settingKey)}
        <br />
        {comparison.right.ref.name}: {sourceText(comparison.right, settingKey)}
      </p>
    </>
  );
}

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
  const isDefault = profile.settings.get(settingKey)?.definedBy === 'default';
  const shownUnit = unitFor(value, unit);
  return (
    <td className={isDefault ? 'is-default' : undefined}>
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
          <span className="toggle">
            <label className="toggle">
              <input
                type="checkbox"
                checked={hideUnknown}
                onChange={(event) => setHideUnknown(event.target.checked)}
              />
              Hide settings OrcaSlicer doesn't use ({unknownCount})
            </label>
            <InfoTip
              subject="hidden settings"
              content="Keys OrcaSlicer doesn't define, such as Bambu Studio leftovers in bundled profiles. OrcaSlicer ignores them when it loads a profile."
            />
          </span>
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
              <th scope="row">
                <InfoTip
                  subject={info?.label ?? row.key}
                  content={
                    <RowTip
                      comparison={comparison}
                      settingKey={row.key}
                      description={info?.tooltip}
                    />
                  }
                >
                  <span className="setting-label">{info?.label ?? row.key}</span>
                </InfoTip>
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
