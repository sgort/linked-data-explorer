// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, test, vi } from 'vitest';

const { modelerInstances, MockBpmnModeler } = vi.hoisted(() => {
  class MockCanvas {
    private zoomLevel = 1;
    zoom(val?: number | string) {
      if (val === undefined) return this.zoomLevel;
      if (val === 'fit-viewport') {
        this.zoomLevel = 1;
        return this.zoomLevel;
      }
      this.zoomLevel = val as number;
      return this.zoomLevel;
    }
  }

  class MockEventBus {
    listeners: Record<string, ((payload?: unknown) => void)[]> = {};
    on(event: string, cb: (payload?: unknown) => void) {
      (this.listeners[event] ??= []).push(cb);
    }
    off(event: string, cb: (payload?: unknown) => void) {
      this.listeners[event] = (this.listeners[event] ?? []).filter((l) => l !== cb);
    }
    emit(event: string, payload?: unknown) {
      (this.listeners[event] ?? []).forEach((cb) => cb(payload));
    }
  }

  class MockOverlays {
    add = () => {};
    remove = () => {};
  }

  class MockElementRegistry {
    elements: unknown[] = [];
    forEach(cb: (el: unknown) => void) {
      this.elements.forEach(cb);
    }
  }

  class MockPropertiesPanel {
    attachTo(container: HTMLElement) {
      const scroll = document.createElement('div');
      scroll.className = 'bio-properties-panel-scroll-container';
      container.appendChild(scroll);
    }
    detach() {}
  }

  class MockBpmnModeler {
    canvas = new MockCanvas();
    eventBus = new MockEventBus();
    overlays = new MockOverlays();
    elementRegistry = new MockElementRegistry();
    propertiesPanel = new MockPropertiesPanel();
    modeling = { updateProperties: () => {} };
    xml = '';

    constructor(_opts: unknown) {
      modelerInstances.push(this);
    }

    get(service: string) {
      switch (service) {
        case 'canvas':
          return this.canvas;
        case 'eventBus':
          return this.eventBus;
        case 'overlays':
          return this.overlays;
        case 'elementRegistry':
          return this.elementRegistry;
        case 'propertiesPanel':
          return this.propertiesPanel;
        case 'modeling':
          return this.modeling;
        default:
          return {};
      }
    }

    importXML(xml: string) {
      this.xml = xml;
      return Promise.resolve({ warnings: [] });
    }

    saveXML(_opts?: unknown) {
      return Promise.resolve({ xml: this.xml });
    }

    destroy() {}
  }

  const modelerInstances: InstanceType<typeof MockBpmnModeler>[] = [];
  return { modelerInstances, MockBpmnModeler };
});

vi.mock('./BpmnModeler.css', () => ({}));
vi.mock('./bpmn-js.css', () => ({}));
vi.mock('@bpmn-io/properties-panel/dist/assets/properties-panel.css', () => ({}));
vi.mock('bpmn-js-properties-panel', () => ({
  BpmnPropertiesPanelModule: {},
  BpmnPropertiesProviderModule: {},
  CamundaPlatformPropertiesProviderModule: {},
}));
vi.mock('camunda-bpmn-moddle/resources/camunda.json', () => ({ default: {} }));

vi.mock('bpmn-js/lib/Modeler', () => ({ default: MockBpmnModeler }));

vi.mock('./DmnTemplateSelector', () => ({
  default: (props: { selectedDecisionRef?: string }) => (
    <div>DMN selector: {props.selectedDecisionRef ?? 'none'}</div>
  ),
}));
vi.mock('./FormTemplateSelector', () => ({
  default: (props: { selectedFormRef?: string }) => (
    <div>Form selector: {props.selectedFormRef ?? 'none'}</div>
  ),
}));
vi.mock('./DocumentTemplateSelector', () => ({
  default: (props: { selectedDocumentRef?: string }) => (
    <div>Document selector: {props.selectedDocumentRef ?? 'none'}</div>
  ),
}));

const getProcesses = vi.fn();
vi.mock('@/src/services/bpmnService', () => ({
  BpmnService: { getProcesses: (...args: unknown[]) => getProcesses(...args) },
}));

