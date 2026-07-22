// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, test, vi } from 'vitest';

const getActiviteitDetail = vi.fn();
vi.mock('../../services/dsoService', () => ({
  getActiviteitDetail: (...args: unknown[]) => getActiviteitDetail(...args),
}));

import DsoActiviteitSelector from './DsoActiviteitSelector';

afterEach(() => {
  getActiviteitDetail.mockReset();
});

describe('DsoActiviteitSelector', () => {
  test('auto-verifies a stored URN on mount and shows the resolved label', async () => {
    getActiviteitDetail.mockResolvedValue({
      omschrijving: 'Kapvergunning',
      bestuursorgaan: { bestuurslaag: 'Gemeente', organisatieType: 'GM', organisatieCode: '0995' },
    });

    render(
      <DsoActiviteitSelector bpmnProcessId="p" currentUrn="urn:existing" onUrnChange={vi.fn()} />
    );

    expect(await screen.findByText('Kapvergunning')).toBeTruthy();
    expect(screen.getByText('Gemeente · GM0995')).toBeTruthy();
    expect(getActiviteitDetail).toHaveBeenCalledWith('urn:existing');
  });

  test('shows a warning when nothing is linked yet', () => {
    render(
      <DsoActiviteitSelector bpmnProcessId="p" currentUrn={undefined} onUrnChange={vi.fn()} />
    );
    expect(screen.getByText(/No DSO activity linked/)).toBeTruthy();
  });

  test('an unresolvable URN shows an error message', async () => {
    getActiviteitDetail.mockRejectedValue(new Error('404'));
    render(
      <DsoActiviteitSelector bpmnProcessId="p" currentUrn="urn:missing" onUrnChange={vi.fn()} />
    );
    expect(await screen.findByText('URN not found in DSO')).toBeTruthy();
  });

  test('typing a URN and clicking Save calls onUrnChange and verifies it', async () => {
    getActiviteitDetail.mockResolvedValue({ omschrijving: 'Nieuwe activiteit' });
    const onUrnChange = vi.fn();
    render(
      <DsoActiviteitSelector bpmnProcessId="p" currentUrn={undefined} onUrnChange={onUrnChange} />
    );

    await userEvent.type(screen.getByPlaceholderText(/Paste activiteit URN/), 'urn:new');
    await userEvent.click(screen.getByText('Save'));

    expect(onUrnChange).toHaveBeenCalledWith('urn:new');
    expect(await screen.findByText('Nieuwe activiteit')).toBeTruthy();
  });

  test('the Clear (X) button resets the input and calls onUrnChange(undefined)', async () => {
    getActiviteitDetail.mockResolvedValue({ omschrijving: 'x' });
    const onUrnChange = vi.fn();
    render(
      <DsoActiviteitSelector
        bpmnProcessId="p"
        currentUrn="urn:existing"
        onUrnChange={onUrnChange}
      />
    );
    await screen.findByText('x');

    await userEvent.click(screen.getByTitle('Clear'));

    expect(onUrnChange).toHaveBeenCalledWith(undefined);
    expect(screen.getByPlaceholderText(/Paste activiteit URN/)).toHaveValue('');
  });

  test('a linked URN with a resolved label links to the RTR registry', async () => {
    getActiviteitDetail.mockResolvedValue({ omschrijving: 'Kapvergunning' });
    render(
      <DsoActiviteitSelector bpmnProcessId="p" currentUrn="urn:existing" onUrnChange={vi.fn()} />
    );
    await screen.findByText('Kapvergunning');

    expect(screen.getByText('View in RTR').closest('a')).toHaveAttribute(
      'href',
      'https://omgevingswet.overheid.nl/registratie-toepasbare-regels/id/urn:existing'
    );
  });
});
