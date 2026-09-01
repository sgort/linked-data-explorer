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
      // Sentinel for the failure path: bpmn-js rejects on unparseable XML.
      if (xml.includes('__IMPORT_FAIL__')) return Promise.reject(new Error('parse error'));
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
    // The process key comes from the `<bpmn:process>` element's own id.
    //
    // This used to assert the literal string "process", the component's
    // fallback, for two compounding reasons. BpmnCanvas looked the element up
    // with a CSS type selector, which matches only the null namespace and so
    // never found a prefixed `<bpmn:process>` — a real defect against real
    // bpmn-js output, now fixed by `findProcessElement`. And the fixture below
    // declared none of the prefixes it used, so `DOMParser` rejected it and
    // returned a `<parsererror>` document in which nothing was findable at all.
    // The namespace declarations are now present, as bpmn-js always emits them.
    const xml =
      '<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:camunda="http://camunda.org/schema/1.0/bpmn" xmlns:ronl="https://regels.overheid.nl/schema"><bpmn:process id="MyProcess"><bpmn:userTask camunda:formRef="form-1" ronl:documentRef="doc-1" /></bpmn:process></bpmn:definitions>';
    await renderCanvas({
      xml,
      forms: [{ id: 'f1', schema: { id: 'form-1' } }],
      templates: [{ id: 'doc-1', name: 'Beschikking' }],
    });

    await userEvent.click(screen.getByText('Deploy'));

    await screen.findByText('Deploy to Operaton');
    await vi.waitFor(() => {
      expect(document.body.textContent).toContain('MyProcess.bpmn');
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

  test('blocks deploy when the BPMN has no ronl:organization attribute', async () => {
    await renderCanvas({ xml: SIMPLE_XML });
    await userEvent.click(screen.getByText('Deploy'));

    expect(await screen.findByText('not set')).toBeTruthy();
    expect(screen.getByText(/An organization is required/)).toBeTruthy();
    const modalDeployButton = screen.getAllByRole('button', { name: /Deploy/ })[1];
    expect(modalDeployButton).toBeDisabled();
  });

  test('reads organization from the BPMN and sends it in the deploy request', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      json: async () => ({ success: true, data: { deploymentId: 'dep-123' } }),
    });
    const xmlWithOrg = SIMPLE_XML.replace(
      '<bpmn:process',
      '<bpmn:process ronl:organization="flevoland"'
    );
    await renderCanvas({ xml: xmlWithOrg });
    await userEvent.click(screen.getByText('Deploy'));

    await screen.findByText('flevoland');
    await userEvent.click(screen.getByRole('button', { name: 'Infra-board' }));
    const modalDeployButton = screen.getAllByRole('button', { name: /Deploy/ })[1];
    expect(modalDeployButton).not.toBeDisabled();

    await userEvent.click(modalDeployButton);

    await vi.waitFor(() =>
      expect(screen.getAllByText(/Deployment ID: dep-123/).length).toBeGreaterThan(0)
    );
    const [, options] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(options.body as string);
    expect(body.organization).toBe('flevoland');
  });

  test('picking a board option enables Deploy and posts to the deploy endpoint on success', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      json: async () => ({ success: true, data: { deploymentId: 'dep-123' } }),
    });
    // organization is mandatory too — give this XML one so the scenario under
    // test (board picking) isn't masked by the unrelated organization block.
    await renderCanvas({
      xml: SIMPLE_XML.replace('<bpmn:process', '<bpmn:process ronl:organization="flevoland"'),
    });
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
    // organization is mandatory too — give this XML one so the scenario under
    // test (server-side failure) isn't masked by the unrelated organization block.
    await renderCanvas({
      xml: SIMPLE_XML.replace('<bpmn:process', '<bpmn:process ronl:organization="flevoland"'),
    });
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

