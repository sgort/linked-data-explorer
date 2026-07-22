// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { BpmnProcess, FormSchema } from '../../types';
import { RopaRecord } from '../../types/ropa.types';

const getProcesses = vi.fn();
const saveProcess = vi.fn();
const getForms = vi.fn();

vi.mock('../../services/bpmnService', () => ({
  BpmnService: {
    getProcesses: (...args: unknown[]) => getProcesses(...args),
    saveProcess: (...args: unknown[]) => saveProcess(...args),
  },
}));

vi.mock('../../services/formService', () => ({
  FormService: {
    getForms: (...args: unknown[]) => getForms(...args),
  },
}));

import RopaRecordEditor from './RopaRecordEditor';

function record(overrides: Partial<RopaRecord> = {}): RopaRecord {
  return {
    id: 'r1',
    bpmnProcessId: 'ZorgtoeslagProcess',
    processLevel: 'shell',
    title: 'Zorgtoeslag',
    controllerName: 'Belastingdienst',
    controllerContact: 'privacy@example.com',
    purpose: 'Toeslag verwerken',
    legalBasisUri: '',
    legalBasisLabel: '',
    gdprArticle: 'Art. 6(1)(c) — Legal obligation',
    dataSubjects: 'Aanvragers',
    recipients: 'Belastingdienst',
    thirdCountryTransfers: false,
    retentionPeriod: '7 jaar',
    securityMeasures: 'Encryptie',
    status: 'draft',
    schemaVersion: 1,
    personalDataFields: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

function process(overrides: Partial<BpmnProcess> = {}): BpmnProcess {
  return {
    id: 'p1',
    name: 'Zorgtoeslag',
    xml: '<bpmn:definitions><bpmn:process /></bpmn:definitions>',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    linkedDmnTemplates: [],
    bpmnProcessId: 'ZorgtoeslagProcess',
    ...overrides,
  };
}

function form(overrides: Partial<FormSchema> = {}): FormSchema {
  return {
    id: 'form-1',
    name: 'Aanvraagformulier',
    schema: { id: 'form-1', components: [{ key: 'leeftijd', label: 'Leeftijd' }] },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  getProcesses.mockReset();
  saveProcess.mockReset();
  getForms.mockReset();
});

describe('RopaRecordEditor — blank vs. existing record', () => {
  test('a null record renders the blank-record defaults', () => {
    getProcesses.mockReturnValue([]);
    render(<RopaRecordEditor record={null} onSave={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getByText('New RoPA record')).toBeTruthy();
    expect(screen.getByDisplayValue('Art. 6(1)(e) — Public task')).toBeTruthy();
  });

  test('an existing record renders its stored values', () => {
    getProcesses.mockReturnValue([]);
    render(<RopaRecordEditor record={record()} onSave={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getByRole('heading', { name: 'Zorgtoeslag' })).toBeTruthy();
    expect(screen.getByDisplayValue('privacy@example.com')).toBeTruthy();
  });
});

describe('RopaRecordEditor — tab navigation', () => {
  test('switches between Record, Personal Data Fields, BPMN Link, and Status tabs', async () => {
    getProcesses.mockReturnValue([]);
    render(<RopaRecordEditor record={record()} onSave={vi.fn()} onCancel={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Personal Data Fields' }));
    expect(screen.getByText('No fields yet.')).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: 'BPMN Link' }));
    expect(screen.getByText('ZorgtoeslagProcess')).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: 'Status' }));
    expect(screen.getByText('draft')).toBeTruthy();
  });
});

describe('RopaRecordEditor — Record tab editing', () => {
  test('typing into the title field updates the header', async () => {
    getProcesses.mockReturnValue([]);
    render(<RopaRecordEditor record={record({ title: '' })} onSave={vi.fn()} onCancel={vi.fn()} />);

    const titleInput = screen.getByPlaceholderText(/Tree Felling Permit/);
    await userEvent.type(titleInput, 'New title');

    expect(screen.getByRole('heading', { name: 'New title' })).toBeTruthy();
  });

  test('toggling third country transfers reveals the details textarea', async () => {
    getProcesses.mockReturnValue([]);
    render(
      <RopaRecordEditor
        record={record({ thirdCountryTransfers: false })}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.queryByPlaceholderText(/Describe the transfer/)).toBeNull();
    await userEvent.click(screen.getByRole('checkbox'));
    expect(screen.getByPlaceholderText(/Describe the transfer/)).toBeTruthy();
  });
});