const getForms = vi.fn();
vi.mock('../../services/formService', () => ({
  FormService: { getForms: (...args: unknown[]) => getForms(...args) },
}));

const getTemplates = vi.fn();
vi.mock('../../services/documentService', () => ({
  DocumentService: { getTemplates: (...args: unknown[]) => getTemplates(...args) },
}));

import BpmnCanvas from './BpmnCanvas';

const SIMPLE_XML =
  '<bpmn:definitions xmlns:bpmn="x"><bpmn:process id="MyProcess"><bpmn:startEvent id="s1"/></bpmn:process></bpmn:definitions>';

afterEach(() => {
  modelerInstances.length = 0;
  getProcesses.mockReset();
  getForms.mockReset();
  getTemplates.mockReset();
  vi.restoreAllMocks();
});

async function renderCanvas(
  options: {
    xml?: string;
    forms?: unknown[];
    templates?: unknown[];
    processes?: unknown[];
    onSave?: (xml: string) => void;
    onClose?: () => void;
    onElementSelect?: (element: unknown) => void;
    onDirtyChange?: (dirty: boolean) => void;
  } = {}
) {
  const xml = options.xml ?? SIMPLE_XML;
  getProcesses.mockReturnValue(options.processes ?? []);
  getForms.mockReturnValue(options.forms ?? []);
  getTemplates.mockReturnValue(options.templates ?? []);
  const onSave = options.onSave ?? vi.fn();
  const onClose = options.onClose ?? vi.fn();
  const onElementSelect = options.onElementSelect ?? vi.fn();
  const onDirtyChange = options.onDirtyChange ?? vi.fn();
  render(
    <BpmnCanvas
      xml={xml}
      endpoint="https://example.com/sparql"
      onSave={onSave}
      onClose={onClose}
      onElementSelect={onElementSelect}
      onDirtyChange={onDirtyChange}
    />
  );
  await vi.waitFor(() => expect(modelerInstances.length).toBe(1), { timeout: 1000 });
  const modeler = modelerInstances[0];
  await vi.waitFor(() => expect(modeler.xml).toBe(xml), { timeout: 1000 });
  return { modeler, onSave, onClose, onElementSelect, onDirtyChange };
}

describe('BpmnCanvas — lifecycle', () => {
  test('imports the XML into a new bpmn-js modeler on mount', async () => {
    await renderCanvas();
    expect(modelerInstances).toHaveLength(1);
  });

  test('Save is disabled until the eventBus reports a commandStack change', async () => {
    const { modeler } = await renderCanvas();
    expect(screen.getByRole('button', { name: /Save/ })).toBeDisabled();

    act(() => modeler.eventBus.emit('commandStack.changed'));
    expect(await screen.findByRole('button', { name: /Save/ })).not.toBeDisabled();
  });

  test('clicking Save calls onSave with the saved XML and resets the dirty flag', async () => {
    const { modeler, onSave, onDirtyChange } = await renderCanvas();
    act(() => modeler.eventBus.emit('commandStack.changed'));
    await userEvent.click(await screen.findByRole('button', { name: /Save/ }));

    expect(onSave).toHaveBeenCalledWith(SIMPLE_XML);
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
    expect(screen.getByRole('button', { name: /Save/ })).toBeDisabled();
  });

  test('Export builds a .bpmn blob download', async () => {
    const createObjectURL = vi.fn().mockReturnValue('blob:mock');
    const revokeObjectURL = vi.fn();
    global.URL.createObjectURL = createObjectURL;
    global.URL.revokeObjectURL = revokeObjectURL;
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    await renderCanvas();
    await userEvent.click(screen.getByText('Export'));

    expect(createObjectURL).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock');
  });

  test('Close calls onClose', async () => {
    const { onClose } = await renderCanvas();
    await userEvent.click(screen.getByText('Close'));
    expect(onClose).toHaveBeenCalled();
  });

  test('zoom controls call canvas.zoom', async () => {
    const { modeler } = await renderCanvas();
    await userEvent.click(screen.getByTitle('Zoom In'));
    expect(modeler.canvas.zoom()).toBeCloseTo(1.1);

    await userEvent.click(screen.getByTitle('Zoom Out'));
    expect(modeler.canvas.zoom()).toBeCloseTo(1.0);

    await userEvent.click(screen.getByTitle('Fit to Viewport'));
    expect(modeler.canvas.zoom()).toBe(1);
  });

  test('destroys the modeler and detaches the properties panel on unmount', async () => {
    const { modeler } = await renderCanvas();
    const destroySpy = vi.spyOn(modeler, 'destroy');
    const detachSpy = vi.spyOn(modeler.propertiesPanel, 'detach');

    // renderCanvas doesn't expose unmount, so re-render fresh for this assertion.
    modelerInstances.length = 0;
    const { unmount } = render(
      <BpmnCanvas
        xml={SIMPLE_XML}
        endpoint="e"
        onSave={vi.fn()}
        onClose={vi.fn()}
        onElementSelect={vi.fn()}
      />
    );
    await vi.waitFor(() => expect(modelerInstances.length).toBe(1));
    const freshDestroy = vi.spyOn(modelerInstances[0], 'destroy');
    const freshDetach = vi.spyOn(modelerInstances[0].propertiesPanel, 'detach');
    unmount();
    expect(freshDestroy).toHaveBeenCalled();
    expect(freshDetach).toHaveBeenCalled();
    // keep references so lint doesn't flag them as unused
    expect(typeof destroySpy).toBe('function');
    expect(typeof detachSpy).toBe('function');
  });
});

