import type { SavePreview } from '@comparer/app';
import { Dialog } from '../../components/Dialog.tsx';

interface SaveDialogProps {
  readonly previews: readonly SavePreview[];
  /**
   * A setting's name as the comparison shows it: its label, plus the key when another setting
   * shares the label (see settingNames).
   */
  readonly nameOf: (key: string) => string;
  readonly saving: boolean;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

/** The confirmation before saving: what each file gets, plus anything to know first. */
export function SaveDialog({ previews, nameOf, saving, onConfirm, onCancel }: SaveDialogProps) {
  const ready = previews.filter((preview) => preview.status === 'ready');

  return (
    <Dialog
      title="Save changes"
      // Not dismissible mid-save: the results need somewhere to land.
      {...(saving ? {} : { onClose: onCancel })}
      actions={
        <>
          <button type="button" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
          <button
            type="button"
            className="primary"
            onClick={onConfirm}
            disabled={saving || ready.length === 0}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      <ul className="save-list">
        {previews.map(({ target, status, keys, reformatted }) => (
          <li key={target.id}>
            <strong>{target.name}</strong>: {keys.map(nameOf).join(', ')}
            {status === 'needs-user-preset' && (
              <p className="warning">
                A system preset can't be changed, and saving it as a new user preset isn't available
                yet. Its changes stay unsaved.
              </p>
            )}
            {reformatted && (
              <p className="warning">
                This file isn't laid out the way OrcaSlicer writes it (it may have been edited by
                hand), so saving rewrites all of it in OrcaSlicer's layout. The settings stay the
                same.
              </p>
            )}
          </li>
        ))}
      </ul>
      <p className="warning">
        A running OrcaSlicer won't see these changes until it reloads its presets (the results will
        say how). Until then, saving the same presets in OrcaSlicer would overwrite them.
      </p>
    </Dialog>
  );
}
