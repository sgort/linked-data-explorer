// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { SparqlResponse } from '../types';
import GraphView from './GraphView';

type Cell = { value: string; type?: string };

function response(bindings: Record<string, Cell>[]): SparqlResponse {
  return {
    head: { vars: Object.keys(bindings[0] ?? {}) },
    results: { bindings },
  } as SparqlResponse;
}

function spo(s: string, p: string, o: string, oType = 'uri'): Record<string, Cell> {
  return {
    s: { value: s, type: 'uri' },
    p: { value: p, type: 'uri' },
    o: { value: o, type: oType },
  };
}

let resizeCallbacks: ResizeObserverCallback[] = [];
const disconnect = vi.fn();

class StubResizeObserver implements ResizeObserver {
  constructor(private cb: ResizeObserverCallback) {
    resizeCallbacks.push(cb);
  }
  observe() {}
  unobserve() {}
  disconnect() {
    disconnect();
  }
}

function fireResize(width: number, height: number) {
  act(() => {
    for (const cb of resizeCallbacks) {
      cb(
        [{ contentRect: { width, height } } as unknown as ResizeObserverEntry],
        {} as ResizeObserver
      );
    }
  });
}

beforeEach(() => {
  resizeCallbacks = [];
  disconnect.mockClear();
  vi.stubGlobal('ResizeObserver', StubResizeObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Nodes and links are only appended once the force simulation has been built. */
function svgOf(container: HTMLElement): SVGSVGElement {
  return container.querySelector('svg') as SVGSVGElement;
}

/**
 * jsdom implements neither SVGSVGElement.width/height animated values (which
 * d3-zoom reads to derive its extent) nor SVGSVGElement.createSVGPoint. Supply
 * the one d3 needs so zoom and drag gestures can run.
 */
function makeGesturesWork(svg: SVGSVGElement, width = 800, height = 600) {
  Object.defineProperty(svg, 'width', { value: { baseVal: { value: width } } });
  Object.defineProperty(svg, 'height', { value: { baseVal: { value: height } } });
}

/**
 * d3-drag reads `event.view.document`, but this jsdom build refuses `view` in
 * the MouseEvent constructor, so attach it to the instance after construction.
 */
function dispatchMouse(target: EventTarget, type: string, clientX: number, clientY: number) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0 });
  Object.defineProperty(event, 'view', { value: window });
  Object.defineProperty(event, 'clientX', { value: clientX });
  Object.defineProperty(event, 'clientY', { value: clientY });
  target.dispatchEvent(event);
}

describe('GraphView empty states', () => {
  test('prompts for a query when there is no data', () => {
    const { container } = render(<GraphView data={null} />);
    expect(screen.getByText(/Run a query to visualize the knowledge graph/)).toBeTruthy();
    expect(svgOf(container).querySelector('.zoom-container')).toBeNull();
  });

  test('keeps the prompt when the result set is empty', () => {
    const { container } = render(<GraphView data={response([])} />);
    expect(screen.getByText(/Run a query to visualize the knowledge graph/)).toBeTruthy();
    expect(svgOf(container).querySelector('.zoom-container')).toBeNull();
  });

  test('renders the colour legend regardless of data', () => {
    render(<GraphView data={null} />);
    expect(screen.getByText(/Subject \/[\s\S]*Entity/)).toBeTruthy();
    expect(screen.getByText(/Object[\s\S]*\(URI\/BNode\)/)).toBeTruthy();
    expect(screen.getByText(/Literal Value/)).toBeTruthy();
  });

  test('disconnects the resize observer on unmount', () => {
    const { unmount } = render(<GraphView data={null} />);
    unmount();
    expect(disconnect).toHaveBeenCalled();
  });
});

