// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

// dnd-kit only reports a transform mid-gesture; drive that state directly.
const draggableState = vi.hoisted(() => ({
  transform: null as { x: number; y: number; scaleX: number; scaleY: number } | null,
  isDragging: false,
}));

vi.mock('@dnd-kit/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@dnd-kit/core')>();
  return {
    ...actual,
    useDraggable: () => ({
      attributes: {},
      listeners: {},
      setNodeRef: () => {},
      transform: draggableState.transform,
      isDragging: draggableState.isDragging,
    }),
  };
});

import ContentLibrary from './ContentLibrary';

function cardFor(label: string): HTMLElement {
  // The draggable wrapper is the element carrying the inline transform style.
  return screen.getByText(label).closest('[style]') ?? screen.getByText(label).parentElement!;
}

beforeEach(() => {
  draggableState.transform = null;
  draggableState.isDragging = false;
});

describe('ContentLibrary', () => {
  test('renders every content block type as a draggable card', () => {
    render(<ContentLibrary />);

    expect(screen.getByText('Text')).toBeTruthy();
    expect(screen.getByText('Variable')).toBeTruthy();
    expect(screen.getByText('Image')).toBeTruthy();
    expect(screen.getByText('Separator')).toBeTruthy();
    expect(screen.getByText('Spacer')).toBeTruthy();
  });

  test('shows a description for each block type', () => {
    render(<ContentLibrary />);
    expect(screen.getByText('Free text with formatting')).toBeTruthy();
    expect(screen.getByText('Process value at this position')).toBeTruthy();
    expect(screen.getByText('Logo or illustration')).toBeTruthy();
    expect(screen.getByText('Horizontal line')).toBeTruthy();
    expect(screen.getByText('Empty space')).toBeTruthy();
  });

  test('leaves cards unstyled while nothing is being dragged', () => {
    const { container } = render(<ContentLibrary />);
    expect(container.querySelector('[style*="translate3d"]')).toBeNull();
  });

  test('follows the pointer and dims the card being dragged', () => {
    draggableState.transform = { x: 24, y: -8, scaleX: 1, scaleY: 1 };
    draggableState.isDragging = true;

    render(<ContentLibrary />);

    const card = cardFor('Text');
    expect(card.getAttribute('style')).toContain('translate3d(24px, -8px, 0)');
    expect(card.getAttribute('style')).toContain('opacity: 0.5');
  });

  test('keeps a transformed card at full opacity when it is not the one being dragged', () => {
    draggableState.transform = { x: 5, y: 5, scaleX: 1, scaleY: 1 };
    draggableState.isDragging = false;

    render(<ContentLibrary />);

    expect(cardFor('Text').getAttribute('style')).toContain('opacity: 1');
  });
});
