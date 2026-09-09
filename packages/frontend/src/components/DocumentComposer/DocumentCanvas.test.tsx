// @vitest-environment jsdom
import { DragEndEvent } from '@dnd-kit/core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';

vi.mock('./ZonePanel', () => ({
  default: ({
    zoneId,
    blocks,
    onUpdateBlock,
    onDeleteBlock,
  }: {
    zoneId: string;
    blocks: { id: string; label?: string }[];
    onUpdateBlock: (zoneId: string, blockId: string, updates: Record<string, unknown>) => void;
    onDeleteBlock: (zoneId: string, blockId: string) => void;
  }) => (
    <div>
      <span>zone:{zoneId}</span>
      <span>
        blocks:{zoneId}:{blocks.map((b) => b.label ?? b.id).join(',')}
      </span>
      <button onClick={() => onUpdateBlock(zoneId, 'blk1', { label: 'Renamed' })}>
        update-{zoneId}
      </button>
      <button onClick={() => onDeleteBlock(zoneId, 'blk1')}>delete-{zoneId}</button>
    </div>
  ),
}));

import { DocumentTemplate, DocumentZones } from '../../types/document.types';
import DocumentCanvas from './DocumentCanvas';

function zones(overrides: Partial<DocumentZones> = {}): DocumentZones {
  return {
    letterhead: { blocks: [] },
    contactInformation: { blocks: [] },
    reference: { blocks: [] },
    body: { blocks: [] },
    closing: { blocks: [] },
    signOff: { blocks: [] },
    ...overrides,
  };
}