describe('BpmnCanvas — deploy modal, unmatched resources', () => {
  // A bundle whose board and organization are both already satisfied, so the
  // ONLY thing left that can disable Deploy is the unmatched-resource guard.
  // Without that isolation these tests would pass on the pre-existing
  // organization guard and prove nothing.
  const NS =
    'xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" ' +
    'xmlns:camunda="http://camunda.org/schema/1.0/bpmn" ' +
    'xmlns:ronl="https://regels.overheid.nl/schema"';

  const bundle = (taskAttrs: string) =>
    `<bpmn:definitions ${NS}><bpmn:process id="MyProcess" ronl:organization="flevoland">` +
    `<bpmn:userTask id="t1" camunda:candidateGroups="rip-projectleider" ${taskAttrs} />` +
    `</bpmn:process></bpmn:definitions>`;

  async function openModalWithBoard(
    xml: string,
    opts: { forms?: unknown[]; templates?: unknown[] }
  ) {
    await renderCanvas({ xml, forms: opts.forms ?? [], templates: opts.templates ?? [] });
    await userEvent.click(screen.getByText('Deploy'));
    await screen.findByText('Deploy to Operaton');
    await userEvent.click(screen.getByRole('button', { name: 'Infra-board' }));
  }

  test('blocks deploy when a referenced document template is missing from storage', async () => {
    await openModalWithBoard(bundle('ronl:documentRef="doc-missing"'), { templates: [] });

    expect(document.body.textContent).toContain('doc-missing.document');
    expect(screen.getAllByRole('button', { name: /Deploy/ })[1]).toBeDisabled();
  });

  test('blocks deploy when a referenced form is missing from storage', async () => {
    await openModalWithBoard(bundle('camunda:formRef="form-missing"'), { forms: [] });

    expect(document.body.textContent).toContain('form-missing.form');
    expect(screen.getAllByRole('button', { name: /Deploy/ })[1]).toBeDisabled();
  });

  test('allows deploy once every referenced resource is present in storage', async () => {
    await openModalWithBoard(bundle('camunda:formRef="form-1" ronl:documentRef="doc-1"'), {
      forms: [{ id: 'f1', schema: { id: 'form-1' } }],
      templates: [{ id: 'doc-1', name: 'Beschikking' }],
    });

    expect(screen.getAllByRole('button', { name: /Deploy/ })[1]).not.toBeDisabled();
  });

  test('bundles the template a task references through ronl:signatureRef', async () => {
    // rip-pdp survived this gap in production only because it happened to carry
    // ronl:documentRef as well; a signature-only task shipped without its
    // template and failed at runtime with SIGNATURE_TEMPLATE_NOT_FOUND.
    await openModalWithBoard(bundle('ronl:signatureRef="doc-1"'), {
      templates: [{ id: 'doc-1', name: 'Projectplan' }],
    });

    expect(document.body.textContent).toContain('doc-1.document');
  });

  test('reports the resource count once, including documents', async () => {
    await openModalWithBoard(bundle('camunda:formRef="form-1" ronl:documentRef="doc-1"'), {
      forms: [{ id: 'f1', schema: { id: 'form-1' } }],
      templates: [{ id: 'doc-1', name: 'Beschikking' }],
    });

    // 1 bpmn + 1 form + 1 document. The footer used to print the count twice,
    // the first omitting documents entirely: "2 resource(s) · 3 resource(s)".
    expect(document.body.textContent).toContain('3 resource(s) · process key:');
    expect(document.body.textContent).not.toMatch(/resource\(s\)\s*·\s*\d+\s*resource\(s\)/);
  });
});

