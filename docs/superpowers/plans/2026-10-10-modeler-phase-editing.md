# Modeler Phase Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a modeller set a process's phases for RBA's caseworker stepper entirely in the LDE BPMN Modeler: declare phases (or choose Awb), mark the node that starts each phase, see every node's phase on the canvas, and get pre-deploy checks.

**Architecture:** A pure TypeScript phase core in `packages/frontend/src/utils/phases/` ports RBA's `assignPhases` over a neutral graph built from the saved XML. Two React components in the properties panel edit `ronl:phases`/`ronl:phaseLabel` (process) and `ronl:phase`/`ronl:awbPhase` (nodes) through one registered bpmn-js command, so every edit is a single undo step. `BpmnCanvas` recomputes the phase view after each change (debounced `saveXML`), draws badges, mounts the editors and shows the checks in the deploy dialog.

**Tech Stack:** React 19, TypeScript, bpmn-js 18 (`modeling.updateModdleProperties`, `commandStack.registerHandler`, `overlays`), bpmn-moddle, Vitest + Testing Library, `DOMParser` (jsdom in tests).

**Spec:** `docs/superpowers/specs/2026-10-10-modeler-phase-editing-design.md`

## Global Constraints

- RBA is the reference: `ronl-business-api/packages/backend/src/rip-swimlane/bpmn-swimlane.ts` (`declaredPhaseSet`, `KINDS`, `findBackEdges`, `assignColumns`, `assignPhases`) and `packages/shared/src/awb-phases.ts`. Behaviour must match it exactly; where this plan and RBA disagree, RBA wins and the plan is wrong.
- `ronl:phases` format: entries separated by `;`, each split at its FIRST `:`, both parts trimmed; an entry with an empty code or name, or a code seen before, is skipped. Default label `Fase`.
- Awb codes: `1`, `2`, `3`, `4+5`, `6`, `7`, `8`, `archivering`; RBA labels them `Fase <code>`, except `archivering` → `Archiefwet`; the set label is `Awb-fase`.
- Counted node kinds (direct children of the FIRST `<process>` only): `startEvent`, `endEvent`, `userTask`, `manualTask`, `scriptTask`, `businessRuleTask`, `receiveTask`, `callActivity`, `subProcess`, `intermediateCatchEvent`, `intermediateThrowEvent`, `serviceTask`, `sendTask`, `exclusiveGateway`, `inclusiveGateway`, `eventBasedGateway`, `parallelGateway`.
- Attributes are matched by LOCAL name (namespace prefix ignored); a blank value counts as absent.
- `ronl:phaseLabel` is written only when it differs from `Fase`.
- Node-picker texts (Dutch, as approved): `(erft over)`, `Erft fase N (Name) over`, `Geen fase: ligt vóór de eerste fasemarkering`, `Stel eerst fasen in op het proces`. Deploy-dialog findings are English, like the dialog's existing warnings.
- Every phase edit is ONE undo step (one `ronl.phases.update` command).
- Frontend tests: Vitest; add `// @vitest-environment jsdom` to any test file that uses `DOMParser`, React or the DOM. Per-file branch coverage floor is 80%.
- Run frontend tests with `npm test --workspace=packages/frontend`; a single file with `npx vitest run --root packages/frontend <path>`.
- Commits: never add attribution trailers. Never `--no-verify`. The human partner approves each commit (see their CLAUDE.md); in this plan "Commit" means: stage, show what is staged, and ask.

## Review Focus

1. A phase NAME containing `;` (or a CODE containing `:`/`;`) typed in the editor would corrupt `ronl:phases` on save — the editor must refuse those characters (codes) and strip `;` from names before writing. Test in Task 6.
2. Renaming a phase code to a code another phase already has must be refused with an inline message, not written (which would make RBA drop the second entry). Test in Task 6.
3. A collaboration with more than one participant: with nothing selected, the process editor edits the FIRST participant's process (the one RBA reads) and says so. Tests in Task 5 (target resolution) and Task 6 (the note).
4. A node inside an embedded subProcess is not a direct child of the process, so RBA never counts it — the node picker must show "not counted" instead of offering a dropdown. Test in Task 7.
5. Undoing a code rename or a phase removal must restore every touched marker at once (one command). Test in Task 5 (handler is one command; nested updates).

---

## File Structure

