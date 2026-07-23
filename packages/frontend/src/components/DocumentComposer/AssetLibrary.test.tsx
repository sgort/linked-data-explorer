// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, test, vi } from 'vitest';

const fetchAssets = vi.fn();
vi.mock('../../services/assetService', () => ({
  fetchAssets: (...args: unknown[]) => fetchAssets(...args),
}));

import AssetLibrary from './AssetLibrary';

function asset(
  overrides: Partial<{
    id: string;
    name: string;
    url: string;
    size: number;
    contentType: string;
  }> = {}
) {
  return {
    id: 'a1',
    name: 'logo.png',
    url: 'https://example.com/logo.png',
    size: 2048,
    contentType: 'image/png',
    ...overrides,
  };
}

afterEach(() => {
  fetchAssets.mockReset();
});

describe('AssetLibrary', () => {
  test('shows a hint instead of loading when there is no endpoint', () => {
    render(<AssetLibrary endpoint="" />);
    expect(screen.getByText('Select a TriplyDB endpoint to load images.')).toBeTruthy();
    expect(fetchAssets).not.toHaveBeenCalled();
  });

  test('loads and lists image assets, filtering out non-image files', async () => {
    fetchAssets.mockResolvedValue([
      asset({ id: 'a1', name: 'logo.png' }),
      asset({ id: 'a2', name: 'document.pdf' }),
    ]);
    render(<AssetLibrary endpoint="https://example.com/sparql" />);

    expect(await screen.findByText('logo.png')).toBeTruthy();
    expect(screen.queryByText('document.pdf')).toBeNull();
  });

  test('shows an empty-state message when there are no images', async () => {
    fetchAssets.mockResolvedValue([]);
    render(<AssetLibrary endpoint="e" />);
    expect(await screen.findByText('No images found in this dataset.')).toBeTruthy();
  });

  test('shows an error message when loading fails', async () => {
    fetchAssets.mockRejectedValue(new Error('network down'));
    render(<AssetLibrary endpoint="e" />);
    expect(await screen.findByText('Failed to load images')).toBeTruthy();
  });

  test('Refresh forces a re-fetch', async () => {
    fetchAssets.mockResolvedValue([asset()]);
    render(<AssetLibrary endpoint="e" />);
    await screen.findByText('logo.png');

    await userEvent.click(screen.getByTitle('Refresh'));

    expect(fetchAssets).toHaveBeenLastCalledWith('e', true);
  });
});
