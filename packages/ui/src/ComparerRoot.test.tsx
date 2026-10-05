import { createComparerApp } from '@comparer/app';
import type { ProfileDocument } from '@comparer/core';
import { createMemoryHost } from '@comparer/host-memory';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ComparerRoot } from './ComparerRoot.tsx';

const filament = (name: string, content: Record<string, unknown>): ProfileDocument => ({
  ref: { id: name, name, type: 'filament', origin: 'user' },
  content: { name, ...content },
});

const documents = [
  filament('PLA', { nozzle_temperature: ['210'], fan_max_speed: ['100'], bambu_only: ['1'] }),
  filament('PETG', { nozzle_temperature: ['240'], fan_max_speed: ['100'] }),
];

function renderComparer(canSave = false) {
  const app = createComparerApp({
    repository: createMemoryHost({ documents, capabilities: { canSave } }),
    catalog: {
      describe: (key) =>
        key === 'nozzle_temperature'
          ? { key, label: 'Nozzle temperature', unit: '℃' }
          : key === 'bambu_only'
            ? undefined
            : { key, label: key },
      defaultsFor: () => new Map([['filament_density', ['1.24']]]),
      legacyKeys: () => ({ obsolete: new Set<string>(), renamed: new Map<string, string>() }),
    },
  });
  return render(<ComparerRoot app={app} />);
}

describe('ComparerRoot', () => {
  it('shows only the differing settings between two presets, by label', async () => {
    const user = userEvent.setup();
    renderComparer();

    await user.selectOptions(await screen.findByLabelText('Left'), 'PLA');
    await user.selectOptions(screen.getByLabelText('Right'), 'PETG');

    const table = await screen.findByRole('table');
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent('Nozzle temperature');
    expect(rows[0]).toHaveTextContent('210');
    expect(rows[0]).toHaveTextContent('240');
  });

  it('can show identical settings too', async () => {
    const user = userEvent.setup();
    renderComparer();

    await user.selectOptions(await screen.findByLabelText('Left'), 'PLA');
    await user.selectOptions(screen.getByLabelText('Right'), 'PETG');
    await user.click(await screen.findByLabelText(/Only differences/));

    expect(within(screen.getByRole('table')).getByText('fan_max_speed')).toBeInTheDocument();
  });

  it("marks values that are OrcaSlicer's built-in defaults", async () => {
    const user = userEvent.setup();
    renderComparer();

    await user.selectOptions(await screen.findByLabelText('Left'), 'PLA');
    await user.selectOptions(screen.getByLabelText('Right'), 'PETG');
    await user.click(await screen.findByLabelText(/Only differences/));

    const row = within(screen.getByRole('table')).getByText('filament_density').closest('tr')!;
    const cells = within(row).getAllByRole('cell');
    expect(cells[0]).toHaveTextContent('1.24');
    expect(cells[0]).toHaveAttribute('title', "OrcaSlicer's built-in default");
    expect(
      within(row.parentElement!).getByText('fan_max_speed').closest('tr')!.querySelector('td'),
    ).toHaveAttribute('title', 'Set in "PLA"');
  });

  it("hides settings OrcaSlicer doesn't use until asked", async () => {
    const user = userEvent.setup();
    renderComparer();

    await user.selectOptions(await screen.findByLabelText('Left'), 'PLA');
    await user.selectOptions(screen.getByLabelText('Right'), 'PETG');
    const table = await screen.findByRole('table');
    expect(within(table).queryByText('bambu_only')).not.toBeInTheDocument();

    await user.click(screen.getByLabelText(/Hide settings OrcaSlicer doesn't use \(1\)/));
    expect(within(table).getByText('bambu_only')).toBeInTheDocument();
  });

  it('marks a host that cannot save as read-only', async () => {
    renderComparer(false);
    expect(await screen.findByText('Read-only')).toBeInTheDocument();
  });
});
