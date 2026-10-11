import { createComparerApp } from '@comparer/app';
import {
  ComparerError,
  type ProfileDocument,
  type ProfileRepository,
  type SettingCatalog,
} from '@comparer/core';
import { createMemoryHost } from '@comparer/host-memory';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ComparerRoot } from '../../ComparerRoot.tsx';

const filament = (
  name: string,
  content: Record<string, unknown>,
  origin: 'user' | 'system' = 'user',
): ProfileDocument => ({
  ref: {
    id: name,
    name,
    type: 'filament',
    origin,
    ...(origin === 'system' ? { vendor: 'V' } : {}),
  },
  content: { name, ...content },
});

const documents = [
  filament('Generic PETG', { nozzle_temperature: ['230'], fan_max_speed: ['60'] }, 'system'),
  filament('PLA', {
    nozzle_temperature: ['210'],
    fan_max_speed: ['100'],
    fan_min_speed: ['20'],
    print_speed: ['50'],
  }),
  filament('PETG', {
    inherits: 'Generic PETG',
    nozzle_temperature: ['240'],
    fan_min_speed: ['30'],
    print_speed: ['60'],
  }),
  filament('ASA', { nozzle_temperature: ['230'], fan_max_speed: ['60'] }),
];

const LABELS: Record<string, string> = {
  nozzle_temperature: 'Nozzle temperature',
  // OrcaSlicer reuses short labels like this one.
  fan_max_speed: 'Fan speed',
  fan_min_speed: 'Fan speed',
};

const catalog: SettingCatalog = {
  describe: (key) => ({ key, label: LABELS[key] ?? key }),
  defaultsFor: () => new Map(),
  legacyKeys: () => ({ obsolete: new Set<string>(), renamed: new Map<string, string>() }),
  // print_speed is a process setting: copying it into a filament is skipped.
  keyRules: () => ({ owned: new Set(Object.keys(LABELS)), perVariant: new Set<string>() }),
};

function setup(wrap: (host: ProfileRepository) => ProfileRepository = (host) => host) {
  const host = createMemoryHost({ documents });
  const app = createComparerApp({ repository: wrap(host), catalog });
  render(<ComparerRoot app={app} />);
  const fileText = async (name: string) => {
    const ref = (await host.listPresets()).find((preset) => preset.name === name)!;
    return (await host.readDocument(ref)).text!;
  };
  return { user: userEvent.setup(), fileText };
}

async function compare(user: ReturnType<typeof userEvent.setup>, left: string, right: string) {
  await user.selectOptions(await screen.findByLabelText('Left'), left);
  await user.selectOptions(screen.getByLabelText('Right'), right);
  return screen.findByRole('table');
}

const rowOf = (label: string) => within(screen.getByRole('table')).getByText(label).closest('tr')!;

