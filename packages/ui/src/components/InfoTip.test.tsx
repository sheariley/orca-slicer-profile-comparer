import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { InfoTip } from './InfoTip.tsx';

function renderTip() {
  return render(
    <div>
      <InfoTip subject="Nozzle temperature" content="Temperature after the first layer.">
        <span>Nozzle temperature</span>
      </InfoTip>
      <button type="button">Elsewhere</button>
    </div>,
  );
}

const button = () => screen.getByRole('button', { name: 'About Nozzle temperature' });

describe('InfoTip', () => {
  it('shows the tip while the element is hovered', async () => {
    const user = userEvent.setup();
    renderTip();

    await user.hover(screen.getByText('Nozzle temperature'));
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'Temperature after the first layer.',
    );

    await user.unhover(screen.getByText('Nozzle temperature'));
    await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument());
  });

  it('pins the tip open with a click or tap on the info button, and closes it on a second one', async () => {
    const user = userEvent.setup();
    renderTip();

    await user.click(button());
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    expect(button()).toHaveAttribute('aria-expanded', 'true');

    // Moving the pointer away doesn't close a pinned tip.
    await user.unhover(button());
    expect(screen.getByRole('tooltip')).toBeInTheDocument();

    await user.click(button());
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('closes a pinned tip on a tap outside or on Escape', async () => {
    const user = userEvent.setup();
    renderTip();

    await user.click(button());
    await user.click(screen.getByRole('button', { name: 'Elsewhere' }));
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();

    await user.click(button());
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('shows the tip when the info button gets keyboard focus, and describes the button', async () => {
    const user = userEvent.setup();
    renderTip();

    await user.tab();
    expect(button()).toHaveFocus();
    const tip = await screen.findByRole('tooltip');
    expect(button()).toHaveAttribute('aria-describedby', tip.id);
  });
});