| File | Responsibility |
|---|---|
| `packages/frontend/src/components/BpmnModeler/ronlModdleDescriptor.json` (modify) | register `phases`, `phaseLabel` on `bpmn:Process`; `phase`, `awbPhase` on `bpmn:FlowNode` |
| `packages/frontend/src/components/BpmnModeler/ronlModdleDescriptor.test.ts` (modify) | registration + round-trip of the examples |
| `packages/frontend/src/utils/phases/phaseSet.ts` (create) | phase-list parsing/serialising, Awb table, codes, labels |
| `packages/frontend/src/utils/phases/phaseGraph.ts` (create) | XML → neutral graph (RBA's reading rules) |
| `packages/frontend/src/utils/phases/assignPhases.ts` (create) | back edges, columns, inheritance, `computePhaseView` |
| `packages/frontend/src/utils/phases/phaseChecks.ts` (create) | pre-deploy findings |
| `packages/frontend/src/utils/phases/phaseCommands.ts` (create) | the `ronl.phases.update` command, process target resolution, update planners |
| `packages/frontend/src/components/BpmnModeler/ProcessPhasesEditor.tsx` (create) | process-level editor |
| `packages/frontend/src/components/BpmnModeler/PhaseMarkerSelector.tsx` (create) | node-level picker |
| `packages/frontend/src/components/BpmnModeler/BpmnCanvas.tsx` (modify) | wiring: recompute, overlays, mounting, deploy checks |
| `packages/frontend/src/components/BpmnModeler/BpmnModeler.css` (modify) | badge styles |

---

### Task 1: Register the phase attributes in the moddle descriptor

**Files:**
- Modify: `packages/frontend/src/components/BpmnModeler/ronlModdleDescriptor.json`
- Test: `packages/frontend/src/components/BpmnModeler/ronlModdleDescriptor.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `businessObject.get('ronl:phases' | 'ronl:phaseLabel')` on a `bpmn:Process`; `businessObject.get('ronl:phase' | 'ronl:awbPhase')` on any `bpmn:FlowNode`, as typed properties (not `$attrs`).

- [ ] **Step 1: Write the failing tests**

Append to `ronlModdleDescriptor.test.ts`:

```ts
import { readFileSync } from 'fs';
import { join } from 'path';

const EXAMPLES = join(__dirname, '../../../public/examples/flevoland');

const parseProcess = async (processAttrs: string, body = '') => {
  const moddle = new BpmnModdle({ ronl: ronlModdleDescriptor });
  const xml = `<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:ronl="http://ronl.nl/schema/1.0" id="d" targetNamespace="t">
  <bpmn:process id="p" ${processAttrs}>${body}</bpmn:process>
</bpmn:definitions>`;
  const { rootElement } = await moddle.fromXML(xml);
  return rootElement.rootElements[0];
};

describe('ronlModdleDescriptor — phases (#242)', () => {
  test('registers phases and phaseLabel on a process', async () => {
    const process = await parseProcess('ronl:phases="a:Alpha;b:Beta" ronl:phaseLabel="Stap"');
    expect(process.get('ronl:phases')).toBe('a:Alpha;b:Beta');
    expect(process.get('ronl:phaseLabel')).toBe('Stap');
    expect(process.$attrs['ronl:phases']).toBeUndefined();
  });

  test.each([
    ['bpmn:startEvent'],
    ['bpmn:exclusiveGateway'],
    ['bpmn:serviceTask'],
    ['bpmn:callActivity'],
    ['bpmn:intermediateCatchEvent'],
  ])('registers phase and awbPhase on a %s', async (tag) => {
    const process = await parseProcess(
      '',
      `<${tag} id="n" ronl:phase="a" ronl:awbPhase="4+5" />`
    );
    const node = process.flowElements[0];
    expect(node.get('ronl:phase')).toBe('a');
    expect(node.get('ronl:awbPhase')).toBe('4+5');
    expect(node.$attrs['ronl:phase']).toBeUndefined();
  });

  // The issue's acceptance criterion: opening and re-saving an example keeps
  // its phase attributes. Compared per element and value, not byte for byte
  // (bpmn-moddle reformats the rest of the file).
  test.each([
    'besluitvorming-gedelegeerd/GedelegeerdBesluitProcess.bpmn',
    'HR-capacity/ManagementCapacityClaimProcess.bpmn',
    'AwbShellProcess.bpmn',
  ])('round-trips every phase attribute of %s', async (file) => {
    const original = readFileSync(join(EXAMPLES, file), 'utf8');
    const moddle = new BpmnModdle({ ronl: ronlModdleDescriptor });
    const { rootElement } = await moddle.fromXML(original);
    const { xml: saved } = await moddle.toXML(rootElement, { format: true });

    const attrs = (xml: string) =>
      [...xml.matchAll(/<[\w:]+\s[^>]*?\bid="([^"]+)"[^>]*>/g)]
        .flatMap(([tag, id]) =>
          [...tag.matchAll(/\bronl:(phases|phaseLabel|phase|awbPhase)="([^"]*)"/g)].map(
            ([, name, value]) => `${id}|${name}|${value}`
          )
        )
        .sort();

    expect(attrs(original).length).toBeGreaterThan(0);
    expect(attrs(saved)).toEqual(attrs(original));
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --root packages/frontend src/components/BpmnModeler/ronlModdleDescriptor.test.ts`
Expected: the registration tests FAIL (`get('ronl:phases')` is undefined, the value sits in `$attrs`). The round-trip tests may already pass (unknown attributes round-trip); that is fine, they pin the behaviour once registered.

- [ ] **Step 3: Add the two mixins**

Append to the `types` array in `ronlModdleDescriptor.json`:

```json
    {
      "name": "PhasesMixin",
      "extends": ["bpmn:Process"],
      "properties": [
        {
          "name": "phases",
          "isAttr": true,
          "type": "String",
          "description": "The phases this process declares for RBA's caseworker stepper: code:Name pairs separated by ';' (#242). Absent means Awb phases (ronl:awbPhase markers) or no stepper."
        },
        {
          "name": "phaseLabel",
          "isAttr": true,
          "type": "String",
          "description": "Prefix for a phase reference in the stepper. Absent means 'Fase'."
        }
      ]
    },
    {
      "name": "PhaseMarkerMixin",
      "extends": ["bpmn:FlowNode"],
      "properties": [
        {
          "name": "phase",
          "isAttr": true,
          "type": "String",
          "description": "Code of the declared phase this node starts. Unmarked nodes inherit; see utils/phases/assignPhases.ts."
        },
        {
          "name": "awbPhase",
          "isAttr": true,
          "type": "String",
          "description": "Awb phase this node starts, for processes that declare no phases of their own."
        }
      ]
    }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run --root packages/frontend src/components/BpmnModeler/ronlModdleDescriptor.test.ts`
Expected: PASS (all tests, including the existing documentRef/signatureRef ones).

- [ ] **Step 5: Commit**

```bash
git add packages/frontend/src/components/BpmnModeler/ronlModdleDescriptor.json packages/frontend/src/components/BpmnModeler/ronlModdleDescriptor.test.ts
git commit -m "feat(modeler): register the phase attributes in the ronl descriptor (#242)"
```

---

### Task 2: Phase lists, the Awb table and codes (`phaseSet.ts`)

**Files:**
- Create: `packages/frontend/src/utils/phases/phaseSet.ts`
- Test: `packages/frontend/src/utils/phases/phaseSet.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  ```ts
  export interface Phase { code: string; name: string }
  export type Scheme = 'declared' | 'awb';
  export interface PhaseSet { scheme: Scheme; label: string; phases: Phase[] }
  export interface ParsedPhases { set?: PhaseSet; skipped: string[] }
  export const DEFAULT_PHASE_LABEL: 'Fase';
  export const AWB_PHASES: readonly Phase[];
  export const AWB_PHASE_SET: PhaseSet;
  export function parseDeclaredPhases(phases: string | undefined, label: string | undefined): ParsedPhases;
  export function serializePhases(phases: Phase[]): string;
  export function codeFromName(name: string, taken: Iterable<string>): string;
  export function isValidPhaseCode(code: string): boolean;
  export function cleanPhaseName(name: string): string;
  export function phaseCodeLabel(set: PhaseSet, code: string): string;
  ```

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, test } from 'vitest';

import {
  AWB_PHASE_SET,
  AWB_PHASES,
  cleanPhaseName,
  codeFromName,
  isValidPhaseCode,
  parseDeclaredPhases,
  phaseCodeLabel,
  serializePhases,
} from './phaseSet';

describe('parseDeclaredPhases (RBA declaredPhaseSet)', () => {
  test('reads code:Name pairs under the given label', () => {
    expect(parseDeclaredPhases('a:Alpha;b:Beta', 'Stap')).toEqual({
      set: {
        scheme: 'declared',
        label: 'Stap',
        phases: [
          { code: 'a', name: 'Alpha' },
          { code: 'b', name: 'Beta' },
        ],
      },
      skipped: [],
    });
  });

  test('labels the set "Fase" without a label, and also for a blank one', () => {
    expect(parseDeclaredPhases('a:Alpha', undefined).set?.label).toBe('Fase');
    expect(parseDeclaredPhases('a:Alpha', '  ').set?.label).toBe('Fase');
  });

  // RBA: 'skips malformed and duplicate entries, and trims the rest'
  test('skips malformed and duplicate entries, trims the rest, and reports what it skipped', () => {
    const parsed = parseDeclaredPhases(' a : Alpha ;;b;:x;c:Gamma: two;a:Again;d: ', undefined);
    expect(parsed.set?.phases).toEqual([
      { code: 'a', name: 'Alpha' },
      { code: 'c', name: 'Gamma: two' },
    ]);
    // Blank entries (the ';;') are not reported; everything else that was dropped is.
    expect(parsed.skipped).toEqual(['b', ':x', 'a:Again', 'd:']);
  });

  test('yields no set when nothing usable is left, or nothing was declared', () => {
    expect(parseDeclaredPhases(';;', undefined)).toEqual({ set: undefined, skipped: [] });
    expect(parseDeclaredPhases(undefined, undefined)).toEqual({ set: undefined, skipped: [] });
    expect(parseDeclaredPhases('   ', undefined)).toEqual({ set: undefined, skipped: [] });
  });
});

describe('serializePhases', () => {
  test('is the inverse of parsing', () => {
    const phases = [
      { code: 'a', name: 'Alpha' },
      { code: 'c', name: 'Gamma: two' },
    ];
    expect(serializePhases(phases)).toBe('a:Alpha;c:Gamma: two');
    expect(parseDeclaredPhases(serializePhases(phases), undefined).set?.phases).toEqual(phases);
  });
});

describe('codes and names', () => {
  test('codeFromName lower-cases, strips diacritics and joins words with "-"', () => {
    expect(codeFromName('Financiële reservering', [])).toBe('financiele-reservering');
    expect(codeFromName('  Advies & toetsing! ', [])).toBe('advies-toetsing');
  });

  test('codeFromName stays unique against codes already taken', () => {
    expect(codeFromName('Intake', ['intake'])).toBe('intake-2');
    expect(codeFromName('Intake', ['intake', 'intake-2'])).toBe('intake-3');
  });

  test('codeFromName falls back to "fase" for a name with no letters or digits', () => {
    expect(codeFromName('!!!', [])).toBe('fase');
  });

  test('isValidPhaseCode refuses empty codes and the separators', () => {
    expect(isValidPhaseCode('intake')).toBe(true);
    expect(isValidPhaseCode('4+5')).toBe(true);
    expect(isValidPhaseCode('')).toBe(false);
    expect(isValidPhaseCode('a:b')).toBe(false);
    expect(isValidPhaseCode('a;b')).toBe(false);
    expect(isValidPhaseCode(' a')).toBe(false);
  });

  test('cleanPhaseName strips the entry separator and trims', () => {
    expect(cleanPhaseName(' Claim; opstellen ')).toBe('Claim opstellen');
    expect(cleanPhaseName('Gamma: two')).toBe('Gamma: two');
  });
});

describe('the Awb table (copied from RBA packages/shared/src/awb-phases.ts)', () => {
  test('has the eight codes in order', () => {
    expect(AWB_PHASES.map((p) => p.code)).toEqual([
      '1',
      '2',
      '3',
      '4+5',
      '6',
      '7',
      '8',
      'archivering',
    ]);
    expect(AWB_PHASE_SET).toMatchObject({ scheme: 'awb', label: 'Awb-fase' });
  });

  test('phaseCodeLabel matches RBA: "Fase <code>", "Archiefwet", and "<label> <n>" for declared', () => {
    expect(phaseCodeLabel(AWB_PHASE_SET, '4+5')).toBe('Fase 4+5');
    expect(phaseCodeLabel(AWB_PHASE_SET, 'archivering')).toBe('Archiefwet');
    const declared = parseDeclaredPhases('a:Alpha;b:Beta', 'Stap').set!;
    expect(phaseCodeLabel(declared, 'b')).toBe('Stap 2');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --root packages/frontend src/utils/phases/phaseSet.test.ts`
Expected: FAIL — module `./phaseSet` not found.

- [ ] **Step 3: Implement `phaseSet.ts`**

```ts
/**
 * The phases a process moves through, for RBA's caseworker stepper (#242).
 * RBA is the reference for every rule here:
 * ronl-business-api/packages/backend/src/rip-swimlane/bpmn-swimlane.ts
 * (declaredPhaseSet, AWB_PHASE_SET) and packages/shared/src/awb-phases.ts.
 */

export interface Phase {
  code: string;
  name: string;
}

/** 'declared': the process lists its own phases in ronl:phases. 'awb': RBA's built-in table. */
export type Scheme = 'declared' | 'awb';

export interface PhaseSet {
  scheme: Scheme;
  label: string;
  phases: Phase[];
}

export interface ParsedPhases {
  /** Undefined when nothing usable was declared. */
  set?: PhaseSet;
  /** Non-blank entries RBA would skip: no code, no name, or a repeated code. */
  skipped: string[];
}

export const DEFAULT_PHASE_LABEL = 'Fase';

/** Copied from ronl-business-api packages/shared/src/awb-phases.ts; RBA is the source. */
export const AWB_PHASES: readonly Phase[] = [
  { code: '1', name: 'Rechtsbetrekking' },
  { code: '2', name: 'Ontvangst' },
  { code: '3', name: 'Ontvankelijkheid' },
  { code: '4+5', name: 'Behandeling en besluit' },
  { code: '6', name: 'Bekendmaking' },
  { code: '7', name: 'Betaling' },
  { code: '8', name: 'Ketenproces' },
  { code: 'archivering', name: 'Archivering' },
];

export const AWB_PHASE_SET: PhaseSet = {
  scheme: 'awb',
  label: 'Awb-fase',
  phases: [...AWB_PHASES],
};

/**
 * RBA's declaredPhaseSet: entries split on ';', each at its FIRST ':' (a name
 * may contain ':'), both parts trimmed; an entry without a code or a name, or
 * repeating a code, is skipped.
 */
export function parseDeclaredPhases(
  phases: string | undefined,
  label: string | undefined
): ParsedPhases {
  const effectiveLabel = label?.trim() ? label.trim() : DEFAULT_PHASE_LABEL;
  const result: Phase[] = [];
  const skipped: string[] = [];
  for (const raw of (phases ?? '').split(';')) {
    if (raw.trim() === '') continue;
    const at = raw.indexOf(':');
    const code = at < 0 ? '' : raw.slice(0, at).trim();
    const name = at < 0 ? '' : raw.slice(at + 1).trim();
    if (code === '' || name === '' || result.some((p) => p.code === code)) {
      skipped.push(raw.trim());
      continue;
    }
    result.push({ code, name });
  }
  return {
    set: result.length > 0 ? { scheme: 'declared', label: effectiveLabel, phases: result } : undefined,
    skipped,
  };
}

export const serializePhases = (phases: Phase[]): string =>
  phases.map((p) => `${p.code}:${p.name}`).join(';');

/** A code may not be empty, carry surrounding spaces, or contain the separators. */
export const isValidPhaseCode = (code: string): boolean =>
  code !== '' && code === code.trim() && !/[:;]/.test(code);

/** ';' separates entries, so a name may not contain it. */
export const cleanPhaseName = (name: string): string =>
  name.replace(/;/g, '').replace(/\s+/g, ' ').trim();

export function codeFromName(name: string, taken: Iterable<string>): string {
  const base =
    name
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'fase';
  const used = new Set(taken);
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

/** The label RBA shows for a phase: "Fase 4+5" / "Archiefwet" for Awb, "<label> <n>" for declared. */
export function phaseCodeLabel(set: PhaseSet, code: string): string {
  if (set.scheme === 'awb') return code === 'archivering' ? 'Archiefwet' : `Fase ${code}`;
  const index = set.phases.findIndex((p) => p.code === code);
  return `${set.label} ${index + 1}`;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run --root packages/frontend src/utils/phases/phaseSet.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/frontend/src/utils/phases/phaseSet.ts packages/frontend/src/utils/phases/phaseSet.test.ts
git commit -m "feat(modeler): phase lists, the Awb table and phase codes (#242)"
```

---

### Task 3: The graph and RBA's inheritance (`phaseGraph.ts`, `assignPhases.ts`)

**Files:**
- Create: `packages/frontend/src/utils/phases/phaseGraph.ts`
- Create: `packages/frontend/src/utils/phases/assignPhases.ts`
- Test: `packages/frontend/src/utils/phases/assignPhases.test.ts`

**Interfaces:**
- Consumes: Task 2 (`PhaseSet`, `Scheme`, `parseDeclaredPhases`, `AWB_PHASE_SET`).
- Produces:
  ```ts
  // phaseGraph.ts
  export const COUNTED_KINDS: ReadonlySet<string>;
  export interface PhaseNode { id: string; kind: string; phase?: string; awbPhase?: string }
  export interface PhaseFlow { id: string; from: string; to: string }
  export interface IgnoredMarker { id: string; kind: string }
  export interface PhaseGraph {
    phases?: string;
    phaseLabel?: string;
    nodes: PhaseNode[];
    flows: PhaseFlow[];
    outgoingOrder: Map<string, string[]>;
    ignoredMarkers: IgnoredMarker[];
  }
  export function graphFromXml(xml: string): PhaseGraph;
  // assignPhases.ts
  export interface PhaseAssignment { code: string; inherited: boolean }
  export interface UnknownMarker { id: string; code: string }
  export interface PhaseView {
    scheme: Scheme | 'none';
    set?: PhaseSet;            // the set RBA uses: declared, or AWB_PHASE_SET for 'awb'
    byNode: Map<string, PhaseAssignment>; // empty when RBA would show no stepper
    unknownMarkers: UnknownMarker[];
    skippedEntries: string[];
  }
  export const EMPTY_PHASE_VIEW: PhaseView;
  export function findBackEdges(nodes: PhaseNode[], flows: PhaseFlow[], seeds: string[], order: Map<string, string[]>): Set<string>;
  export function computePhaseView(graph: PhaseGraph): PhaseView;
  export function phaseViewFromXml(xml: string): PhaseView;
  ```

- [ ] **Step 1: Write the failing tests**

`assignPhases.test.ts` (jsdom for `DOMParser`). Every case marked `RBA:` is re-expressed from `ronl-business-api/packages/backend/src/rip-swimlane/bpmn-swimlane.test.ts`; the two example expectations are copied from its `'puts every node in the phase the design groups it under'` cases.

```ts
// @vitest-environment jsdom
import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, test } from 'vitest';

import { phaseViewFromXml } from './assignPhases';
import { graphFromXml } from './phaseGraph';

const EXAMPLES = join(__dirname, '../../../public/examples/flevoland');

const proc = (attrs: string, body: string) => `<?xml version="1.0"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:ronl="http://ronl.nl/schema/1.0">
  <bpmn:process id="P" ${attrs}>${body}</bpmn:process>
</bpmn:definitions>`;

const phaseOf = (xml: string) =>
  Object.fromEntries(
    graphFromXml(xml).nodes.map((n) => [n.id, phaseViewFromXml(xml).byNode.get(n.id)?.code])
  );

describe('graphFromXml', () => {
  test('reads only counted node kinds that are direct children of the first process', () => {
    const g = graphFromXml(
      proc(
        '',
        `<bpmn:startEvent id="S"/>
         <bpmn:subProcess id="Sub"><bpmn:userTask id="Inner" ronl:phase="a"/></bpmn:subProcess>
         <bpmn:boundaryEvent id="B" attachedToRef="Sub" ronl:awbPhase="3"/>
         <bpmn:sequenceFlow id="F" sourceRef="S" targetRef="Sub"/>`
      )
    );
    expect(g.nodes.map((n) => n.id)).toEqual(['S', 'Sub']);
    expect(g.ignoredMarkers).toEqual([{ id: 'B', kind: 'boundaryEvent' }]);
    expect(g.flows).toEqual([{ id: 'F', from: 'S', to: 'Sub' }]);
  });

  test('reads markers by local name, with blank counting as absent', () => {
    const g = graphFromXml(
      `<?xml version="1.0"?><definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:x="http://ronl.nl/schema/1.0">
        <process id="P" x:phases="a:Alpha"><startEvent id="S" x:phase="a"/><userTask id="T" x:phase="  "/></process>
      </definitions>`
    );
    expect(g.phases).toBe('a:Alpha');
    expect(g.nodes).toEqual([
      { id: 'S', kind: 'startEvent', phase: 'a' },
      { id: 'T', kind: 'userTask' },
    ]);
  });

  test('keeps each node’s declared outgoing order', () => {
    const g = graphFromXml(
      proc(
        '',
        `<bpmn:exclusiveGateway id="G"><bpmn:outgoing>F2</bpmn:outgoing><bpmn:outgoing>F1</bpmn:outgoing></bpmn:exclusiveGateway>`
      )
    );
    expect(g.outgoingOrder.get('G')).toEqual(['F2', 'F1']);
  });

  test('yields an empty graph for a document without a process', () => {
    expect(graphFromXml('<definitions/>').nodes).toEqual([]);
  });
});

describe('computePhaseView — Awb (RBA cases)', () => {
  test('RBA: ignores a marker that is not a known Awb phase', () => {
    const xml = proc(
      '',
      `<bpmn:startEvent id="S" ronl:awbPhase="4 + 5"/>
       <bpmn:userTask id="T" ronl:awbPhase="9"/>
       <bpmn:userTask id="U" ronl:awbPhase=""/>
       <bpmn:sequenceFlow id="F" sourceRef="S" targetRef="T"/>
       <bpmn:sequenceFlow id="G" sourceRef="T" targetRef="U"/>`
    );
    expect(phaseOf(xml)).toEqual({ S: undefined, T: undefined, U: undefined });
    const view = phaseViewFromXml(xml);
    expect(view.scheme).toBe('awb');
    expect(view.unknownMarkers).toEqual([
      { id: 'S', code: '4 + 5' },
      { id: 'T', code: '9' },
    ]);
  });

  test('RBA: leaves an unmarked node without a marked predecessor unphased', () => {
    const xml = proc(
      '',
      `<bpmn:startEvent id="S"/>
       <bpmn:userTask id="T" ronl:awbPhase="2"/>
       <bpmn:sequenceFlow id="F" sourceRef="S" targetRef="T"/>`
    );
    expect(phaseOf(xml)).toEqual({ S: undefined, T: '2' });
  });

  test('RBA: takes the latest phase where branches join', () => {
    const xml = proc(
      '',
      `<bpmn:startEvent id="S" ronl:awbPhase="6"/>
       <bpmn:exclusiveGateway id="G" ronl:awbPhase="7"/>
       <bpmn:userTask id="J"/>
       <bpmn:sequenceFlow id="F1" sourceRef="S" targetRef="G"/>
       <bpmn:sequenceFlow id="F2" sourceRef="S" targetRef="J"/>
       <bpmn:sequenceFlow id="F3" sourceRef="G" targetRef="J"/>`
    );
    expect(phaseOf(xml).J).toBe('7');
    expect(phaseViewFromXml(xml).byNode.get('J')).toEqual({ code: '7', inherited: true });
  });

  test('RBA: does not let a rework loop pull an earlier node into a later phase', () => {
    const xml = proc(
      '',
      `<bpmn:startEvent id="S" ronl:awbPhase="1"><bpmn:outgoing>F1</bpmn:outgoing></bpmn:startEvent>
       <bpmn:userTask id="A"><bpmn:outgoing>F2</bpmn:outgoing></bpmn:userTask>
       <bpmn:userTask id="B" ronl:awbPhase="3"><bpmn:outgoing>F3</bpmn:outgoing></bpmn:userTask>
       <bpmn:exclusiveGateway id="G"><bpmn:outgoing>F4</bpmn:outgoing><bpmn:outgoing>F5</bpmn:outgoing></bpmn:exclusiveGateway>
       <bpmn:endEvent id="E"/>
       <bpmn:sequenceFlow id="F1" sourceRef="S" targetRef="A"/>
       <bpmn:sequenceFlow id="F2" sourceRef="A" targetRef="B"/>
       <bpmn:sequenceFlow id="F3" sourceRef="B" targetRef="G"/>
       <bpmn:sequenceFlow id="F4" sourceRef="G" targetRef="E"/>
       <bpmn:sequenceFlow id="F5" sourceRef="G" targetRef="A"/>`
    );
    expect(phaseOf(xml)).toEqual({ S: '1', A: '1', B: '3', G: '3', E: '3' });
  });

  test('no marker at all means no stepper: scheme none and nothing assigned', () => {
    const view = phaseViewFromXml(proc('', '<bpmn:startEvent id="S"/>'));
    expect(view.scheme).toBe('none');
    expect(view.byNode.size).toBe(0);
  });
});

describe('computePhaseView — declared (RBA cases)', () => {
  test('RBA: has no stepper when the process declares phases but marks no node', () => {
    const view = phaseViewFromXml(proc('ronl:phases="a:Alpha"', '<bpmn:startEvent id="S"/>'));
    expect(view.scheme).toBe('declared');
    expect(view.byNode.size).toBe(0);
  });

  test('RBA: ignores a ronl:phase code the process did not declare', () => {
    const xml = proc(
      'ronl:phases="a:Alpha"',
      `<bpmn:startEvent id="S" ronl:phase="a"/>
       <bpmn:userTask id="T" ronl:phase="zz"/>
       <bpmn:sequenceFlow id="F" sourceRef="S" targetRef="T"/>`
    );
    expect(phaseOf(xml)).toEqual({ S: 'a', T: 'a' });
    expect(phaseViewFromXml(xml).unknownMarkers).toEqual([{ id: 'T', code: 'zz' }]);
  });

  test('RBA: ignores ronl:awbPhase in a process that declares its own phases', () => {
    const xml = proc(
      'ronl:phases="a:Alpha;b:Beta"',
      `<bpmn:startEvent id="S" ronl:phase="a"/>
       <bpmn:userTask id="T" ronl:awbPhase="2"/>
       <bpmn:sequenceFlow id="F" sourceRef="S" targetRef="T"/>`
    );
    expect(phaseViewFromXml(xml).scheme).toBe('declared');
    expect(phaseOf(xml)).toEqual({ S: 'a', T: 'a' });
  });

  test('RBA: ignores ronl:phase in a process without declared phases, and reports it', () => {
    const view = phaseViewFromXml(proc('', '<bpmn:startEvent id="S" ronl:phase="1"/>'));
    expect(view.scheme).toBe('none');
    expect(view.byNode.size).toBe(0);
    expect(view.unknownMarkers).toEqual([{ id: 'S', code: '1' }]);
  });

  test('reports ronl:phase markers left in an Awb process', () => {
    const view = phaseViewFromXml(
      proc('', '<bpmn:startEvent id="S" ronl:awbPhase="1" ronl:phase="old"/>')
    );
    expect(view.scheme).toBe('awb');
    expect(view.unknownMarkers).toEqual([{ id: 'S', code: 'old' }]);
  });

  test('RBA: inherits declared phases the way Awb phases inherit: latest at a join', () => {
    const xml = proc(
      'ronl:phases="a:Alpha;b:Beta;c:Gamma"',
      `<bpmn:startEvent id="S" ronl:phase="a"/>
       <bpmn:exclusiveGateway id="G" ronl:phase="c"/>
       <bpmn:userTask id="J"/>
       <bpmn:sequenceFlow id="F1" sourceRef="S" targetRef="G"/>
       <bpmn:sequenceFlow id="F2" sourceRef="S" targetRef="J"/>
       <bpmn:sequenceFlow id="F3" sourceRef="G" targetRef="J"/>`
    );
    expect(phaseOf(xml).J).toBe('c');
  });

  test('reports the entries RBA skips', () => {
    const view = phaseViewFromXml(proc('ronl:phases="a:Alpha;b;a:Again"', '<bpmn:startEvent id="S" ronl:phase="a"/>'));
    expect(view.skippedEntries).toEqual(['b', 'a:Again']);
  });
});

describe('parity with RBA on the declared-phase examples', () => {
  test('HR capacity claim (RBA bpmn-swimlane.test.ts, declared/ManagementCapacityClaimProcess)', () => {
    const xml = readFileSync(join(EXAMPLES, 'HR-capacity/ManagementCapacityClaimProcess.bpmn'), 'utf8');
    expect(phaseOf(xml)).toEqual({
      StartEvent_CapacityClaim: 'intake',
      Task_ConsultAndClassify: 'intake',
      Gateway_RequestType: 'claim',
      Task_PrepareStaffingClaim: 'claim',
      Task_PrepareHiringClaim: 'claim',
      Gateway_MergePrepare: 'claim',
      Task_DetermineRouting: 'routering',
      Task_SubmitToBoardAgenda: 'agenda',
      Task_BoardDecision: 'besluit',
      Gateway_BoardDecision: 'besluit',
      Task_ReconsiderationMeeting: 'heroverweging',
      Gateway_ReconsiderationOutcome: 'heroverweging',
      EndEvent_Withdrawn: 'heroverweging',
      Task_ResetClaimFields: 'heroverweging',
      Gateway_DecisionRoute: 'overdracht',
      Task_HandoverToRecruitment: 'overdracht',
      Task_HandoverToProcurement: 'overdracht',
      Gateway_MergeHandover: 'reservering',
      Task_RegisterReservation: 'reservering',
      EndEvent_ClaimCompleted: 'reservering',
    });
  });

  test('Besluitvorming (RBA bpmn-swimlane.test.ts, declared/GedelegeerdBesluitProcess)', () => {
    const xml = readFileSync(
      join(EXAMPLES, 'besluitvorming-gedelegeerd/GedelegeerdBesluitProcess.bpmn'),
      'utf8'
    );
    expect(phaseOf(xml)).toEqual({
      StartEvent_Besluit: 'voorbereiding',
      Task_KiesSjabloon: 'voorbereiding',
      Task_VulSjabloonIn: 'voorbereiding',
      Task_AdviesToetsing: 'toetsing',
      Task_ControleerVoorwaarden: 'toetsing',
      Task_Beslisregels: 'toetsing',
      Gateway_VoorwaardenVervuld: 'toetsing',
      Gateway_Memorandum: 'toetsing',
      Task_Memorandum: 'memorandum',
      Task_AdviesAkkoord: 'memorandum',
      Gateway_Akkoord: 'memorandum',
      Task_DienIn: 'ondertekening',
      Task_Onderteken: 'ondertekening',
      Gateway_Ondertekend: 'ondertekening',
      Task_Escaleren: 'escalatie',
      Task_NeemBesluit: 'escalatie',
      Task_Registreer: 'registratie',
      Task_Archiveer: 'registratie',
      EndEvent_Besluit: 'registratie',
    });
  });

  test('every node of the Awb shell example is in an Awb phase (RBA: fully phased)', () => {
    const xml = readFileSync(join(EXAMPLES, 'AwbShellProcess.bpmn'), 'utf8');
    const unphased = Object.entries(phaseOf(xml)).filter(([, code]) => code === undefined);
    expect(unphased).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --root packages/frontend src/utils/phases/assignPhases.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `phaseGraph.ts`**

```ts
/**
 * Reads a BPMN document the way RBA's parseSwimlane reads it for phases
 * (ronl-business-api packages/backend/src/rip-swimlane/bpmn-swimlane.ts):
 * only the FIRST <process>, only its DIRECT children of the counted kinds,
 * attributes by local name (namespace prefix ignored), blank as absent.
 */

/** RBA's KINDS allowlist. boundaryEvent is not counted, nor anything nested in a subProcess. */
export const COUNTED_KINDS: ReadonlySet<string> = new Set([
  'startEvent',
  'endEvent',
  'userTask',
  'manualTask',
  'scriptTask',
  'businessRuleTask',
  'receiveTask',
  'callActivity',
  'subProcess',
  'intermediateCatchEvent',
  'intermediateThrowEvent',
  'serviceTask',
  'sendTask',
  'exclusiveGateway',
  'inclusiveGateway',
  'eventBasedGateway',
  'parallelGateway',
]);

export interface PhaseNode {
  id: string;
  kind: string;
  phase?: string;
  awbPhase?: string;
}

export interface PhaseFlow {
  id: string;
  from: string;
  to: string;
}

/** A phase marker on an element RBA does not count (e.g. a boundary event). */
export interface IgnoredMarker {
  id: string;
  kind: string;
}

export interface PhaseGraph {
  phases?: string;
  phaseLabel?: string;
  nodes: PhaseNode[];
  flows: PhaseFlow[];
  outgoingOrder: Map<string, string[]>;
  ignoredMarkers: IgnoredMarker[];
}

const EMPTY: PhaseGraph = { nodes: [], flows: [], outgoingOrder: new Map(), ignoredMarkers: [] };

/** An attribute by local name, ignoring its namespace; blank counts as absent. */
function attr(el: Element, local: string): string | undefined {
  for (const a of Array.from(el.attributes)) {
    if (a.localName === local) {
      const v = a.value.trim();
      return v === '' ? undefined : v;
    }
  }
  return undefined;
}

const children = (el: Element): Element[] => Array.from(el.children);

export function graphFromXml(xml: string): PhaseGraph {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const root = doc.documentElement;
  if (!root || root.getElementsByTagName('parsererror').length > 0) return EMPTY;
  const process = children(root).find((c) => c.localName === 'process');
  if (!process) return EMPTY;

  const nodes: PhaseNode[] = [];
  const flows: PhaseFlow[] = [];
  const outgoingOrder = new Map<string, string[]>();
  const ignoredMarkers: IgnoredMarker[] = [];

  for (const el of children(process)) {
    const kind = el.localName;
    const id = el.getAttribute('id') ?? '';
    if (kind === 'sequenceFlow') {
      flows.push({ id, from: el.getAttribute('sourceRef') ?? '', to: el.getAttribute('targetRef') ?? '' });
      continue;
    }
    const phase = attr(el, 'phase');
    const awbPhase = attr(el, 'awbPhase');
    if (!COUNTED_KINDS.has(kind)) {
      if (phase !== undefined || awbPhase !== undefined) ignoredMarkers.push({ id, kind });
      continue;
    }
    nodes.push({
      id,
      kind,
      ...(phase !== undefined ? { phase } : {}),
      ...(awbPhase !== undefined ? { awbPhase } : {}),
    });
    const declared = children(el)
      .filter((c) => c.localName === 'outgoing')
      .map((c) => (c.textContent ?? '').trim());
    if (declared.length > 0) outgoingOrder.set(id, declared);
  }

  return {
    ...(attr(process, 'phases') !== undefined ? { phases: attr(process, 'phases') } : {}),
    ...(attr(process, 'phaseLabel') !== undefined ? { phaseLabel: attr(process, 'phaseLabel') } : {}),
    nodes,
    flows,
    outgoingOrder,
    ignoredMarkers,
  };
}
```

- [ ] **Step 4: Implement `assignPhases.ts`**

```ts
/**
 * RBA's phase inheritance, ported line for line from
 * ronl-business-api packages/backend/src/rip-swimlane/bpmn-swimlane.ts
 * (findBackEdges, assignColumns, assignPhases). If the two ever disagree, RBA
 * is right: the stepper shows what RBA computes, and the canvas must match it.
 */
import { graphFromXml, PhaseFlow, PhaseGraph, PhaseNode } from './phaseGraph';
import { AWB_PHASE_SET, parseDeclaredPhases, PhaseSet, Scheme } from './phaseSet';

export interface PhaseAssignment {
  code: string;
  /** False where the node carries the marker itself. */
  inherited: boolean;
}

export interface UnknownMarker {
  id: string;
  code: string;
}

export interface PhaseView {
  /** declared: ronl:phases yields a set; awb: none, but an ronl:awbPhase marker exists; none otherwise. */
  scheme: Scheme | 'none';
  set?: PhaseSet;
  /** Empty when RBA would show no stepper (no valid marker). */
  byNode: Map<string, PhaseAssignment>;
  /** Markers of the active scheme whose code is not in its set (RBA ignores them). */
  unknownMarkers: UnknownMarker[];
  skippedEntries: string[];
}

export const EMPTY_PHASE_VIEW: PhaseView = {
  scheme: 'none',
  byNode: new Map(),
  unknownMarkers: [],
  skippedEntries: [],
};

/** RBA findBackEdges: iterative DFS in each node's declared outgoing order. */
export function findBackEdges(
  nodes: PhaseNode[],
  flows: PhaseFlow[],
  seeds: string[],
  order: Map<string, string[]>
): Set<string> {
  const byId = new Map<string, PhaseFlow>();
  const grouped = new Map<string, PhaseFlow[]>();
  for (const f of flows) {
    byId.set(f.id, f);
    grouped.set(f.from, [...(grouped.get(f.from) ?? []), f]);
  }
  const outgoing = new Map<string, PhaseFlow[]>();
  for (const [from, group] of grouped) {
    const seen = new Set<string>();
    const ordered: PhaseFlow[] = [];
    for (const flowId of order.get(from) ?? []) {
      const f = byId.get(flowId);
      if (f && f.from === from && !seen.has(flowId)) {
        ordered.push(f);
        seen.add(flowId);
      }
    }
    for (const f of group) {
      if (!seen.has(f.id)) {
        ordered.push(f);
        seen.add(f.id);
      }
    }
    outgoing.set(from, ordered);
  }

  const back = new Set<string>();
  const state = new Map<string, 'white' | 'grey' | 'black'>();
  for (const n of nodes) state.set(n.id, 'white');
  const visit = (root: string) => {
    const stack: Array<{ id: string; next: number }> = [{ id: root, next: 0 }];
    state.set(root, 'grey');
    while (stack.length) {
      const frame = stack[stack.length - 1];
      const edges = outgoing.get(frame.id) ?? [];
      if (frame.next >= edges.length) {
        state.set(frame.id, 'black');
        stack.pop();
        continue;
      }
      const f = edges[frame.next++];
      const s = state.get(f.to);
      if (s === 'grey') back.add(f.id);
      else if (s === 'white') {
        state.set(f.to, 'grey');
        stack.push({ id: f.to, next: 0 });
      }
    }
  };
  for (const seed of seeds) if (state.get(seed) === 'white') visit(seed);
  for (const n of nodes) if (state.get(n.id) === 'white') visit(n.id);
  return back;
}

/** RBA assignColumns: longest path over forward edges; every node starts at 0. */
function assignColumns(nodes: PhaseNode[], forward: PhaseFlow[], seeds: string[]): Map<string, number> {
  const col = new Map<string, number>(nodes.map((n) => [n.id, 0]));
  if (seeds.length === 0) return col;
  let changed = true;
  let passes = 0;
  while (changed && passes < nodes.length + 1) {
    changed = false;
    passes += 1;
    for (const f of forward) {
      const from = col.get(f.from);
      const to = col.get(f.to);
      if (from === undefined || to === undefined) continue;
      if (to < from + 1) {
        col.set(f.to, from + 1);
        changed = true;
      }
    }
  }
  return col;
}

export function computePhaseView(graph: PhaseGraph): PhaseView {
  const parsed = parseDeclaredPhases(graph.phases, graph.phaseLabel);
  const hasAwbMarker = graph.nodes.some((n) => n.awbPhase !== undefined);
  const scheme: PhaseView['scheme'] = parsed.set ? 'declared' : hasAwbMarker ? 'awb' : 'none';
  const set = parsed.set ?? (scheme === 'awb' ? AWB_PHASE_SET : undefined);
  const base = { scheme, ...(set ? { set } : {}), skippedEntries: parsed.skipped };
  if (!set) {
    // No scheme: leftover ronl:phase markers (e.g. after switching a process
    // to "None") name phases the process no longer has. RBA ignores them.
    const leftovers = graph.nodes
      .filter((n) => n.phase !== undefined)
      .map((n) => ({ id: n.id, code: n.phase! }));
    return { ...base, byNode: new Map(), unknownMarkers: leftovers };
  }

  const markerOf = (n: PhaseNode) => (scheme === 'declared' ? n.phase : n.awbPhase);
  const explicit = new Map<string, string>();
  const unknownMarkers: UnknownMarker[] = [];
  for (const n of graph.nodes) {
    // ronl:phase markers in an Awb process name a phase the process does not
    // have; RBA ignores them, so they are reported like any unknown code.
    if (scheme === 'awb' && n.phase !== undefined) unknownMarkers.push({ id: n.id, code: n.phase });
    const marker = markerOf(n);
    if (marker === undefined) continue;
    if (set.phases.some((p) => p.code === marker)) explicit.set(n.id, marker);
    else unknownMarkers.push({ id: n.id, code: marker });
  }
  const byNode = new Map<string, PhaseAssignment>();
  if (explicit.size === 0) return { ...base, byNode, unknownMarkers };

  const starts = graph.nodes.filter((n) => n.kind === 'startEvent').map((n) => n.id);
  const seeds = starts.length > 0 ? starts : graph.nodes.slice(0, 1).map((n) => n.id);
  const backIds = findBackEdges(graph.nodes, graph.flows, seeds, graph.outgoingOrder);
  const forward = graph.flows.filter((f) => !backIds.has(f.id));
  const col = assignColumns(graph.nodes, forward, seeds);

  const order = (code: string) => set.phases.findIndex((p) => p.code === code);
  const preds = new Map<string, string[]>();
  for (const f of forward) preds.set(f.to, [...(preds.get(f.to) ?? []), f.from]);
  for (const n of [...graph.nodes].sort((a, b) => (col.get(a.id) ?? 0) - (col.get(b.id) ?? 0))) {
    const own = explicit.get(n.id);
    if (own) {
      byNode.set(n.id, { code: own, inherited: false });
      continue;
    }
    let latest: string | undefined;
    for (const p of preds.get(n.id) ?? []) {
      const phase = byNode.get(p)?.code;
      if (phase && (latest === undefined || order(phase) > order(latest))) latest = phase;
    }
    if (latest) byNode.set(n.id, { code: latest, inherited: true });
  }
  return { ...base, byNode, unknownMarkers };
}

export const phaseViewFromXml = (xml: string): PhaseView => computePhaseView(graphFromXml(xml));
```

Note on the sort: RBA sorts `SwimNode` objects by their `col`; `Array.prototype.sort` is stable, so equal columns keep document order, as here.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run --root packages/frontend src/utils/phases/assignPhases.test.ts`
Expected: PASS. If a parity test fails, compare the port line by line with RBA's `bpmn-swimlane.ts`; do NOT change the expected maps (they are RBA's output).

- [ ] **Step 6: Commit**

```bash
git add packages/frontend/src/utils/phases/phaseGraph.ts packages/frontend/src/utils/phases/assignPhases.ts packages/frontend/src/utils/phases/assignPhases.test.ts
git commit -m "feat(modeler): port RBA's phase inheritance over a graph read from the XML (#242)"
```

---

### Task 4: Pre-deploy findings (`phaseChecks.ts`)

**Files:**
- Create: `packages/frontend/src/utils/phases/phaseChecks.ts`
- Test: `packages/frontend/src/utils/phases/phaseChecks.test.ts`

**Interfaces:**
- Consumes: Task 3 (`graphFromXml`, `computePhaseView`), Task 2 (`phaseCodeLabel`).
- Produces:
  ```ts
  export type PhaseFindingCode =
    | 'MIXED_SCHEMES' | 'NO_MARKERS' | 'UNKNOWN_CODE' | 'EMPTY_PHASE' | 'SKIPPED_ENTRIES' | 'IGNORED_NODE_KIND';
  export interface PhaseFinding { severity: 'error' | 'warning'; code: PhaseFindingCode; message: string }
  export function checkPhases(xml: string): PhaseFinding[];
  ```

- [ ] **Step 1: Write the failing tests**

```ts
// @vitest-environment jsdom
import { describe, expect, test } from 'vitest';

import { checkPhases } from './phaseChecks';

const proc = (attrs: string, body: string) => `<?xml version="1.0"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:ronl="http://ronl.nl/schema/1.0">
  <bpmn:process id="P" ${attrs}>${body}</bpmn:process>
</bpmn:definitions>`;

const codes = (xml: string) => checkPhases(xml).map((f) => `${f.severity}:${f.code}`);

describe('checkPhases', () => {
  test('a process without phases has no findings', () => {
    expect(checkPhases(proc('', '<bpmn:startEvent id="S"/>'))).toEqual([]);
  });

  test('a fully marked declared process has no findings', () => {
    expect(
      checkPhases(
        proc(
          'ronl:phases="a:Alpha;b:Beta"',
          `<bpmn:startEvent id="S" ronl:phase="a"/><bpmn:userTask id="T" ronl:phase="b"/>
           <bpmn:sequenceFlow id="F" sourceRef="S" targetRef="T"/>`
        )
      )
    ).toEqual([]);
  });

  test('error: declared phases and an Awb marker in one process', () => {
    expect(
      codes(proc('ronl:phases="a:Alpha"', '<bpmn:startEvent id="S" ronl:phase="a"/><bpmn:userTask id="T" ronl:awbPhase="2"/>'))
    ).toContain('error:MIXED_SCHEMES');
  });

  test('warning: phases declared but no node marked', () => {
    expect(codes(proc('ronl:phases="a:Alpha"', '<bpmn:startEvent id="S"/>'))).toEqual(['warning:NO_MARKERS']);
  });

  test('warning: a marker naming a code the process did not declare', () => {
    const findings = checkPhases(
      proc('ronl:phases="a:Alpha"', '<bpmn:startEvent id="S" ronl:phase="a"/><bpmn:userTask id="T" ronl:phase="zz"/><bpmn:sequenceFlow id="F" sourceRef="S" targetRef="T"/>')
    );
    expect(findings).toEqual([
      expect.objectContaining({ severity: 'warning', code: 'UNKNOWN_CODE', message: expect.stringContaining('T (zz)') }),
    ]);
  });

  test('warning: an Awb marker that is not an Awb code', () => {
    expect(codes(proc('', '<bpmn:startEvent id="S" ronl:awbPhase="1"/><bpmn:userTask id="T" ronl:awbPhase="9"/><bpmn:sequenceFlow id="F" sourceRef="S" targetRef="T"/>'))).toEqual([
      'warning:UNKNOWN_CODE',
    ]);
  });

  test('warning: a declared phase no node falls into after inheritance', () => {
    const findings = checkPhases(
      proc('ronl:phases="a:Alpha;b:Beta;c:Gamma"', `<bpmn:startEvent id="S" ronl:phase="a"/><bpmn:userTask id="T" ronl:phase="c"/>
        <bpmn:sequenceFlow id="F" sourceRef="S" targetRef="T"/>`)
    );
    expect(findings).toEqual([
      expect.objectContaining({ code: 'EMPTY_PHASE', message: expect.stringContaining('Fase 2 (Beta)') }),
    ]);
  });

  test('warning: skipped entries in ronl:phases', () => {
    expect(codes(proc('ronl:phases="a:Alpha;b;a:Again"', '<bpmn:startEvent id="S" ronl:phase="a"/>'))).toEqual([
      'warning:SKIPPED_ENTRIES',
    ]);
  });

  test('warning: a marker on a node kind RBA does not count', () => {
    expect(
      codes(proc('', '<bpmn:startEvent id="S" ronl:awbPhase="1"/><bpmn:boundaryEvent id="B" ronl:awbPhase="3"/>'))
    ).toEqual(['warning:IGNORED_NODE_KIND']);
  });

  test('the shipped examples deploy clean', async () => {
    const { readFileSync } = await import('fs');
    const { join } = await import('path');
    const dir = join(__dirname, '../../../public/examples/flevoland');
    for (const file of [
      'besluitvorming-gedelegeerd/GedelegeerdBesluitProcess.bpmn',
      'HR-capacity/ManagementCapacityClaimProcess.bpmn',
      'AwbShellProcess.bpmn',
    ]) {
      expect(checkPhases(readFileSync(join(dir, file), 'utf8'))).toEqual([]);
    }
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --root packages/frontend src/utils/phases/phaseChecks.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `phaseChecks.ts`**

```ts
/**
 * What the deploy dialog says about a process's phases (#242). Only mixing
 * the two schemes blocks a deploy: RBA would read one and silently ignore the
 * other. Everything else is a warning about a stepper that will look wrong.
 */
import { computePhaseView } from './assignPhases';
import { graphFromXml } from './phaseGraph';
import { phaseCodeLabel } from './phaseSet';

export type PhaseFindingCode =
  | 'MIXED_SCHEMES'
  | 'NO_MARKERS'
  | 'UNKNOWN_CODE'
  | 'EMPTY_PHASE'
  | 'SKIPPED_ENTRIES'
  | 'IGNORED_NODE_KIND';

export interface PhaseFinding {
  severity: 'error' | 'warning';
  code: PhaseFindingCode;
  message: string;
}

export function checkPhases(xml: string): PhaseFinding[] {
  const graph = graphFromXml(xml);
  const view = computePhaseView(graph);
  const findings: PhaseFinding[] = [];

  if (view.scheme === 'declared' && graph.nodes.some((n) => n.awbPhase !== undefined)) {
    findings.push({
      severity: 'error',
      code: 'MIXED_SCHEMES',
      message:
        'The process declares its own phases (ronl:phases) and also has Awb phase markers (ronl:awbPhase). RBA reads only one scheme; remove the other before deploying.',
    });
  }
  if (view.scheme !== 'none' && view.byNode.size === 0 && view.unknownMarkers.length === 0) {
    findings.push({
      severity: 'warning',
      code: 'NO_MARKERS',
      message: 'Phases are set on the process but no node starts a phase, so RBA shows no stepper.',
    });
  }
  if (view.unknownMarkers.length > 0) {
    findings.push({
      severity: 'warning',
      code: 'UNKNOWN_CODE',
      message: `These phase markers name a phase the process does not have, so RBA ignores them: ${view.unknownMarkers
        .map((m) => `${m.id} (${m.code})`)
        .join(', ')}.`,
    });
  }
  if (view.scheme === 'declared' && view.set && view.byNode.size > 0) {
    const used = new Set([...view.byNode.values()].map((a) => a.code));
    const empty = view.set.phases.filter((p) => !used.has(p.code));
    if (empty.length > 0) {
      findings.push({
        severity: 'warning',
        code: 'EMPTY_PHASE',
        message: `No node falls into ${empty
          .map((p) => `${phaseCodeLabel(view.set!, p.code)} (${p.name})`)
          .join(', ')}, so that step of the stepper never lights up.`,
      });
    }
  }
  if (view.skippedEntries.length > 0) {
    findings.push({
      severity: 'warning',
      code: 'SKIPPED_ENTRIES',
      message: `RBA skips these entries of ronl:phases (no code, no name, or a repeated code): ${view.skippedEntries.join(', ')}.`,
    });
  }
  if (graph.ignoredMarkers.length > 0) {
    findings.push({
      severity: 'warning',
      code: 'IGNORED_NODE_KIND',
      message: `These elements carry a phase marker that RBA does not count: ${graph.ignoredMarkers
        .map((m) => `${m.id} (${m.kind})`)
        .join(', ')}.`,
    });
  }
  return findings;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run --root packages/frontend src/utils/phases/phaseChecks.test.ts`
Expected: PASS. If "the shipped examples deploy clean" fails, the finding is real: report it to the human partner instead of changing the example.

- [ ] **Step 5: Commit**

```bash
git add packages/frontend/src/utils/phases/phaseChecks.ts packages/frontend/src/utils/phases/phaseChecks.test.ts
git commit -m "feat(modeler): pre-deploy findings for a process's phases (#242)"
```

---

### Task 5: One undoable command, process target and update planners (`phaseCommands.ts`)

**Files:**
- Create: `packages/frontend/src/utils/phases/phaseCommands.ts`
- Test: `packages/frontend/src/utils/phases/phaseCommands.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  ```ts
  export type PhaseAttr = 'ronl:phase' | 'ronl:awbPhase';
  export interface ModdleUpdate { element: any; moddleElement: any; properties: Record<string, string | undefined> }
  export interface ProcessTarget { element: any; moddleElement: any }
  export const PHASE_COMMAND: 'ronl.phases.update';
  export function registerPhaseCommand(commandStack: any, modeling: any): void;
  export function applyPhaseUpdates(commandStack: any, updates: ModdleUpdate[]): void;
  export function resolveProcessTarget(selected: any | null, rootElement: any, elementRegistry: any): ProcessTarget | null;
  export function isCountedNode(element: any): boolean;
  export function markerTargets(elementRegistry: any): any[];
  export function planRenameCode(nodes: any[], from: string, to: string): ModdleUpdate[];
  export function planClearCodes(nodes: any[], attr: PhaseAttr, codes: ReadonlySet<string> | 'all'): ModdleUpdate[];
  ```

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, test, vi } from 'vitest';

import {
  applyPhaseUpdates,
  isCountedNode,
  markerTargets,
  PHASE_COMMAND,
  planClearCodes,
  planRenameCode,
  registerPhaseCommand,
  resolveProcessTarget,
} from './phaseCommands';

const bo = (attrs: Record<string, string | undefined>, extra: Record<string, unknown> = {}) => ({
  get: (k: string) => attrs[k],
  ...extra,
});
const node = (id: string, type: string, attrs: Record<string, string | undefined> = {}, parentType = 'bpmn:Process') => ({
  id,
  type,
  parent: { type: parentType },
  businessObject: bo(attrs),
});
const registry = (elements: unknown[]) => ({
  filter: (fn: (e: unknown) => boolean) => elements.filter(fn),
});

describe('registerPhaseCommand / applyPhaseUpdates', () => {
  test('one command carries every update, applied as nested moddle updates', () => {
    let handler: { preExecute: (ctx: unknown) => void; execute: () => unknown; revert: () => unknown } | undefined;
    const commandStack = {
      registerHandler: vi.fn((name: string, Handler: new () => typeof handler) => {
        expect(name).toBe(PHASE_COMMAND);
        handler = new Handler();
      }),
      execute: vi.fn((name: string, ctx: unknown) => handler!.preExecute(ctx)),
    };
    const modeling = { updateModdleProperties: vi.fn() };
    registerPhaseCommand(commandStack, modeling);

    const a = node('A', 'bpmn:UserTask');
    const b = node('B', 'bpmn:UserTask');
    applyPhaseUpdates(commandStack, [
      { element: a, moddleElement: a.businessObject, properties: { 'ronl:phase': 'x' } },
      { element: b, moddleElement: b.businessObject, properties: { 'ronl:phase': undefined } },
    ]);

    expect(commandStack.execute).toHaveBeenCalledTimes(1);
    expect(modeling.updateModdleProperties).toHaveBeenCalledTimes(2);
    expect(modeling.updateModdleProperties).toHaveBeenCalledWith(a, a.businessObject, { 'ronl:phase': 'x' });
    // The handler itself changes nothing; undo reverts the nested commands.
    expect(handler!.execute()).toEqual([]);
    expect(handler!.revert()).toEqual([]);
  });

  test('registering twice registers once', () => {
    const commandStack = { registerHandler: vi.fn(), execute: vi.fn() };
    registerPhaseCommand(commandStack, {});
    registerPhaseCommand(commandStack, {});
    expect(commandStack.registerHandler).toHaveBeenCalledTimes(1);
  });

  test('no updates, no command', () => {
    const commandStack = { execute: vi.fn() };
    applyPhaseUpdates(commandStack, []);
    expect(commandStack.execute).not.toHaveBeenCalled();
  });
});

describe('resolveProcessTarget', () => {
  const processBo = bo({});
  const processRoot = { id: 'P', type: 'bpmn:Process', businessObject: processBo };

  test('the root process when nothing is selected', () => {
    expect(resolveProcessTarget(null, processRoot, registry([]))).toEqual({
      element: processRoot,
      moddleElement: processBo,
    });
  });

  test('a selected participant edits its own process', () => {
    const procA = bo({});
    const participant = { id: 'Part', type: 'bpmn:Participant', businessObject: bo({}, { processRef: procA }) };
    expect(resolveProcessTarget(participant, { type: 'bpmn:Collaboration' }, registry([participant]))).toEqual({
      element: participant,
      moddleElement: procA,
    });
  });

  // Review focus 3: with nothing selected in a collaboration, the FIRST
  // participant's process is the one RBA reads.
  test('nothing selected in a collaboration: the first participant with a process', () => {
    const empty = { id: 'Pool0', type: 'bpmn:Participant', businessObject: bo({}, {}) };
    const procA = bo({});
    const first = { id: 'Pool1', type: 'bpmn:Participant', businessObject: bo({}, { processRef: procA }) };
    const second = { id: 'Pool2', type: 'bpmn:Participant', businessObject: bo({}, { processRef: bo({}) }) };
    expect(
      resolveProcessTarget(null, { type: 'bpmn:Collaboration' }, registry([empty, first, second]))
    ).toEqual({ element: first, moddleElement: procA });
  });

  test('a flow node is not a process target', () => {
    expect(resolveProcessTarget(node('T', 'bpmn:UserTask'), processRoot, registry([]))).toBeNull();
  });
});

describe('counted nodes', () => {
  test('a counted kind directly in the process or a participant counts', () => {
    expect(isCountedNode(node('T', 'bpmn:UserTask'))).toBe(true);
    expect(isCountedNode(node('G', 'bpmn:ExclusiveGateway', {}, 'bpmn:Participant'))).toBe(true);
    expect(isCountedNode(node('G', 'bpmn:ExclusiveGateway', {}, 'bpmn:Lane'))).toBe(true);
  });

  // Review focus 4: RBA never counts what sits inside an embedded subprocess.
  test('a node inside an embedded subprocess, a boundary event and a flow do not count', () => {
    expect(isCountedNode(node('Inner', 'bpmn:UserTask', {}, 'bpmn:SubProcess'))).toBe(false);
    expect(isCountedNode(node('B', 'bpmn:BoundaryEvent'))).toBe(false);
    expect(isCountedNode(node('F', 'bpmn:SequenceFlow'))).toBe(false);
  });

  test('markerTargets lists the counted nodes', () => {
    const t = node('T', 'bpmn:UserTask');
    const inner = node('Inner', 'bpmn:UserTask', {}, 'bpmn:SubProcess');
    expect(markerTargets(registry([t, inner]))).toEqual([t]);
  });
});

describe('planners', () => {
  const nodes = [
    node('A', 'bpmn:UserTask', { 'ronl:phase': 'old' }),
    node('B', 'bpmn:UserTask', { 'ronl:phase': 'keep' }),
    node('C', 'bpmn:UserTask', { 'ronl:awbPhase': '3' }),
  ];

  test('planRenameCode rewrites only the markers using the old code', () => {
    expect(planRenameCode(nodes, 'old', 'new')).toEqual([
      { element: nodes[0], moddleElement: nodes[0].businessObject, properties: { 'ronl:phase': 'new' } },
    ]);
  });

  test('planClearCodes clears the named codes, or every marker of an attribute', () => {
    expect(planClearCodes(nodes, 'ronl:phase', new Set(['keep']))).toEqual([
      { element: nodes[1], moddleElement: nodes[1].businessObject, properties: { 'ronl:phase': undefined } },
    ]);
    expect(planClearCodes(nodes, 'ronl:awbPhase', 'all')).toEqual([
      { element: nodes[2], moddleElement: nodes[2].businessObject, properties: { 'ronl:awbPhase': undefined } },
    ]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --root packages/frontend src/utils/phases/phaseCommands.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `phaseCommands.ts`**

```ts
/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Writing phases through bpmn-js (#242).
 *
 * Every phase edit goes through ONE command, `ronl.phases.update`, whose
 * handler applies its updates as nested `updateModdleProperties` commands in
 * preExecute. diagram-js records nested commands under the outer one, so a
 * rename that touches eight markers is still a single undo step.
 *
 * `updateModdleProperties` (rather than `updateProperties`) because the
 * phase list lives on the PROCESS, while the element the user selects in a
 * collaboration is its PARTICIPANT.
 */

export type PhaseAttr = 'ronl:phase' | 'ronl:awbPhase';

export interface ModdleUpdate {
  element: any;
  moddleElement: any;
  properties: Record<string, string | undefined>;
}

export interface ProcessTarget {
  element: any;
  moddleElement: any;
}

export const PHASE_COMMAND = 'ronl.phases.update';

const registered = new WeakSet<object>();

export function registerPhaseCommand(commandStack: any, modeling: any): void {
  if (registered.has(commandStack)) return;
  registered.add(commandStack);
  class PhaseUpdateHandler {
    preExecute(context: { updates: ModdleUpdate[] }) {
      for (const u of context.updates) {
        modeling.updateModdleProperties(u.element, u.moddleElement, u.properties);
      }
    }
    execute() {
      return [];
    }
    revert() {
      return [];
    }
  }
  commandStack.registerHandler(PHASE_COMMAND, PhaseUpdateHandler);
}

export function applyPhaseUpdates(commandStack: any, updates: ModdleUpdate[]): void {
  if (updates.length === 0) return;
  commandStack.execute(PHASE_COMMAND, { updates });
}

/**
 * The process whose phases the process editor edits: the root process, the
 * selected participant's process, or, with nothing selected in a
 * collaboration, the first participant that has a process (the one RBA reads).
 */
export function resolveProcessTarget(
  selected: any | null,
  rootElement: any,
  elementRegistry: any
): ProcessTarget | null {
  if (selected && selected.type === 'bpmn:Participant') {
    const processRef = selected.businessObject.processRef;
    return processRef ? { element: selected, moddleElement: processRef } : null;
  }
  if (selected) return null;
  if (rootElement?.type === 'bpmn:Process') {
    return { element: rootElement, moddleElement: rootElement.businessObject };
  }
  const first = elementRegistry
    .filter((e: any) => e.type === 'bpmn:Participant')
    .find((p: any) => p.businessObject.processRef);
  return first ? { element: first, moddleElement: first.businessObject.processRef } : null;
}

/** bpmn-js types of RBA's counted kinds (see phaseGraph.ts COUNTED_KINDS). */
const COUNTED_TYPES = new Set([
  'bpmn:StartEvent',
  'bpmn:EndEvent',
  'bpmn:UserTask',
  'bpmn:ManualTask',
  'bpmn:ScriptTask',
  'bpmn:BusinessRuleTask',
  'bpmn:ReceiveTask',
  'bpmn:CallActivity',
  'bpmn:SubProcess',
  'bpmn:IntermediateCatchEvent',
  'bpmn:IntermediateThrowEvent',
  'bpmn:ServiceTask',
  'bpmn:SendTask',
  'bpmn:ExclusiveGateway',
  'bpmn:InclusiveGateway',
  'bpmn:EventBasedGateway',
  'bpmn:ParallelGateway',
]);

/** Parents that keep a node a DIRECT child of the process in the XML. */
const PROCESS_LEVEL_PARENTS = new Set(['bpmn:Process', 'bpmn:Participant', 'bpmn:Lane']);

export const isCountedNode = (element: any): boolean =>
  COUNTED_TYPES.has(element?.type) && PROCESS_LEVEL_PARENTS.has(element?.parent?.type);

export const markerTargets = (elementRegistry: any): any[] =>
  elementRegistry.filter((e: any) => isCountedNode(e));

export function planRenameCode(nodes: any[], from: string, to: string): ModdleUpdate[] {
  return nodes
    .filter((n) => n.businessObject.get('ronl:phase') === from)
    .map((n) => ({ element: n, moddleElement: n.businessObject, properties: { 'ronl:phase': to } }));
}

export function planClearCodes(
  nodes: any[],
  attr: PhaseAttr,
  codes: ReadonlySet<string> | 'all'
): ModdleUpdate[] {
  return nodes
    .filter((n) => {
      const v = n.businessObject.get(attr);
      return v !== undefined && v !== '' && (codes === 'all' || codes.has(v));
    })
    .map((n) => ({ element: n, moddleElement: n.businessObject, properties: { [attr]: undefined } }));
}
```

Note for the implementer: in bpmn-js a lane is not the XML parent of its nodes (lanes list `flowNodeRef`s), which is why `bpmn:Lane` counts as process level here.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run --root packages/frontend src/utils/phases/phaseCommands.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/frontend/src/utils/phases/phaseCommands.ts packages/frontend/src/utils/phases/phaseCommands.test.ts
git commit -m "feat(modeler): one undoable command for phase edits (#242)"
```

---

### Task 6: The process-level editor (`ProcessPhasesEditor.tsx`)

**Files:**
- Create: `packages/frontend/src/components/BpmnModeler/ProcessPhasesEditor.tsx`
- Test: `packages/frontend/src/components/BpmnModeler/ProcessPhasesEditor.test.tsx`

**Interfaces:**
- Consumes: Task 2 (`AWB_PHASES`, `DEFAULT_PHASE_LABEL`, `parseDeclaredPhases`, `serializePhases`, `codeFromName`, `isValidPhaseCode`, `cleanPhaseName`, `Phase`, `Scheme`), Task 3 (`PhaseView`), Task 5 (`ProcessTarget`, `ModdleUpdate`, `applyPhaseUpdates`, `planRenameCode`, `planClearCodes`).
- Produces: `default export ProcessPhasesEditor` with props
  ```ts
  interface ProcessPhasesEditorProps {
    target: ProcessTarget;
    nodes: any[];               // markerTargets(elementRegistry)
    commandStack: any;
    view: PhaseView;
    schemeIntent?: Scheme | 'none';
    onSchemeIntent: (scheme: Scheme | 'none' | undefined) => void;
    note?: string;              // e.g. "Editing the first participant's process"
  }
  ```

The component reads `target.moddleElement.get('ronl:phases' | 'ronl:phaseLabel')` for its rows. The shown scheme is `schemeIntent ?? view.scheme`.

- [ ] **Step 1: Write the failing tests**

```tsx
// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';

import { EMPTY_PHASE_VIEW, PhaseView } from '../../utils/phases/assignPhases';
import { AWB_PHASE_SET } from '../../utils/phases/phaseSet';
import ProcessPhasesEditor from './ProcessPhasesEditor';

function setup(
  processAttrs: Record<string, string | undefined>,
  opts: { view?: PhaseView; nodes?: unknown[]; intent?: 'declared' | 'awb' | 'none' } = {}
) {
  const moddleElement = { get: (k: string) => processAttrs[k] };
  const target = { element: { id: 'P' }, moddleElement };
  const execute = vi.fn();
  const onSchemeIntent = vi.fn();
  render(
    <ProcessPhasesEditor
      target={target}
      nodes={opts.nodes ?? []}
      commandStack={{ execute }}
      view={opts.view ?? EMPTY_PHASE_VIEW}
      schemeIntent={opts.intent}
      onSchemeIntent={onSchemeIntent}
    />
  );
  const lastUpdates = () => execute.mock.calls.at(-1)?.[1].updates;
  return { execute, onSchemeIntent, lastUpdates, target };
}

const node = (id: string, attrs: Record<string, string>) => ({
  id,
  type: 'bpmn:UserTask',
  businessObject: { get: (k: string) => attrs[k] },
});

describe('ProcessPhasesEditor', () => {
  test('a process without phases shows "None" selected', () => {
    setup({});
    expect(screen.getByLabelText('None')).toBeChecked();
  });

  test('switching to own phases is a session intent until a phase is added', async () => {
    const { execute, onSchemeIntent } = setup({});
    await userEvent.click(screen.getByLabelText('Own phases'));
    expect(onSchemeIntent).toHaveBeenCalledWith('declared');
    expect(execute).not.toHaveBeenCalled();
  });

  test('adding a phase writes ronl:phases with a code generated from the name', async () => {
    const { lastUpdates, target } = setup({}, { intent: 'declared' });
    await userEvent.type(screen.getByPlaceholderText('New phase name'), 'Financiële reservering');
    await userEvent.click(screen.getByRole('button', { name: 'Add phase' }));
    expect(lastUpdates()).toEqual([
      { element: target.element, moddleElement: target.moddleElement, properties: { 'ronl:phases': 'financiele-reservering:Financiële reservering' } },
    ]);
  });

  // Review focus 1
  test('a ";" typed in a name is stripped before writing', async () => {
    const { lastUpdates } = setup({}, { intent: 'declared' });
    await userEvent.type(screen.getByPlaceholderText('New phase name'), 'Claim; opstellen');
    await userEvent.click(screen.getByRole('button', { name: 'Add phase' }));
    expect(lastUpdates()[0].properties['ronl:phases']).toBe('claim-opstellen:Claim opstellen');
  });

  test('renaming a code rewrites the markers that used it, in the same command', async () => {
    const nodes = [node('A', { 'ronl:phase': 'a' }), node('B', { 'ronl:phase': 'b' })];
    const { execute, lastUpdates } = setup({ 'ronl:phases': 'a:Alpha;b:Beta' }, { nodes });
    const code = screen.getByDisplayValue('a');
    await userEvent.clear(code);
    await userEvent.type(code, 'intake');
    await userEvent.tab();
    expect(execute).toHaveBeenCalledTimes(1);
    expect(lastUpdates()).toEqual([
      expect.objectContaining({ properties: { 'ronl:phases': 'intake:Alpha;b:Beta' } }),
      expect.objectContaining({ element: nodes[0], properties: { 'ronl:phase': 'intake' } }),
    ]);
  });

  // Review focus 2
  test('renaming a code to one another phase has is refused, not written', async () => {
    const { execute } = setup({ 'ronl:phases': 'a:Alpha;b:Beta' });
    const code = screen.getByDisplayValue('a');
    await userEvent.clear(code);
    await userEvent.type(code, 'b');
    await userEvent.tab();
    expect(execute).not.toHaveBeenCalled();
    expect(screen.getByText('Code "b" is already used by another phase.')).toBeTruthy();
  });

  test('a code with ":" or ";" is refused', async () => {
    const { execute } = setup({ 'ronl:phases': 'a:Alpha' });
    const code = screen.getByDisplayValue('a');
    await userEvent.clear(code);
    await userEvent.type(code, 'x:y');
    await userEvent.tab();
    expect(execute).not.toHaveBeenCalled();
    expect(screen.getByText('A code may not be empty or contain ":" or ";".')).toBeTruthy();
  });

  test('moving a phase down reorders ronl:phases', async () => {
    const { lastUpdates } = setup({ 'ronl:phases': 'a:Alpha;b:Beta' });
    await userEvent.click(screen.getAllByRole('button', { name: 'Move down' })[0]);
    expect(lastUpdates()[0].properties).toEqual({ 'ronl:phases': 'b:Beta;a:Alpha' });
  });

  test('removing a phase asks, then clears its markers in the same command', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const nodes = [node('A', { 'ronl:phase': 'a' })];
    const { lastUpdates } = setup({ 'ronl:phases': 'a:Alpha;b:Beta' }, { nodes });
    await userEvent.click(screen.getAllByRole('button', { name: 'Remove' })[0]);
    expect(window.confirm).toHaveBeenCalled();
    expect(lastUpdates()).toEqual([
      expect.objectContaining({ properties: { 'ronl:phases': 'b:Beta' } }),
      expect.objectContaining({ element: nodes[0], properties: { 'ronl:phase': undefined } }),
    ]);
  });

  test('the label is written only when it differs from "Fase"', async () => {
    const { lastUpdates } = setup({ 'ronl:phases': 'a:Alpha' });
    const label = screen.getByLabelText('Label');
    await userEvent.clear(label);
    await userEvent.type(label, 'Stap');
    await userEvent.tab();
    expect(lastUpdates()[0].properties).toEqual({ 'ronl:phaseLabel': 'Stap' });
    await userEvent.clear(label);
    await userEvent.type(label, 'Fase');
    await userEvent.tab();
    expect(lastUpdates()[0].properties).toEqual({ 'ronl:phaseLabel': undefined });
  });

  test('switching from own phases to Awb asks, then clears ronl:phases and every ronl:phase marker', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const nodes = [node('A', { 'ronl:phase': 'a' })];
    const { lastUpdates, onSchemeIntent } = setup({ 'ronl:phases': 'a:Alpha', 'ronl:phaseLabel': 'Stap' }, { nodes, view: { ...EMPTY_PHASE_VIEW, scheme: 'declared' } });
    await userEvent.click(screen.getByLabelText('Awb phases'));
    expect(lastUpdates()).toEqual([
      expect.objectContaining({ properties: { 'ronl:phases': undefined, 'ronl:phaseLabel': undefined } }),
      expect.objectContaining({ element: nodes[0], properties: { 'ronl:phase': undefined } }),
    ]);
    expect(onSchemeIntent).toHaveBeenCalledWith('awb');
  });

  test('switching from own phases to None clears the list and label but keeps the markers', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const nodes = [node('A', { 'ronl:phase': 'a' })];
    const { lastUpdates, onSchemeIntent } = setup(
      { 'ronl:phases': 'a:Alpha' },
      { nodes, view: { ...EMPTY_PHASE_VIEW, scheme: 'declared' } }
    );
    await userEvent.click(screen.getByLabelText('None'));
    expect(lastUpdates()).toEqual([
      expect.objectContaining({ properties: { 'ronl:phases': undefined, 'ronl:phaseLabel': undefined } }),
    ]);
    expect(onSchemeIntent).toHaveBeenCalledWith('none');
  });

  test('declining the switch changes nothing', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { execute } = setup({ 'ronl:phases': 'a:Alpha' }, { nodes: [node('A', { 'ronl:phase': 'a' })], view: { ...EMPTY_PHASE_VIEW, scheme: 'declared' } });
    await userEvent.click(screen.getByLabelText('Awb phases'));
    expect(execute).not.toHaveBeenCalled();
  });

  test('the Awb scheme lists the eight codes read-only', () => {
    setup({}, { view: { ...EMPTY_PHASE_VIEW, scheme: 'awb', set: AWB_PHASE_SET } });
    expect(screen.getByText('4+5 · Behandeling en besluit')).toBeTruthy();
    expect(screen.queryByPlaceholderText('New phase name')).toBeNull();
  });

  test('shows the note it is given', () => {
    const moddleElement = { get: () => undefined };
    render(
      <ProcessPhasesEditor
        target={{ element: {}, moddleElement }}
        nodes={[]}
        commandStack={{ execute: vi.fn() }}
        view={EMPTY_PHASE_VIEW}
        onSchemeIntent={vi.fn()}
        note="Editing the first participant's process."
      />
    );
    expect(screen.getByText("Editing the first participant's process.")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --root packages/frontend src/components/BpmnModeler/ProcessPhasesEditor.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `ProcessPhasesEditor.tsx`**

```tsx
/* eslint-disable @typescript-eslint/no-explicit-any */
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import React, { useEffect, useState } from 'react';

import { PhaseView } from '../../utils/phases/assignPhases';
import {
  applyPhaseUpdates,
  ModdleUpdate,
  planClearCodes,
  planRenameCode,
  ProcessTarget,
} from '../../utils/phases/phaseCommands';
import {
  AWB_PHASES,
  cleanPhaseName,
  codeFromName,
  DEFAULT_PHASE_LABEL,
  isValidPhaseCode,
  parseDeclaredPhases,
  Phase,
  Scheme,
  serializePhases,
} from '../../utils/phases/phaseSet';

interface ProcessPhasesEditorProps {
  target: ProcessTarget;
  nodes: any[];
  commandStack: any;
  view: PhaseView;
  schemeIntent?: Scheme | 'none';
  onSchemeIntent: (scheme: Scheme | 'none' | undefined) => void;
  note?: string;
}

/**
 * The phases a process moves through, for RBA's caseworker stepper (#242).
 * Shown in the properties panel when the process itself is selected. Every
 * change is one `ronl.phases.update` command, so one undo step.
 */
const ProcessPhasesEditor: React.FC<ProcessPhasesEditorProps> = ({
  target,
  nodes,
  commandStack,
  view,
  schemeIntent,
  onSchemeIntent,
  note,
}) => {
  const read = () => parseDeclaredPhases(
    target.moddleElement.get('ronl:phases'),
    target.moddleElement.get('ronl:phaseLabel')
  );
  const [phases, setPhases] = useState<Phase[]>(() => read().set?.phases ?? []);
  const [label, setLabel] = useState<string>(() => target.moddleElement.get('ronl:phaseLabel') ?? DEFAULT_PHASE_LABEL);
  const [newName, setNewName] = useState('');
  const [codeDrafts, setCodeDrafts] = useState<string[]>(() => phases.map((p) => p.code));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const next = read().set?.phases ?? [];
    setPhases(next);
    setCodeDrafts(next.map((p) => p.code));
    setLabel(target.moddleElement.get('ronl:phaseLabel') ?? DEFAULT_PHASE_LABEL);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target.moddleElement, view]);

  const scheme: Scheme | 'none' = schemeIntent ?? view.scheme;

  const processUpdate = (properties: Record<string, string | undefined>): ModdleUpdate => ({
    element: target.element,
    moddleElement: target.moddleElement,
    properties,
  });

  const writePhases = (next: Phase[], extra: ModdleUpdate[] = []) => {
    setPhases(next);
    setCodeDrafts(next.map((p) => p.code));
    applyPhaseUpdates(commandStack, [
      processUpdate({ 'ronl:phases': next.length > 0 ? serializePhases(next) : undefined }),
      ...extra,
    ]);
  };

  const chooseScheme = (next: Scheme | 'none') => {
    if (next === scheme) return;
    const updates: ModdleUpdate[] = [];
    if (scheme === 'declared') {
      // Spec: to None, the phase list and label go and the markers stay (the
      // deploy checks report them). To Awb, the markers go too: RBA would read
      // the Awb markers and these would only be noise.
      const markers = next === 'awb' ? planClearCodes(nodes, 'ronl:phase', 'all') : [];
      const question =
        next === 'awb'
          ? 'Switching removes this process\'s own phases and every "start of phase" marker that uses them. Continue?'
          : 'Switching removes this process\'s own phases. Nodes keep their markers until you remove them. Continue?';
      if ((phases.length > 0 || markers.length > 0) && !window.confirm(question)) return;
      if (phases.length > 0 || target.moddleElement.get('ronl:phaseLabel') !== undefined) {
        updates.push(processUpdate({ 'ronl:phases': undefined, 'ronl:phaseLabel': undefined }));
      }
      updates.push(...markers);
    }
    if (scheme === 'awb') {
      const markers = planClearCodes(nodes, 'ronl:awbPhase', 'all');
      if (markers.length > 0 && !window.confirm(
        'Switching removes every Awb "start of phase" marker in this process. Continue?'
      )) return;
      updates.push(...markers);
    }
    applyPhaseUpdates(commandStack, updates);
    onSchemeIntent(next);
  };

  const addPhase = () => {
    const name = cleanPhaseName(newName);
    if (name === '') return;
    const code = codeFromName(name, phases.map((p) => p.code));
    setNewName('');
    writePhases([...phases, { code, name }]);
  };

  const commitCode = (index: number) => {
    const draft = codeDrafts[index];
    const old = phases[index].code;
    if (draft === old) return;
    if (!isValidPhaseCode(draft)) {
      setError('A code may not be empty or contain ":" or ";".');
      return;
    }
    if (phases.some((p, i) => i !== index && p.code === draft)) {
      setError(`Code "${draft}" is already used by another phase.`);
      return;
    }
    setError(null);
    const next = phases.map((p, i) => (i === index ? { ...p, code: draft } : p));
    writePhases(next, planRenameCode(nodes, old, draft));
  };

  const commitName = (index: number, value: string) => {
    const name = cleanPhaseName(value);
    if (name === '' || name === phases[index].name) return;
    writePhases(phases.map((p, i) => (i === index ? { ...p, name } : p)));
  };

  const move = (index: number, delta: number) => {
    const next = [...phases];
    const [moved] = next.splice(index, 1);
    next.splice(index + delta, 0, moved);
    writePhases(next);
  };

  const remove = (index: number) => {
    const phase = phases[index];
    if (!window.confirm(`Remove phase "${phase.name}"? Nodes that start it lose their marker.`)) return;
    writePhases(
      phases.filter((_, i) => i !== index),
      planClearCodes(nodes, 'ronl:phase', new Set([phase.code]))
    );
  };

  const commitLabel = () => {
    const value = label.trim();
    applyPhaseUpdates(commandStack, [
      processUpdate({ 'ronl:phaseLabel': value === '' || value === DEFAULT_PHASE_LABEL ? undefined : value }),
    ]);
  };

  const radio = (value: Scheme | 'none', text: string) => (
    <label className="flex items-center gap-2 text-xs text-slate-700">
      <input type="radio" name="phase-scheme" checked={scheme === value} onChange={() => chooseScheme(value)} />
      {text}
    </label>
  );

  return (
    <div className="p-3 bg-white border-t border-slate-200">
      <div className="text-xs font-medium text-slate-700 mb-2">Phases (RBA stepper)</div>
      {note && <div className="text-[11px] text-slate-500 mb-2">{note}</div>}
      <div className="space-y-1 mb-3">
        {radio('none', 'None')}
        {radio('declared', 'Own phases')}
        {radio('awb', 'Awb phases')}
      </div>

      {scheme === 'awb' && (
        <ul className="text-xs text-slate-600 space-y-0.5">
          {AWB_PHASES.map((p) => (
            <li key={p.code}>{`${p.code} · ${p.name}`}</li>
          ))}
        </ul>
      )}

      {scheme === 'declared' && (
        <div className="space-y-2">
          {phases.map((p, i) => (
            <div key={`${p.code}-${i}`} className="flex items-center gap-1">
              <span className="w-5 text-[11px] text-slate-400">{i + 1}</span>
              <input
                className="flex-1 min-w-0 px-2 py-1 border border-slate-300 rounded text-xs"
                defaultValue={p.name}
                aria-label={`Name of phase ${i + 1}`}
                onBlur={(e) => commitName(i, e.target.value)}
              />
              <input
                className="w-24 px-2 py-1 border border-slate-300 rounded text-xs font-mono"
                value={codeDrafts[i] ?? ''}
                aria-label={`Code of phase ${i + 1}`}
                onChange={(e) => setCodeDrafts(codeDrafts.map((c, j) => (j === i ? e.target.value : c)))}
                onBlur={() => commitCode(i)}
              />
              <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)} className="p-1 disabled:opacity-30">
                <ArrowUp size={12} />
              </button>
              <button type="button" aria-label="Move down" disabled={i === phases.length - 1} onClick={() => move(i, 1)} className="p-1 disabled:opacity-30">
                <ArrowDown size={12} />
              </button>
              <button type="button" aria-label="Remove" onClick={() => remove(i)} className="p-1 text-slate-400 hover:text-red-600">
                <Trash2 size={12} />
              </button>
            </div>
          ))}
          {error && <div className="text-[11px] text-red-600">{error}</div>}
          <div className="flex items-center gap-1">
            <input
              className="flex-1 px-2 py-1 border border-slate-300 rounded text-xs"
              placeholder="New phase name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addPhase()}
            />
            <button type="button" onClick={addPhase} className="flex items-center gap-1 px-2 py-1 text-xs bg-slate-100 rounded hover:bg-slate-200">
              <Plus size={12} /> Add phase
            </button>
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-700">
            Label
            <input
              className="w-24 px-2 py-1 border border-slate-300 rounded text-xs"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onBlur={commitLabel}
            />
          </label>
        </div>
      )}
    </div>
  );
};

export default ProcessPhasesEditor;
```

Note: the "Add phase" button's accessible name comes from its text ("Add phase"); the icon has no label.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run --root packages/frontend src/components/BpmnModeler/ProcessPhasesEditor.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/frontend/src/components/BpmnModeler/ProcessPhasesEditor.tsx packages/frontend/src/components/BpmnModeler/ProcessPhasesEditor.test.tsx
git commit -m "feat(modeler): edit a process's phases in the properties panel (#242)"
```

---

### Task 7: The node-level picker (`PhaseMarkerSelector.tsx`)

**Files:**
- Create: `packages/frontend/src/components/BpmnModeler/PhaseMarkerSelector.tsx`
- Test: `packages/frontend/src/components/BpmnModeler/PhaseMarkerSelector.test.tsx`

**Interfaces:**
- Consumes: Task 2 (`AWB_PHASE_SET`, `phaseCodeLabel`, `Scheme`), Task 3 (`PhaseView`), Task 5 (`applyPhaseUpdates`, `isCountedNode`).
- Produces: `default export PhaseMarkerSelector` with props
  ```ts
  interface PhaseMarkerSelectorProps {
    element: any;
    commandStack: any;
    view: PhaseView;
    schemeIntent?: Scheme | 'none';
  }
  ```

- [ ] **Step 1: Write the failing tests**

```tsx
// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';

import { EMPTY_PHASE_VIEW, PhaseView } from '../../utils/phases/assignPhases';
import { AWB_PHASE_SET, parseDeclaredPhases } from '../../utils/phases/phaseSet';
import PhaseMarkerSelector from './PhaseMarkerSelector';

const declared = parseDeclaredPhases('intake:Intake;toetsing:Toetsing', undefined).set!;
const element = (attrs: Record<string, string> = {}, parentType = 'bpmn:Process') => ({
  id: 'T',
  type: 'bpmn:UserTask',
  parent: { type: parentType },
  businessObject: { get: (k: string) => attrs[k] },
});
const view = (over: Partial<PhaseView>): PhaseView => ({ ...EMPTY_PHASE_VIEW, ...over });

function setup(el: ReturnType<typeof element>, v: PhaseView, intent?: 'declared' | 'awb' | 'none') {
  const execute = vi.fn();
  render(<PhaseMarkerSelector element={el} commandStack={{ execute }} view={v} schemeIntent={intent} />);
  return { execute, lastUpdates: () => execute.mock.calls.at(-1)?.[1].updates };
}

describe('PhaseMarkerSelector', () => {
  test('without a scheme it asks to set phases on the process first', () => {
    setup(element(), view({}));
    expect(screen.getByText('Stel eerst fasen in op het proces')).toBeTruthy();
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  // Review focus 4
  test('a node inside an embedded subprocess is not counted by RBA', () => {
    setup(element({}, 'bpmn:SubProcess'), view({ scheme: 'declared', set: declared }));
    expect(screen.getByText(/telt niet mee/)).toBeTruthy();
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  test('offers "(erft over)" and the declared phases, labelled as RBA labels them', () => {
    setup(element(), view({ scheme: 'declared', set: declared }));
    const options = screen.getAllByRole('option').map((o) => o.textContent);
    expect(options).toEqual(['(erft over)', 'Fase 1 · Intake', 'Fase 2 · Toetsing']);
  });

  test('picking a declared phase writes ronl:phase', async () => {
    const el = element();
    const { lastUpdates } = setup(el, view({ scheme: 'declared', set: declared }));
    await userEvent.selectOptions(screen.getByRole('combobox'), 'toetsing');
    expect(lastUpdates()).toEqual([
      { element: el, moddleElement: el.businessObject, properties: { 'ronl:phase': 'toetsing' } },
    ]);
  });

  test('"(erft over)" removes the marker', async () => {
    const el = element({ 'ronl:phase': 'intake' });
    const { lastUpdates } = setup(el, view({ scheme: 'declared', set: declared }));
    await userEvent.selectOptions(screen.getByRole('combobox'), '');
    expect(lastUpdates()[0].properties).toEqual({ 'ronl:phase': undefined });
  });

  test('with the Awb intent and no markers yet, it offers the Awb codes and writes ronl:awbPhase', async () => {
    const el = element();
    const { lastUpdates } = setup(el, view({}), 'awb');
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toContain('Fase 4+5 · Behandeling en besluit');
    await userEvent.selectOptions(screen.getByRole('combobox'), '3');
    expect(lastUpdates()[0].properties).toEqual({ 'ronl:awbPhase': '3' });
  });

  test('says what an unmarked node inherits', () => {
    setup(element(), view({ scheme: 'declared', set: declared, byNode: new Map([['T', { code: 'toetsing', inherited: true }]]) }));
    expect(screen.getByText('Erft fase 2 (Toetsing) over')).toBeTruthy();
  });

  test('says when a node lies before the first marker', () => {
    setup(element(), view({ scheme: 'declared', set: declared, byNode: new Map([['X', { code: 'intake', inherited: false }]]) }));
    expect(screen.getByText('Geen fase: ligt vóór de eerste fasemarkering')).toBeTruthy();
  });

  test('uses the Awb label for an inherited Awb phase', () => {
    setup(element(), view({ scheme: 'awb', set: AWB_PHASE_SET, byNode: new Map([['T', { code: 'archivering', inherited: true }]]) }));
    expect(screen.getByText('Erft Archiefwet (Archivering) over')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --root packages/frontend src/components/BpmnModeler/PhaseMarkerSelector.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `PhaseMarkerSelector.tsx`**

```tsx
/* eslint-disable @typescript-eslint/no-explicit-any */
import React from 'react';

import { PhaseView } from '../../utils/phases/assignPhases';
import { applyPhaseUpdates, isCountedNode } from '../../utils/phases/phaseCommands';
import { AWB_PHASE_SET, phaseCodeLabel, PhaseSet, Scheme } from '../../utils/phases/phaseSet';

interface PhaseMarkerSelectorProps {
  element: any;
  commandStack: any;
  view: PhaseView;
  schemeIntent?: Scheme | 'none';
}

/**
 * Which phase a node starts, for RBA's caseworker stepper (#242). Mirrors
 * DocumentTemplateSelector: rendered into the properties panel below the
 * other selectors. "(erft over)" removes the marker, so the node inherits.
 */
const PhaseMarkerSelector: React.FC<PhaseMarkerSelectorProps> = ({ element, commandStack, view, schemeIntent }) => {
  const scheme = schemeIntent ?? view.scheme;
  const set: PhaseSet | undefined =
    scheme === 'declared' ? view.set : scheme === 'awb' ? AWB_PHASE_SET : undefined;

  const box = (children: React.ReactNode) => (
    <div className="p-3 bg-white border-t border-slate-200">
      <label className="block text-xs font-medium text-slate-700 mb-2">Start van fase</label>
      {children}
    </div>
  );

  if (!isCountedNode(element)) {
    return box(
      <div className="text-xs text-slate-500">
        Dit element telt niet mee voor de fasen: RBA telt alleen elementen direct in het proces.
      </div>
    );
  }
  if (!set) return box(<div className="text-xs text-slate-500">Stel eerst fasen in op het proces</div>);

  const attr = scheme === 'declared' ? 'ronl:phase' : 'ronl:awbPhase';
  const current = (element.businessObject.get(attr) as string | undefined) ?? '';
  const assignment = view.byNode.get(element.id);

  const status = (() => {
    if (current !== '') return null;
    if (!assignment) return 'Geen fase: ligt vóór de eerste fasemarkering';
    const phase = set.phases.find((p) => p.code === assignment.code);
    const label = phaseCodeLabel(set, assignment.code);
    // Declared labels read mid-sentence ("Erft fase 2 …"); Awb labels are names ("Erft Archiefwet …").
    const ref = scheme === 'declared' ? label.charAt(0).toLowerCase() + label.slice(1) : label;
    return `Erft ${ref} (${phase?.name ?? assignment.code}) over`;
  })();

  const choose = (code: string) =>
    applyPhaseUpdates(commandStack, [
      { element, moddleElement: element.businessObject, properties: { [attr]: code === '' ? undefined : code } },
    ]);

  return box(
    <>
      <select
        value={current}
        onChange={(e) => choose(e.target.value)}
        className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm bg-white"
      >
        <option value="">(erft over)</option>
        {set.phases.map((p) => (
          <option key={p.code} value={p.code}>
            {`${phaseCodeLabel(set, p.code)} · ${p.name}`}
          </option>
        ))}
      </select>
      {status && <div className="mt-2 text-xs text-slate-500">{status}</div>}
    </>
  );
};

export default PhaseMarkerSelector;
```

The inherited-status text: for declared phases RBA labels them `<label> <n>` (e.g. `Fase 2`); the sentence lower-cases a leading `Fase` → `Erft fase 2 (Toetsing) over`. For Awb the label is used as is (`Erft Fase 3 (...)`/`Erft Archiefwet (...)`).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run --root packages/frontend src/components/BpmnModeler/PhaseMarkerSelector.test.tsx`
Expected: PASS. (`Erft fase 2 (Toetsing) over`: `phaseCodeLabel` gives `Fase 2`, lower-cased to `fase 2`.)

- [ ] **Step 5: Commit**

```bash
git add packages/frontend/src/components/BpmnModeler/PhaseMarkerSelector.tsx packages/frontend/src/components/BpmnModeler/PhaseMarkerSelector.test.tsx
git commit -m "feat(modeler): pick the phase a node starts (#242)"
```

---

### Task 8: Wire it into `BpmnCanvas` — recompute, badges, editors, deploy checks

**Files:**
- Modify: `packages/frontend/src/components/BpmnModeler/BpmnCanvas.tsx`
- Modify: `packages/frontend/src/components/BpmnModeler/BpmnModeler.css`
- Test: `packages/frontend/src/components/BpmnModeler/BpmnCanvas.test.tsx`

**Interfaces:**
- Consumes: Task 3 (`phaseViewFromXml`, `EMPTY_PHASE_VIEW`, `PhaseView`), Task 4 (`checkPhases`, `PhaseFinding`), Task 5 (`registerPhaseCommand`, `resolveProcessTarget`, `markerTargets`, `isCountedNode`), Tasks 6–7 (components).
- Produces: user-visible behaviour only.

Read `BpmnCanvas.tsx` first; line numbers below are from `acc` at `e42bd7a` and may have moved.

- [ ] **Step 1: Extend the bpmn-js mocks and write the failing tests**

In `BpmnCanvas.test.tsx` the bpmn-js classes are mocked with `vi.hoisted` (top of the file). Extend them minimally:
- `MockCanvas` gains `getRootElement()` returning `mockState.rootElement` (default `{ id: 'P', type: 'bpmn:Process', businessObject: { get: () => undefined } }`).
- The mocked modeler's `get('commandStack')` returns `{ registerHandler: vi.fn(), execute: vi.fn() }`; `get('modeling')` keeps its object and gains `updateModdleProperties: vi.fn()`.
- `MockElementRegistry` gains `filter(fn)` over its `elements` (if it lacks one).
- `saveXML` returns `mockState.savedXml` (set per test).

Add a describe block:

```tsx
describe('BpmnCanvas — phases (#242)', () => {
  const PROCESS_WITH_PHASES = `<?xml version="1.0"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:ronl="http://ronl.nl/schema/1.0">
  <bpmn:process id="P" ronl:phases="a:Alpha;b:Beta">
    <bpmn:startEvent id="S" ronl:phase="a"/>
    <bpmn:userTask id="T"/>
    <bpmn:sequenceFlow id="F" sourceRef="S" targetRef="T"/>
  </bpmn:process>
</bpmn:definitions>`;

  test('with nothing selected the process phase editor is shown', async () => {
    mockState.savedXml = PROCESS_WITH_PHASES;
    renderCanvas(); // the file's existing render helper
    emitSelection([]); // the file's existing helper for selection.changed
    expect(await screen.findByText('Phases (RBA stepper)')).toBeTruthy();
  });

  test('selecting a user task shows the phase picker below the other selectors', async () => {
    mockState.savedXml = PROCESS_WITH_PHASES;
    renderCanvas();
    emitSelection([taskElement('T')]); // a bpmn:UserTask whose parent is the process
    expect(await screen.findByText('Start van fase')).toBeTruthy();
  });

  test('a change recomputes phases and draws a solid and an outlined badge', async () => {
    mockState.savedXml = PROCESS_WITH_PHASES;
    mockState.elements = [taskElement('S', 'bpmn:StartEvent'), taskElement('T')];
    renderCanvas();
    emitCommandStackChanged();
    await vi.waitFor(() =>
      expect(addedOverlays('phase-marker')).toEqual([
        expect.objectContaining({ id: 'S', html: expect.stringContaining('phase-badge--start') }),
        expect.objectContaining({ id: 'T', html: expect.stringContaining('phase-badge--inherited') }),
      ])
    );
  });

  test('the deploy dialog blocks on mixed schemes and shows phase warnings', async () => {
    mockState.savedXml = PROCESS_WITH_PHASES.replace('<bpmn:userTask id="T"/>', '<bpmn:userTask id="T" ronl:awbPhase="2"/>');
    renderCanvas();
    await openDeployDialog(); // the file's existing helper or a click on "Deploy"
    expect(screen.getByText(/declares its own phases \(ronl:phases\) and also has Awb phase markers/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Deploy/ })).toBeDisabled();
  });
});
```

Where the file has no such helpers (`renderCanvas`, `emitSelection`, `emitCommandStackChanged`, `addedOverlays`, `openDeployDialog`), write them next to the existing ones, following how the file's existing selection, overlay (`:694-705` on `acc`) and deploy-modal (`:411`) tests drive the mocks.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --root packages/frontend src/components/BpmnModeler/BpmnCanvas.test.tsx`
Expected: the four new tests FAIL; every existing test still passes.

- [ ] **Step 3: Recompute the phase view (debounced)**

In `BpmnCanvas.tsx`, add imports:

```tsx
import { EMPTY_PHASE_VIEW, PhaseView, phaseViewFromXml } from '../../utils/phases/assignPhases';
import { checkPhases, PhaseFinding } from '../../utils/phases/phaseChecks';
import { markerTargets, registerPhaseCommand, resolveProcessTarget } from '../../utils/phases/phaseCommands';
import { Scheme } from '../../utils/phases/phaseSet';
import PhaseMarkerSelector from './PhaseMarkerSelector';
import ProcessPhasesEditor from './ProcessPhasesEditor';
```

State, next to the other `useState`s:

```tsx
  const [phaseView, setPhaseView] = useState<PhaseView>(EMPTY_PHASE_VIEW);
  // Awb has no attribute of its own (RBA recognises it by its markers), so a
  // fresh "Awb phases" choice lives here until the first marker exists.
  const [schemeIntent, setSchemeIntent] = useState<Scheme | 'none' | undefined>(undefined);
  const phaseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
```

A recompute function (beside `refreshDmnOverlays`):

```tsx
  /**
   * Recomputes every node's phase from the saved XML (#242) — the same input
   * RBA reads, so the canvas cannot drift from the stepper. Debounced: a burst
   * of edits costs one saveXML. A failed save or parse keeps the last view.
   */
  const schedulePhaseRefresh = () => {
    if (phaseTimer.current) clearTimeout(phaseTimer.current);
    phaseTimer.current = setTimeout(async () => {
      const modeler = modelerRef.current;
      if (!modeler) return;
      try {
        const { xml: current } = await modeler.saveXML({ format: false });
        const view = phaseViewFromXml(current);
        setPhaseView(view);
        // Once the XML shows a scheme, it no longer needs the session intent.
        if (view.scheme !== 'none') setSchemeIntent(undefined);
        refreshPhaseOverlays(view);
      } catch (err) {
        console.debug('[BpmnCanvas] phase refresh skipped:', err);
      }
    }, 150);
  };
```

Call it where the overlays are refreshed today: after `refreshDmnOverlays()` in `importDiagram`, and in `handleChange`. Register the command once the modeler exists (right after `modelerRef.current = modeler;`):

```tsx
    registerPhaseCommand(modeler.get('commandStack'), modeler.get('modeling'));
```

In the effect's cleanup, add `if (phaseTimer.current) clearTimeout(phaseTimer.current);`.

- [ ] **Step 4: Draw the badges**

```tsx
  const PHASE_COLOURS = ['#0f766e', '#7c3aed', '#b45309', '#2563eb', '#be123c', '#4d7c0f', '#0369a1', '#a21caf'];

  const refreshPhaseOverlays = (view: PhaseView) => {
    if (!modelerRef.current) return;
    const overlays = modelerRef.current.get('overlays') as any;
    const elementRegistry = modelerRef.current.get('elementRegistry') as any;
    overlays.remove({ type: 'phase-marker' });
    if (!view.set || view.byNode.size === 0) return;
    const set = view.set;
    elementRegistry.forEach((element: any) => {
      const assignment = view.byNode.get(element.id);
      if (!assignment) return;
      const index = set.phases.findIndex((p) => p.code === assignment.code);
      const phase = set.phases[index];
      const colour = PHASE_COLOURS[index % PHASE_COLOURS.length];
      const label = phaseCodeLabel(set, assignment.code);
      const text = assignment.inherited
        ? `${index + 1}`
        : set.scheme === 'awb'
          ? label
          : `${index + 1} · ${assignment.code}`;
      const kind = assignment.inherited ? 'phase-badge--inherited' : 'phase-badge--start';
      overlays.add(element.id, 'phase-marker', {
        position: { top: -10, left: -6 },
        html: `<div class="phase-badge ${kind}" style="--phase-colour:${colour}" title="${label} · ${phase?.name ?? ''}">${text}</div>`,
      });
    });
  };
```

Add `phaseCodeLabel` to the `phaseSet` import. Append to `BpmnModeler.css`:

```css
/* Phase badges (#242): solid where a node starts a phase, outlined where it inherits one. */
.phase-badge {
  font-size: 10px;
  font-weight: 600;
  padding: 1px 5px;
  border-radius: 9999px;
  white-space: nowrap;
  pointer-events: none;
}
.phase-badge--start {
  background: var(--phase-colour);
  color: white;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
}
.phase-badge--inherited {
  background: white;
  color: var(--phase-colour);
  border: 1px solid var(--phase-colour);
}
```

- [ ] **Step 5: Mount the editors**

In the selection effect (starts with `if (!selectedElement || !modelerRef.current) return;`):

1. Change the guard to `if (!modelerRef.current) return;` so an empty selection still runs.
2. Extend `cleanupReactRoots` to also remove `[id^="phase-process-custom-"], [id^="phase-node-custom-"]` (unmount like the document selector does).
3. Before the existing type branches, mount the process editor when the selection is the process itself:

```tsx
    const modeler = modelerRef.current;
    const elementRegistry = modeler.get('elementRegistry') as any;
    const commandStack = modeler.get('commandStack');
    const rootElement = (modeler.get('canvas') as any).getRootElement();
    const processTarget = resolveProcessTarget(selectedElement, rootElement, elementRegistry);
    const mountPhaseComponent = (prefix: string, node: React.ReactNode) => {
      const panel = document.querySelector('.bio-properties-panel-scroll-container');
      if (!panel) return;
      const container = document.createElement('div');
      container.id = `${prefix}${selectedElement?.id ?? 'root'}`;
      panel.appendChild(container);
      ReactDOM.createRoot(container).render(node);
    };
    if (processTarget) {
      cleanupReactRoots();
      const participants = elementRegistry.filter((e: any) => e.type === 'bpmn:Participant');
      mountPhaseComponent(
        'phase-process-custom-',
        <ProcessPhasesEditor
          target={processTarget}
          nodes={markerTargets(elementRegistry)}
          commandStack={commandStack}
          view={phaseView}
          schemeIntent={schemeIntent}
          onSchemeIntent={(s) => {
            setSchemeIntent(s);
            schedulePhaseRefresh();
          }}
          note={!selectedElement && participants.length > 1 ? "Editing the first participant's process, the one RBA reads." : undefined}
        />
      );
      return () => cleanupReactRoots();
    }
    if (!selectedElement) return;
```

4. After the existing branches mount their selectors (BusinessRuleTask, UserTask/StartEvent) — and also for every other node type that `isCountedNode` accepts — append the picker. Simplest: after the if/else chain and before the cleanup `return`, add:

```tsx
    if (isCountedNode(selectedElement) || selectedElement.parent?.type === 'bpmn:SubProcess') {
      mountPhaseComponent(
        'phase-node-custom-',
        <PhaseMarkerSelector element={selectedElement} commandStack={commandStack} view={phaseView} schemeIntent={schemeIntent} />
      );
    }
```

and change the final `else { cleanupReactRoots(); }` so it still runs cleanup first (the picker mount comes after it). Add `isCountedNode` to the `phaseCommands` import.

5. Add `phaseView` and `schemeIntent` to the effect's dependency array: `[selectedElement, endpoint, phaseView, schemeIntent]`.

- [ ] **Step 6: Show the checks in the deploy dialog**

In `handleOpenDeployModal`, after `languageList`:

```tsx
    const phaseFindings = checkPhases(xml);
```

and pass it in `setDeployResources({... , phaseFindings })`, adding `phaseFindings?: PhaseFinding[]` to the cast type. In the dialog, after the language-mismatch block:

```tsx
                {((deployResources as any).phaseFindings as PhaseFinding[] | undefined)?.map((f) => (
                  <div
                    key={f.code}
                    className={`mb-3 p-3 rounded-lg text-xs ${
                      f.severity === 'error'
                        ? 'bg-red-50 border border-red-200 text-red-800'
                        : 'bg-amber-50 border border-amber-200 text-amber-800'
                    }`}
                  >
                    {f.severity === 'error' ? '✗ ' : '⚠️ '}
                    {f.message}
                  </div>
                ))}
```

and extend the Deploy button's `disabled` condition with:

```tsx
                    ((deployResources as any).phaseFindings as PhaseFinding[] | undefined)?.some(
                      (f) => f.severity === 'error'
                    ) ||
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run --root packages/frontend src/components/BpmnModeler/BpmnCanvas.test.tsx`
Expected: PASS, including every pre-existing test.

- [ ] **Step 8: Run the whole frontend suite, lint and typecheck**

Run: `npm test --workspace=packages/frontend`
Expected: all test files pass; coverage floor met.
Run: `cd packages/frontend && npx tsc --noEmit -p . && npx eslint src/components/BpmnModeler src/utils/phases && npx prettier --check src/components/BpmnModeler src/utils/phases`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add packages/frontend/src/components/BpmnModeler/BpmnCanvas.tsx packages/frontend/src/components/BpmnModeler/BpmnCanvas.test.tsx packages/frontend/src/components/BpmnModeler/BpmnModeler.css
git commit -m "feat(modeler): phase badges, editors and deploy checks in the canvas (#242)"
```

---

### Task 9: End-to-end acceptance (human partner)

No code. Hand over:

- [ ] **Step 1: The suites**
  `npm test --workspace=packages/frontend` and `npm test --workspace=packages/backend`: green.
- [ ] **Step 2: In the Modeler** (dev server the human partner runs)
  1. Open `ManagementCapacityClaimProcess` and `AwbShellProcess`: badges match the stepper RBA shows for them today; Save, and the phase attributes are unchanged (`git diff` on an exported file shows none of `ronl:phase*` changed).
  2. Create a new process, add three phases in the process editor, mark three nodes, Undo once (the last marker goes), Redo.
  3. Rename a phase code: every marker follows; one Undo restores all.
  4. Deploy it to the local stack and open the instance in RBA's caseworker view: the stepper shows the three phases with no RBA change.
- [ ] **Step 3: PR**
  After the partner's green: push the branch and open a PR against `acc` with "Closes #242".