describe('editing', () => {
  it('copies one setting with one click, marks it unsaved, and undoes and redoes it', async () => {
    const { user } = setup();
    await compare(user, 'PLA', 'PETG');

    await user.click(screen.getByRole('button', { name: 'Copy Nozzle temperature to PETG' }));

    // Both sides now agree, but the row stays visible because it has unsaved changes.
    const cells = within(rowOf('Nozzle temperature')).getAllByRole('cell');
    expect(cells.at(-1)).toHaveTextContent('210');
    expect(cells.at(-1)).toHaveClass('is-edited');
    expect(screen.getByText('1 unsaved change')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Copy Nozzle temperature to PETG');

    await user.click(screen.getByRole('button', { name: 'Undo: Copy Nozzle temperature to PETG' }));
    expect(within(rowOf('Nozzle temperature')).getAllByRole('cell').at(-1)).toHaveTextContent(
      '240',
    );
    expect(screen.getByText('No unsaved changes')).toBeInTheDocument();

    await user.keyboard('{Control>}y{/Control}');
    expect(within(rowOf('Nozzle temperature')).getAllByRole('cell').at(-1)).toHaveTextContent(
      '210',
    );
    await user.keyboard('{Control>}z{/Control}');
    expect(screen.getByText('No unsaved changes')).toBeInTheDocument();
  });

  it('copies the selected settings after showing what will change', async () => {
    const { user } = setup();
    await compare(user, 'PLA', 'PETG');

    await user.click(screen.getByRole('checkbox', { name: 'Select Nozzle temperature' }));
    await user.click(screen.getByRole('checkbox', { name: 'Select print_speed' }));
    await user.click(screen.getByRole('button', { name: 'Copy selected to PETG (2)' }));

    const dialog = screen.getByRole('dialog', { name: 'Copy 2 settings to PETG' });
    const nozzle = within(dialog).getByText('Nozzle temperature').closest('tr')!;
    expect(nozzle).toHaveTextContent(/240.*210/);
    const speed = within(dialog).getByText('print_speed').closest('tr')!;
    expect(speed).toHaveTextContent("OrcaSlicer doesn't use this setting in this kind of preset");
    expect(dialog).toHaveTextContent('1 setting changes in PETG. 1 left as they are.');

    await user.click(within(dialog).getByRole('button', { name: 'Copy' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('1 unsaved change')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Select Nozzle temperature' })).not.toBeChecked();
  });

  it('selects every shown setting at once', async () => {
    const { user } = setup();
    await compare(user, 'PLA', 'PETG');

    await user.click(screen.getByRole('checkbox', { name: 'Select all shown settings' }));

    expect(screen.getByRole('button', { name: /Copy selected to PETG \(4\)/ })).toBeEnabled();
  });

  it('explains a one-click copy that changes nothing', async () => {
    const { user } = setup();
    await compare(user, 'PLA', 'PETG');

    await user.click(screen.getByRole('button', { name: 'Copy print_speed to PETG' }));

    expect(screen.getByRole('status')).toHaveTextContent(
      "Didn't copy print_speed: OrcaSlicer doesn't use this setting in this kind of preset.",
    );
    expect(screen.getByText('No unsaved changes')).toBeInTheDocument();
  });

  it('asks whether to pin a redundant override, and saves the choice', async () => {
    const { user, fileText } = setup();
    await compare(user, 'ASA', 'PETG');

    // ASA's 230 is what PETG inherits from Generic PETG, so PETG's override would be redundant.
    await user.click(screen.getByRole('button', { name: 'Copy Nozzle temperature to PETG' }));
    const dialog = screen.getByRole('dialog', { name: 'Copy 1 setting to PETG' });
    const pin = within(dialog).getByRole('checkbox', {
      name: 'Pin override for Nozzle temperature',
    });
    expect(pin).not.toBeChecked();

    await user.click(
      within(dialog).getByRole('button', { name: 'About Pin override for Nozzle temperature' }),
    );
    expect(screen.getByRole('tooltip')).toHaveTextContent(
      'later changes to "Generic PETG" no longer reach it',
    );
    await user.click(pin);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Copy' }));

    await user.click(screen.getByRole('button', { name: 'Save…' }));
    await user.click(
      within(screen.getByRole('dialog', { name: 'Save changes' })).getByRole('button', {
        name: 'Save',
      }),
    );
    expect(await fileText('PETG')).toContain('"nozzle_temperature": [\n\t\t"230"\n\t]');
  });

  it('re-links an unpinned redundant override to the parent', async () => {
    const { user, fileText } = setup();
    await compare(user, 'ASA', 'PETG');

    await user.click(screen.getByRole('button', { name: 'Copy Nozzle temperature to PETG' }));
    await user.click(screen.getByRole('button', { name: 'Copy' }));
    await user.click(screen.getByRole('button', { name: 'Save…' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await fileText('PETG')).not.toContain('nozzle_temperature');
  });

  it('saves after a confirmation, and reports the result', async () => {
    const { user, fileText } = setup();
    await compare(user, 'PLA', 'PETG');
    await user.click(screen.getByRole('button', { name: 'Copy Nozzle temperature to PETG' }));

    await user.click(screen.getByRole('button', { name: 'Save…' }));
    const dialog = screen.getByRole('dialog', { name: 'Save changes' });
    expect(dialog).toHaveTextContent('PETG: Nozzle temperature');
    expect(dialog).not.toHaveTextContent('(nozzle_temperature)');
    expect(dialog).toHaveTextContent("A running OrcaSlicer won't see these changes");
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    const results = await screen.findByRole('region', { name: 'Save results' });
    expect(results).toHaveTextContent('Saved 1 of 1.');
    expect(await fileText('PETG')).toContain('"210"');
    expect(screen.getByText('No unsaved changes')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save…' })).toBeDisabled();
  });

  it('tells apart settings that share a label, in the controls and the save confirmation', async () => {
    const { user } = setup();
    await compare(user, 'PLA', 'PETG');

    await user.click(
      screen.getByRole('button', { name: 'Copy Fan speed (fan_min_speed) to PETG' }),
    );
    await user.click(screen.getByRole('button', { name: 'Save…' }));

    expect(screen.getByRole('dialog', { name: 'Save changes' })).toHaveTextContent(
      'PETG: Fan speed (fan_min_speed)',
    );
  });

  it('keeps failed saves pending, and retries them', async () => {
    let failures = 1;
    const { user, fileText } = setup((host) => ({
      ...host,
      async saveDocument(request) {
        if (failures-- > 0) throw new ComparerError('host-error', 'The disk is full.');
        return { ...(await host.saveDocument(request)), reloadRequired: 'restart' };
      },
    }));
    await compare(user, 'PLA', 'PETG');
    await user.click(screen.getByRole('button', { name: 'Copy Nozzle temperature to PETG' }));
    await user.click(screen.getByRole('button', { name: 'Save…' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    const results = await screen.findByRole('region', { name: 'Save results' });
    expect(results).toHaveTextContent("Couldn't save PETG; its changes stay unsaved.");
    expect(results).toHaveTextContent('The disk is full.');
    expect(screen.getByText('1 unsaved change')).toBeInTheDocument();

    await user.click(within(results).getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText(/Saved 1 of 1\./)).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Save results' })).toHaveTextContent(
      'Restart OrcaSlicer to see the changes.',
    );
    expect(await fileText('PETG')).toContain('"210"');
  });

  it('confirms before discarding unsaved changes', async () => {
    const { user } = setup();
    await compare(user, 'PLA', 'PETG');
    await user.click(screen.getByRole('button', { name: 'Copy Nozzle temperature to PETG' }));

    await user.selectOptions(screen.getByLabelText('Left'), 'ASA');
    await user.click(
      within(screen.getByRole('dialog', { name: 'Discard unsaved changes?' })).getByRole('button', {
        name: 'Keep editing',
      }),
    );
    expect(screen.getByLabelText('Left')).toHaveValue('PLA');
    expect(screen.getByText('1 unsaved change')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Left'), 'ASA');
    await user.click(screen.getByRole('button', { name: 'Discard changes' }));
    expect(screen.getByLabelText('Left')).toHaveValue('ASA');
    expect(await screen.findByText('No unsaved changes')).toBeInTheDocument();
  });

  it("doesn't offer copying into a system preset, and says why", async () => {
    const { user } = setup();
    await compare(user, 'PLA', 'Generic PETG');

    expect(
      screen.queryByRole('button', { name: 'Copy Nozzle temperature to Generic PETG' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Copy Nozzle temperature to PLA' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Copy selected to Generic PETG/ })).toBeDisabled();
    expect(within(screen.getByRole('table')).getByText('System')).toBeInTheDocument();
  });
});