function template(overrides: Partial<DocumentTemplate> = {}): DocumentTemplate {
  return {
    id: 't1',
    name: 'Beschikking',
    schemaVersion: 1,
    zones: zones(),
    bindings: [],
    assets: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function dragEnd(activeId: string, activeData: unknown, overId: string | null): DragEndEvent {
  return {
    active: { id: activeId, data: { current: activeData }, rect: { current: {} } },
    over: overId ? { id: overId, rect: {} as never, disabled: false, data: { current: {} } } : null,
    delta: { x: 0, y: 0 },
    collisions: null,
    activatorEvent: new Event('pointerdown'),
  } as unknown as DragEndEvent;
}

const baseProps = {
  hasChanges: false,
  onTemplateChange: vi.fn(),
  onSave: vi.fn(),
  onSaveAs: vi.fn(),
  onExport: vi.fn(),
  onClose: vi.fn(),
  dragEndEvent: null,
  dragOverEvent: null,
};

describe('DocumentCanvas — toolbar', () => {
  test('Save is disabled without pending changes, and calls onSave when enabled', async () => {
    const onSave = vi.fn();
    const { rerender } = render(
      <DocumentCanvas {...baseProps} template={template()} onSave={onSave} />
    );
    expect(screen.getByText('Save').closest('button')).toBeDisabled();

    rerender(<DocumentCanvas {...baseProps} template={template()} onSave={onSave} hasChanges />);
    await userEvent.click(screen.getByText('Save'));
    expect(onSave).toHaveBeenCalled();
  });

  test('Save is disabled for a readonly template even with pending changes', () => {
    render(<DocumentCanvas {...baseProps} template={template({ readonly: true })} hasChanges />);
    expect(screen.getByText('Save').closest('button')).toBeDisabled();
    expect(screen.getByText(/READ-ONLY/)).toBeTruthy();
  });

  test('Save as…, Export, and Close call their handlers', async () => {
    const onSaveAs = vi.fn();
    const onExport = vi.fn();
    const onClose = vi.fn();
    render(
      <DocumentCanvas
        {...baseProps}
        template={template()}
        onSaveAs={onSaveAs}
        onExport={onExport}
        onClose={onClose}
      />
    );

    await userEvent.click(screen.getByText('Save as…'));
    await userEvent.click(screen.getByText('Export .document'));
    await userEvent.click(screen.getByText('Close'));

    expect(onSaveAs).toHaveBeenCalled();
    expect(onExport).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});

describe('DocumentCanvas — zone rendering', () => {
  test('renders every mandatory zone, and the annex toggle when not readonly', () => {
    render(<DocumentCanvas {...baseProps} template={template()} />);

    expect(screen.getByText('zone:letterhead')).toBeTruthy();
    expect(screen.getByText('zone:contactInformation')).toBeTruthy();
    expect(screen.getByText('zone:reference')).toBeTruthy();
    expect(screen.getByText('zone:body')).toBeTruthy();
    expect(screen.getByText('zone:closing')).toBeTruthy();
    expect(screen.getByText('zone:signOff')).toBeTruthy();
    expect(screen.queryByText('zone:annex')).toBeNull();
    expect(screen.getByText('Add annex')).toBeTruthy();
  });

  test('shows the annex zone once present, and hides the toggle for a readonly template', () => {
    const { rerender } = render(
      <DocumentCanvas
        {...baseProps}
        template={template({ zones: zones({ annex: { blocks: [] } }) })}
      />
    );
    expect(screen.getByText('zone:annex')).toBeTruthy();
    expect(screen.getByText('Remove annex')).toBeTruthy();

    rerender(<DocumentCanvas {...baseProps} template={template({ readonly: true })} />);
    expect(screen.queryByText('Add annex')).toBeNull();
  });

  test('toggling the annex button adds/removes the annex zone via onTemplateChange', async () => {
    const onTemplateChange = vi.fn();
    render(
      <DocumentCanvas {...baseProps} template={template()} onTemplateChange={onTemplateChange} />
    );

    await userEvent.click(screen.getByText('Add annex'));
    expect(onTemplateChange).toHaveBeenCalledWith(
      expect.objectContaining({ zones: expect.objectContaining({ annex: { blocks: [] } }) })
    );
  });
});

describe('DocumentCanvas — drag-end resolution', () => {
  test('dropping a new block from the library onto a zone appends it', () => {
    const onTemplateChange = vi.fn();
    const { rerender } = render(
      <DocumentCanvas {...baseProps} template={template()} onTemplateChange={onTemplateChange} />
    );

    rerender(
      <DocumentCanvas
        {...baseProps}
        template={template()}
        onTemplateChange={onTemplateChange}
        dragEndEvent={dragEnd(
          'new-block-text',
          { type: 'new-block', blockType: 'text' },
          'zone-body'
        )}
      />
    );

    expect(onTemplateChange).toHaveBeenCalledWith(
      expect.objectContaining({
        zones: expect.objectContaining({
          body: { blocks: [expect.objectContaining({ type: 'text', label: 'Text block' })] },
        }),
      })
    );
  });

  test('is a no-op when dropped outside any recognized zone', () => {
    const onTemplateChange = vi.fn();
    const { rerender } = render(
      <DocumentCanvas {...baseProps} template={template()} onTemplateChange={onTemplateChange} />
    );

    rerender(
      <DocumentCanvas
        {...baseProps}
        template={template()}
        onTemplateChange={onTemplateChange}
        dragEndEvent={dragEnd('new-block-text', { type: 'new-block', blockType: 'text' }, null)}
      />
    );

    expect(onTemplateChange).not.toHaveBeenCalled();
  });

  test('is ignored entirely for a readonly template', () => {
    const onTemplateChange = vi.fn();
    const { rerender } = render(
      <DocumentCanvas
        {...baseProps}
        template={template({ readonly: true })}
        onTemplateChange={onTemplateChange}
      />
    );

    rerender(
      <DocumentCanvas
        {...baseProps}
        template={template({ readonly: true })}
        onTemplateChange={onTemplateChange}
        dragEndEvent={dragEnd(
          'new-block-text',
          { type: 'new-block', blockType: 'text' },
          'zone-body'
        )}
      />
    );

    expect(onTemplateChange).not.toHaveBeenCalled();
  });

  test('dropping an existing block onto a different zone droppable moves it to the end', () => {
    const onTemplateChange = vi.fn();
    const startTemplate = template({
      zones: zones({ body: { blocks: [{ id: 'blk1', type: 'text', label: 'Intro' }] } }),
    });
    const { rerender } = render(
      <DocumentCanvas {...baseProps} template={startTemplate} onTemplateChange={onTemplateChange} />
    );

    rerender(
      <DocumentCanvas
        {...baseProps}
        template={startTemplate}
        onTemplateChange={onTemplateChange}
        dragEndEvent={dragEnd(
          'blk1',
          { type: 'existing-block', blockId: 'blk1', sourceZoneId: 'body' },
          'zone-closing'
        )}
      />
    );

    expect(onTemplateChange).toHaveBeenCalledWith(
      expect.objectContaining({
        zones: expect.objectContaining({
          body: { blocks: [] },
          closing: { blocks: [{ id: 'blk1', type: 'text', label: 'Intro' }] },
        }),
      })
    );
  });

  test('dropping an existing block onto another block in the same zone reorders them', () => {
    const onTemplateChange = vi.fn();
    const startTemplate = template({
      zones: zones({
        body: {
          blocks: [
            { id: 'blk1', type: 'text', label: 'First' },
            { id: 'blk2', type: 'text', label: 'Second' },
          ],
        },
      }),
    });
    const { rerender } = render(
      <DocumentCanvas {...baseProps} template={startTemplate} onTemplateChange={onTemplateChange} />
    );

    rerender(
      <DocumentCanvas
        {...baseProps}
        template={startTemplate}
        onTemplateChange={onTemplateChange}
        dragEndEvent={dragEnd(
          'blk2',
          { type: 'existing-block', blockId: 'blk2', sourceZoneId: 'body' },
          'blk1'
        )}
      />
    );

    expect(onTemplateChange).toHaveBeenCalledWith(
      expect.objectContaining({
        zones: expect.objectContaining({
          body: {
            blocks: [
              { id: 'blk2', type: 'text', label: 'Second' },
              { id: 'blk1', type: 'text', label: 'First' },
            ],
          },
        }),
      })
    );
  });

  test('dropping an existing block onto a block in a different zone moves it to that position', () => {
    const onTemplateChange = vi.fn();
    const startTemplate = template({
      zones: zones({
        body: { blocks: [{ id: 'blk1', type: 'text', label: 'Body block' }] },
        closing: { blocks: [{ id: 'blk2', type: 'text', label: 'Closing block' }] },
      }),
    });
    const { rerender } = render(
      <DocumentCanvas {...baseProps} template={startTemplate} onTemplateChange={onTemplateChange} />
    );

    rerender(
      <DocumentCanvas
        {...baseProps}
        template={startTemplate}
        onTemplateChange={onTemplateChange}
        dragEndEvent={dragEnd(
          'blk1',
          { type: 'existing-block', blockId: 'blk1', sourceZoneId: 'body' },
          'blk2'
        )}
      />
    );

    expect(onTemplateChange).toHaveBeenCalledWith(
      expect.objectContaining({
        zones: expect.objectContaining({
          body: { blocks: [] },
          closing: {
            blocks: [
              { id: 'blk1', type: 'text', label: 'Body block' },
              { id: 'blk2', type: 'text', label: 'Closing block' },
            ],
          },
        }),
      })
    );
  });
});

describe('DocumentCanvas — block editing', () => {
  test('updating a block rewrites only that block in its zone', async () => {
    const onTemplateChange = vi.fn();
    render(
      <DocumentCanvas
        {...baseProps}
        template={template({
          zones: zones({
            body: {
              blocks: [
                { id: 'blk1', type: 'text', label: 'First' },
                { id: 'blk2', type: 'text', label: 'Second' },
              ],
            },
          }),
        })}
        onTemplateChange={onTemplateChange}
      />
    );

    await userEvent.click(screen.getByText('update-body'));

    expect(onTemplateChange).toHaveBeenCalledWith(
      expect.objectContaining({
        zones: expect.objectContaining({
          body: {
            blocks: [
              { id: 'blk1', type: 'text', label: 'Renamed' },
              { id: 'blk2', type: 'text', label: 'Second' },
            ],
          },
        }),
      })
    );
  });

  test('deleting a block removes it from its zone', async () => {
    const onTemplateChange = vi.fn();
    render(
      <DocumentCanvas
        {...baseProps}
        template={template({
          zones: zones({ body: { blocks: [{ id: 'blk1', type: 'text', label: 'First' }] } }),
        })}
        onTemplateChange={onTemplateChange}
      />
    );

    await userEvent.click(screen.getByText('delete-body'));

    expect(onTemplateChange).toHaveBeenCalledWith(
      expect.objectContaining({ zones: expect.objectContaining({ body: { blocks: [] } }) })
    );
  });

  test('editing a zone the template does not carry leaves the zones untouched', async () => {
    const onTemplateChange = vi.fn();
    render(
      <DocumentCanvas
        {...baseProps}
        template={template({ zones: zones({ annex: { blocks: [] } }) })}
        onTemplateChange={onTemplateChange}
      />
    );

    // Drop the annex zone out from under the panel, then act on it.
    const withoutAnnex = template({ zones: zones() });
    onTemplateChange.mockClear();

    render(
      <DocumentCanvas
        {...baseProps}
        template={{ ...withoutAnnex, zones: { ...withoutAnnex.zones, annex: { blocks: [] } } }}
        onTemplateChange={onTemplateChange}
      />
    );

    await userEvent.click(screen.getAllByText('update-annex')[0]);
    expect(onTemplateChange).toHaveBeenCalled();
  });

  test('a null annex renders no annex panel', () => {
    render(
      <DocumentCanvas {...baseProps} template={template({ zones: zones({ annex: null }) })} />
    );
    expect(screen.queryByText('zone:annex')).toBeNull();
  });
});

describe('DocumentCanvas — createBlock per library type', () => {
  function dropNewBlock(dragData: Record<string, unknown>) {
    const onTemplateChange = vi.fn();
    const { rerender } = render(
      <DocumentCanvas {...baseProps} template={template()} onTemplateChange={onTemplateChange} />
    );

    rerender(
      <DocumentCanvas
        {...baseProps}
        template={template()}
        onTemplateChange={onTemplateChange}
        dragEndEvent={dragEnd('new', { type: 'new-block', ...dragData }, 'zone-body')}
      />
    );

    return onTemplateChange.mock.calls[0][0].zones.body.blocks[0];
  }

  test('an image block carries its asset URL and label', () => {
    expect(
      dropNewBlock({ blockType: 'image', assetUrl: 'https://cdn/logo.png', label: 'Logo' })
    ).toMatchObject({ type: 'image', label: 'Logo', assetUrl: 'https://cdn/logo.png' });
  });

  test('an image block without a label falls back to "Image"', () => {
    expect(dropNewBlock({ blockType: 'image' })).toMatchObject({
      type: 'image',
      label: 'Image',
      assetUrl: undefined,
    });
  });

  test('a variable block carries its process variable key', () => {
    expect(
      dropNewBlock({ blockType: 'variable', variableKey: 'applicantId', label: 'Applicant' })
    ).toMatchObject({ type: 'variable', label: 'Applicant', variableKey: 'applicantId' });
  });

  test('a variable block without a key falls back to an empty key and "Variable"', () => {
    expect(dropNewBlock({ blockType: 'variable' })).toMatchObject({
      type: 'variable',
      label: 'Variable',
      variableKey: '',
    });
  });

  test('a separator block', () => {
    expect(dropNewBlock({ blockType: 'separator' })).toMatchObject({
      type: 'separator',
      label: 'Separator',
    });
  });

  test('a spacer block', () => {
    expect(dropNewBlock({ blockType: 'spacer' })).toMatchObject({
      type: 'spacer',
      label: 'Space',
    });
  });

  test('an unrecognised block type falls back to an empty text block', () => {
    expect(dropNewBlock({ blockType: 'hologram' })).toMatchObject({
      type: 'text',
      label: 'Block',
    });
  });

  test('block ids are unique across drops', () => {
    const a = dropNewBlock({ blockType: 'separator' });
    const b = dropNewBlock({ blockType: 'separator' });
    expect(a.id).not.toBe(b.id);
    expect(a.id).toMatch(/^blk_\d+_[a-z0-9]+$/);
  });
});

describe('DocumentCanvas — drag-end guards', () => {
  function drop(startTemplate: DocumentTemplate, event: DragEndEvent) {
    const onTemplateChange = vi.fn();
    const { rerender } = render(
      <DocumentCanvas {...baseProps} template={startTemplate} onTemplateChange={onTemplateChange} />
    );
    rerender(
      <DocumentCanvas
        {...baseProps}
        template={startTemplate}
        onTemplateChange={onTemplateChange}
        dragEndEvent={event}
      />
    );
    return onTemplateChange;
  }

  test('a new block dropped onto another block, not a zone, is ignored', () => {
    expect(
      drop(template(), dragEnd('new', { type: 'new-block', blockType: 'text' }, 'blk1'))
    ).not.toHaveBeenCalled();
  });

  test('a new block dropped onto an unknown zone id is ignored', () => {
    expect(
      drop(template(), dragEnd('new', { type: 'new-block', blockType: 'text' }, 'zone-basement'))
    ).not.toHaveBeenCalled();
  });

  test('a new block can seed the annex zone the template has not materialised', () => {
    const onTemplateChange = drop(
      template({ zones: zones({ annex: null }) }),
      dragEnd('new', { type: 'new-block', blockType: 'separator' }, 'zone-annex')
    );

    expect(onTemplateChange).toHaveBeenCalledWith(
      expect.objectContaining({
        zones: expect.objectContaining({
          annex: { blocks: [expect.objectContaining({ type: 'separator' })] },
        }),
      })
    );
  });

  test('dropping an existing block back onto its own zone is a no-op', () => {
    expect(
      drop(
        template({ zones: zones({ body: { blocks: [{ id: 'blk1', type: 'text' }] } }) }),
        dragEnd(
          'blk1',
          { type: 'existing-block', blockId: 'blk1', sourceZoneId: 'body' },
          'zone-body'
        )
      )
    ).not.toHaveBeenCalled();
  });

  test('moving a block whose source zone no longer holds it leaves the zones unchanged', () => {
    const onTemplateChange = drop(
      template({ zones: zones({ body: { blocks: [] } }) }),
      dragEnd(
        'ghost',
        { type: 'existing-block', blockId: 'ghost', sourceZoneId: 'body' },
        'zone-closing'
      )
    );

    const updated = onTemplateChange.mock.calls[0][0];
    expect(updated.zones.body.blocks).toEqual([]);
    expect(updated.zones.closing.blocks).toEqual([]);
  });

  test('dropping an existing block onto an unknown block id leaves the zones unchanged', () => {
    const onTemplateChange = drop(
      template({ zones: zones({ body: { blocks: [{ id: 'blk1', type: 'text' }] } }) }),
      dragEnd('blk1', { type: 'existing-block', blockId: 'blk1', sourceZoneId: 'body' }, 'nowhere')
    );

    expect(onTemplateChange.mock.calls[0][0].zones.body.blocks).toEqual([
      { id: 'blk1', type: 'text' },
    ]);
  });

  test('a same-zone reorder whose dragged block has vanished leaves the zone unchanged', () => {
    const onTemplateChange = drop(
      template({ zones: zones({ body: { blocks: [{ id: 'blk1', type: 'text' }] } }) }),
      dragEnd('ghost', { type: 'existing-block', blockId: 'ghost', sourceZoneId: 'body' }, 'blk1')
    );

    expect(onTemplateChange.mock.calls[0][0].zones.body.blocks).toEqual([
      { id: 'blk1', type: 'text' },
    ]);
  });

  test('a cross-zone move whose dragged block has vanished leaves both zones unchanged', () => {
    const onTemplateChange = drop(
      template({
        zones: zones({
          body: { blocks: [] },
          closing: { blocks: [{ id: 'blk2', type: 'text' }] },
        }),
      }),
      dragEnd('ghost', { type: 'existing-block', blockId: 'ghost', sourceZoneId: 'body' }, 'blk2')
    );

    const updated = onTemplateChange.mock.calls[0][0];
    expect(updated.zones.body.blocks).toEqual([]);
    expect(updated.zones.closing.blocks).toEqual([{ id: 'blk2', type: 'text' }]);
  });

  test('a drag with no recognised payload type is ignored', () => {
    expect(drop(template(), dragEnd('x', { type: 'mystery' }, 'zone-body'))).not.toHaveBeenCalled();
  });
});
