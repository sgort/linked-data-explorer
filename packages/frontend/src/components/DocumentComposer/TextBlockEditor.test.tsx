// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';

import TextBlockEditor from './TextBlockEditor';

// jsdom doesn't implement Range.getClientRects()/getBoundingClientRect(), which
// ProseMirror's EditorView.scrollToSelection() calls on every transaction — without
// this polyfill, typing into the editor throws "target.getClientRects is not a
// function" as an uncaught exception outside the test's own try/catch.
const rectStub = () => ({
  x: 0,
  y: 0,
  width: 0,
  height: 0,
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
  toJSON: () => {},
});
Range.prototype.getBoundingClientRect = rectStub;
Range.prototype.getClientRects = () =>
  ({
    item: () => null,
    length: 0,
    [Symbol.iterator]: [][Symbol.iterator],
  }) as unknown as DOMRectList;
// jsdom also doesn't implement document.elementFromPoint(), which ProseMirror's
// mousedown handler calls via posAtCoords() on every click into the editor.
document.elementFromPoint = () => null;

describe('TextBlockEditor', () => {
  test('renders the toolbar and an editable content area', () => {
    render(<TextBlockEditor content={undefined} onChange={vi.fn()} />);

    expect(screen.getByTitle('Bold')).toBeTruthy();
    expect(screen.getByTitle('Italic')).toBeTruthy();
    expect(screen.getByTitle('Heading 1')).toBeTruthy();
    expect(document.querySelector('.ProseMirror')).toBeTruthy();
  });

  test('renders the given placeholder text on an empty document', () => {
    render(<TextBlockEditor content={undefined} onChange={vi.fn()} placeholder="Type here…" />);
    expect(document.querySelector('[data-placeholder]')?.getAttribute('data-placeholder')).toBe(
      'Type here…'
    );
  });

  test('a readonly editor hides the toolbar and is not editable', () => {
    render(
      <TextBlockEditor
        content={{ type: 'doc', content: [{ type: 'paragraph' }] }}
        onChange={vi.fn()}
        readonly
      />
    );
    expect(screen.queryByTitle('Bold')).toBeNull();
    expect(document.querySelector('.ProseMirror')?.getAttribute('contenteditable')).toBe('false');
  });

  test('toggling Bold updates the active state', async () => {
    render(<TextBlockEditor content={undefined} onChange={vi.fn()} />);

    const boldButton = screen.getByTitle('Bold');
    expect(boldButton.className).not.toContain('bg-blue-100');

    await userEvent.click(boldButton);
    expect(boldButton.className).toContain('bg-blue-100');
  });

  test('typing calls onChange with the updated TipTap JSON document', async () => {
    const onChange = vi.fn();
    render(<TextBlockEditor content={undefined} onChange={onChange} />);

    const editorEl = document.querySelector('.ProseMirror') as HTMLElement;
    editorEl.focus();
    await userEvent.type(editorEl, 'Hello');

    expect(onChange).toHaveBeenCalled();
    const lastDoc = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(JSON.stringify(lastDoc)).toContain('Hello');
  });

  test('renders pre-existing content passed in via the content prop', () => {
    render(
      <TextBlockEditor
        content={{
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Existing text' }] }],
        }}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByText('Existing text')).toBeTruthy();
  });
});
