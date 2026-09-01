// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';

// dnd-kit reports drag/hover state only inside a live DndContext gesture;
// drive both directly so the styling branches are reachable.
const dndState = vi.hoisted(() => ({ isDragging: false, isOver: false }));

vi.mock('@dnd-kit/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@dnd-kit/core')>();
  return {
    ...actual,
    useDroppable: () => ({ setNodeRef: () => {}, isOver: dndState.isOver }),
  };
});

vi.mock('@dnd-kit/sortable', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@dnd-kit/sortable')>();
  return {
    ...actual,
    useSortable: () => ({
      attributes: {},
      listeners: {},
      setNodeRef: () => {},
      transform: null,
      transition: undefined,
      isDragging: dndState.isDragging,
    }),
  };
});

vi.mock('./VendorModal', () => ({
  default: ({ dmnTitle, onClose }: { dmnTitle: string; onClose: () => void }) => (
    <div>
      <span>Vendor modal: {dmnTitle}</span>
      <button onClick={onClose}>close-vendor-modal</button>
    </div>
  ),
}));

import { DmnModel } from '../../types';
import { ChainValidation } from '../../types/chainBuilder.types';
import ChainComposer from './ChainComposer';

function dmn(overrides: Partial<DmnModel> = {}): DmnModel {
  return {
    id: 'd1',
    identifier: 'age-check',
    title: 'Age check',
    inputs: [{ identifier: 'age', title: 'Age', type: 'Integer' }],
    outputs: [{ identifier: 'eligible', title: 'Eligible', type: 'Boolean' }],
    ...overrides,
  };
}

function validation(overrides: Partial<ChainValidation> = {}): ChainValidation {
  return {
    isValid: true,
    isDrdCompatible: true,
    errors: [],
    warnings: [],
    semanticMatches: [],
    drdIssues: [],
    requiredInputs: [],
    missingInputs: [],
    estimatedTime: 0,
    ...overrides,
  };
}

beforeEach(() => {
  dndState.isDragging = false;
  dndState.isOver = false;
});

