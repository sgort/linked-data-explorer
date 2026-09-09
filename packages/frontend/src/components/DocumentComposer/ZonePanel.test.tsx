// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';

// dnd-kit's hover state is driven by a live DndContext; drive it directly instead.
const droppableState = vi.hoisted(() => ({ isOver: false }));
vi.mock('@dnd-kit/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@dnd-kit/core')>();
  return {
    ...actual,
    useDroppable: () => ({ setNodeRef: () => {}, isOver: droppableState.isOver }),
  };
});

vi.mock('./BlockItem', () => ({
  default: ({
    block,
    zoneId,
    onDelete,
  }: {
    block: { id: string; label?: string; type: string };
    zoneId: string;
    onDelete: (zoneId: string, blockId: string) => void;
  }) => (
    <div>
      <span>{block.label ?? block.type}</span>
      <button onClick={() => onDelete(zoneId, block.id)}>delete-{block.id}</button>
    </div>
  ),
}));

import { DocumentBlock } from '../../types/document.types';
import ZonePanel from './ZonePanel';

function block(overrides: Partial<DocumentBlock> = {}): DocumentBlock {
  return { id: 'b1', type: 'text', ...overrides };
}

beforeEach(() => {
  droppableState.isOver = false;
});

describe('ZonePanel', () => {
  test('renders the zone label, description, and block count', () => {
    render(
      <ZonePanel
        zoneId="body"
        blocks={[]}
        readonly={false}
        onUpdateBlock={vi.fn()}
        onDeleteBlock={vi.fn()}
      />
    );
    expect(screen.getByText('Body')).toBeTruthy();
    expect(screen.getByText(/Decision, motivation and considerations/)).toBeTruthy();
    expect(screen.getByText('0 blocks')).toBeTruthy();
  });

  test('uses singular "block" for exactly one block', () => {
    render(
      <ZonePanel
        zoneId="body"
        blocks={[block()]}
        readonly={false}
        onUpdateBlock={vi.fn()}
        onDeleteBlock={vi.fn()}
      />
    );
    expect(screen.getByText('1 block')).toBeTruthy();
  });

  test('shows a "drag a block here" placeholder when the zone is empty', () => {
    render(
      <ZonePanel
        zoneId="body"
        blocks={[]}
        readonly={false}
        onUpdateBlock={vi.fn()}
        onDeleteBlock={vi.fn()}
      />
    );
    expect(screen.getByText('Drag a block here')).toBeTruthy();
  });

  test('renders each block via BlockItem', () => {
    render(
      <ZonePanel
        zoneId="body"
        blocks={[block({ id: 'b1', label: 'Intro' }), block({ id: 'b2', label: 'Outro' })]}
        readonly={false}
        onUpdateBlock={vi.fn()}
        onDeleteBlock={vi.fn()}
      />
    );
    expect(screen.getByText('Intro')).toBeTruthy();
    expect(screen.getByText('Outro')).toBeTruthy();
  });

  test('deleting a block calls onDeleteBlock with the zone and block id', async () => {
    const onDeleteBlock = vi.fn();
    render(
      <ZonePanel
        zoneId="body"
        blocks={[block({ id: 'b1' })]}
        readonly={false}
        onUpdateBlock={vi.fn()}
        onDeleteBlock={onDeleteBlock}
      />
    );

    await userEvent.click(screen.getByText('delete-b1'));
    expect(onDeleteBlock).toHaveBeenCalledWith('body', 'b1');
  });

  test('the header toggles collapsed state, hiding the blocks', async () => {
    render(
      <ZonePanel
        zoneId="body"
        blocks={[block({ label: 'Intro' })]}
        readonly={false}
        onUpdateBlock={vi.fn()}
        onDeleteBlock={vi.fn()}
      />
    );

    expect(screen.getByText('Intro')).toBeTruthy();
    await userEvent.click(screen.getByText('Body'));
    expect(screen.queryByText('Intro')).toBeNull();
  });

  test('highlights the panel and its placeholder while a block hovers over the zone', () => {
    droppableState.isOver = true;
    const { container } = render(
      <ZonePanel
        zoneId="body"
        blocks={[]}
        readonly={false}
        onUpdateBlock={vi.fn()}
        onDeleteBlock={vi.fn()}
      />
    );

    expect(container.firstElementChild?.className).toContain('bg-blue-50');
    expect(screen.getByText('Drag a block here').parentElement?.className).toContain(
      'border-blue-400'
    );
  });

  test('renders in its resting colours when nothing hovers over the zone', () => {
    const { container } = render(
      <ZonePanel
        zoneId="body"
        blocks={[]}
        readonly={false}
        onUpdateBlock={vi.fn()}
        onDeleteBlock={vi.fn()}
      />
    );

    expect(container.firstElementChild?.className).toContain('bg-white');
    expect(screen.getByText('Drag a block here').parentElement?.className).toContain(
      'border-slate-200'
    );
  });

  test.each([
    ['letterhead', 'border-l-blue-500'],
    ['reference', 'border-l-amber-500'],
    ['annex', 'border-l-slate-400'],
  ] as const)('gives the %s zone its own accent colour', (zoneId, colour) => {
    const { container } = render(
      <ZonePanel
        zoneId={zoneId}
        blocks={[]}
        readonly={false}
        onUpdateBlock={vi.fn()}
        onDeleteBlock={vi.fn()}
      />
    );
    expect(container.firstElementChild?.className).toContain(colour);
  });
});