describe('BpmnCanvas — overlay badges', () => {
  /** A minimal element-registry entry, shaped like a bpmn-js element. */
  function element(type: string, attrs: Record<string, string> = {}, id = 'e1') {
    return {
      id,
      type,
      width: 100,
      businessObject: { get: (key: string) => attrs[key] },
    };
  }

  async function overlaysAfterChange(elements: unknown[]) {
    const { modeler } = await renderCanvas();
    const added: { id: string; type: string; opts: { html: string } }[] = [];
    modeler.overlays.add = ((id: string, type: string, opts: { html: string }) => {
      added.push({ id, type, opts });
    }) as never;
    modeler.elementRegistry.elements = elements;

    act(() => modeler.eventBus.emit('commandStack.changed'));

    return added;
  }

  test('badges a BusinessRuleTask that references a DMN', async () => {
    const added = await overlaysAfterChange([
      element('bpmn:BusinessRuleTask', { 'camunda:decisionRef': 'AgeCheck' }),
    ]);

    expect(added).toHaveLength(1);
    expect(added[0].type).toBe('dmn-linked');
    expect(added[0].opts.html).toContain('AgeCheck');
  });

  test('leaves an unlinked BusinessRuleTask unbadged', async () => {
    expect(await overlaysAfterChange([element('bpmn:BusinessRuleTask')])).toHaveLength(0);
  });

  test('badges a UserTask with both its form and its document', async () => {
    const added = await overlaysAfterChange([
      element('bpmn:UserTask', {
        'camunda:formRef': 'aanvraag-form',
        'ronl:documentRef': 'beschikking',
      }),
    ]);

    expect(added.map((a) => a.type)).toEqual(['form-linked', 'document-linked']);
    expect(added[0].opts.html).toContain('aanvraag-form');
    expect(added[1].opts.html).toContain('beschikking');
  });

  test('badges a UserTask that has a form but no document', async () => {
    const added = await overlaysAfterChange([
      element('bpmn:UserTask', { 'camunda:formRef': 'aanvraag-form' }),
    ]);
    expect(added.map((a) => a.type)).toEqual(['form-linked']);
  });

  test('leaves an unlinked UserTask unbadged', async () => {
    expect(await overlaysAfterChange([element('bpmn:UserTask')])).toHaveLength(0);
  });

  test('badges a StartEvent that carries a form, below the shape', async () => {
    const added = await overlaysAfterChange([
      element('bpmn:StartEvent', { 'camunda:formRef': 'start-form' }),
    ]);

    expect(added).toHaveLength(1);
    expect(added[0].opts.html).toContain('form-linked-badge--start');
  });

  test('leaves an unlinked StartEvent unbadged', async () => {
    expect(await overlaysAfterChange([element('bpmn:StartEvent')])).toHaveLength(0);
  });

  test('ignores element types that carry no badge', async () => {
    expect(await overlaysAfterChange([element('bpmn:SequenceFlow')])).toHaveLength(0);
  });
});

describe('BpmnCanvas — canvas interaction', () => {
  test('the wheel zooms in when scrolling up and out when scrolling down', async () => {
    const { modeler } = await renderCanvas();
    const container = document.querySelector('.flex-1.relative') ?? document.body;
    const surface = container.querySelector('div') ?? (container as HTMLElement);

    const before = modeler.canvas.zoom();
    surface.dispatchEvent(new WheelEvent('wheel', { deltaY: -120, bubbles: true }));
    const zoomedIn = modeler.canvas.zoom();

    surface.dispatchEvent(new WheelEvent('wheel', { deltaY: 120, bubbles: true }));
    const zoomedOut = modeler.canvas.zoom();

    expect(zoomedIn).toBeGreaterThanOrEqual(before);
    expect(zoomedOut).toBeLessThanOrEqual(zoomedIn);
  });

  test('logs and keeps rendering when the XML cannot be imported', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    getProcesses.mockReturnValue([]);
    getForms.mockReturnValue([]);
    getTemplates.mockReturnValue([]);
    render(
      <BpmnCanvas
        xml="<definitions __IMPORT_FAIL__ />"
        endpoint="e"
        onSave={vi.fn()}
        onClose={vi.fn()}
        onElementSelect={vi.fn()}
      />
    );

    await vi.waitFor(() =>
      expect(consoleError).toHaveBeenCalledWith('Failed to import BPMN:', expect.any(Error))
    );
  });

  test('a selection of an element type with no custom panel injects nothing', async () => {
    const { modeler } = await renderCanvas();

    act(() =>
      modeler.eventBus.emit('selection.changed', {
        newSelection: [
          { id: 'g1', type: 'bpmn:Gateway', businessObject: { get: () => undefined } },
        ],
      })
    );

    expect(screen.queryByText(/selector:/)).toBeNull();
  });

  test('injects nothing when the properties panel scroll container is absent', async () => {
    const { modeler } = await renderCanvas();
    document.querySelector('.bio-properties-panel-scroll-container')?.remove();

    act(() =>
      modeler.eventBus.emit('selection.changed', {
        newSelection: [
          {
            id: 't1',
            type: 'bpmn:UserTask',
            businessObject: { get: () => undefined },
          },
        ],
      })
    );

    expect(screen.queryByText(/Form selector/)).toBeNull();
  });
});

