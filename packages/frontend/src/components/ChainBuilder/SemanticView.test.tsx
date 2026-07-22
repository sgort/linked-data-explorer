// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';

import SemanticView from './SemanticView';

function jsonResponse(body: unknown) {
  return Promise.resolve({ json: async () => body });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('SemanticView', () => {
  test('shows a loading message, then the summary counts once both fetches resolve', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (String(url).includes('semantic-equivalences')) {
        return jsonResponse({
          success: true,
          data: [
            {
              dmn1: { title: 'A' },
              dmn2: { title: 'B' },
              sharedConcept: 'https://example.com/concept/leeftijd',
              concept1: { label: 'Leeftijd', variable: { identifier: 'age' } },
              concept2: { label: 'Age', variable: { identifier: 'age' } },
            },
          ],
        });
      }
      return jsonResponse({
        success: true,
        data: [
          {
            matchType: 'semantic',
            dmn1: { title: 'A' },
            dmn2: { title: 'B' },
            outputVariable: 'out',
            inputVariable: 'in',
            sharedConcept: 'https://example.com/concept/leeftijd',
          },
        ],
      });
    });

    render(
      <SemanticView endpoint="https://example.com/sparql" apiBaseUrl="https://api.example.com" />
    );

    expect(screen.getByText('Loading semantic analysis...')).toBeTruthy();
    expect(await screen.findByText('Semantic Chain Links')).toBeTruthy();
    expect(screen.getAllByText('leeftijd').length).toBeGreaterThan(0);
  });

  test('shows the empty-state messages when both responses are empty', async () => {
    global.fetch = vi.fn().mockImplementation(() => jsonResponse({ success: true, data: [] }));
    render(<SemanticView endpoint="e" apiBaseUrl="a" />);

    expect(
      await screen.findByText(
        'No semantic chain links found. Variables match by exact identifier only.'
      )
    ).toBeTruthy();
    expect(screen.getByText('No semantic equivalences found via skos:exactMatch.')).toBeTruthy();
  });

  test('a fetch failure degrades to empty state rather than crashing', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network down'));
    render(<SemanticView endpoint="e" apiBaseUrl="a" />);

    expect(
      await screen.findByText('No semantic equivalences found via skos:exactMatch.')
    ).toBeTruthy();
  });

  test('separates semantic and exact-match links into their own counts', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (String(url).includes('semantic-equivalences')) {
        return jsonResponse({ success: true, data: [] });
      }
      return jsonResponse({
        success: true,
        data: [
          {
            matchType: 'semantic',
            dmn1: { title: 'A' },
            dmn2: { title: 'B' },
            outputVariable: 'out',
            inputVariable: 'in',
            sharedConcept: 'https://example.com/concept/leeftijd',
          },
          {
            matchType: 'exact',
            dmn1: { title: 'C' },
            dmn2: { title: 'D' },
            outputVariable: 'out',
            inputVariable: 'in',
            sharedConcept: 'https://example.com/concept/naam',
          },
        ],
      });
    });

    render(<SemanticView endpoint="e" apiBaseUrl="a" />);

    expect(await screen.findByText('Semantic Chain Links')).toBeTruthy();
    const counts = screen.getAllByText('1');
    expect(counts.length).toBeGreaterThanOrEqual(2);
  });
});
