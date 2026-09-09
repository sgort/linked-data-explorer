// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';

vi.mock('./TextBlockEditor', () => ({
  default: ({ onChange }: { onChange: (doc: unknown) => void }) => (
    <button onClick={() => onChange({ type: 'doc', content: [] })}>TextBlockEditor stub</button>
  ),
}));

import { DocumentBlock } from '../../types/document.types';
import BlockItem from './BlockItem';

function block(overrides: Partial<DocumentBlock> = {}): DocumentBlock {
  return {
    id: 'b1',
    type: 'text',
    ...overrides,
  };
}

describe('BlockItem', () => {
  test('renders a text block via TextBlockEditor and propagates onChange as onUpdate', async () => {
    const onUpdate = vi.fn();
    render(
      <BlockItem
        block={block()}
        zoneId="body"
        readonly={false}
        onUpdate={onUpdate}
        onDelete={vi.fn()}
      />
    );

    await userEvent.click(screen.getByText('TextBlockEditor stub'));
    expect(onUpdate).toHaveBeenCalledWith('body', 'b1', { content: { type: 'doc', content: [] } });
  });

  test('renders an image block with its asset, or a placeholder when none is set', () => {
    const { rerender } = render(
      <BlockItem
        block={block({ type: 'image', assetUrl: 'https://example.com/logo.png', label: 'Logo' })}
        zoneId="letterhead"
        readonly={false}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    expect(screen.getByAltText('Logo')).toBeTruthy();

    rerender(
      <BlockItem
        block={block({ type: 'image' })}
        zoneId="letterhead"
        readonly={false}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    expect(screen.getByText('No image selected')).toBeTruthy();
  });

  test('renders a variable block with its placeholder syntax', () => {
    render(
      <BlockItem
        block={block({ type: 'variable', variableKey: 'leeftijd', label: 'Age' })}
        zoneId="body"
        readonly={false}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    expect(screen.getByText('{{leeftijd}}')).toBeTruthy();
    expect(screen.getAllByText('Age').length).toBeGreaterThan(0);
  });

  test('renders separator and spacer blocks', () => {
    const { rerender } = render(
      <BlockItem
        block={block({ type: 'separator' })}
        zoneId="body"
        readonly={false}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    expect(document.querySelector('.border-t.border-slate-300')).toBeTruthy();

    rerender(
      <BlockItem
        block={block({ type: 'spacer' })}
        zoneId="body"
        readonly={false}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    expect(screen.getByText('Empty space')).toBeTruthy();
  });

  test('clicking delete calls onDelete with the zone and block id', async () => {
    const onDelete = vi.fn();
    render(
      <BlockItem
        block={block()}
        zoneId="body"
        readonly={false}
        onUpdate={vi.fn()}
        onDelete={onDelete}
      />
    );

    await userEvent.click(screen.getByTitle('Delete block'));
    expect(onDelete).toHaveBeenCalledWith('body', 'b1');
  });

  test('a readonly block hides the drag handle and delete button', () => {
    render(
      <BlockItem block={block()} zoneId="body" readonly onUpdate={vi.fn()} onDelete={vi.fn()} />
    );
    expect(screen.queryByTitle('Move')).toBeNull();
    expect(screen.queryByTitle('Delete block')).toBeNull();
  });

  test('shows the block label when set, falling back to its type', () => {
    const { rerender } = render(
      <BlockItem
        block={block({ label: 'Intro paragraph' })}
        zoneId="body"
        readonly={false}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    expect(screen.getByText('Intro paragraph')).toBeTruthy();

    rerender(
      <BlockItem
        block={block()}
        zoneId="body"
        readonly={false}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    expect(screen.getByText('text')).toBeTruthy();
  });
});