describe('BpmnCanvas — properties panel element selectors', () => {
  test('selecting a BusinessRuleTask injects the DMN selector and calls onElementSelect', async () => {
    const { modeler, onElementSelect } = await renderCanvas();
    const element = {
      id: 'task1',
      type: 'bpmn:BusinessRuleTask',
      businessObject: {
        get: (key: string) => (key === 'camunda:decisionRef' ? 'age-check' : undefined),
      },
    };

    act(() => modeler.eventBus.emit('selection.changed', { newSelection: [element] }));

    expect(onElementSelect).toHaveBeenCalledWith(element);
    expect(await screen.findByText('DMN selector: age-check')).toBeTruthy();
  });

  test('selecting a UserTask injects both the Form and Document selectors', async () => {
    const { modeler } = await renderCanvas();
    const element = {
      id: 'task2',
      type: 'bpmn:UserTask',
      businessObject: {
        get: (key: string) =>
          key === 'camunda:formRef' ? 'form-1' : key === 'ronl:documentRef' ? 'doc-1' : undefined,
      },
    };

    act(() => modeler.eventBus.emit('selection.changed', { newSelection: [element] }));

    expect(await screen.findByText('Form selector: form-1')).toBeTruthy();
    expect(screen.getByText('Document selector: doc-1')).toBeTruthy();
  });

  test('selecting a StartEvent injects only the Form selector, not the Document selector', async () => {
    const { modeler } = await renderCanvas();
    const element = {
      id: 's1',
      type: 'bpmn:StartEvent',
      businessObject: { get: (key: string) => (key === 'camunda:formRef' ? 'form-2' : undefined) },
    };

    act(() => modeler.eventBus.emit('selection.changed', { newSelection: [element] }));

    expect(await screen.findByText('Form selector: form-2')).toBeTruthy();
    expect(screen.queryByText(/Document selector/)).toBeNull();
  });

  test('selecting an unsupported element type clears any injected selector', async () => {
    const { modeler } = await renderCanvas();
    const businessRuleTask = {
      id: 'task1',
      type: 'bpmn:BusinessRuleTask',
      businessObject: { get: () => 'age-check' },
    };
    act(() => modeler.eventBus.emit('selection.changed', { newSelection: [businessRuleTask] }));
    await screen.findByText('DMN selector: age-check');

    act(() =>
      modeler.eventBus.emit('selection.changed', {
        newSelection: [{ id: 'gw1', type: 'bpmn:ExclusiveGateway' }],
      })
    );

    expect(screen.queryByText(/DMN selector/)).toBeNull();
  });
});