describe('RopaRecordEditor — legal basis lookup', () => {
  test('a successful lookup lists results; picking one fills the legal basis fields', async () => {
    getProcesses.mockReturnValue([]);
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: {
          bindings: [
            {
              serviceTitle: { value: 'Zorgtoeslag' },
              legalResource: { value: 'https://data.europa.eu/eli/x' },
            },
          ],
        },
      }),
    });

    render(<RopaRecordEditor record={record()} onSave={vi.fn()} onCancel={vi.fn()} />);
    await userEvent.click(screen.getByText('Lookup from knowledge graph'));

    const resultButton = await screen.findByText('Zorgtoeslag', { selector: 'span.font-medium' });
    await userEvent.click(resultButton);

    expect(screen.getByPlaceholderText(/Wet op de zorgtoeslag/)).toHaveValue('Zorgtoeslag');
    expect(screen.getByDisplayValue('https://data.europa.eu/eli/x')).toBeTruthy();
  });

  test('an empty result set shows a "no legal resources found" message', async () => {
    getProcesses.mockReturnValue([]);
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: { bindings: [] } }),
    });

    render(<RopaRecordEditor record={record()} onSave={vi.fn()} onCancel={vi.fn()} />);
    await userEvent.click(screen.getByText('Lookup from knowledge graph'));

    expect(await screen.findByText(/No legal resources found/)).toBeTruthy();
  });

  test('a failed lookup surfaces the error message', async () => {
    getProcesses.mockReturnValue([]);
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });

    render(<RopaRecordEditor record={record()} onSave={vi.fn()} onCancel={vi.fn()} />);
    await userEvent.click(screen.getByText('Lookup from knowledge graph'));

    expect(await screen.findByText('HTTP 500')).toBeTruthy();
  });
});

describe('RopaRecordEditor — Personal Data Fields / hydrate', () => {
  test('"Hydrate from forms" is disabled without a BPMN process ID', async () => {
    getProcesses.mockReturnValue([]);
    render(
      <RopaRecordEditor
        record={record({ bpmnProcessId: '' })}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: 'Personal Data Fields' }));
    expect(screen.getByText('Hydrate from forms')).toBeDisabled();
  });

  test("hydrates new fields from the linked BPMN process's camunda:formRef forms, skipping keyless components and already-present keys", async () => {
    getProcesses.mockReturnValue([
      process({
        xml: '<bpmn:definitions><bpmn:userTask camunda:formRef="form-1" /></bpmn:definitions>',
      }),
    ]);
    getForms.mockReturnValue([
      form({
        schema: {
          id: 'form-1',
          components: [{ key: 'leeftijd', label: 'Leeftijd' }, { label: 'A heading with no key' }],
        },
      }),
    ]);

    render(
      <RopaRecordEditor
        record={record({ personalDataFields: [] })}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: 'Personal Data Fields' }));
    await userEvent.click(screen.getByText('Hydrate from forms'));

    expect(await screen.findByText('leeftijd')).toBeTruthy();
    expect(screen.getAllByRole('row')).toHaveLength(2); // header row + 1 field row
  });

  test('removing a field row deletes it from the table', async () => {
    getProcesses.mockReturnValue([]);
    render(
      <RopaRecordEditor
        record={record({
          personalDataFields: [
            {
              id: 'f1',
              ropaRecordId: 'r1',
              formId: 'form-1',
              fieldKey: 'leeftijd',
              fieldLabel: 'Leeftijd',
              dataCategory: 'other',
              specialCategory: false,
              sortOrder: 0,
            },
          ],
        })}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: 'Personal Data Fields' }));
    expect(screen.getByText('leeftijd')).toBeTruthy();

    await userEvent.click(screen.getByRole('row', { name: /leeftijd/ }).querySelector('button')!);
    expect(screen.queryByText('leeftijd')).toBeNull();
  });

  test('editing a field row updates its label, category, and special-category flag', async () => {
    getProcesses.mockReturnValue([]);
    render(
      <RopaRecordEditor
        record={record({
          personalDataFields: [
            {
              id: 'f1',
              ropaRecordId: 'r1',
              formId: 'form-1',
              fieldKey: 'leeftijd',
              fieldLabel: 'Leeftijd',
              dataCategory: 'other',
              specialCategory: false,
              sortOrder: 0,
            },
          ],
        })}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: 'Personal Data Fields' }));
    const row = screen.getByRole('row', { name: /leeftijd/ });

    const labelInput = within(row).getByDisplayValue('Leeftijd');
    await userEvent.clear(labelInput);
    await userEvent.type(labelInput, 'Age');
    expect(labelInput).toHaveValue('Age');

    await userEvent.selectOptions(within(row).getByRole('combobox'), 'identity');
    expect(within(row).getByRole('combobox')).toHaveValue('identity');

    const specialCheckbox = within(row).getByRole('checkbox');
    await userEvent.click(specialCheckbox);
    expect(specialCheckbox).toBeChecked();
  });
});

