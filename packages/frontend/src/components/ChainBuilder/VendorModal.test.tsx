// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { VendorService } from '../../types/vendor.types';
import VendorModal from './VendorModal';

function vendor(overrides: Partial<VendorService> = {}): VendorService {
  return {
    id: 'v1',
    basedOn: 'https://example.com/dmn/1',
    provider: { name: 'Acme BV' },
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('VendorModal', () => {
  test('shows a loading state, then the vendor list', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      json: async () => ({ success: true, data: { vendorServices: [vendor()] } }),
    });

    render(
      <VendorModal
        dmnIdentifier="age-check"
        dmnTitle="Age check"
        endpoint="https://example.com/sparql"
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText('Loading vendor services...')).toBeTruthy();
    expect(await screen.findByText('Acme BV')).toBeTruthy();
  });

  test('shows an empty-state message when there are no vendors', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      json: async () => ({ success: true, data: { vendorServices: [] } }),
    });
    render(
      <VendorModal dmnIdentifier="age-check" dmnTitle="Age check" endpoint="e" onClose={vi.fn()} />
    );
    expect(await screen.findByText('No vendor implementations found')).toBeTruthy();
  });

  test('shows the error message when the backend reports failure', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      json: async () => ({ success: false, error: 'Upstream unavailable' }),
    });
    render(
      <VendorModal dmnIdentifier="age-check" dmnTitle="Age check" endpoint="e" onClose={vi.fn()} />
    );
    expect(await screen.findByText('Upstream unavailable')).toBeTruthy();
  });

  test('shows the error message when the fetch itself throws', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network down'));
    render(
      <VendorModal dmnIdentifier="age-check" dmnTitle="Age check" endpoint="e" onClose={vi.fn()} />
    );
    expect(await screen.findByText('network down')).toBeTruthy();
  });

  test('renders license/access-type badges and contact details', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      json: async () => ({
        success: true,
        data: {
          vendorServices: [
            vendor({
              license: 'Open Source',
              accessType: 'public',
              provider: {
                name: 'Acme BV',
                contactPoint: { name: 'Jan', email: 'jan@example.com', telephone: '0612345678' },
              },
            }),
          ],
        },
      }),
    });

    render(
      <VendorModal dmnIdentifier="age-check" dmnTitle="Age check" endpoint="e" onClose={vi.fn()} />
    );

    expect(await screen.findByText('Open Source')).toBeTruthy();
    expect(screen.getByText('Public Access')).toBeTruthy();
    expect(screen.getByText('jan@example.com')).toBeTruthy();
    expect(screen.getByText('0612345678')).toBeTruthy();
  });

  test('the header and footer close buttons both call onClose', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      json: async () => ({ success: true, data: { vendorServices: [] } }),
    });
    const onClose = vi.fn();
    render(
      <VendorModal dmnIdentifier="age-check" dmnTitle="Age check" endpoint="e" onClose={onClose} />
    );

    await screen.findByText('No vendor implementations found');
    await userEvent.click(screen.getByText('Close'));
    expect(onClose).toHaveBeenCalled();
  });
});
