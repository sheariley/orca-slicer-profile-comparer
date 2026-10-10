import { presetIn, type EditSession } from '@comparer/app';
import { useMemo, useState } from 'react';
import { Dialog } from '../../components/Dialog.tsx';
import { InfoTip } from '../../components/InfoTip.tsx';
import { useComparerApp } from '../../hooks/useComparerApp.ts';
import { formatValue, settingNames } from '../diff-view/format.ts';
import { skipReasonText } from './skip-reasons.ts';

/** Copy `keys` from one open preset to another. */
export interface SingleCopy {
  readonly source: string;
  readonly target: string;
  readonly keys: readonly string[];
}

interface CopyPreviewDialogProps {
  readonly session: EditSession;
  readonly request: SingleCopy;
  /** Records the copy with the user's "Pin override" choices (setting key → keep). */
  readonly onApply: (pins: ReadonlyMap<string, boolean>) => void;
  readonly onCancel: () => void;
}

/**
 * Shows what a copy would do before recording it: each setting's value in the target now and
 * after the copy, why any are skipped, and a "Pin override" checkbox for each redundant override.
 * Changing a checkbox re-plans the copy.
 */
export function CopyPreviewDialog({ session, request, onApply, onCancel }: CopyPreviewDialogProps) {
  const app = useComparerApp();
  const [pins, setPins] = useState<ReadonlyMap<string, boolean>>(new Map());
  const { source, target, keys } = request;
  const targetName = presetIn(session, target).ref.name;
  const parent = presetIn(session, target).chain[1]?.ref.name;
  const parentText = parent ? `"${parent}"` : "OrcaSlicer's built-in default";

  const preview = useMemo(() => {
    // Recording it on a copy of the session shows the exact result (variant fitting included).
    const { session: after, plan } = app.copy(session, {
      source,
      targets: [target],
      keys,
      pinOverrides: new Map([[target, pins]]),
    });
    const valuesIn = (state: EditSession) =>
      new Map(app.compareEdited(state, source, target).rows.map((row) => [row.key, row.right]));
    return { plan: plan.targets[0]!, before: valuesIn(session), after: valuesIn(after) };
  }, [app, session, source, target, keys, pins]);

  const skipped = new Map(preview.plan.skipped.map((skip) => [skip.key, skip.reason]));
  const redundant = new Map(preview.plan.redundantOverrides.map((item) => [item.key, item.keep]));
  const changing = keys.filter((key) => !skipped.has(key)).length;

  const names = settingNames(keys, (key) => app.describeSetting(key)?.label ?? key);
  const setPin = (key: string, keep: boolean) => setPins(new Map(pins).set(key, keep));

  return (
    <Dialog
      title={`Copy ${keys.length === 1 ? '1 setting' : `${keys.length} settings`} to ${targetName}`}
      onClose={onCancel}
      actions={
        <>
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="primary"
            disabled={changing === 0}
            onClick={() => onApply(pins)}
          >
            Copy
          </button>
        </>
      }
    >
      <p>
        {changing === 0
          ? 'Nothing would change.'
          : `${changing} ${changing === 1 ? 'setting changes' : 'settings change'} in ${targetName}.`}
        {changing < keys.length && ` ${keys.length - changing} left as they are.`}
      </p>
      <table className="preview-table">
        <thead>
          <tr>
            <th scope="col">Setting</th>
            <th scope="col">Now</th>
            <th scope="col">After</th>
            <th scope="col">Notes</th>
          </tr>
        </thead>
        <tbody>
          {keys.map((key) => {
            const info = app.describeSetting(key);
            const label = info?.label ?? key;
            const reason = skipped.get(key);
            const keep = redundant.get(key);
            return (
              <tr key={key} data-skipped={reason !== undefined && keep === undefined}>
                <th scope="row">
                  {label}
                  {label !== key && <code className="setting-key">{key}</code>}
                </th>
                <td>{formatValue(preview.before.get(key), info?.unit)}</td>
                <td>{formatValue(preview.after.get(key), info?.unit)}</td>
                <td>
                  {keep !== undefined ? (
                    <span className="toggle">
                      <label className="toggle">
                        <input
                          type="checkbox"
                          aria-label={`Pin override for ${names.get(key) ?? label}`}
                          checked={keep}
                          onChange={(event) => setPin(key, event.target.checked)}
                        />
                        Pin override
                      </label>
                      <InfoTip
                        subject={`Pin override for ${names.get(key) ?? label}`}
                        content={
                          <>
                            <p>
                              After the copy, {targetName} would set the same value it inherits from{' '}
                              {parentText}.
                            </p>
                            <p>
                              Checked: {targetName} keeps its own value, so later changes to{' '}
                              {parentText} no longer reach it.
                            </p>
                            <p>
                              Unchecked: the setting is re-linked to {parentText} and follows it.
                            </p>
                          </>
                        }
                      />
                    </span>
                  ) : (
                    reason !== undefined && skipReasonText(reason, targetName)
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Dialog>
  );
}