describe('GraphView s-p-o bindings', () => {
  test('builds one node per distinct term and one link per triple', () => {
    const { container } = render(
      <GraphView
        data={response([
          spo('https://example.org/a', 'https://example.org/p/knows', 'https://example.org/b'),
          spo('https://example.org/a', 'https://example.org/p/knows', 'https://example.org/c'),
        ])}
      />
    );

    const svg = svgOf(container);
    expect(svg.querySelectorAll('.nodes > g')).toHaveLength(3);
    expect(svg.querySelectorAll('.links > g')).toHaveLength(2);
    expect(svg.querySelector('marker#arrowhead')).not.toBeNull();
  });

  test('labels links with the last segment of the predicate', () => {
    const { container } = render(
      <GraphView data={response([spo('urn:a', 'https://example.org/p/knows', 'urn:b')])} />
    );
    const text = svgOf(container).querySelector('.links text');
    expect(text?.textContent).toBe('knows');
  });

  test('prefers the fragment when the predicate uses a hash', () => {
    const { container } = render(
      <GraphView data={response([spo('urn:a', 'https://example.org/onto#label', 'urn:b')])} />
    );
    expect(svgOf(container).querySelector('.links text')?.textContent).toBe('label');
  });

  test('falls back to the raw predicate when it has no usable segment', () => {
    const { container } = render(
      <GraphView data={response([spo('urn:a', 'https://example.org/', 'urn:b')])} />
    );
    expect(svgOf(container).querySelector('.links text')?.textContent).toBe('https://example.org/');
  });

  test('styles semantic predicates differently from ordinary ones', () => {
    const { container } = render(
      <GraphView
        data={response([
          spo('urn:a', 'http://www.w3.org/2004/02/skos/core#exactMatch', 'urn:b'),
          spo('urn:a', 'https://example.org/p/knows', 'urn:c'),
        ])}
      />
    );

    const lines = Array.from(svgOf(container).querySelectorAll('.links line'));
    const semantic = lines.find((l) => l.getAttribute('stroke') === '#10b981');
    const plain = lines.find((l) => l.getAttribute('stroke') === '#cbd5e1');

    expect(semantic?.getAttribute('stroke-dasharray')).toBe('5,5');
    expect(semantic?.getAttribute('stroke-width')).toBe('2.5');
    expect(plain?.getAttribute('stroke-dasharray')).toBe('none');
    expect(plain?.getAttribute('stroke-width')).toBe('1.5');
  });

  test('treats dcterms:subject as a semantic link', () => {
    const { container } = render(
      <GraphView data={response([spo('urn:a', 'http://purl.org/dc/terms/subject', 'urn:b')])} />
    );
    expect(svgOf(container).querySelector('.links line')?.getAttribute('stroke')).toBe('#10b981');
  });

  test('colours subjects blue, literal objects green and URI objects amber', () => {
    const { container } = render(
      <GraphView
        data={response([
          spo('urn:subject', 'urn:p', 'a literal', 'literal'),
          spo('urn:subject', 'urn:p2', 'urn:object'),
        ])}
      />
    );

    const fills = Array.from(svgOf(container).querySelectorAll('.nodes circle')).map((c) =>
      c.getAttribute('fill')
    );
    expect(fills).toContain('#3b82f6');
    expect(fills).toContain('#10b981');
    expect(fills).toContain('#f59e0b');
  });

  test('truncates node labels longer than 25 characters', () => {
    const long = 'a'.repeat(40);
    const { container } = render(
      <GraphView data={response([spo(`urn:${long}`, 'urn:p', 'urn:b')])} />
    );

    const labels = Array.from(svgOf(container).querySelectorAll('.nodes text')).map(
      (t) => t.textContent
    );
    expect(labels).toContain(`urn:${'a'.repeat(21)}...`);
    expect(labels).toContain('urn:b');
  });

  test('falls back to the whole term when it has no trailing segment to label', () => {
    const { container } = render(
      <GraphView data={response([spo('https://example.org/', 'urn:p', 'urn:b')])} />
    );
    const labels = Array.from(svgOf(container).querySelectorAll('.nodes text')).map(
      (t) => t.textContent
    );
    expect(labels).toContain('https://example.org/');
  });

  test('exposes the full term as the node tooltip', () => {
    const { container } = render(
      <GraphView data={response([spo('https://example.org/a', 'urn:p', 'urn:b')])} />
    );
    const titles = Array.from(svgOf(container).querySelectorAll('.nodes title')).map(
      (t) => t.textContent
    );
    expect(titles).toContain('https://example.org/a');
  });

  test('positions links and nodes once the simulation ticks', async () => {
    const { container } = render(<GraphView data={response([spo('urn:a', 'urn:p', 'urn:b')])} />);

    await waitFor(() => {
      const line = svgOf(container).querySelector('.links line');
      expect(line?.getAttribute('x1')).not.toBeNull();
    });

    const node = svgOf(container).querySelector('.nodes > g');
    expect(node?.getAttribute('transform')).toMatch(/^translate\(/);
  });
});

describe('GraphView column-based bindings', () => {
  test('links the first column to every other bound column', () => {
    const { container } = render(
      <GraphView
        data={response([
          {
            org: { value: 'urn:svb', type: 'uri' },
            name: { value: 'Sociale Verzekeringsbank', type: 'literal' },
            city: { value: 'Amstelveen', type: 'literal' },
          },
        ])}
      />
    );

    const svg = svgOf(container);
    expect(svg.querySelectorAll('.nodes > g')).toHaveLength(3);
    const predicates = Array.from(svg.querySelectorAll('.links text')).map((t) => t.textContent);
    expect(predicates).toEqual(['name', 'city']);
  });

  test('ignores rows with fewer than two columns', () => {
    const { container } = render(
      <GraphView data={response([{ only: { value: 'urn:a', type: 'uri' } }])} />
    );
    expect(svgOf(container).querySelectorAll('.links > g')).toHaveLength(0);
  });

  test('skips columns that are unbound in a row', () => {
    const data = {
      head: { vars: ['org', 'name', 'city'] },
      results: {
        bindings: [
          {
            org: { value: 'urn:svb', type: 'uri' },
            name: { value: 'SVB', type: 'literal' },
            city: undefined,
          },
        ],
      },
    } as unknown as SparqlResponse;

    const { container } = render(<GraphView data={data} />);
    expect(svgOf(container).querySelectorAll('.links > g')).toHaveLength(1);
  });

  test('reuses a node shared by two rows instead of duplicating it', () => {
    const { container } = render(
      <GraphView
        data={response([
          { org: { value: 'urn:svb', type: 'uri' }, name: { value: 'SVB', type: 'literal' } },
          { org: { value: 'urn:svb', type: 'uri' }, name: { value: 'S.V.B.', type: 'literal' } },
        ])}
      />
    );
    expect(svgOf(container).querySelectorAll('.nodes > g')).toHaveLength(3);
  });
});

describe('GraphView interaction', () => {
  test('resizing the wrapper resizes the svg', async () => {
    const { container } = render(<GraphView data={response([spo('urn:a', 'urn:p', 'urn:b')])} />);
    expect(svgOf(container).getAttribute('width')).toBe('800');

    fireResize(1024, 512);

    await waitFor(() => expect(svgOf(container).getAttribute('width')).toBe('1024'));
    expect(svgOf(container).getAttribute('height')).toBe('512');
  });

  test('zooming transforms the container group rather than the svg', () => {
    const { container } = render(<GraphView data={response([spo('urn:a', 'urn:p', 'urn:b')])} />);
    const svg = svgOf(container);
    makeGesturesWork(svg);

    fireEvent.wheel(svg, { deltaY: -120, clientX: 100, clientY: 100 });

    expect(svg.querySelector('.zoom-container')?.getAttribute('transform')).toMatch(/translate/);
  });

  test('dragging a node moves it by the pointer delta, and releasing unpins it', async () => {
    const { container } = render(<GraphView data={response([spo('urn:a', 'urn:p', 'urn:b')])} />);
    makeGesturesWork(svgOf(container));
    const node = svgOf(container).querySelector('.nodes > g') as SVGGElement;

    const position = () => {
      const [x, y] = /translate\(([-\d.]+),([-\d.]+)\)/
        .exec(node.getAttribute('transform') ?? '')!
        .slice(1)
        .map(Number);
      return { x, y };
    };

    await waitFor(() => expect(node.getAttribute('transform')).toMatch(/^translate\(/));

    dispatchMouse(node, 'mousedown', 10, 10);
    const start = position();
    dispatchMouse(window, 'mousemove', 640, 480);

    // Pinned to the cursor: the node tracks the pointer delta exactly.
    await waitFor(() => {
      const moved = position();
      expect(moved.x - start.x).toBeCloseTo(630, 5);
      expect(moved.y - start.y).toBeCloseTo(470, 5);
    });
    const pinned = position();

    dispatchMouse(window, 'mouseup', 640, 480);

    // Unpinned, the simulation is free to move the node again.
    await waitFor(() => expect(position()).not.toEqual(pinned));
  });

  test('re-rendering with new data replaces the previous graph', () => {
    const { container, rerender } = render(
      <GraphView data={response([spo('urn:a', 'urn:p', 'urn:b')])} />
    );
    expect(svgOf(container).querySelectorAll('.nodes > g')).toHaveLength(2);

    rerender(
      <GraphView
        data={response([spo('urn:x', 'urn:p', 'urn:y'), spo('urn:x', 'urn:p', 'urn:z')])}
      />
    );

    const svg = svgOf(container);
    expect(svg.querySelectorAll('.zoom-container')).toHaveLength(1);
    expect(svg.querySelectorAll('.nodes > g')).toHaveLength(3);
  });
});