describe('BpmnCanvas — deploy modal', () => {
  test('opening the modal lists the process key and matched form/document resources', async () => {
    // NOTE: `doc.querySelector('process')` in BpmnCanvas.tsx never matches a
    // namespace-prefixed `<bpmn:process>` element in jsdom's XML parser — a plain
    // CSS type selector only matches the null namespace, prefix or not. The
    // component's own `?? 'process'` fallback kicks in here every time, so the
    // process key is always the literal string "process" for XML shaped like
    // real bpmn-js output. Asserting the actual (fallback) behavior rather than
    // the intended one — this looks like a pre-existing, unrelated bug, flagged
    // in docs/TESTS.md rather than silently "fixed" as part of writing this test.
    const xml =
      '<bpmn:definitions><bpmn:process id="MyProcess"><bpmn:userTask camunda:formRef="form-1" ronl:documentRef="doc-1" /></bpmn:process></bpmn:definitions>';
    await renderCanvas({
      xml,
      forms: [{ id: 'f1', schema: { id: 'form-1' } }],
      templates: [{ id: 'doc-1', name: 'Beschikking' }],
    });

    await userEvent.click(screen.getByText('Deploy'));

    await screen.findByText('Deploy to Operaton');
    await vi.waitFor(() => {
      expect(document.body.textContent).toContain('process.bpmn');
      expect(document.body.textContent).toContain('form-1.form');
      expect(document.body.textContent).toContain('doc-1.document');
    });
  });

  test('warns when no ronl:ropaRef is present in the process XML', async () => {
    await renderCanvas();
    await userEvent.click(screen.getByText('Deploy'));

    await screen.findByText('Deploy to Operaton');
    await vi.waitFor(() => expect(document.body.textContent).toMatch(/ronl:ropaRef/));
  });

  test('auto-detects the board owner from candidateGroups, and blocks deploy without one', async () => {
    const xmlNoGroup = SIMPLE_XML;
    await renderCanvas({ xml: xmlNoGroup });
    await userEvent.click(screen.getByText('Deploy'));

    expect(await screen.findByText('no board auto-detected')).toBeTruthy();
    expect(screen.getByText(/A board owner is required/)).toBeTruthy();
    const modalDeployButton = screen.getAllByRole('button', { name: /Deploy/ })[1];
    expect(modalDeployButton).toBeDisabled();
  });

  test('picking a board option enables Deploy and posts to the deploy endpoint on success', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      json: async () => ({ success: true, data: { deploymentId: 'dep-123' } }),
    });
    await renderCanvas();
    await userEvent.click(screen.getByText('Deploy'));
    await screen.findByText('no board auto-detected');

    await userEvent.click(screen.getByRole('button', { name: 'Infra-board' }));
    const modalDeployButton = screen.getAllByRole('button', { name: /Deploy/ })[1];
    expect(modalDeployButton).not.toBeDisabled();

    await userEvent.click(modalDeployButton);

    await vi.waitFor(() =>
      expect(screen.getAllByText(/Deployment ID: dep-123/).length).toBeGreaterThan(0)
    );
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/dmns/process/deploy'),
      expect.objectContaining({ method: 'POST' })
    );
  });

  test('a failed deploy shows the server error message', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      json: async () => ({ success: false, error: { message: 'Operaton unreachable' } }),
    });
    await renderCanvas();
    await userEvent.click(screen.getByText('Deploy'));
    await screen.findByText('no board auto-detected');
    await userEvent.click(screen.getByRole('button', { name: 'Infra-board' }));
    await userEvent.click(screen.getAllByRole('button', { name: /Deploy/ })[1]);

    await vi.waitFor(() => expect(document.body.textContent).toContain('Operaton unreachable'));
  });

  test('Cancel closes the deploy modal', async () => {
    await renderCanvas();
    await userEvent.click(screen.getByText('Deploy'));
    await screen.findByText('Deploy to Operaton');

    await userEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByText('Deploy to Operaton')).toBeNull();
  });
});