describe('ChainComposer', () => {
  test('shows an empty-state message when the chain has no DMNs', () => {
    render(
      <ChainComposer
        chain={[]}
        onRemoveDmn={vi.fn()}
        onClearChain={vi.fn()}
        validation={null}
        endpoint="e"
      />
    );
    expect(screen.getByText('No DMNs in chain yet')).toBeTruthy();
    expect(screen.queryByText('Clear Chain')).toBeNull();
  });

  test('renders each chained DMN with its step number and input/output counts', () => {
    render(
      <ChainComposer
        chain={[dmn(), dmn({ identifier: 'income-check', title: 'Income check' })]}
        onRemoveDmn={vi.fn()}
        onClearChain={vi.fn()}
        validation={validation()}
        endpoint="e"
      />
    );
    expect(screen.getByRole('heading', { name: 'age-check' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'income-check' })).toBeTruthy();
    expect(screen.getAllByText('1 input')).toHaveLength(2);
  });

  test('"Clear Chain" appears once populated and calls onClearChain', async () => {
    const onClearChain = vi.fn();
    render(
      <ChainComposer
        chain={[dmn()]}
        onRemoveDmn={vi.fn()}
        onClearChain={onClearChain}
        validation={validation()}
        endpoint="e"
      />
    );

    await userEvent.click(screen.getByText('Clear Chain'));
    expect(onClearChain).toHaveBeenCalled();
  });

  test('removing an item calls onRemoveDmn with its identifier', async () => {
    const onRemoveDmn = vi.fn();
    render(
      <ChainComposer
        chain={[dmn()]}
        onRemoveDmn={onRemoveDmn}
        onClearChain={vi.fn()}
        validation={validation()}
        endpoint="e"
      />
    );

    await userEvent.click(screen.getAllByTitle('Remove from chain')[0]);
    expect(onRemoveDmn).toHaveBeenCalledWith('age-check');
  });

  test('shows the valid-chain message when validation passes', () => {
    render(
      <ChainComposer
        chain={[dmn()]}
        onRemoveDmn={vi.fn()}
        onClearChain={vi.fn()}
        validation={validation()}
        endpoint="e"
      />
    );
    expect(screen.getByText('Chain is valid and ready to execute')).toBeTruthy();
  });

  test('shows the missing-inputs count when validation fails', () => {
    render(
      <ChainComposer
        chain={[dmn()]}
        onRemoveDmn={vi.fn()}
        onClearChain={vi.fn()}
        validation={validation({
          isValid: false,
          missingInputs: [{ identifier: 'age', title: 'Age', type: 'Integer' } as never],
        })}
        endpoint="e"
      />
    );
    expect(screen.getByText('1 input required')).toBeTruthy();
  });

  test('shows the "cannot save as DRD" warning when semantic matching makes the chain DRD-incompatible', () => {
    render(
      <ChainComposer
        chain={[dmn()]}
        onRemoveDmn={vi.fn()}
        onClearChain={vi.fn()}
        validation={validation({ isDrdCompatible: false })}
        endpoint="e"
      />
    );
    expect(screen.getByText('Cannot save as DRD')).toBeTruthy();
  });

  test('semantic matches render inside a collapsible details section', () => {
    render(
      <ChainComposer
        chain={[dmn()]}
        onRemoveDmn={vi.fn()}
        onClearChain={vi.fn()}
        validation={validation({
          semanticMatches: [
            {
              outputDmn: 'age-check',
              outputVar: 'age',
              inputDmn: 'income-check',
              inputVar: 'leeftijd',
              matchType: 'semantic',
              semanticConcept: 'https://example.com/concept/leeftijd',
            },
          ],
        })}
        endpoint="e"
      />
    );
    expect(screen.getByText(/1 semantic link detected/)).toBeTruthy();
    expect(screen.getByText('via leeftijd')).toBeTruthy();
  });

  test('an isDrd DMN shows its title, a DRD badge, and the Operaton cockpit link', () => {
    render(
      <ChainComposer
        chain={[dmn({ isDrd: true, deploymentId: 'deploy-123456789' })]}
        onRemoveDmn={vi.fn()}
        onClearChain={vi.fn()}
        validation={validation()}
        endpoint="e"
      />
    );
    expect(screen.getByText('Age check')).toBeTruthy();
    expect(screen.getByText('🔗 DRD')).toBeTruthy();
    expect(screen.getByTitle('View in Operaton Cockpit')).toBeTruthy();
  });

  test('clicking a vendor badge opens the vendor modal for that DMN', async () => {
    render(
      <ChainComposer
        chain={[dmn({ vendorCount: 3 })]}
        onRemoveDmn={vi.fn()}
        onClearChain={vi.fn()}
        validation={validation()}
        endpoint="e"
      />
    );

    await userEvent.click(screen.getByText('3'));
    expect(screen.getByText('Vendor modal: Age check')).toBeTruthy();
  });

  function renderChain(dmns: DmnModel[], overrides: Record<string, unknown> = {}) {
    return render(
      <ChainComposer
        chain={dmns}
        onRemoveDmn={vi.fn()}
        onClearChain={vi.fn()}
        validation={null}
        endpoint="e"
        {...overrides}
      />
    );
  }

  test('dims and outlines the card being dragged', () => {
    dndState.isDragging = true;
    const { container } = renderChain([dmn()]);

    const wrapper = container.querySelector('[style*="opacity"]') as HTMLElement;
    expect(wrapper.getAttribute('style')).toContain('opacity: 0.5');
    expect(container.querySelector('.border-blue-500')).not.toBeNull();
  });

  test('tints the drop zone while a DMN hovers over it', () => {
    dndState.isOver = true;
    const { container } = renderChain([]);
    expect(container.querySelector('.bg-blue-50')).not.toBeNull();
  });

  test('renders the description, organization logo and name of a chained DMN', () => {
    renderChain([
      dmn({
        description: 'Checks the applicant age',
        logoUrl: 'https://cdn.example.org/svb.png',
        organizationName: 'SVB',
      }),
    ]);

    expect(screen.getByText('Checks the applicant age')).toBeTruthy();
    expect(screen.getByAltText('SVB')).toBeTruthy();
    expect(screen.getByText('SVB')).toBeTruthy();
  });

  test('hides a logo that fails to load', () => {
    renderChain([dmn({ logoUrl: 'https://cdn.example.org/broken.png' })]);

    const logo = screen.getByAltText('Organization');
    fireEvent.error(logo);

    expect(logo.style.display).toBe('none');
  });

  test('shows the organization name on its own when there is no logo', () => {
    renderChain([dmn({ organizationName: 'UWV' })]);

    expect(screen.getByText('UWV')).toBeTruthy();
    expect(screen.queryByRole('img')).toBeNull();
  });

  test('styles a non-DRD deployment id in neutral colours and omits the cockpit link', () => {
    const { container } = renderChain([dmn({ deploymentId: 'abcdef0123456789' })]);

    expect(screen.getByText('abcdef01...')).toBeTruthy();
    expect(container.querySelector('.bg-slate-100.text-slate-700')).not.toBeNull();
    expect(screen.queryByTitle('View in Operaton Cockpit')).toBeNull();
    expect(screen.getByText('abcdef0123456789')).toBeTruthy();
  });

  test('links the API endpoint a DMN declares', () => {
    renderChain([dmn({ implementedBy: 'https://api.example.org/age-check' })]);

    const link = screen.getByTitle('Open API endpoint in new tab');
    expect(link.getAttribute('href')).toBe('https://api.example.org/age-check');
  });

  test('pluralises the input and output counts', () => {
    renderChain([
      dmn({
        inputs: [
          { identifier: 'age', title: 'Age', type: 'Integer' },
          { identifier: 'income', title: 'Income', type: 'Double' },
        ],
        outputs: [
          { identifier: 'a', title: 'A', type: 'Boolean' },
          { identifier: 'b', title: 'B', type: 'Boolean' },
        ],
      }),
    ]);

    expect(screen.getByText(/2 inputs/)).toBeTruthy();
    expect(screen.getByText(/2 outputs/)).toBeTruthy();
  });

  test('lists the first three inputs and outputs, summarising the rest', () => {
    const many = (prefix: string) =>
      Array.from({ length: 5 }, (_, i) => ({
        identifier: `${prefix}${i}`,
        title: `${prefix}${i}`,
        type: 'String',
      }));

    renderChain([dmn({ inputs: many('in'), outputs: many('out') })]);

    expect(screen.getByText(/• in0/)).toBeTruthy();
    expect(screen.getByText(/• in2/)).toBeTruthy();
    expect(screen.queryByText(/• in3/)).toBeNull();
    expect(screen.getAllByText('+2 more...')).toHaveLength(2);
  });

  test('uses the singular noun for exactly one missing input', () => {
    renderChain([dmn()], {
      validation: validation({ isValid: false, missingInputs: ['age'] }),
    });
    expect(screen.getByText(/^1 input required$/)).toBeTruthy();
  });

  test('uses the singular noun for exactly one semantic link', () => {
    renderChain([dmn()], {
      validation: validation({
        semanticMatches: [
          {
            outputDmn: 'a',
            outputVar: 'x',
            inputDmn: 'b',
            inputVar: 'y',
            semanticConcept: 'https://example.org/concept/Age',
          },
        ],
      }),
    });
    expect(screen.getByText(/1 semantic link detected/)).toBeTruthy();
  });

  test('hides the validation badge for a DMN that was never validated', () => {
    renderChain([dmn({ validationStatus: 'not-validated' })]);
    expect(screen.queryByText('Gevalideerd')).toBeNull();
  });

  test('hides the vendor badge when the DMN reports no vendors', () => {
    renderChain([dmn({ vendorCount: 0 })]);
    expect(screen.queryByText('0')).toBeNull();
  });
});