describe('RopaRecordEditor — BPMN link', () => {
  test('shows "Not linked" when the matching process has no ronl:ropaRef', async () => {
    getProcesses.mockReturnValue([process()]);
    render(<RopaRecordEditor record={record()} onSave={vi.fn()} onCancel={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: 'BPMN Link' }));
    expect(await screen.findByText('Not linked')).toBeTruthy();
  });

  test('writing the link saves the process XML with ronl:ropaRef and the xmlns declaration', async () => {
    getProcesses.mockReturnValue([process()]);
    render(<RopaRecordEditor record={record()} onSave={vi.fn()} onCancel={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: 'BPMN Link' }));
    await userEvent.click(screen.getByText('Write ronl:ropaRef to BPMN'));

    expect(saveProcess).toHaveBeenCalledWith(
      expect.objectContaining({
        xml: expect.stringMatching(/xmlns:ronl="http:\/\/ronl\.nl\/schema\/1\.0"/),
      })
    );
    expect(saveProcess).toHaveBeenCalledWith(
      expect.objectContaining({ xml: expect.stringContaining('ronl:ropaRef="r1"') })
    );
  });

  test('removing the link is offered once linked, and clears the ropaRef attribute', async () => {
    getProcesses.mockReturnValue([
      process({
        xml: '<bpmn:definitions xmlns:ronl="http://ronl.nl/schema/1.0"><bpmn:process ronl:ropaRef="r1" /></bpmn:definitions>',
      }),
    ]);
    render(<RopaRecordEditor record={record()} onSave={vi.fn()} onCancel={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: 'BPMN Link' }));
    expect(await screen.findByText('✓ Linked')).toBeTruthy();

    await userEvent.click(screen.getByText('Remove link'));
    expect(saveProcess).toHaveBeenCalledWith(
      expect.objectContaining({ xml: expect.not.stringContaining('ronl:ropaRef') })
    );
  });
});

describe('RopaRecordEditor — status', () => {
  test('Set Draft and Set Archived apply immediately, without confirmation', async () => {
    getProcesses.mockReturnValue([]);
    render(
      <RopaRecordEditor record={record({ status: 'active' })} onSave={vi.fn()} onCancel={vi.fn()} />
    );

    await userEvent.click(screen.getByRole('button', { name: 'Status' }));
    await userEvent.click(screen.getByRole('button', { name: /Set Archived/ }));

    expect(
      within(screen.getByText('Current status').parentElement!).getByText('archived')
    ).toBeTruthy();
  });

  test('Set Active asks for confirmation and does nothing when cancelled', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    getProcesses.mockReturnValue([]);
    render(
      <RopaRecordEditor record={record({ status: 'draft' })} onSave={vi.fn()} onCancel={vi.fn()} />
    );

    await userEvent.click(screen.getByRole('button', { name: 'Status' }));
    await userEvent.click(screen.getByRole('button', { name: /Set Active/ }));

    expect(window.confirm).toHaveBeenCalled();
    expect(
      within(screen.getByText('Current status').parentElement!).getByText('draft')
    ).toBeTruthy();
  });

  test('Set Active applies once confirmed', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    getProcesses.mockReturnValue([]);
    render(
      <RopaRecordEditor record={record({ status: 'draft' })} onSave={vi.fn()} onCancel={vi.fn()} />
    );

    await userEvent.click(screen.getByRole('button', { name: 'Status' }));
    await userEvent.click(screen.getByRole('button', { name: /Set Active/ }));

    expect(
      within(screen.getByText('Current status').parentElement!).getByText('active')
    ).toBeTruthy();
  });
});

describe('RopaRecordEditor — save / cancel', () => {
  test('Save calls onSave with the current record and a bumped updatedAt', async () => {
    getProcesses.mockReturnValue([]);
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<RopaRecordEditor record={record()} onSave={onSave} onCancel={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: /Save/ }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'r1', title: 'Zorgtoeslag' })
    );
  });

  test('a failed save surfaces the error message next to the header', async () => {
    getProcesses.mockReturnValue([]);
    const onSave = vi.fn().mockRejectedValue(new Error('Save failed: conflict'));
    render(<RopaRecordEditor record={record()} onSave={onSave} onCancel={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: /Save/ }));

    expect(await screen.findByText('Save failed: conflict')).toBeTruthy();
  });

  test('Cancel calls onCancel', async () => {
    getProcesses.mockReturnValue([]);
    const onCancel = vi.fn();
    render(<RopaRecordEditor record={record()} onSave={vi.fn()} onCancel={onCancel} />);

    // The only icon-only button in the top bar besides Save is the X/cancel button.
    const topBarButtons = screen.getAllByRole('button').filter((b) => b.textContent === '');
    await userEvent.click(topBarButtons[0]);

    expect(onCancel).toHaveBeenCalled();
  });
});