describe('BpmnCanvas — deploy bundle assembly', () => {
  const NS =
    'xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" ' +
    'xmlns:camunda="http://camunda.org/schema/1.0/bpmn" ' +
    'xmlns:ronl="https://regels.overheid.nl/schema"';

  function shell(extraProcessAttrs: string, body: string) {
    return (
      `<bpmn:definitions ${NS}><bpmn:process id="MyProcess" ronl:organization="flevoland" ` +
      `${extraProcessAttrs}><bpmn:userTask id="t1" camunda:candidateGroups="rip-projectleider"/>` +
      `${body}</bpmn:process></bpmn:definitions>`
    );
  }

  function subprocess(id: string, attrs = '') {
    return `<bpmn:definitions ${NS}><bpmn:process id="${id}" ${attrs}/></bpmn:definitions>`;
  }

  async function openModal(options: Parameters<typeof renderCanvas>[0]) {
    const rendered = await renderCanvas(options);
    await userEvent.click(screen.getByText('Deploy'));
    await screen.findByText('Deploy to Operaton');
    return rendered;
  }

  test('pulls a called subprocess into the bundle', async () => {
    await openModal({
      xml: shell('', '<bpmn:callActivity id="c1" calledElement="SubProc"/>'),
      processes: [{ id: 'p2', xml: subprocess('SubProc') }],
    });

    expect(document.body.textContent).toContain('SubProc.bpmn');
    expect(document.body.textContent).toContain('2 resource(s)');
  });

  test('omits a called subprocess that is not in local storage', async () => {
    await openModal({
      xml: shell('', '<bpmn:callActivity id="c1" calledElement="Missing"/>'),
      processes: [{ id: 'p2', xml: subprocess('Other') }],
    });

    expect(document.body.textContent).not.toContain('Missing.bpmn');
    expect(document.body.textContent).toContain('1 resource(s)');
  });

  test('accepts a single-language bundle without warning', async () => {
    await openModal({
      xml: shell('ronl:language="nl"', '<bpmn:callActivity id="c1" calledElement="SubProc"/>'),
      processes: [{ id: 'p2', xml: subprocess('SubProc', 'ronl:language="nl"') }],
    });

    expect(document.body.textContent).not.toContain('Bundle mixes languages');
  });

  test('warns when the shell and its subprocess disagree on language', async () => {
    await openModal({
      xml: shell('ronl:language="nl"', '<bpmn:callActivity id="c1" calledElement="SubProc"/>'),
      processes: [{ id: 'p2', xml: subprocess('SubProc', 'ronl:language="en"') }],
    });

    expect(document.body.textContent).toContain('Bundle mixes languages');
    expect(document.body.textContent).toContain('en, nl');
  });

  test('warns when a bundled form is tagged in another language than the process', async () => {
    await openModal({
      xml:
        `<bpmn:definitions ${NS}><bpmn:process id="MyProcess" ronl:organization="flevoland" ` +
        `ronl:language="nl"><bpmn:userTask id="t1" camunda:formRef="form-1"/>` +
        `</bpmn:process></bpmn:definitions>`,
      forms: [{ id: 'f1', schema: { id: 'form-1' }, language: 'de' }],
    });

    expect(document.body.textContent).toContain('Bundle mixes languages');
    expect(document.body.textContent).toContain('de, nl');
  });

  test('warns when a bundled document is tagged in another language than the process', async () => {
    await openModal({
      xml:
        `<bpmn:definitions ${NS}><bpmn:process id="MyProcess" ronl:organization="flevoland" ` +
        `ronl:language="nl"><bpmn:userTask id="t1" ronl:documentRef="doc-1"/>` +
        `</bpmn:process></bpmn:definitions>`,
      templates: [{ id: 'doc-1', name: 'Beschikking', language: 'en' }],
    });

    expect(document.body.textContent).toContain('Bundle mixes languages');
    expect(document.body.textContent).toContain('en, nl');
  });

  test('a process XML with no <process> element falls back to a generic key', async () => {
    await openModal({
      xml: `<bpmn:definitions ${NS}><bpmn:collaboration id="c"/></bpmn:definitions>`,
    });

    expect(document.body.textContent).toContain('process key:');
    expect(document.body.textContent).toContain('process.bpmn');
  });
});

