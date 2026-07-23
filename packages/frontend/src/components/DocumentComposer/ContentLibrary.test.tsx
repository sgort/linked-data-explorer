// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';

import ContentLibrary from './ContentLibrary';

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
});