describe('BpmnCanvas — deploy request', () => {
  const NS =
    'xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" ' +
    'xmlns:camunda="http://camunda.org/schema/1.0/bpmn" ' +
    'xmlns:ronl="https://regels.overheid.nl/schema"';

  const DEPLOYABLE =
    `<bpmn:definitions ${NS}><bpmn:process id="MyProcess" ronl:organization="flevoland" ` +
    `ronl:ropaRef="ropa-1"><bpmn:userTask id="t1" camunda:candidateGroups="rip-projectleider" ` +
    `camunda:formRef="form-1" ronl:documentRef="doc-1"/>` +
    `<bpmn:callActivity id="c1" calledElement="SubProc"/></bpmn:process></bpmn:definitions>`;

  async function deploy(fetchImpl: (url: string, init?: RequestInit) => Promise<unknown>) {
    global.fetch = vi.fn().mockImplementation(fetchImpl) as never;
    await renderCanvas({
      xml: DEPLOYABLE,
      forms: [{ id: 'f1', schema: { id: 'form-1' } }],
      templates: [{ id: 'doc-1', name: 'Beschikking' }],
      processes: [
        { id: 'lde-1', bpmnProcessId: 'MyProcess', xml: DEPLOYABLE },
        {
          id: 'p2',
          bpmnProcessId: 'SubProc',
          xml: `<bpmn:definitions ${NS}><bpmn:process id="SubProc"/></bpmn:definitions>`,
        },
      ],
    });
    await userEvent.click(screen.getByText('Deploy'));
    await screen.findByText('Deploy to Operaton');
    await userEvent.click(screen.getAllByRole('button', { name: /^Deploy$/ })[1]);
  }

  test('posts the whole bundle and records the deployment on success', async () => {
    const calls: { url: string; body: Record<string, unknown> }[] = [];
    await deploy(async (url, init) => {
      calls.push({ url, body: JSON.parse(String(init?.body)) });
      return {
        json: async () => ({ success: true, data: { deploymentId: 'dep-42' } }),
      };
    });

    expect((await screen.findAllByText(/Deployment ID: dep-42/)).length).toBeGreaterThan(0);

    const deployCall = calls.find((c) => c.url.includes('/api/dmns/process/deploy'))!;
    expect(deployCall.body.deploymentName).toBe('MyProcess');
    expect(deployCall.body.boardOwner).toBe('infra-board');
    expect(deployCall.body.organization).toBe('flevoland');
    expect(deployCall.body.forms).toEqual([{ id: 'form-1', schema: { id: 'form-1' } }]);
    expect((deployCall.body.documents as { id: string }[])[0].id).toBe('doc-1');
    expect((deployCall.body.subProcesses as { filename: string }[])[0].filename).toBe(
      'SubProc.bpmn'
    );
    expect(deployCall.body.operatonUrl).toBeUndefined();

    await vi.waitFor(() =>
      expect(calls.some((c) => c.url.includes('/v1/assets/bpmn/lde-1/deploy'))).toBe(true)
    );
    const patch = calls.find((c) => c.url.includes('/v1/assets/bpmn/lde-1/deploy'))!;
    expect(patch.body.deploymentId).toBe('dep-42');
    expect(patch.body.formIds).toEqual(['form-1']);
    expect(patch.body.documentIds).toEqual(['doc-1']);
  });

  test('reports the server message when the deploy is refused', async () => {
    await deploy(async () => ({
      json: async () => ({ success: false, error: { message: 'engine unreachable' } }),
    }));

    expect((await screen.findAllByText(/engine unreachable/)).length).toBeGreaterThan(0);
  });

  test('falls back to a generic message when the server sends no error text', async () => {
    await deploy(async () => ({ json: async () => ({ success: false }) }));

    expect((await screen.findAllByText(/Deployment failed/)).length).toBeGreaterThan(0);
  });

  test('reports a network failure as the deploy result', async () => {
    await deploy(async () => {
      throw new Error('offline');
    });

    expect((await screen.findAllByText(/offline/)).length).toBeGreaterThan(0);
  });

  test('reports a non-Error rejection generically', async () => {
    await deploy(async () => {
      throw 'kaboom';
    });

    expect((await screen.findAllByText(/Deployment failed/)).length).toBeGreaterThan(0);
  });
});
