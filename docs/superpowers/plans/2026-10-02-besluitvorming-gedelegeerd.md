# Besluitvorming onder gedelegeerde bevoegdheid — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A new Dutch example bundle in linked-data-explorer (BPMN with swimlanes and declared phases, a DMN, 12 forms and a besluit document), runnable end to end in ronl-business-api. RBA's ValidSign signing becomes generic, so any process configures it from its BPMN alone.

**Architecture:** The bundle consists of static artifacts under `packages/frontend/public/examples/flevoland/besluitvorming-gedelegeerd/`, seeded into the Modeler, Form Editor and Document Composer. A jest test in LDE's backend checks that the BPMN, DMN, forms and document agree with each other.

RBA gets:
- five realm roles and two test users;
- a dashboard start section;
- generic signing: a shared `SigningPanel` behind a `useTaskSignature` hook in both task views, signing state scoped to the task that created it, and archive names derived from the template and the business key;
- a parser fixture.

**Tech Stack:** BPMN 2.0 with Camunda/Operaton extensions, DMN 1.3 (FEEL), form-js schema 16, React and TypeScript (Vite, vitest), Express and TypeScript (jest), Keycloak realm JSON.

**Spec:** `docs/superpowers/specs/2026-10-01-besluitvorming-gedelegeerd-design.md` (linked-data-explorer, branch `feat/besluitvorming-gedelegeerd`, commit 089eb9c).

## Global Constraints

- Every name, label, form text and document text is **Dutch**. Code identifiers, comments and commit messages stay English, as in the rest of both repos.
- **Tenant flevoland:** `ronl:organization="flevoland"` and `ronl:language="nl"` on the process. Seeds use `organization: 'flevoland'` and `language: 'nl'`.
- **Process key** `GedelegeerdBesluitProcess`. **DMN key** `GedelegeerdBesluitRoute`. **Document id** `besluit-gb-besluit`. **Forms:** `besluit-gb-*`, with the file name equal to the form id.
- Every business rule task carries `camunda:decisionRefTenantId="${null}"`. The DMN is deployed **without an Organization**.
- **Roles:** `besluit-indiener`, `besluit-jurist`, `besluit-bestuursautoriteit`, `besluit-ondertekenaar`, `besluit-registratie`.
- **Test users:** `test-indiener-flevoland` (caseworker, besluit-indiener), and `test-besluit-flevoland` (caseworker plus the four other besluit roles). Both have the password `test123` and an email.
- **R2.1 needs no backward compatibility**: its archived names may change.
- **Commits:** no `Co-Authored-By`, `Claude-Session` or "Generated with" lines, anywhere.
- **Ask before every `git commit`.** Each "Commit" step below means: stage, report what is staged, and wait for the user's go-ahead.
- **Never start, stop or restart a dev server.** Never pass `--no-verify`, and never skip a hook.
- **No heredocs** for multi-line content: write it to a scratchpad file with the Write tool, and pass the file (`git commit -F`, `node <script>`).
- **LDE branch:** `feat/besluitvorming-gedelegeerd`, which already exists and holds the spec.
- **RBA branch:** `feat/besluitvorming-gedelegeerd`, created **from `origin/acc`**. The RBA working tree may be on another in-progress branch (`feat/edocs-per-user-entra` was checked out on 2026-10-02). Do not touch that work: before Part B, check `git status`, and if there are changes or a different branch, **stop and ask** how to proceed.
- **Backend jest:** run through the workspace script or with `--config packages/backend/jest.config.js`; a bare `npx jest` from the repo root ignores the package config.

## Review Focus

1. **Signing again after a declined signature.** The decline loop sends the case back to "6 Dien in" and then to a *new* "Onderteken" task. Today `validsignStatus=declined` is a process variable, so the new task would open as declined and the package route would answer 409. Expected: the new task starts fresh. Pinned in **Task B2**.
2. **Archiving a package created before this change**, which carries no template variables. Expected: completion still archives, with fallback names, and does not crash. Pinned in **Task B2**.
3. **Switching tasks in the caseworker inbox while a spec fetch is in flight.** Expected: a slow response for the previous task never shows its signing panel on the new task. Pinned in **Task B3**.
4. **The signing spec cannot be fetched** (network error or 500). Expected: the caseworker gets the fallback form, not a stuck panel or a blank action area. Pinned in **Task B4**.
5. **The € 50.000 boundary and an empty amount.** Expected: exactly € 50.000 goes straight to ondertekening; anything above goes to memorandum; an amount never filled in does not break evaluation. The form defaults it to 0. Pinned in **Task A1** (rule text and form default), plus the evaluation check in **Task A6**.

---

# Part A — linked-data-explorer

Work in `C:\Users\gorts01\Development\linked-data-explorer` on branch `feat/besluitvorming-gedelegeerd`. Before Task A1, run `git switch feat/besluitvorming-gedelegeerd` and `git pull --ff-only`, and confirm with `git branch --show-current`.

Bundle folder (referred to as `$B` below): `packages/frontend/public/examples/flevoland/besluitvorming-gedelegeerd/`

### Task A1: Bundle consistency test and the DMN

**Files:**
- Create: `packages/backend/src/besluitvorming-gedelegeerd-bundle.test.ts`
- Create: `$B/gedelegeerd-besluit-route.dmn`

**Interfaces:**
- Produces: the test file, extended by A2, A3 and A4. Helpers in it: `BUNDLE` (absolute folder path), `readBundle(name)`, `formIds()`. DMN decision `GedelegeerdBesluitRoute`, with inputs `voorwaardenVervuld`, `binnenMandaat`, `politiekGevoelig`, `overwegingenDuidelijk`, `financieleGevolgen` and output `route` ∈ {`escaleren`, `memorandum`, `ondertekenen`}.

- [ ] **Step 1: Write the failing test**

Create `packages/backend/src/besluitvorming-gedelegeerd-bundle.test.ts`:

```ts
import fs from 'fs';
import path from 'path';
import { XMLParser } from 'fast-xml-parser';

/**
 * The "Besluitvorming onder gedelegeerde bevoegdheid" bundle is hand-written
 * BPMN, DMN, form and document files that reference each other by id and by
 * variable name. Nothing else checks those references before a deploy fails
 * on Operaton or a gateway finds no variable at runtime, so this test does.
 */
const REPO_ROOT = path.join(__dirname, '..', '..', '..');
const BUNDLE = path.join(
  REPO_ROOT,
  'packages',
  'frontend',
  'public',
  'examples',
  'flevoland',
  'besluitvorming-gedelegeerd'
);
const readBundle = (name: string) => fs.readFileSync(path.join(BUNDLE, name), 'utf8');
const formIds = () =>
  fs
    .readdirSync(BUNDLE)
    .filter((f) => f.endsWith('.form'))
    .map((f) => f.replace(/\.form$/, ''));

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
  isArray: (name) => ['input', 'rule', 'inputEntry'].includes(name),
});

describe('GedelegeerdBesluitRoute (DMN)', () => {
  const doc = parser.parse(readBundle('gedelegeerd-besluit-route.dmn'));
  const decision = doc.definitions.decision;
  const table = decision.decisionTable;
  const inputs = table.input.map((i: { inputExpression: { text: string } }) =>
    String(i.inputExpression.text).trim()
  );
  const rules = table.rule.map(
    (r: { inputEntry: Array<{ text: string }>; outputEntry: { text: string } }) => ({
      when: r.inputEntry.map((e) => String(e.text).trim()),
      then: String(r.outputEntry.text).trim(),
    })
  );

  it('is the decision the process calls, with hit policy FIRST', () => {
    expect(decision['@_id']).toBe('GedelegeerdBesluitRoute');
    expect(table['@_hitPolicy']).toBe('FIRST');
    expect(table.output['@_name']).toBe('route');
  });

  it('reads exactly the five inputs the forms produce, in order', () => {
    expect(inputs).toEqual([
      'voorwaardenVervuld',
      'binnenMandaat',
      'politiekGevoelig',
      'overwegingenDuidelijk',
      'financieleGevolgen',
    ]);
  });

  it('implements the diagram\'s beslisregels in order, escalation first', () => {
    expect(rules).toEqual([
      { when: ['false', '-', '-', '-', '-'], then: '"escaleren"' },
      { when: ['-', 'false', '-', '-', '-'], then: '"escaleren"' },
      { when: ['-', '-', 'true', '-', '-'], then: '"escaleren"' },
      { when: ['-', '-', '-', 'false', '-'], then: '"memorandum"' },
      // Strictly greater: exactly € 50.000 needs no memorandum.
      { when: ['-', '-', '-', '-', '> 50000'], then: '"memorandum"' },
      { when: ['-', '-', '-', '-', '-'], then: '"ondertekenen"' },
    ]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test --workspace=packages/backend -- --coverage=false besluitvorming-gedelegeerd-bundle`
Expected: FAIL with `ENOENT ... gedelegeerd-besluit-route.dmn`.

- [ ] **Step 3: Write the DMN**

Create `$B/gedelegeerd-besluit-route.dmn`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="https://www.omg.org/spec/DMN/20191111/MODEL/" xmlns:camunda="http://camunda.org/schema/1.0/dmn" xmlns:dmndi="https://www.omg.org/spec/DMN/20191111/DMNDI/" xmlns:dc="http://www.omg.org/spec/DMN/20180521/DC/" id="Definitions_GedelegeerdBesluitRoute" name="GedelegeerdBesluitRoute" namespace="http://example.com/besluitvorming-gedelegeerd/dmn" exporter="Camunda Modeler" exporterVersion="5.43.1">
  <decision id="GedelegeerdBesluitRoute" name="Route besluit onder gedelegeerde bevoegdheid" camunda:historyTimeToLive="365">
    <decisionTable id="DecisionTable_GedelegeerdBesluitRoute" hitPolicy="FIRST">
      <input id="Input_VoorwaardenVervuld" label="Zijn alle voorwaarden vervuld?">
        <inputExpression id="InputExpression_VoorwaardenVervuld" typeRef="boolean">
          <text>voorwaardenVervuld</text>
        </inputExpression>
      </input>
      <input id="Input_BinnenMandaat" label="Valt het besluit binnen de gedelegeerde bevoegdheid?">
        <inputExpression id="InputExpression_BinnenMandaat" typeRef="boolean">
          <text>binnenMandaat</text>
        </inputExpression>
      </input>
      <input id="Input_PolitiekGevoelig" label="Is het besluit politiek gevoelig?">
        <inputExpression id="InputExpression_PolitiekGevoelig" typeRef="boolean">
          <text>politiekGevoelig</text>
        </inputExpression>
      </input>
      <input id="Input_OverwegingenDuidelijk" label="Zijn aanleiding en overwegingen duidelijk?">
        <inputExpression id="InputExpression_OverwegingenDuidelijk" typeRef="boolean">
          <text>overwegingenDuidelijk</text>
        </inputExpression>
      </input>
      <input id="Input_FinancieleGevolgen" label="Financiële gevolgen (€)">
        <inputExpression id="InputExpression_FinancieleGevolgen" typeRef="double">
          <text>financieleGevolgen</text>
        </inputExpression>
      </input>
      <output id="Output_Route" label="Route" name="route" typeRef="string" />
      <rule id="Rule_VoorwaardenNietVervuld">
        <description>Escalatie: niet alle voorwaarden zijn vervuld.</description>
        <inputEntry id="Entry_R1_Voorwaarden"><text>false</text></inputEntry>
        <inputEntry id="Entry_R1_Mandaat"><text>-</text></inputEntry>
        <inputEntry id="Entry_R1_Politiek"><text>-</text></inputEntry>
        <inputEntry id="Entry_R1_Overwegingen"><text>-</text></inputEntry>
        <inputEntry id="Entry_R1_Financieel"><text>-</text></inputEntry>
        <outputEntry id="Output_R1"><text>"escaleren"</text></outputEntry>
      </rule>
      <rule id="Rule_BuitenMandaat">
        <description>Escalatie: het besluit valt buiten de gedelegeerde bevoegdheid.</description>
        <inputEntry id="Entry_R2_Voorwaarden"><text>-</text></inputEntry>
        <inputEntry id="Entry_R2_Mandaat"><text>false</text></inputEntry>
        <inputEntry id="Entry_R2_Politiek"><text>-</text></inputEntry>
        <inputEntry id="Entry_R2_Overwegingen"><text>-</text></inputEntry>
        <inputEntry id="Entry_R2_Financieel"><text>-</text></inputEntry>
        <outputEntry id="Output_R2"><text>"escaleren"</text></outputEntry>
      </rule>
      <rule id="Rule_PolitiekGevoelig">
        <description>Escalatie: het besluit is politiek gevoelig.</description>
        <inputEntry id="Entry_R3_Voorwaarden"><text>-</text></inputEntry>
        <inputEntry id="Entry_R3_Mandaat"><text>-</text></inputEntry>
        <inputEntry id="Entry_R3_Politiek"><text>true</text></inputEntry>
        <inputEntry id="Entry_R3_Overwegingen"><text>-</text></inputEntry>
        <inputEntry id="Entry_R3_Financieel"><text>-</text></inputEntry>
        <outputEntry id="Output_R3"><text>"escaleren"</text></outputEntry>
      </rule>
      <rule id="Rule_OverwegingenOnduidelijk">
        <description>Formeel memorandum: overwegingen en aandachtspunten zijn niet duidelijk.</description>
        <inputEntry id="Entry_R4_Voorwaarden"><text>-</text></inputEntry>
        <inputEntry id="Entry_R4_Mandaat"><text>-</text></inputEntry>
        <inputEntry id="Entry_R4_Politiek"><text>-</text></inputEntry>
        <inputEntry id="Entry_R4_Overwegingen"><text>false</text></inputEntry>
        <inputEntry id="Entry_R4_Financieel"><text>-</text></inputEntry>
        <outputEntry id="Output_R4"><text>"memorandum"</text></outputEntry>
      </rule>
      <rule id="Rule_FinancieelBoven50000">
        <description>Formeel memorandum: financiële gevolgen boven € 50.000.</description>
        <inputEntry id="Entry_R5_Voorwaarden"><text>-</text></inputEntry>
        <inputEntry id="Entry_R5_Mandaat"><text>-</text></inputEntry>
        <inputEntry id="Entry_R5_Politiek"><text>-</text></inputEntry>
        <inputEntry id="Entry_R5_Overwegingen"><text>-</text></inputEntry>
        <inputEntry id="Entry_R5_Financieel"><text>&gt; 50000</text></inputEntry>
        <outputEntry id="Output_R5"><text>"memorandum"</text></outputEntry>
      </rule>
      <rule id="Rule_DirectOndertekenen">
        <description>Alle voorwaarden vervuld, geen memorandum vereist: direct ter ondertekening.</description>
        <inputEntry id="Entry_R6_Voorwaarden"><text>-</text></inputEntry>
        <inputEntry id="Entry_R6_Mandaat"><text>-</text></inputEntry>
        <inputEntry id="Entry_R6_Politiek"><text>-</text></inputEntry>
        <inputEntry id="Entry_R6_Overwegingen"><text>-</text></inputEntry>
        <inputEntry id="Entry_R6_Financieel"><text>-</text></inputEntry>
        <outputEntry id="Output_R6"><text>"ondertekenen"</text></outputEntry>
      </rule>
    </decisionTable>
  </decision>
  <dmndi:DMNDI>
    <dmndi:DMNDiagram id="DMNDiagram_GedelegeerdBesluitRoute">
      <dmndi:DMNShape id="DMNShape_GedelegeerdBesluitRoute" dmnElementRef="GedelegeerdBesluitRoute">
        <dc:Bounds height="80" width="180" x="160" y="100" />
      </dmndi:DMNShape>
    </dmndi:DMNDiagram>
  </dmndi:DMNDI>
</definitions>
```

The `> 50000` entry is written `&gt; 50000` in XML; the parsed text the test reads is `> 50000`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test --workspace=packages/backend -- --coverage=false besluitvorming-gedelegeerd-bundle`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit** (ask first)

```bash
git add packages/backend/src/besluitvorming-gedelegeerd-bundle.test.ts "packages/frontend/public/examples/flevoland/besluitvorming-gedelegeerd/gedelegeerd-besluit-route.dmn"
git commit -F <scratchpad>/a1-msg.txt
```
Message: `feat(examples): routing DMN for besluitvorming onder gedelegeerde bevoegdheid`

### Task A2: The twelve forms

**Files:**
- Create: `$B/besluit-gb-*.form` (12 files), generated once by a scratchpad script that is **not committed**
- Modify: `packages/backend/src/besluitvorming-gedelegeerd-bundle.test.ts`

**Interfaces:**
- Consumes: `BUNDLE`, `readBundle`, `formIds` from A1.
- Produces: form ids and the variable keys listed in the spec's Forms table. Later tasks rely on these exact keys:
  - DMN inputs: `voorwaardenVervuld`, `binnenMandaat`, `politiekGevoelig`, `overwegingenDuidelijk`, `financieleGevolgen`.
  - Gateway conditions: `juridischAkkoord` ∈ {`akkoord`, `niet-akkoord`}, `approvalStatus` ∈ {`approved`, `rejected`}.
  - Document bindings: `onderwerp`, `besluitType`, `voorgesteldBesluit`, `motivering`, `financieleGevolgen`, `ondertekenaar`.

- [ ] **Step 1: Write the failing test**

Append to `besluitvorming-gedelegeerd-bundle.test.ts`:

```ts
type FormComponent = {
  key?: string;
  type: string;
  defaultValue?: unknown;
  values?: Array<{ value: string }>;
  validate?: { required?: boolean };
  readonly?: boolean;
};
const form = (id: string) =>
  JSON.parse(readBundle(`${id}.form`)) as { id: string; components: FormComponent[] };
const field = (formId: string, key: string) => {
  const c = form(formId).components.find((x) => x.key === key);
  if (!c) throw new Error(`${formId} has no field ${key}`);
  return c;
};

const FORMS = [
  'besluit-gb-sjabloon-kiezen',
  'besluit-gb-sjabloon-invullen',
  'besluit-gb-advies-toetsing',
  'besluit-gb-voorwaarden',
  'besluit-gb-memorandum',
  'besluit-gb-akkoord',
  'besluit-gb-indienen',
  'besluit-gb-ondertekenen',
  'besluit-gb-escalatie',
  'besluit-gb-besluit-nemen',
  'besluit-gb-registreren',
  'besluit-gb-archiveren',
];

describe('besluitvorming forms', () => {
  it('has exactly the twelve forms, each named after its own id', () => {
    expect(formIds().sort()).toEqual([...FORMS].sort());
    for (const id of FORMS) expect(form(id).id).toBe(id);
  });

  it('produces every DMN input, writable where it is produced', () => {
    expect(field('besluit-gb-sjabloon-invullen', 'financieleGevolgen').type).toBe('number');
    // The DMN compares it with > 50000; an amount never typed in must not reach it as null.
    expect(field('besluit-gb-sjabloon-invullen', 'financieleGevolgen').defaultValue).toBe(0);
    for (const [formId, key, def] of [
      ['besluit-gb-advies-toetsing', 'binnenMandaat', true],
      ['besluit-gb-advies-toetsing', 'politiekGevoelig', false],
      ['besluit-gb-voorwaarden', 'voorwaardenVervuld', false],
      ['besluit-gb-voorwaarden', 'overwegingenDuidelijk', true],
    ] as const) {
      const c = field(formId, key);
      expect(c.type).toBe('checkbox');
      expect(c.defaultValue).toBe(def);
      expect(c.readonly).toBeFalsy();
    }
  });

  it('gives each gateway radio exactly the string values its conditions test', () => {
    const values = (formId: string, key: string) =>
      (field(formId, key).values ?? []).map((v) => v.value);
    expect(values('besluit-gb-akkoord', 'juridischAkkoord')).toEqual(['akkoord', 'niet-akkoord']);
    expect(values('besluit-gb-ondertekenen', 'approvalStatus')).toEqual(['approved', 'rejected']);
    expect(field('besluit-gb-akkoord', 'juridischAkkoord').validate?.required).toBe(true);
    expect(field('besluit-gb-ondertekenen', 'approvalStatus').validate?.required).toBe(true);
  });

  it('collects every value the besluit document binds before it is signed', () => {
    for (const [formId, key] of [
      ['besluit-gb-sjabloon-kiezen', 'besluitType'],
      ['besluit-gb-sjabloon-invullen', 'onderwerp'],
      ['besluit-gb-sjabloon-invullen', 'motivering'],
      ['besluit-gb-sjabloon-invullen', 'voorgesteldBesluit'],
      ['besluit-gb-indienen', 'ondertekenaar'],
    ] as const) {
      const c = field(formId, key);
      expect(c.readonly).toBeFalsy();
      expect(c.validate?.required).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test --workspace=packages/backend -- --coverage=false besluitvorming-gedelegeerd-bundle`
Expected: FAIL in "has exactly the twelve forms" (`received []`).

- [ ] **Step 3: Write the form generator** (scratchpad, not committed)

Write `<scratchpad>/besluit-forms.js` with the Write tool:

```js
const fs = require('fs');
const path = require('path');
const B = 'packages/frontend/public/examples/flevoland/besluitvorming-gedelegeerd';

let n = 0;
const id = (p) => `Field_${p}_${++n}`;
const text = (t) => ({ id: id('Text'), type: 'text', text: t });
const ro = (key, label, type = 'textfield') => ({ id: id('Ro'), type, label, key, readonly: true, disabled: true });
const tf = (key, label, required = false) => ({ id: id('Tf'), type: 'textfield', label, key, ...(required ? { validate: { required: true } } : {}) });
const ta = (key, label, required = false) => ({ id: id('Ta'), type: 'textarea', label, key, ...(required ? { validate: { required: true } } : {}) });
const num = (key, label) => ({ id: id('Num'), type: 'number', label, key, defaultValue: 0, validate: { required: true, min: 0 } });
const cb = (key, label, defaultValue, required = false) => ({ id: id('Cb'), type: 'checkbox', label, key, defaultValue, ...(required ? { validate: { required: true } } : {}) });
const radio = (key, label, values) => ({ id: id('Radio'), type: 'radio', label, key, validate: { required: true }, values: values.map(([value, l]) => ({ label: l, value })) });
const select = (key, label, values) => ({ id: id('Select'), type: 'select', label, key, validate: { required: true }, values: values.map(([value, l]) => ({ label: l, value })) });
const submit = (label) => ({ id: id('Submit'), type: 'button', action: 'submit', label });

const BESLUITTYPES = [
  ['standaard', 'Standaardbesluit onder gedelegeerde bevoegdheid'],
  ['motivering', 'Besluit met motivering / nadere onderbouwing'],
  ['financieel', 'Financieel besluit > € 50.000'],
  ['buiten-delegatie', 'Besluit buiten delegatie'],
  ['specifiek', 'Overige specifieke besluiten'],
];

const FORMS = {
  'besluit-gb-sjabloon-kiezen': [
    text('# 1. Kies de juiste beslissingssjabloon'),
    text('Bepaal het type besluit en selecteer het bijbehorende sjabloon. De sjablonen staan in het DMS / intranet.'),
    text('| Type besluit | Sjabloon |\n|---|---|\n| Standaardbesluit onder gedelegeerde bevoegdheid | Besluittemplate |\n| Besluit met motivering / nadere onderbouwing | Besluit + Memorandum template |\n| Financieel besluit > € 50.000 | Financieel memorandum template |\n| Besluit buiten delegatie | Escalatie / indieningstemplate |\n| Overige specifieke besluiten | Specialistische template(s) |'),
    select('besluitType', 'Type besluit', BESLUITTYPES),
    submit('Sjabloon kiezen'),
  ],
  'besluit-gb-sjabloon-invullen': [
    text('# 2. Vul de sjabloon in'),
    ro('besluitType', 'Type besluit'),
    tf('onderwerp', 'Onderwerp', true),
    ta('motivering', 'Motivering / achtergrond', true),
    ta('relevanteGegevens', 'Relevante gegevens'),
    num('financieleGevolgen', 'Financiële gevolgen (€)'),
    ta('bijlagen', 'Bijlagen (indien van toepassing)'),
    ta('voorgesteldBesluit', 'Voorgesteld besluit', true),
    submit('Opslaan'),
  ],
  'besluit-gb-advies-toetsing': [
    text('# Advies en toetsing'),
    text('Toets het voorgestelde besluit en geef advies.'),
    ro('onderwerp', 'Onderwerp'),
    ro('voorgesteldBesluit', 'Voorgesteld besluit', 'textarea'),
    ro('financieleGevolgen', 'Financiële gevolgen (€)', 'number'),
    cb('toetsWetgeving', 'Getoetst aan wet- en regelgeving', false),
    cb('toetsBeleid', 'Getoetst aan provinciaal beleid', false),
    cb('toetsBegroting', 'Getoetst aan de begroting', false),
    cb('binnenMandaat', 'Het besluit valt binnen de gedelegeerde bevoegdheid', true),
    cb('politiekGevoelig', 'Het besluit is politiek gevoelig', false),
    ta('advies', 'Advies', true),
    submit('Advies vastleggen'),
  ],
  'besluit-gb-voorwaarden': [
    text('# 4. Controleer de voorwaarden voor gedelegeerde bevoegdheid'),
    ro('advies', 'Advies Juridische Zaken / Compliance', 'textarea'),
    text('Voorwaarden: wet- en regelgeving, provinciaal beleid, begroting en geen politieke gevoeligheid.'),
    cb('voorwaardenVervuld', 'Alle voorwaarden zijn vervuld', false),
    cb('overwegingenDuidelijk', 'De aanleiding en overwegingen zijn duidelijk', true),
    submit('Voorwaarden vastleggen'),
  ],
  'besluit-gb-memorandum': [
    text('# 5. Vul het memorandum in'),
    ta('aanleiding', 'Aanleiding', true),
    ta('overwegingen', 'Overwegingen', true),
    ta('risicos', "Risico's en aandachtspunten"),
    ta('financieleToelichting', 'Financiële gevolgen (toelichting)'),
    submit('Memorandum opslaan'),
  ],
  'besluit-gb-akkoord': [
    text('# Verstrek advies / akkoord'),
    ro('aanleiding', 'Aanleiding', 'textarea'),
    ro('overwegingen', 'Overwegingen', 'textarea'),
    ro('risicos', "Risico's en aandachtspunten", 'textarea'),
    radio('juridischAkkoord', 'Akkoord', [['akkoord', 'Akkoord'], ['niet-akkoord', 'Niet akkoord — escaleren']]),
    ta('akkoordToelichting', 'Toelichting'),
    submit('Vastleggen'),
  ],
  'besluit-gb-indienen': [
    text('# 6. Dien het besluit in voor ondertekening'),
    ro('onderwerp', 'Onderwerp'),
    ro('voorgesteldBesluit', 'Voorgesteld besluit', 'textarea'),
    cb('documentenCompleet', 'Alle documenten zijn toegevoegd en volledig', false, true),
    tf('ondertekenaar', 'Gemachtigde ondertekenaar (naam)', true),
    submit('Indienen'),
  ],
  'besluit-gb-ondertekenen': [
    text('# Onderteken het besluit'),
    text('Controleer de volledigheid en bevestig je bevoegdheid. Ondertekenen gaat normaal via ValidSign; dit formulier is de terugvaloptie.'),
    ro('onderwerp', 'Onderwerp'),
    ro('voorgesteldBesluit', 'Voorgesteld besluit', 'textarea'),
    radio('approvalStatus', 'Ondertekening', [['approved', 'Ondertekend'], ['rejected', 'Niet ondertekend — terug naar indiener']]),
    ta('ondertekenToelichting', 'Toelichting'),
    submit('Vastleggen'),
  ],
  'besluit-gb-escalatie': [
    text('# Escaleren naar bevoegde bestuursautoriteit'),
    ro('onderwerp', 'Onderwerp'),
    ro('advies', 'Advies Juridische Zaken / Compliance', 'textarea'),
    ta('escalatieReden', 'Reden van escalatie', true),
    submit('Escaleren'),
  ],
  'besluit-gb-besluit-nemen': [
    text('# Neem besluit'),
    text('Het besluit valt buiten de gedelegeerde bevoegdheid of is geëscaleerd.'),
    ro('onderwerp', 'Onderwerp'),
    ro('voorgesteldBesluit', 'Voorgesteld besluit', 'textarea'),
    ro('escalatieReden', 'Reden van escalatie', 'textarea'),
    radio('besluitUitkomst', 'Besluit', [['genomen', 'Besluit genomen'], ['afgewezen', 'Besluit afgewezen']]),
    ta('besluitToelichting', 'Toelichting'),
    submit('Besluit vastleggen'),
  ],
  'besluit-gb-registreren': [
    text('# Ontvang en registreer'),
    ro('onderwerp', 'Onderwerp'),
    tf('zaaknummer', 'Zaaknummer (zaaksysteem)', true),
    tf('kenmerk', 'Kenmerk / dossiernummer', true),
    cb('documentenGekoppeld', 'Documenten gekoppeld in het zaaksysteem', false),
    submit('Registreren'),
  ],
  'besluit-gb-archiveren': [
    text('# Archiveer'),
    ro('zaaknummer', 'Zaaknummer'),
    ro('kenmerk', 'Kenmerk'),
    select('bewaartermijn', 'Bewaartermijn', [['5', '5 jaar'], ['10', '10 jaar'], ['20', '20 jaar'], ['permanent', 'Permanent']]),
    cb('toegankelijkOpgeslagen', 'Toegankelijk opgeslagen', false, true),
    submit('Archiveren'),
  ],
};

fs.mkdirSync(B, { recursive: true });
for (const [formId, components] of Object.entries(FORMS)) {
  n = 0;
  const json = {
    schemaVersion: 16,
    type: 'default',
    id: formId,
    executionPlatform: 'Camunda Platform',
    executionPlatformVersion: '7.21.0',
    components,
  };
  fs.writeFileSync(path.join(B, `${formId}.form`), JSON.stringify(json, null, 2) + '\n');
}
console.log(`wrote ${Object.keys(FORMS).length} forms`);
```

- [ ] **Step 4: Generate the forms**

Run: `node <scratchpad>/besluit-forms.js`
Expected: `wrote 12 forms`

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test --workspace=packages/backend -- --coverage=false besluitvorming-gedelegeerd-bundle`
Expected: PASS, 7 tests.

- [ ] **Step 6: Commit** (ask first)

```bash
git add "packages/frontend/public/examples/flevoland/besluitvorming-gedelegeerd/"*.form packages/backend/src/besluitvorming-gedelegeerd-bundle.test.ts
git commit -F <scratchpad>/a2-msg.txt
```
Message: `feat(examples): twelve Dutch forms for besluitvorming onder gedelegeerde bevoegdheid`

### Task A3: The BPMN, in six lanes with declared phases

**Files:**
- Create: `$B/GedelegeerdBesluitProcess.bpmn`, generated once by a scratchpad script that is **not committed**
- Modify: `packages/backend/src/besluitvorming-gedelegeerd-bundle.test.ts`

**Interfaces:**
- Consumes: the forms (A2), the DMN (A1), and the document id `besluit-gb-besluit` (A4 creates the file; the test in this task only checks that the BPMN references it).
- Produces: process `GedelegeerdBesluitProcess` with the element ids, lanes and phases of the spec. RBA Task B6 copies this file in as a fixture.

- [ ] **Step 1: Write the failing test**

Append to `besluitvorming-gedelegeerd-bundle.test.ts`:

```ts
describe('GedelegeerdBesluitProcess (BPMN)', () => {
  const bpmnParser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    removeNSPrefix: true,
    isArray: (name) =>
      ['lane', 'flowNodeRef', 'userTask', 'sequenceFlow', 'exclusiveGateway'].includes(name),
  });
  const xml = readBundle('GedelegeerdBesluitProcess.bpmn');
  const process = bpmnParser.parse(xml).definitions.process;
  const userTasks: Array<Record<string, string>> = process.userTask;
  const lanes: Array<{ '@_id': string; '@_name': string; flowNodeRef: string[] }> =
    process.laneSet.lane;
  const laneOf = (nodeId: string) => lanes.find((l) => l.flowNodeRef.includes(nodeId))?.['@_id'];

  it('is the flevoland, Dutch process the seeds and RBA expect', () => {
    expect(process['@_id']).toBe('GedelegeerdBesluitProcess');
    expect(process['@_name']).toBe('Besluitvorming onder gedelegeerde bevoegdheid');
    expect(process['@_organization']).toBe('flevoland');
    expect(process['@_language']).toBe('nl');
    expect(process['@_isExecutable']).toBe('true');
  });

  it('draws the six lanes in the diagram\'s order', () => {
    expect(lanes.map((l) => [l['@_id'], l['@_name']])).toEqual([
      ['Lane_Indiener', 'Aanvrager / Indiener'],
      ['Lane_Juridisch', 'Juridische Zaken / Compliance'],
      ['Lane_Systeem', 'Systeem'],
      ['Lane_Bestuursautoriteit', 'Bevoegde bestuursautoriteit'],
      ['Lane_Ondertekenaar', 'Gemachtigde ondertekenaar'],
      ['Lane_Registratie', 'Registratie & Beheer'],
    ]);
  });

  it('gives every user task a deployed form and its own lane\'s role', () => {
    const ROLE: Record<string, string> = {
      Lane_Indiener: 'besluit-indiener',
      Lane_Juridisch: 'besluit-jurist',
      Lane_Bestuursautoriteit: 'besluit-bestuursautoriteit',
      Lane_Ondertekenaar: 'besluit-ondertekenaar',
      Lane_Registratie: 'besluit-registratie',
    };
    expect(userTasks).toHaveLength(12);
    for (const t of userTasks) {
      expect(formIds()).toContain(t['@_formRef']);
      expect(t['@_formRefBinding']).toBe('deployment');
      expect(t['@_candidateGroups']).toBe(ROLE[laneOf(t['@_id'])!]);
    }
  });

  it('calls the shared DMN untenanted, and signs the besluit document', () => {
    const rule = process.businessRuleTask;
    expect(rule['@_decisionRef']).toBe('GedelegeerdBesluitRoute');
    expect(rule['@_decisionRefTenantId']).toBe('${null}');
    expect(rule['@_resultVariable']).toBe('besluitRoute');
    expect(rule['@_mapDecisionResult']).toBe('singleEntry');
    const task = (id: string) => userTasks.find((t) => t['@_id'] === id)!;
    expect(task('Task_Onderteken')['@_signatureRef']).toBe('besluit-gb-besluit');
    expect(task('Task_NeemBesluit')['@_documentRef']).toBe('besluit-gb-besluit');
  });

  it('declares six phases and marks the node that starts each one', () => {
    expect(process['@_phaseLabel']).toBe('Fase');
    expect(process['@_phases']).toBe(
      'voorbereiding:Voorbereiding;toetsing:Advies en toetsing;memorandum:Memorandum;' +
        'ondertekening:Ondertekening;escalatie:Escalatie;registratie:Registratie en archivering'
    );
    const markers = [...xml.matchAll(/id="([^"]+)"[^>]*ronl:phase="([^"]+)"/g)].map((m) => [
      m[1],
      m[2],
    ]);
    expect(markers).toEqual([
      ['StartEvent_Besluit', 'voorbereiding'],
      ['Task_AdviesToetsing', 'toetsing'],
      ['Task_Memorandum', 'memorandum'],
      ['Task_DienIn', 'ondertekening'],
      ['Task_Escaleren', 'escalatie'],
      ['Task_Registreer', 'registratie'],
    ]);
  });

  it('tests in its gateways only values the DMN and forms produce', () => {
    const conditions = process.sequenceFlow
      .filter((f: { conditionExpression?: unknown }) => f.conditionExpression)
      .map((f: { conditionExpression: { '#text': string } }) => f.conditionExpression['#text']);
    expect(conditions.sort()).toEqual(
      [
        '${besluitRoute == "escaleren"}',
        '${besluitRoute != "escaleren"}',
        '${besluitRoute == "memorandum"}',
        '${besluitRoute == "ondertekenen"}',
        '${juridischAkkoord == "akkoord"}',
        '${juridischAkkoord == "niet-akkoord"}',
        '${approvalStatus == "approved"}',
        '${approvalStatus == "rejected"}',
      ].sort()
    );
  });

  it('keeps the schema\'s element order: laneSet, flow elements, no artifacts', () => {
    const body = xml.slice(xml.indexOf('<bpmn:process'), xml.indexOf('</bpmn:process>'));
    expect(body.indexOf('<bpmn:laneSet')).toBeLessThan(body.indexOf('<bpmn:startEvent'));
    expect(body).not.toMatch(/<bpmn:(textAnnotation|association)\b/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test --workspace=packages/backend -- --coverage=false besluitvorming-gedelegeerd-bundle`
Expected: FAIL with `ENOENT ... GedelegeerdBesluitProcess.bpmn`.

- [ ] **Step 3: Write the BPMN generator** (scratchpad, not committed)

Write `<scratchpad>/besluit-bpmn.js` with the Write tool. Coordinates are the starting layout: the escalation path crosses the middle lanes, so a few crossings are expected. The user reviews it visually in the Modeler and may tidy it there.

```js
const fs = require('fs');
const OUT = 'packages/frontend/public/examples/flevoland/besluitvorming-gedelegeerd/GedelegeerdBesluitProcess.bpmn';
const NAME = 'Besluitvorming onder gedelegeerde bevoegdheid';
const PHASES = 'voorbereiding:Voorbereiding;toetsing:Advies en toetsing;memorandum:Memorandum;ondertekening:Ondertekening;escalatie:Escalatie;registratie:Registratie en archivering';
const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// [laneId, name, role, y, height]
const LANES = [
  ['Lane_Indiener', 'Aanvrager / Indiener', 'besluit-indiener', 60, 280],
  ['Lane_Juridisch', 'Juridische Zaken / Compliance', 'besluit-jurist', 340, 140],
  ['Lane_Systeem', 'Systeem', null, 480, 140],
  ['Lane_Bestuursautoriteit', 'Bevoegde bestuursautoriteit', 'besluit-bestuursautoriteit', 620, 140],
  ['Lane_Ondertekenaar', 'Gemachtigde ondertekenaar', 'besluit-ondertekenaar', 760, 140],
  ['Lane_Registratie', 'Registratie & Beheer', 'besluit-registratie', 900, 140],
];
const POOL = [100, 60, 2860, 980];

// [id, element, name, lane, [x, y, w, h], attrs, label bounds?]
const T = (x, y) => [x, y, 160, 80];
const G = (x, y) => [x, y, 50, 50];
const E = (x, y) => [x, y, 36, 36];
const user = (form, extra = '') => `camunda:formRef="${form}" camunda:formRefBinding="deployment"${extra}`;
const NODES = [
  ['StartEvent_Besluit', 'startEvent', 'Besluit voorbereiden', 'Lane_Indiener', E(192, 112), 'ronl:phase="voorbereiding"', [170, 155, 80, 27]],
  ['Task_KiesSjabloon', 'userTask', '1. Kies de juiste beslissingssjabloon', 'Lane_Indiener', T(270, 90), user('besluit-gb-sjabloon-kiezen')],
  ['Task_VulSjabloonIn', 'userTask', '2. Vul de sjabloon in', 'Lane_Indiener', T(470, 90), user('besluit-gb-sjabloon-invullen')],
  ['Task_AdviesToetsing', 'userTask', 'Advies en toetsing', 'Lane_Juridisch', T(670, 370), 'ronl:phase="toetsing" ' + user('besluit-gb-advies-toetsing')],
  ['Task_ControleerVoorwaarden', 'userTask', '4. Controleer de voorwaarden voor gedelegeerde bevoegdheid', 'Lane_Indiener', T(870, 90), user('besluit-gb-voorwaarden')],
  ['Task_Beslisregels', 'businessRuleTask', 'Beslisregels toepassen', 'Lane_Systeem', T(1070, 510), 'camunda:resultVariable="besluitRoute" camunda:decisionRef="GedelegeerdBesluitRoute" camunda:decisionRefTenantId="${null}" camunda:mapDecisionResult="singleEntry"'],
  ['Gateway_VoorwaardenVervuld', 'exclusiveGateway', 'Zijn alle voorwaarden vervuld?', 'Lane_Systeem', G(1285, 525), '', [1265, 485, 90, 27]],
  ['Gateway_Memorandum', 'exclusiveGateway', 'Is een formeel memorandum vereist?', 'Lane_Systeem', G(1395, 525), '', [1375, 580, 90, 40]],
  ['Task_Memorandum', 'userTask', '5. Vul het memorandum in', 'Lane_Indiener', T(1500, 90), 'ronl:phase="memorandum" ' + user('besluit-gb-memorandum')],
  ['Task_AdviesAkkoord', 'userTask', 'Verstrek advies / akkoord', 'Lane_Juridisch', T(1700, 370), user('besluit-gb-akkoord')],
  ['Gateway_Akkoord', 'exclusiveGateway', 'Akkoord?', 'Lane_Juridisch', G(1915, 385), '', [1918, 440, 45, 14]],
  ['Task_DienIn', 'userTask', '6. Dien het besluit in voor ondertekening', 'Lane_Indiener', T(2020, 90), 'ronl:phase="ondertekening" ' + user('besluit-gb-indienen')],
  ['Task_Escaleren', 'userTask', 'Escaleren naar bevoegde bestuursautoriteit', 'Lane_Indiener', T(2230, 230), 'ronl:phase="escalatie" ' + user('besluit-gb-escalatie')],
  ['Task_NeemBesluit', 'userTask', 'Neem besluit', 'Lane_Bestuursautoriteit', T(2230, 650), user('besluit-gb-besluit-nemen', ' ronl:documentRef="besluit-gb-besluit"')],
  ['Task_Onderteken', 'userTask', 'Onderteken het besluit', 'Lane_Ondertekenaar', T(2020, 790), user('besluit-gb-ondertekenen', ' ronl:signatureRef="besluit-gb-besluit"')],
  ['Gateway_Ondertekend', 'exclusiveGateway', 'Ondertekend?', 'Lane_Ondertekenaar', G(2235, 805), '', [2292, 812, 70, 14]],
  ['Task_Registreer', 'userTask', 'Ontvang en registreer', 'Lane_Registratie', T(2440, 930), 'ronl:phase="registratie" ' + user('besluit-gb-registreren')],
  ['Task_Archiveer', 'userTask', 'Archiveer', 'Lane_Registratie', T(2650, 930), user('besluit-gb-archiveren')],
  ['EndEvent_Besluit', 'endEvent', 'Besluit gearchiveerd', 'Lane_Registratie', E(2862, 952), '', [2840, 995, 80, 27]],
];

// [id, from, to, name, condition, waypoints, label bounds?]
const FLOWS = [
  ['Flow_Start_Kies', 'StartEvent_Besluit', 'Task_KiesSjabloon', '', '', [[228, 130], [270, 130]]],
  ['Flow_Kies_Vul', 'Task_KiesSjabloon', 'Task_VulSjabloonIn', '', '', [[430, 130], [470, 130]]],
  ['Flow_Vul_Advies', 'Task_VulSjabloonIn', 'Task_AdviesToetsing', '', '', [[630, 130], [650, 130], [650, 410], [670, 410]]],
  ['Flow_Advies_Controleer', 'Task_AdviesToetsing', 'Task_ControleerVoorwaarden', '', '', [[830, 410], [850, 410], [850, 130], [870, 130]]],
  ['Flow_Controleer_Beslisregels', 'Task_ControleerVoorwaarden', 'Task_Beslisregels', '', '', [[1030, 130], [1050, 130], [1050, 550], [1070, 550]]],
  ['Flow_Beslisregels_Voorwaarden', 'Task_Beslisregels', 'Gateway_VoorwaardenVervuld', '', '', [[1230, 550], [1285, 550]]],
  ['Flow_Voorwaarden_Ja', 'Gateway_VoorwaardenVervuld', 'Gateway_Memorandum', 'ja', '${besluitRoute != "escaleren"}', [[1335, 550], [1395, 550]], [1352, 532, 15, 14]],
  ['Flow_Voorwaarden_Nee', 'Gateway_VoorwaardenVervuld', 'Task_Escaleren', 'nee', '${besluitRoute == "escaleren"}', [[1310, 575], [1310, 600], [2270, 600], [2270, 310]], [1316, 580, 20, 14]],
  ['Flow_Memorandum_Ja', 'Gateway_Memorandum', 'Task_Memorandum', 'ja', '${besluitRoute == "memorandum"}', [[1420, 525], [1420, 130], [1500, 130]], [1426, 500, 15, 14]],
  ['Flow_Memorandum_Nee', 'Gateway_Memorandum', 'Task_DienIn', 'nee', '${besluitRoute == "ondertekenen"}', [[1445, 550], [1990, 550], [1990, 150], [2020, 150]], [1452, 532, 20, 14]],
  ['Flow_MemorandumTask_Advies', 'Task_Memorandum', 'Task_AdviesAkkoord', '', '', [[1660, 130], [1680, 130], [1680, 410], [1700, 410]]],
  ['Flow_AdviesAkkoord_Gateway', 'Task_AdviesAkkoord', 'Gateway_Akkoord', '', '', [[1860, 410], [1915, 410]]],
  ['Flow_Akkoord_Ja', 'Gateway_Akkoord', 'Task_DienIn', 'akkoord', '${juridischAkkoord == "akkoord"}', [[1940, 385], [1940, 110], [2020, 110]], [1946, 362, 40, 14]],
  ['Flow_Akkoord_Nee', 'Gateway_Akkoord', 'Task_Escaleren', 'niet akkoord', '${juridischAkkoord == "niet-akkoord"}', [[1965, 410], [2330, 410], [2330, 310]], [1972, 392, 60, 14]],
  ['Flow_DienIn_Onderteken', 'Task_DienIn', 'Task_Onderteken', '', '', [[2100, 170], [2100, 790]]],
  ['Flow_Onderteken_Gateway', 'Task_Onderteken', 'Gateway_Ondertekend', '', '', [[2180, 830], [2235, 830]]],
  ['Flow_Ondertekend_Ja', 'Gateway_Ondertekend', 'Task_Registreer', 'ja', '${approvalStatus == "approved"}', [[2260, 855], [2260, 970], [2440, 970]], [2266, 880, 15, 14]],
  ['Flow_Ondertekend_Nee', 'Gateway_Ondertekend', 'Task_DienIn', 'nee', '${approvalStatus == "rejected"}', [[2260, 805], [2260, 780], [2200, 780], [2200, 150], [2180, 150]], [2206, 760, 20, 14]],
  ['Flow_Escaleren_NeemBesluit', 'Task_Escaleren', 'Task_NeemBesluit', '', '', [[2310, 310], [2310, 650]]],
  ['Flow_NeemBesluit_Registreer', 'Task_NeemBesluit', 'Task_Registreer', '', '', [[2390, 690], [2520, 690], [2520, 930]]],
  ['Flow_Registreer_Archiveer', 'Task_Registreer', 'Task_Archiveer', '', '', [[2600, 970], [2650, 970]]],
  ['Flow_Archiveer_End', 'Task_Archiveer', 'EndEvent_Besluit', '', '', [[2810, 970], [2862, 970]]],
];

const B = ([x, y, w, h]) => `<dc:Bounds x="${x}" y="${y}" width="${w}" height="${h}" />`;
const incoming = (id) => FLOWS.filter((f) => f[2] === id).map((f) => `      <bpmn:incoming>${f[0]}</bpmn:incoming>\n`).join('');
const outgoing = (id) => FLOWS.filter((f) => f[1] === id).map((f) => `      <bpmn:outgoing>${f[0]}</bpmn:outgoing>\n`).join('');
const roleOf = (lane) => LANES.find((l) => l[0] === lane)[2];

let x = '';
x += '<?xml version="1.0" encoding="UTF-8"?>\n';
x += '<bpmn:definitions xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" xmlns:camunda="http://camunda.org/schema/1.0/bpmn" xmlns:ronl="http://ronl.nl/schema/1.0" id="Definitions_GedelegeerdBesluit" targetNamespace="http://example.com/besluitvorming-gedelegeerd" exporter="Camunda Modeler" exporterVersion="5.43.1">\n';
x += '  <bpmn:collaboration id="Collaboration_GedelegeerdBesluit">\n';
x += `    <bpmn:participant id="Participant_GedelegeerdBesluit" name="${NAME}" processRef="GedelegeerdBesluitProcess" />\n`;
x += '  </bpmn:collaboration>\n';
x += `  <bpmn:process id="GedelegeerdBesluitProcess" name="${NAME}" isExecutable="true" camunda:historyTimeToLive="365" ronl:organization="flevoland" ronl:language="nl" ronl:phases="${PHASES}" ronl:phaseLabel="Fase">\n`;
x += '    <bpmn:laneSet id="LaneSet_GedelegeerdBesluit">\n';
for (const [laneId, name] of LANES) {
  x += `      <bpmn:lane id="${laneId}" name="${esc(name)}">\n`;
  for (const n of NODES.filter((n) => n[3] === laneId)) x += `        <bpmn:flowNodeRef>${n[0]}</bpmn:flowNodeRef>\n`;
  x += '      </bpmn:lane>\n';
}
x += '    </bpmn:laneSet>\n';
for (const [id, el, name, lane, , attrs] of NODES) {
  const groups = el === 'userTask' ? ` camunda:candidateGroups="${roleOf(lane)}"` : '';
  x += `    <bpmn:${el} id="${id}" name="${esc(name)}"${attrs ? ' ' + attrs : ''}${groups}>\n${incoming(id)}${outgoing(id)}    </bpmn:${el}>\n`;
}
for (const [id, from, to, name, cond] of FLOWS) {
  const nm = name ? ` name="${esc(name)}"` : '';
  if (cond) {
    x += `    <bpmn:sequenceFlow id="${id}"${nm} sourceRef="${from}" targetRef="${to}">\n      <bpmn:conditionExpression xsi:type="bpmn:tFormalExpression">${esc(cond)}</bpmn:conditionExpression>\n    </bpmn:sequenceFlow>\n`;
  } else {
    x += `    <bpmn:sequenceFlow id="${id}" sourceRef="${from}" targetRef="${to}" />\n`;
  }
}
x += '  </bpmn:process>\n';
x += '  <bpmndi:BPMNDiagram id="BPMNDiagram_GedelegeerdBesluit">\n';
x += '    <bpmndi:BPMNPlane id="BPMNPlane_GedelegeerdBesluit" bpmnElement="Collaboration_GedelegeerdBesluit">\n';
x += `      <bpmndi:BPMNShape id="Participant_GedelegeerdBesluit_di" bpmnElement="Participant_GedelegeerdBesluit" isHorizontal="true">\n        ${B(POOL)}\n      </bpmndi:BPMNShape>\n`;
for (const [laneId, , , y, h] of LANES) {
  x += `      <bpmndi:BPMNShape id="${laneId}_di" bpmnElement="${laneId}" isHorizontal="true">\n        ${B([POOL[0] + 30, y, POOL[2] - 30, h])}\n      </bpmndi:BPMNShape>\n`;
}
for (const [id, el, , , bounds, , label] of NODES) {
  const marker = el === 'exclusiveGateway' ? ' isMarkerVisible="true"' : '';
  x += `      <bpmndi:BPMNShape id="${id}_di" bpmnElement="${id}"${marker}>\n        ${B(bounds)}\n`;
  if (label) x += `        <bpmndi:BPMNLabel>\n          ${B(label)}\n        </bpmndi:BPMNLabel>\n`;
  x += '      </bpmndi:BPMNShape>\n';
}
for (const [id, , , , , wps, label] of FLOWS) {
  x += `      <bpmndi:BPMNEdge id="${id}_di" bpmnElement="${id}">\n`;
  for (const [px, py] of wps) x += `        <di:waypoint x="${px}" y="${py}" />\n`;
  if (label) x += `        <bpmndi:BPMNLabel>\n          ${B(label)}\n        </bpmndi:BPMNLabel>\n`;
  x += '      </bpmndi:BPMNEdge>\n';
}
x += '    </bpmndi:BPMNPlane>\n  </bpmndi:BPMNDiagram>\n</bpmn:definitions>\n';
fs.writeFileSync(OUT, x);
console.log('wrote', OUT);
```

The marker test in Step 1 matches `id="..."` followed by `ronl:phase="..."` on the same tag. The generator writes `id`, `name`, then the attributes, so `ronl:phase` always follows `id` on its own element.

- [ ] **Step 4: Generate the BPMN**

Run: `node <scratchpad>/besluit-bpmn.js`
Expected: `wrote packages/frontend/public/examples/flevoland/besluitvorming-gedelegeerd/GedelegeerdBesluitProcess.bpmn`

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test --workspace=packages/backend -- --coverage=false besluitvorming-gedelegeerd-bundle`
Expected: PASS, 14 tests.

- [ ] **Step 6: Structural check** (scratchpad, not committed)

Write `<scratchpad>/check-lanes.mjs` with the Write tool. It is the same check used for the HR and Zorgtoeslag redraws:

```js
import fs from 'fs';
import { BpmnModdle } from 'bpmn-moddle';
const f = process.argv[2];
const xml = fs.readFileSync(f, 'utf8');
const { rootElement, warnings } = await new BpmnModdle().fromXML(xml);
const proc = rootElement.rootElements.find((e) => e.$type === 'bpmn:Process');
const di = new Map(rootElement.diagrams[0].plane.planeElement.map((p) => [p.bpmnElement?.id, p]));
const problems = warnings.map((w) => 'warning: ' + w.message);
const lanes = proc.laneSets[0].lanes;
for (const n of proc.flowElements.filter((e) => e.$type !== 'bpmn:SequenceFlow')) {
  const ls = lanes.filter((l) => (l.flowNodeRef || []).includes(n));
  if (ls.length !== 1) { problems.push(`${n.id} in ${ls.length} lanes`); continue; }
  const b = di.get(n.id)?.bounds, lb = di.get(ls[0].id)?.bounds;
  if (!b || !lb) { problems.push(`${n.id} missing DI`); continue; }
  if (b.x < lb.x || b.y < lb.y || b.x + b.width > lb.x + lb.width || b.y + b.height > lb.y + lb.height) problems.push(`${n.id} outside ${ls[0].id}`);
}
for (const e of proc.flowElements) if (!di.get(e.id)) problems.push(`${e.id} missing DI`);
console.log(problems.length ? problems : 'OK');
```

Copy it into the repo root as `.check-tmp.mjs`, so that `bpmn-moddle` resolves from `node_modules`. Run it, then delete it:

Run: `cp <scratchpad>/check-lanes.mjs ./.check-tmp.mjs && node ./.check-tmp.mjs "packages/frontend/public/examples/flevoland/besluitvorming-gedelegeerd/GedelegeerdBesluitProcess.bpmn"; rm ./.check-tmp.mjs`
Expected: `OK`

- [ ] **Step 7: Commit** (ask first)

```bash
git add "packages/frontend/public/examples/flevoland/besluitvorming-gedelegeerd/GedelegeerdBesluitProcess.bpmn" packages/backend/src/besluitvorming-gedelegeerd-bundle.test.ts
git commit -F <scratchpad>/a3-msg.txt
```
Message: `feat(examples): GedelegeerdBesluitProcess in six lanes with six declared phases`

### Task A4: The besluit document

**Files:**
- Create: `$B/besluit-gb-besluit.document`
- Modify: `packages/frontend/src/components/DocumentComposer/defaultTemplates.ts` (end of file: constant and `DEFAULT_TEMPLATES`)
- Modify: `packages/frontend/src/components/DocumentComposer/defaultTemplates.test.ts`
- Modify: `packages/backend/src/besluitvorming-gedelegeerd-bundle.test.ts`

**Interfaces:**
- Consumes: the variable keys from A2.
- Produces: `export const BESLUIT_GB_BESLUIT: DocumentTemplate` in `defaultTemplates.ts`, parsed from the `.document` file through Vite's `?raw` import. The file is the single source, so the seed and the deployable copy cannot drift. It is listed last in `DEFAULT_TEMPLATES`.

**Spec deviation:** the spec's reference zone shows `{{kenmerk}}`, but `kenmerk` is only set at "Ontvang en registreer", after signing, so it would render empty on the signed PDF. The reference zone shows `{{onderwerp}}` and `{{besluitType}}` instead, and `kenmerk` is not bound.

- [ ] **Step 1: Write the failing tests**

In `defaultTemplates.test.ts`, add `BESLUIT_GB_BESLUIT,` to the import list (alphabetically first). Extend the `exports every named template exactly once` expectation, so that the array ends with:

```ts
      THUISBATTERIJ_SUBSIDIE_BESCHIKKING,
      BESLUIT_GB_BESLUIT,
    ]);
```

Append:

```ts
describe('BESLUIT_GB_BESLUIT', () => {
  test('is the signable besluit of the gedelegeerde-bevoegdheid bundle', () => {
    expect(BESLUIT_GB_BESLUIT.id).toBe('besluit-gb-besluit');
    expect(BESLUIT_GB_BESLUIT.processKey).toBe('GedelegeerdBesluitProcess');
    expect(BESLUIT_GB_BESLUIT.language).toBe('nl');
    expect(BESLUIT_GB_BESLUIT.organization).toBe('flevoland');
  });

  test('carries the default Dutch besluit text in its body', () => {
    expect(JSON.stringify(BESLUIT_GB_BESLUIT.zones.body)).toContain(
      'Besluiten tot het aangaan, wijzigen, beëindigen verplichtingen d.m.v. opdrachtbon, -brief, overeenkomst of anderszins voor: het leveren van zaken, verrichten van diensten en uitvoeren van werken.'
    );
  });

  test('has a text block opening its signOff zone, where ValidSign anchors the signature field', () => {
    expect(BESLUIT_GB_BESLUIT.zones.signOff?.blocks[0].type).toBe('text');
  });
});
```

Append to `besluitvorming-gedelegeerd-bundle.test.ts`:

```ts
describe('besluit-gb-besluit (document)', () => {
  const doc = JSON.parse(readBundle('besluit-gb-besluit.document'));

  it('is the document the BPMN signs and attaches', () => {
    expect(doc.id).toBe('besluit-gb-besluit');
    expect(doc.processKey).toBe('GedelegeerdBesluitProcess');
  });

  it('binds only variables the forms set before Onderteken', () => {
    expect(doc.bindings.map((b: { variableKey: string }) => b.variableKey).sort()).toEqual(
      ['besluitType', 'financieleGevolgen', 'motivering', 'ondertekenaar', 'onderwerp', 'voorgesteldBesluit'].sort()
    );
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx --workspace=packages/frontend vitest run --coverage.enabled=false src/components/DocumentComposer/defaultTemplates.test.ts`
Expected: FAIL. `BESLUIT_GB_BESLUIT` is not exported.

Run: `npm test --workspace=packages/backend -- --coverage=false besluitvorming-gedelegeerd-bundle`
Expected: FAIL with `ENOENT ... besluit-gb-besluit.document`.

- [ ] **Step 3: Write the document**

Create `$B/besluit-gb-besluit.document`:

```json
{
  "id": "besluit-gb-besluit",
  "name": "Besluit onder gedelegeerde bevoegdheid",
  "description": "Besluit genomen onder gedelegeerde bevoegdheid, ter ondertekening door de gemachtigde ondertekenaar via ValidSign.",
  "processKey": "GedelegeerdBesluitProcess",
  "serviceId": "GedelegeerdBesluit",
  "schemaVersion": 1,
  "readonly": false,
  "status": "example",
  "language": "nl",
  "organization": "flevoland",
  "createdAt": "2026-10-02T09:00:00.000Z",
  "updatedAt": "2026-10-02T09:00:00.000Z",
  "assets": [],
  "bindings": [
    { "id": "b1", "placeholder": "{{onderwerp}}", "variableKey": "onderwerp", "source": "process", "label": "Onderwerp" },
    { "id": "b2", "placeholder": "{{besluitType}}", "variableKey": "besluitType", "source": "process", "label": "Type besluit" },
    { "id": "b3", "placeholder": "{{voorgesteldBesluit}}", "variableKey": "voorgesteldBesluit", "source": "process", "label": "Besluit" },
    { "id": "b4", "placeholder": "{{motivering}}", "variableKey": "motivering", "source": "process", "label": "Motivering" },
    { "id": "b5", "placeholder": "{{financieleGevolgen}}", "variableKey": "financieleGevolgen", "source": "process", "label": "Financiële gevolgen (€)" },
    { "id": "b6", "placeholder": "{{ondertekenaar}}", "variableKey": "ondertekenaar", "source": "process", "label": "Gemachtigde ondertekenaar" }
  ],
  "zones": {
    "letterhead": {
      "blocks": [
        {
          "id": "lh_org_name",
          "type": "text",
          "label": "Organisatienaam",
          "content": {
            "type": "doc",
            "content": [
              { "type": "heading", "attrs": { "level": 1 }, "content": [{ "type": "text", "text": "Provincie Flevoland" }] },
              { "type": "paragraph", "content": [{ "type": "text", "marks": [{ "type": "italic" }], "text": "Besluit onder gedelegeerde bevoegdheid" }] }
            ]
          }
        },
        { "id": "lh_separator", "type": "separator", "label": "Separator" }
      ]
    },
    "contactInformation": {
      "blocks": [
        {
          "id": "ci_address",
          "type": "text",
          "label": "Contactgegevens",
          "content": {
            "type": "doc",
            "content": [
              { "type": "paragraph", "content": [{ "type": "text", "text": "Provincie Flevoland" }] },
              { "type": "paragraph", "content": [{ "type": "text", "text": "Postbus 55, 8200 AB Lelystad" }] }
            ]
          }
        }
      ]
    },
    "reference": {
      "blocks": [
        {
          "id": "ref_header",
          "type": "text",
          "label": "Onderwerp en type besluit",
          "content": {
            "type": "doc",
            "content": [
              { "type": "paragraph", "content": [{ "type": "text", "text": "Onderwerp: {{onderwerp}}" }] },
              { "type": "paragraph", "content": [{ "type": "text", "text": "Type besluit: {{besluitType}}" }] }
            ]
          }
        }
      ]
    },
    "body": {
      "blocks": [
        {
          "id": "body_title",
          "type": "text",
          "label": "Titel",
          "content": {
            "type": "doc",
            "content": [{ "type": "heading", "attrs": { "level": 2 }, "content": [{ "type": "text", "text": "Besluit onder gedelegeerde bevoegdheid" }] }]
          }
        },
        {
          "id": "body_mandaat",
          "type": "text",
          "label": "Reikwijdte",
          "content": {
            "type": "doc",
            "content": [
              { "type": "paragraph", "content": [{ "type": "text", "text": "Besluiten tot het aangaan, wijzigen, beëindigen verplichtingen d.m.v. opdrachtbon, -brief, overeenkomst of anderszins voor: het leveren van zaken, verrichten van diensten en uitvoeren van werken." }] }
            ]
          }
        },
        {
          "id": "body_besluit",
          "type": "text",
          "label": "Besluit",
          "content": {
            "type": "doc",
            "content": [
              { "type": "paragraph", "content": [{ "type": "text", "marks": [{ "type": "bold" }], "text": "Besluit" }] },
              { "type": "paragraph", "content": [{ "type": "text", "text": "{{voorgesteldBesluit}}" }] }
            ]
          }
        },
        {
          "id": "body_motivering",
          "type": "text",
          "label": "Motivering",
          "content": {
            "type": "doc",
            "content": [
              { "type": "paragraph", "content": [{ "type": "text", "marks": [{ "type": "bold" }], "text": "Motivering" }] },
              { "type": "paragraph", "content": [{ "type": "text", "text": "{{motivering}}" }] }
            ]
          }
        },
        {
          "id": "body_financieel",
          "type": "text",
          "label": "Financiële gevolgen",
          "content": {
            "type": "doc",
            "content": [
              { "type": "paragraph", "content": [{ "type": "text", "text": "Financiële gevolgen: € {{financieleGevolgen}}" }] }
            ]
          }
        }
      ]
    },
    "closing": {
      "blocks": [
        {
          "id": "cl_bezwaar",
          "type": "text",
          "label": "Bezwaar",
          "content": {
            "type": "doc",
            "content": [
              { "type": "paragraph", "content": [{ "type": "text", "text": "Tegen dit besluit kan een belanghebbende binnen zes weken na de dag van bekendmaking bezwaar maken (artikel 6:7 Awb)." }] }
            ]
          }
        }
      ]
    },
    "signOff": {
      "blocks": [
        {
          "id": "so_namens",
          "type": "text",
          "label": "Ondertekening",
          "content": {
            "type": "doc",
            "content": [
              { "type": "paragraph", "content": [{ "type": "text", "text": "Namens deze, de gemachtigde ondertekenaar," }] }
            ]
          }
        },
        { "id": "so_spacer", "type": "spacer", "label": "Ruimte handtekening" },
        {
          "id": "so_name",
          "type": "text",
          "label": "Naam ondertekenaar",
          "content": {
            "type": "doc",
            "content": [
              { "type": "paragraph", "content": [{ "type": "text", "marks": [{ "type": "bold" }], "text": "{{ondertekenaar}}" }] },
              { "type": "paragraph", "content": [{ "type": "text", "text": "Provincie Flevoland" }] }
            ]
          }
        }
      ]
    },
    "annex": null
  }
}
```

- [ ] **Step 4: Seed it from the file**

At the end of `defaultTemplates.ts`, immediately above `export const DEFAULT_TEMPLATES`, add:

```ts
// The deployable .document file is the single source for this template: the
// Modeler bundles the seeded copy into deployments and RBA renders it for
// ValidSign, so a hand-copied twin here could drift from what is signed.
import besluitGbBesluitRaw from '../../../public/examples/flevoland/besluitvorming-gedelegeerd/besluit-gb-besluit.document?raw';

export const BESLUIT_GB_BESLUIT: DocumentTemplate = JSON.parse(besluitGbBesluitRaw);
```

Move that `import` line to the top of the file, after the existing `import { DocumentTemplate } ...` line, because ESLint's `import/first` rule fails otherwise. Then append `BESLUIT_GB_BESLUIT,` as the last entry of `DEFAULT_TEMPLATES`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx --workspace=packages/frontend vitest run --coverage.enabled=false src/components/DocumentComposer/defaultTemplates.test.ts`
Expected: PASS. The generic `DEFAULT_TEMPLATES` checks (required zones, unique block ids, every placeholder bound) now also run against the new template.

Run: `npm test --workspace=packages/backend -- --coverage=false besluitvorming-gedelegeerd-bundle`
Expected: PASS, 16 tests.

Run: `npm run typecheck --workspace=packages/frontend`
Expected: no errors. The `?raw` module type comes from `vite/client` through `src/vite-env.d.ts`.

- [ ] **Step 6: Commit** (ask first)

```bash
git add "packages/frontend/public/examples/flevoland/besluitvorming-gedelegeerd/besluit-gb-besluit.document" packages/frontend/src/components/DocumentComposer/defaultTemplates.ts packages/frontend/src/components/DocumentComposer/defaultTemplates.test.ts packages/backend/src/besluitvorming-gedelegeerd-bundle.test.ts
git commit -F <scratchpad>/a4-msg.txt
```
Message: `feat(examples): besluit document for besluitvorming onder gedelegeerde bevoegdheid, seeded from its own file`

### Task A5: Seed the process and the forms

**Files:**
- Modify: `packages/frontend/src/components/BpmnModeler/BpmnModeler.tsx`: add after the `// --- HR-capacity Dutch BPMN sibling` block, which ends at `updated.push(hrCapacityNlExample);` and its closing `}`
- Modify: `packages/frontend/src/components/FormEditor/FormEditor.tsx`: append to `EXAMPLE_FORMS`, after the last HR-capacity entry
- Modify: `packages/frontend/src/utils/exampleVersions.ts`

**Interfaces:**
- Consumes: the bundle files from A1–A4.
- Produces: seed ids `example_besluit_gb` (BPMN) and `example_besluit_gb_<form-suffix>` (forms).

- [ ] **Step 1: Write the failing test**

Check for an existing exampleVersions test: `ls packages/frontend/src/utils/exampleVersions.test.ts`. If it is absent, create it:

```ts
import { describe, expect, it } from 'vitest';
import { EXAMPLE_VERSIONS } from './exampleVersions';

describe('EXAMPLE_VERSIONS — besluitvorming gedelegeerd', () => {
  it('versions the process and all twelve forms', () => {
    const ids = [
      'example_besluit_gb',
      ...[
        'sjabloon_kiezen',
        'sjabloon_invullen',
        'advies_toetsing',
        'voorwaarden',
        'memorandum',
        'akkoord',
        'indienen',
        'ondertekenen',
        'escalatie',
        'besluit_nemen',
        'registreren',
        'archiveren',
      ].map((s) => `example_besluit_gb_${s}`),
    ];
    for (const id of ids) expect(EXAMPLE_VERSIONS[id]).toBe(1);
  });
});
```

If it exists, add the same `describe` block to it.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx --workspace=packages/frontend vitest run --coverage.enabled=false src/utils/exampleVersions.test.ts`
Expected: FAIL, `expected undefined to be 1`.

- [ ] **Step 3: Add the versions**

In `exampleVersions.ts`, under `// BPMN processes` after `example_thuisbatterij_decision`, add:

```ts
  example_besluit_gb: 1,
```

At the end of the `// Camunda Forms` group, after `example_kapvergunning_missing_info` or whichever entry is last there, add:

```ts
  example_besluit_gb_sjabloon_kiezen: 1,
  example_besluit_gb_sjabloon_invullen: 1,
  example_besluit_gb_advies_toetsing: 1,
  example_besluit_gb_voorwaarden: 1,
  example_besluit_gb_memorandum: 1,
  example_besluit_gb_akkoord: 1,
  example_besluit_gb_indienen: 1,
  example_besluit_gb_ondertekenen: 1,
  example_besluit_gb_escalatie: 1,
  example_besluit_gb_besluit_nemen: 1,
  example_besluit_gb_registreren: 1,
  example_besluit_gb_archiveren: 1,
```

- [ ] **Step 4: Seed the BPMN**

In `BpmnModeler.tsx`, after the HR-capacity block, add:

```tsx
      // --- Besluitvorming onder gedelegeerde bevoegdheid (NL) ---
      const besluitGbId = 'example_besluit_gb';
      if (getStoredVersion(besluitGbId) < EXAMPLE_VERSIONS[besluitGbId]) {
        const xml = await fetch(
          '/examples/flevoland/besluitvorming-gedelegeerd/GedelegeerdBesluitProcess.bpmn'
        ).then((r) => r.text());
        const besluitGbExample: BpmnProcess = {
          id: besluitGbId,
          name: 'Besluitvorming onder gedelegeerde bevoegdheid (Voorbeeld, NL)',
          description:
            'Besluit voorbereiden, toetsen en ondertekenen onder gedelegeerde bevoegdheid, met escalatie naar de bevoegde bestuursautoriteit. Ondertekening via ValidSign.',
          xml,
          createdAt: '2026-10-02T09:00:00.000Z',
          updatedAt: new Date().toISOString(),
          linkedDmnTemplates: ['GedelegeerdBesluitRoute'],
          readonly: false,
          status: 'example',
          bpmnProcessId: 'GedelegeerdBesluitProcess',
          processRole: 'standalone',
          language: 'nl',
          organization: 'flevoland',
        };
        BpmnService.saveProcess(besluitGbExample);
        setStoredVersion(besluitGbId, EXAMPLE_VERSIONS[besluitGbId]);
        updated.push(besluitGbExample);
      }
```

- [ ] **Step 5: Seed the forms**

In `FormEditor.tsx`, append to `EXAMPLE_FORMS` one entry per form, in this shape, for all 12:

```ts
  {
    id: 'example_besluit_gb_sjabloon_kiezen',
    name: 'Besluit GB — 1. Kies sjabloon (Voorbeeld, NL)',
    description: 'Indiener kiest het type besluit en het bijbehorende sjabloon',
    path: '/examples/flevoland/besluitvorming-gedelegeerd/besluit-gb-sjabloon-kiezen.form',
    language: 'nl',
    organization: 'flevoland',
  },
```

The remaining eleven, as `[id suffix, name, description]`:

| id suffix | name | description |
|---|---|---|
| `sjabloon_invullen` | Besluit GB — 2. Vul sjabloon in (Voorbeeld, NL) | Indiener vult onderwerp, motivering, financiële gevolgen en voorgesteld besluit in |
| `advies_toetsing` | Besluit GB — Advies en toetsing (Voorbeeld, NL) | Juridische Zaken toetst en adviseert |
| `voorwaarden` | Besluit GB — 4. Controleer voorwaarden (Voorbeeld, NL) | Indiener bevestigt de voorwaarden voor gedelegeerde bevoegdheid |
| `memorandum` | Besluit GB — 5. Memorandum (Voorbeeld, NL) | Indiener vult het formele memorandum in |
| `akkoord` | Besluit GB — Advies / akkoord (Voorbeeld, NL) | Juridische Zaken geeft akkoord of escaleert |
| `indienen` | Besluit GB — 6. Indienen (Voorbeeld, NL) | Indiener dient het besluit in voor ondertekening |
| `ondertekenen` | Besluit GB — Ondertekenen (Voorbeeld, NL) | Terugvalformulier voor ondertekening (ValidSign is de normale route) |
| `escalatie` | Besluit GB — Escaleren (Voorbeeld, NL) | Indiener escaleert naar de bevoegde bestuursautoriteit |
| `besluit_nemen` | Besluit GB — Neem besluit (Voorbeeld, NL) | Bevoegde bestuursautoriteit neemt het besluit |
| `registreren` | Besluit GB — Ontvang en registreer (Voorbeeld, NL) | Registratie & Beheer registreert in het zaaksysteem |
| `archiveren` | Besluit GB — Archiveer (Voorbeeld, NL) | Registratie & Beheer archiveert volgens bewaartermijn |

For each, the `path` is `/examples/flevoland/besluitvorming-gedelegeerd/besluit-gb-<suffix with _ replaced by ->.form`. For example, `besluit_nemen` maps to `besluit-gb-besluit-nemen.form`.

- [ ] **Step 6: Run the tests, typecheck and lint**

Run: `npx --workspace=packages/frontend vitest run --coverage.enabled=false src/utils src/components/BpmnModeler src/components/FormEditor src/components/DocumentComposer`
Expected: PASS.

Run: `npm run typecheck --workspace=packages/frontend && npm run lint --workspace=packages/frontend`
Expected: no errors.

- [ ] **Step 7: Commit** (ask first)

```bash
git add packages/frontend/src/components/BpmnModeler/BpmnModeler.tsx packages/frontend/src/components/FormEditor/FormEditor.tsx packages/frontend/src/utils/exampleVersions.ts packages/frontend/src/utils/exampleVersions.test.ts
git commit -F <scratchpad>/a5-msg.txt
```
Message: `feat(examples): seed the besluitvorming gedelegeerd process and forms in the Modeler and Form Editor`

### Task A6: Hand-off for Part A

- [ ] **Step 1:** Hand the user the LDE suites and wait for "green": `npm test`, `npm run typecheck`, `npm run lint` at the repo root. Do not substitute a focused run.
- [ ] **Step 2:** Hand the user the DMN boundary check (Review Focus 5). Once the DMN is deployed untenanted on the local engine from LDE, these must give `ondertekenen`, `memorandum` and `ondertekenen` respectively:

```bash
curl -s -X POST http://localhost:8081/engine-rest/decision-definition/key/GedelegeerdBesluitRoute/evaluate -H "Content-Type: application/json" -d "{\"variables\":{\"voorwaardenVervuld\":{\"value\":true,\"type\":\"Boolean\"},\"binnenMandaat\":{\"value\":true,\"type\":\"Boolean\"},\"politiekGevoelig\":{\"value\":false,\"type\":\"Boolean\"},\"overwegingenDuidelijk\":{\"value\":true,\"type\":\"Boolean\"},\"financieleGevolgen\":{\"value\":50000,\"type\":\"Double\"}}}"
```
The second call uses `50000.01`. The third leaves out `financieleGevolgen` entirely, and must still yield `ondertekenen`.

- [ ] **Step 3:** Ask the user to look at the diagram in the Modeler after the re-seed.
- [ ] **Step 4:** On green, push `feat/besluitvorming-gedelegeerd` and open the LDE PR to `acc`. The body is written to a file; it has no attribution and mentions the RBA companion.

---

# Part B — ronl-business-api

Work in `C:\Users\gorts01\Development\ronl-business-api`. **Before Task B1:**

1. Run `git status -sb`. If the working tree has changes, or a branch other than `acc` is checked out with commits not on `origin/acc` (it was on `feat/edocs-per-user-entra`, 2 ahead, on 2026-10-02), **stop and ask** the user how to proceed. Do not stash, switch or reset their work.
2. When the user clears it: `git fetch origin`, then `git switch -c feat/besluitvorming-gedelegeerd origin/acc` as a standalone command, then `git branch --show-current`.

### Task B1: Realm roles and test users

**Files:**
- Modify: `config/keycloak/ronl-realm.json` (realm `roles.realm` list; `users` list)

**Interfaces:**
- Produces: realm roles `besluit-indiener`, `besluit-jurist`, `besluit-bestuursautoriteit`, `besluit-ondertekenaar`, `besluit-registratie`, and users `test-indiener-flevoland`, `test-besluit-flevoland`.

- [ ] **Step 1: Write the failing check**

Write `<scratchpad>/realm-check.js` with the Write tool:

```js
const realm = require(require('path').resolve('config/keycloak/ronl-realm.json'));
const roles = new Set(realm.roles.realm.map((r) => r.name));
const need = ['besluit-indiener', 'besluit-jurist', 'besluit-bestuursautoriteit', 'besluit-ondertekenaar', 'besluit-registratie'];
const missing = need.filter((r) => !roles.has(r));
const user = (u) => realm.users.find((x) => x.username === u);
const ind = user('test-indiener-flevoland');
const bes = user('test-besluit-flevoland');
const problems = [...missing.map((r) => `role ${r} missing`)];
if (!ind) problems.push('test-indiener-flevoland missing');
if (!bes) problems.push('test-besluit-flevoland missing');
for (const u of [ind, bes].filter(Boolean)) {
  if (!u.email) problems.push(`${u.username} has no email (ValidSign needs one)`);
  if (u.attributes?.municipality?.[0] !== 'flevoland') problems.push(`${u.username} not in flevoland`);
}
if (ind && JSON.stringify([...ind.realmRoles].sort()) !== JSON.stringify(['besluit-indiener', 'caseworker'])) problems.push('indiener roles wrong');
if (bes && JSON.stringify([...bes.realmRoles].sort()) !== JSON.stringify(['besluit-bestuursautoriteit', 'besluit-jurist', 'besluit-ondertekenaar', 'besluit-registratie', 'caseworker'])) problems.push('besluit roles wrong');
console.log(problems.length ? problems.join('\n') : 'OK');
process.exit(problems.length ? 1 : 0);
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node <scratchpad>/realm-check.js`
Expected: exit 1, listing the five missing roles and two missing users.

- [ ] **Step 3: Add the roles**

In `ronl-realm.json`, in `roles.realm`, after the `personnel-controller` role entry, add:

```json
      {
        "name": "besluit-indiener",
        "description": "Besluitvorming gedelegeerde bevoegdheid — Aanvrager / Indiener: bereidt het besluit voor en dient het in"
      },
      {
        "name": "besluit-jurist",
        "description": "Besluitvorming gedelegeerde bevoegdheid — Juridische Zaken / Compliance: toetst en adviseert"
      },
      {
        "name": "besluit-bestuursautoriteit",
        "description": "Besluitvorming gedelegeerde bevoegdheid — Bevoegde bestuursautoriteit: neemt geëscaleerde besluiten"
      },
      {
        "name": "besluit-ondertekenaar",
        "description": "Besluitvorming gedelegeerde bevoegdheid — Gemachtigde ondertekenaar: ondertekent het besluit via ValidSign"
      },
      {
        "name": "besluit-registratie",
        "description": "Besluitvorming gedelegeerde bevoegdheid — Registratie & Beheer: registreert en archiveert"
      },
```

- [ ] **Step 4: Add the users**

In `users`, after `test-mngr-flevoland`, add two users modelled on `test-hr-flevoland`. Each has a distinct `employee_id` and `email`:

```json
    {
      "username": "test-indiener-flevoland",
      "enabled": true,
      "firstName": "Indiener",
      "lastName": "Besluitvorming Flevoland",
      "email": "indiener@flevoland.nl",
      "emailVerified": true,
      "credentials": [{ "type": "password", "value": "test123", "temporary": false }],
      "attributes": {
        "municipality": ["flevoland"],
        "organisation_type": ["province"],
        "assurance_level": ["hoog"],
        "employee_id": ["emp-besluit-01"]
      },
      "realmRoles": ["caseworker", "besluit-indiener"]
    },
    {
      "username": "test-besluit-flevoland",
      "enabled": true,
      "firstName": "Besluit",
      "lastName": "Behandelaar Flevoland",
      "email": "besluit@flevoland.nl",
      "emailVerified": true,
      "credentials": [{ "type": "password", "value": "test123", "temporary": false }],
      "attributes": {
        "municipality": ["flevoland"],
        "organisation_type": ["province"],
        "assurance_level": ["hoog"],
        "employee_id": ["emp-besluit-02"]
      },
      "realmRoles": [
        "caseworker",
        "besluit-jurist",
        "besluit-bestuursautoriteit",
        "besluit-ondertekenaar",
        "besluit-registratie"
      ]
    },
```

- [ ] **Step 5: Run the check to verify it passes**

Run: `node <scratchpad>/realm-check.js`
Expected: `OK`

- [ ] **Step 6: Commit** (ask first)

```bash
git add config/keycloak/ronl-realm.json
git commit -F <scratchpad>/b1-msg.txt
```
Message: `feat(realm): besluit-* roles and two test users for besluitvorming onder gedelegeerde bevoegdheid`

### Task B2: Signing state per task, and archive names from the template and the case

**Files:**
- Modify: `packages/backend/src/routes/validsign.routes.ts`: `statusFromVariables` (around line 645), the spec route (`GET /task/:taskId/spec`, around line 667), the package route (`POST /task/:taskId/package`, around lines 734–893)
- Modify: `packages/backend/src/services/operaton.service.ts`: `findInstanceByValidsignPackage` (around lines 848–889)
- Modify: `packages/backend/src/services/validsignCompletion.service.ts`
- Test: `packages/backend/src/routes/validsign.routes.test.ts`, `packages/backend/src/services/operaton.service.test.ts`, `packages/backend/src/services/validsignCompletion.service.test.ts`

**Interfaces:**
- Produces process variables written by the package route: `validsignTaskId`, `validsignTemplateId` and `validsignTemplateName`, besides the existing `validsignPackageId`, `validsignStatus` and `validsignSigningUrl`.
- `findInstanceByValidsignPackage(packageId)` returns `{ processInstanceId; taskId; status; businessKey?: string; templateId?: string; templateName?: string; edocsWorkspaceId?; department?; documentId? }`. `projectNumber` is removed.
- `export function signedArchiveNames(input: { templateId?: string; templateName?: string; reference: string }): { signedFile: string; evidenceFile: string; signedTitle: string; evidenceTitle: string }` in `validsignCompletion.service.ts`.
- `function statusFromVariables(variables: Record<string, unknown>, taskId: string): SignatureStatus`

- [ ] **Step 1: Write the failing tests: archive names**

In `validsignCompletion.service.test.ts`, add `signedArchiveNames` to the import from `./validsignCompletion.service`, and append:

```ts
describe('signedArchiveNames', () => {
  it('names the archive after the template and the case', () => {
    expect(
      signedArchiveNames({
        templateId: 'besluit-gb-besluit',
        templateName: 'Besluit onder gedelegeerde bevoegdheid',
        reference: 'flevoland-1759400000000',
      })
    ).toEqual({
      signedFile: 'besluit-gb-besluit-flevoland-1759400000000-signed.pdf',
      evidenceFile: 'besluit-gb-besluit-flevoland-1759400000000-evidence.pdf',
      signedTitle:
        'flevoland-1759400000000 — Besluit onder gedelegeerde bevoegdheid (ondertekend) — getekend document',
      evidenceTitle:
        'flevoland-1759400000000 — Besluit onder gedelegeerde bevoegdheid (ondertekend) — bewijsoverzicht',
    });
  });

  it('falls back to neutral names for a package created before the template was recorded', () => {
    expect(signedArchiveNames({ reference: 'pkg-1' })).toEqual({
      signedFile: 'ondertekend-document-pkg-1-signed.pdf',
      evidenceFile: 'ondertekend-document-pkg-1-evidence.pdf',
      signedTitle: 'pkg-1 — Ondertekend document (ondertekend) — getekend document',
      evidenceTitle: 'pkg-1 — Ondertekend document (ondertekend) — bewijsoverzicht',
    });
  });
});
```

In the same file, look for the existing archive tests that build a `mockFindInstance` result with `projectNumber` and assert `rip-pdp-…` file names or "Uitgangspunten VO-fase" titles; find them with `grep -n "projectNumber\|rip-pdp\|Uitgangspunten" packages/backend/src/services/validsignCompletion.service.test.ts`. Change their fixture to `{ processInstanceId: 'pi-1', taskId: 'task-1', status: 'sent', businessKey: 'flevoland-1', templateId: 'besluit-gb-besluit', templateName: 'Besluit onder gedelegeerde bevoegdheid' }`. Change their expectations to `besluit-gb-besluit-flevoland-1-signed.pdf` / `-evidence.pdf`, with the titles from `signedArchiveNames` above. Add one test where `businessKey` is absent: the file names then use the package id, as in `ondertekend-document-<packageId>-signed.pdf` when the template variables are also absent.

- [ ] **Step 2: Write the failing tests: find instance**

In `operaton.service.test.ts`, `describe('findInstanceByValidsignPackage')`, change the first test:
- the `/process-instance` route returns `{ data: [{ id: 'pi-1', businessKey: 'flevoland-1' }] }`;
- the variables include `validsignTemplateId: { value: 'besluit-gb-besluit', type: 'String' }` and `validsignTemplateName: { value: 'Besluit onder gedelegeerde bevoegdheid', type: 'String' }` instead of `projectNumber`;
- the expectation reads:

```ts
    await expect(svc.findInstanceByValidsignPackage('pkg-1')).resolves.toEqual({
      processInstanceId: 'pi-1',
      taskId: 'task-1',
      status: 'sent',
      businessKey: 'flevoland-1',
      templateId: 'besluit-gb-besluit',
      templateName: 'Besluit onder gedelegeerde bevoegdheid',
      edocsWorkspaceId: 'ws-1',
      department: 'Infra',
      documentId: 'doc-9',
    });
```

- [ ] **Step 3: Write the failing tests: per-task signing state**

In `validsign.routes.test.ts`, in the package-route `describe`, extend the existing `creates and sends the package…` test's `mockSetProcessVariables` expectation with:

```ts
        validsignTaskId: { value: 'task-1', type: 'String' },
        validsignTemplateId: { value: 'tpl-1', type: 'String' },
        validsignTemplateName: { value: 'Uitgangspunten VO-fase', type: 'String' },
```

Append a test to the same `describe`, built like the existing successful one:

```ts
  it('starts afresh on a new signing task after an earlier task\'s signature was declined', async () => {
    // A rework loop (declined → revise → sign again) creates a NEW task. The
    // previous attempt's variables are process-wide, so without the task id
    // the new task would read 'declined' and be refused with 409.
    mockGetTaskSignatureSpec.mockResolvedValue({
      templateId: 'tpl-1',
      template: { name: 'Besluit onder gedelegeerde bevoegdheid' },
    });
    mockGetTaskVariables.mockResolvedValue({
      municipality: 'flevoland',
      validsignStatus: 'declined',
      validsignPackageId: 'pkg-old',
      validsignTaskId: 'task-old',
    });
    mockRenderTemplate.mockReturnValue({ templateId: 'tpl-1', zones: [] });
    mockToPdf.mockResolvedValue({ bytes: Buffer.from('pdf'), signatureFields: [] });
    mockValidsign.createPackage.mockResolvedValue({ packageId: 'pkg-new', roleId: 'role-1' });
    mockValidsign.getSigningUrl.mockResolvedValue('/v1/validsign/stub/ceremony/pkg-new');

    const res = await request(app).post('/v1/validsign/task/task-1/package').set(authHeader);

    expect(res.status).toBe(200);
    expect(res.body.data.packageId).toBe('pkg-new');
  });

  it('still refuses a second package for the same task', async () => {
    mockGetTaskSignatureSpec.mockResolvedValue({ templateId: 'tpl-1', template: { name: 'X' } });
    mockGetTaskVariables.mockResolvedValue({
      municipality: 'flevoland',
      validsignStatus: 'declined',
      validsignPackageId: 'pkg-1',
      validsignTaskId: 'task-1',
    });

    const res = await request(app).post('/v1/validsign/task/task-1/package').set(authHeader);

    expect(res.status).toBe(409);
  });
```

In the spec-route `describe` (`GET /v1/validsign/task/:taskId/spec`), append:

```ts
  it('reports status none, and no package, for a task that did not create the recorded package', async () => {
    mockGetTaskSignatureSpec.mockResolvedValue({ templateId: 'tpl-1', template: { name: 'X' } });
    mockGetTaskVariables.mockResolvedValue({
      municipality: 'flevoland',
      validsignStatus: 'declined',
      validsignPackageId: 'pkg-old',
      validsignSigningUrl: '/v1/validsign/stub/ceremony/pkg-old',
      validsignTaskId: 'task-old',
    });

    const res = await request(app).get('/v1/validsign/task/task-1/spec').set(authHeader);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ required: true, status: 'none' });
    expect(res.body.data.packageId).toBeUndefined();
    expect(res.body.data.signingUrl).toBeUndefined();
  });
```

The mock names (`mockGetTaskSignatureSpec`, `mockGetTaskVariables`, `mockRenderTemplate`, `mockToPdf`, `mockValidsign`, `authHeader`, `app`) are the ones that file already declares. Reuse them as declared there.

- [ ] **Step 4: Run the tests to verify they fail**

Run: `npx --workspace=packages/backend jest --config jest.config.js --coverage=false src/services/validsignCompletion.service.test.ts src/services/operaton.service.test.ts src/routes/validsign.routes.test.ts`
Expected: FAIL. `signedArchiveNames` is not exported; the new variables are not written; the new-task tests get 409 and `status: 'declined'`.

- [ ] **Step 5: Implement per-task state in the routes**

In `validsign.routes.ts`, replace `statusFromVariables` with:

```ts
/**
 * The signing state of THIS task. The validsign* variables are process
 * variables, so after a declined signature they outlive the task that
 * created them: a rework loop that brings the case back to a new signing
 * task would otherwise open on 'declined' and be refused. Variables recorded
 * by another task describe that task's attempt, not this one's. A package
 * without a recorded task id predates the field and is taken at face value.
 */
function statusFromVariables(variables: Record<string, unknown>, taskId: string): SignatureStatus {
  const owner = variables['validsignTaskId'];
  if (typeof owner === 'string' && owner !== taskId) return 'none';
  const raw = variables['validsignStatus'];
  if (raw === 'sent' || raw === 'completed' || raw === 'declined' || raw === 'failed') return raw;
  return 'none';
}
```

In the spec route, replace `const status = statusFromVariables(variables);` and the two lines after it with:

```ts
    const status = statusFromVariables(variables, taskId);
    const ownPackage = status !== 'none';
    const packageId = ownPackage ? (variables['validsignPackageId'] as string | undefined) : undefined;
    const signingUrl = ownPackage ? (variables['validsignSigningUrl'] as string | undefined) : undefined;
```

In the package route, change `statusFromVariables(variables)` to `statusFromVariables(variables, taskId)`. Then extend `processVariables`:

```ts
    const processVariables: Record<string, OperatonVariable> = {
      validsignPackageId: { value: packageId, type: 'String' },
      validsignStatus: { value: 'sent', type: 'String' },
      // Which task this package belongs to, so a later signing task in the
      // same instance starts fresh (see statusFromVariables), and what was
      // signed, so completion can name the archive without knowing the process.
      validsignTaskId: { value: taskId, type: 'String' },
      validsignTemplateId: { value: spec.templateId, type: 'String' },
      validsignTemplateName: { value: spec.template.name, type: 'String' },
    };
```

If `taskId` has another name in that handler, use the route parameter variable the handler already reads, e.g. `req.params.taskId`. Check with `grep -n "taskId" packages/backend/src/routes/validsign.routes.ts | sed -n 1,40p`.

- [ ] **Step 6: Implement the instance lookup**

In `operaton.service.ts`, `findInstanceByValidsignPackage`:
- change the return type: remove `projectNumber?: string;` and add `businessKey?: string; templateId?: string; templateName?: string;`;
- read `const instances: Array<{ id: string; businessKey?: string | null }> = instancesRes.data;`;
- in the returned object, replace `projectNumber: value('projectNumber') as string | undefined,` with:

```ts
        businessKey: instances[0].businessKey ?? undefined,
        templateId: value('validsignTemplateId') as string | undefined,
        templateName: value('validsignTemplateName') as string | undefined,
```

- [ ] **Step 7: Implement the archive names**

In `validsignCompletion.service.ts`, add above `completeSignature`:

```ts
/**
 * Archive file names and titles for a signed package, from the template that
 * was signed and the case it belongs to (the process business key). Nothing
 * process-specific: any process that signs through ValidSign gets sensible
 * names without code here. A package created before the template was
 * recorded falls back to neutral names.
 */
export function signedArchiveNames(input: {
  templateId?: string;
  templateName?: string;
  reference: string;
}): { signedFile: string; evidenceFile: string; signedTitle: string; evidenceTitle: string } {
  const id = input.templateId ?? 'ondertekend-document';
  const title = `${input.reference} — ${input.templateName ?? 'Ondertekend document'} (ondertekend)`;
  return {
    signedFile: `${id}-${input.reference}-signed.pdf`,
    evidenceFile: `${id}-${input.reference}-evidence.pdf`,
    signedTitle: `${title} — getekend document`,
    evidenceTitle: `${title} — bewijsoverzicht`,
  };
}
```

In `doComplete`, replace `const { processInstanceId, projectNumber } = found;` with `const { processInstanceId } = found;`. Replace the block from `const base = …` through the second `uploadDocument` call with:

```ts
        const names = signedArchiveNames({
          templateId: found.templateId,
          templateName: found.templateName,
          reference: found.businessKey ?? packageId,
        });
        const doc = await edocsService.uploadDocument(
          null,
          names.signedFile,
          signed.toString('base64'),
          { docName: names.signedTitle, department }
        );
        await edocsService.uploadDocument(
          null,
          names.evidenceFile,
          evidence.toString('base64'),
          { docName: names.evidenceTitle, department }
        );
```

Run `grep -rn "projectNumber" packages/backend/src/services/validsignCompletion.service.ts packages/backend/src/services/validsignPoller.service.ts packages/backend/src/routes/validsign.routes.ts`. Expected: no results. Remove any leftover reference to the removed field.

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npx --workspace=packages/backend jest --config jest.config.js --coverage=false src/services/validsignCompletion.service.test.ts src/services/operaton.service.test.ts src/routes/validsign.routes.test.ts src/services/validsignPoller.service.test.ts`
Expected: PASS.

Run: `npm run type-check --workspace=packages/backend && npm run lint --workspace=packages/backend`
Expected: no errors.

- [ ] **Step 9: Commit** (ask first)

```bash
git add packages/backend/src/routes/validsign.routes.ts packages/backend/src/routes/validsign.routes.test.ts packages/backend/src/services/operaton.service.ts packages/backend/src/services/operaton.service.test.ts packages/backend/src/services/validsignCompletion.service.ts packages/backend/src/services/validsignCompletion.service.test.ts
git commit -F <scratchpad>/b2-msg.txt
```
Message: `feat(validsign): signing state per task, and archive names from the template and the case`

### Task B3: Shared signing component and hook; the Infra-board uses it

**Files:**
- Move: `packages/frontend/src/components/InfraBoardDashboard/{SigningPanel.tsx, SigningPanel.test.tsx, resolveSigningUrl.ts, resolveSigningUrl.test.ts}` → `packages/frontend/src/components/signing/`
- Create: `packages/frontend/src/components/signing/useTaskSignature.ts`, `useTaskSignature.test.ts`
- Modify: `packages/frontend/src/components/InfraBoardDashboard/ProjectDetail.tsx` (`TaskWorkPanel`, around lines 69–100 and 160–178)

**Interfaces:**
- Produces: `export function useTaskSignature(taskId: string | null): SignatureSpec | null`. It returns `null` for no task, while loading, and when the fetch fails or answers `success: false`. It never returns another task's spec. The default export `SigningPanel` from `components/signing/SigningPanel` has unchanged props `{ taskId; spec; onCompleted }`.

- [ ] **Step 1: Move the files**

Run, each as its own command:
```bash
mkdir -p packages/frontend/src/components/signing
git mv packages/frontend/src/components/InfraBoardDashboard/SigningPanel.tsx packages/frontend/src/components/signing/SigningPanel.tsx
git mv packages/frontend/src/components/InfraBoardDashboard/SigningPanel.test.tsx packages/frontend/src/components/signing/SigningPanel.test.tsx
git mv packages/frontend/src/components/InfraBoardDashboard/resolveSigningUrl.ts packages/frontend/src/components/signing/resolveSigningUrl.ts
git mv packages/frontend/src/components/InfraBoardDashboard/resolveSigningUrl.test.ts packages/frontend/src/components/signing/resolveSigningUrl.test.ts
```
Both folders sit two levels below `src/`, so relative imports such as `../../services/api` stay valid. Then run `grep -rn "InfraBoardDashboard/SigningPanel\|InfraBoardDashboard/resolveSigningUrl\|from './SigningPanel'\|from './resolveSigningUrl'" packages/frontend/src`, and update `ProjectDetail.tsx`'s import to `import SigningPanel from '../signing/SigningPanel';`. Any CSS the panel imports moves only if it is panel-specific: check the `import '...css'` lines in `SigningPanel.tsx` and keep the paths resolving.

- [ ] **Step 2: Write the failing hook test**

Create `packages/frontend/src/components/signing/useTaskSignature.test.ts`:

```ts
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useTaskSignature } from './useTaskSignature';

const mockTaskSpec = vi.hoisted(() => vi.fn());
vi.mock('../../services/api', () => ({
  businessApi: { validsign: { taskSpec: mockTaskSpec } },
}));

afterEach(() => vi.clearAllMocks());

describe('useTaskSignature', () => {
  it('returns the spec of the task', async () => {
    mockTaskSpec.mockResolvedValue({ success: true, data: { required: true, status: 'none' } });
    const { result } = renderHook(() => useTaskSignature('task-1'));
    await waitFor(() => expect(result.current).toEqual({ required: true, status: 'none' }));
    expect(mockTaskSpec).toHaveBeenCalledWith('task-1');
  });

  it('returns null without a task, and does not fetch', () => {
    const { result } = renderHook(() => useTaskSignature(null));
    expect(result.current).toBeNull();
    expect(mockTaskSpec).not.toHaveBeenCalled();
  });

  it('returns null when the fetch fails, so the caller falls back to the form', async () => {
    mockTaskSpec.mockRejectedValue(new Error('network'));
    const { result } = renderHook(() => useTaskSignature('task-1'));
    await waitFor(() => expect(mockTaskSpec).toHaveBeenCalled());
    expect(result.current).toBeNull();
  });

  it('never shows the previous task\'s spec after switching tasks', async () => {
    let resolveOld!: (v: unknown) => void;
    mockTaskSpec.mockImplementation((id: string) =>
      id === 'old'
        ? new Promise((r) => (resolveOld = r))
        : Promise.resolve({ success: true, data: { required: false } })
    );
    const { result, rerender } = renderHook(({ id }) => useTaskSignature(id), {
      initialProps: { id: 'old' as string | null },
    });
    rerender({ id: 'new' });
    await waitFor(() => expect(result.current).toEqual({ required: false }));
    resolveOld({ success: true, data: { required: true, status: 'none' } });
    await new Promise((r) => setTimeout(r, 0));
    expect(result.current).toEqual({ required: false });
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx --workspace=packages/frontend vitest run --coverage.enabled=false src/components/signing/useTaskSignature.test.ts`
Expected: FAIL. `./useTaskSignature` cannot be resolved.

- [ ] **Step 4: Implement the hook**

Create `packages/frontend/src/components/signing/useTaskSignature.ts`:

```ts
import { useEffect, useState } from 'react';
import { businessApi } from '../../services/api';
import type { SignatureSpec } from '../../services/api';

/**
 * The ValidSign signing spec of a task: whether it must be signed, and the
 * state of its package. Every task view asks the same question through this
 * hook, so a process configures signing with `ronl:signatureRef` alone.
 *
 * Null for no task, while loading, and when the fetch fails: a failed spec
 * fetch means "use the form", never a stuck panel. Keyed by task id, so a
 * slow answer for a task the user already left cannot show up on the next.
 */
export function useTaskSignature(taskId: string | null): SignatureSpec | null {
  const [loaded, setLoaded] = useState<{ taskId: string; spec: SignatureSpec } | null>(null);

  useEffect(() => {
    if (!taskId) return;
    let alive = true;
    // Promise.resolve().then so a synchronous throw from the API layer is a
    // rejection like any other, caught below.
    Promise.resolve()
      .then(() => businessApi.validsign.taskSpec(taskId))
      .then((res) => {
        if (alive && res.success && res.data) setLoaded({ taskId, spec: res.data });
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [taskId]);

  return loaded && loaded.taskId === taskId ? loaded.spec : null;
}
```

- [ ] **Step 5: Run it to verify it passes**

Run: `npx --workspace=packages/frontend vitest run --coverage.enabled=false src/components/signing`
Expected: PASS, including the moved `SigningPanel` and `resolveSigningUrl` tests.

- [ ] **Step 6: Use the hook on the Infra-board**

In `ProjectDetail.tsx`, `TaskWorkPanel`:
- remove `const [sig, setSig] = useState<SignatureSpec | null>(null);`;
- add `const sig = useTaskSignature(task.id);`;
- in the mount effect, drop the spec fetch, so that it reads:

```ts
  // Process variables on mount so they're visible before claiming. The
  // signing spec comes from useTaskSignature, which degrades to "no
  // signature required" on its own when its fetch fails.
  useEffect(() => {
    setDetailLoading(true);
    businessApi.task
      .variables(task.id)
      .then((res) => {
        if (res.success) setVariables(res.data as Record<string, unknown>);
      })
      .catch(() => undefined)
      .finally(() => setDetailLoading(false));
  }, [task.id]);
```

- add `import { useTaskSignature } from '../signing/useTaskSignature';`;
- drop the `SignatureSpec` type import if it is now unused.

The render (`sig?.required ? <SigningPanel … /> : <TaskFormViewer … />`) stays as it is.

- [ ] **Step 7: Run the Infra-board tests**

Run: `npx --workspace=packages/frontend vitest run --coverage.enabled=false src/components/InfraBoardDashboard src/components/signing`
Expected: PASS. If a `ProjectDetail` test asserted the old `Promise.allSettled` pairing, adjust it to the hook. Its mock of `businessApi.validsign.taskSpec` still feeds the hook.

- [ ] **Step 8: Typecheck and lint**

Run: `npm run type-check --workspace=packages/frontend && npm run lint --workspace=packages/frontend`
Expected: no errors.

- [ ] **Step 9: Commit** (ask first)

```bash
git add -A packages/frontend/src/components/signing packages/frontend/src/components/InfraBoardDashboard
git commit -F <scratchpad>/b3-msg.txt
```
Message: `refactor(signing): one shared SigningPanel behind a useTaskSignature hook`

### Task B4: The caseworker inbox signs too

**Files:**
- Modify: `packages/frontend/src/components/CaseworkerDashboardV2/TakenInbox.tsx`: hooks near `const selected = …` (around line 205), and the `Acties` section (around lines 504–523)
- Test: `packages/frontend/src/components/CaseworkerDashboardV2/TakenInbox.test.tsx`

**Interfaces:**
- Consumes: `useTaskSignature`, `SigningPanel` (B3).

- [ ] **Step 1: Write the failing tests**

In `TakenInbox.test.tsx`, extend the hoisted `mockBusinessApi` with a `validsign` member:

```ts
  validsign: {
    taskSpec: vi.fn(),
  },
```

In `beforeEach`, add the default "no signature required":

```ts
  mockBusinessApi.validsign.taskSpec.mockResolvedValue({ success: true, data: { required: false } });
```

Mock the panel next to the existing `TaskFormViewer` mock:

```tsx
vi.mock('../signing/SigningPanel', () => ({
  default: ({ taskId }: { taskId: string }) => <div>signing-panel:{taskId}</div>,
}));
```

Add these tests next to `an already-claimed task shows the task form instead of the claim button`. They use the same `makeTask`, `render` and `userEvent` setup:

```tsx
  it('shows the signing panel instead of the form for a claimed task that must be signed', async () => {
    const user = userEvent.setup();
    mockBusinessApi.task.list.mockResolvedValue({
      success: true,
      data: [makeTask({ assignee: 'user-1' })],
    });
    mockBusinessApi.validsign.taskSpec.mockResolvedValue({
      success: true,
      data: { required: true, status: 'none', templateId: 'besluit-gb-besluit' },
    });

    render(<TakenInbox user={{ sub: 'user-1' } as never} />);
    await user.click(await screen.findByText('Aanvraag beoordelen'));

    expect(await screen.findByText('signing-panel:t1')).toBeInTheDocument();
    expect(screen.queryByText('task-form')).toBeNull();
    expect(mockBusinessApi.validsign.taskSpec).toHaveBeenCalledWith('t1');
  });

  it('falls back to the form when the signing spec cannot be fetched', async () => {
    const user = userEvent.setup();
    mockBusinessApi.task.list.mockResolvedValue({
      success: true,
      data: [makeTask({ assignee: 'user-1' })],
    });
    mockBusinessApi.validsign.taskSpec.mockRejectedValue(new Error('500'));

    render(<TakenInbox user={{ sub: 'user-1' } as never} />);
    await user.click(await screen.findByText('Aanvraag beoordelen'));

    expect(await screen.findByText('task-form')).toBeInTheDocument();
    expect(screen.queryByText(/signing-panel:/)).toBeNull();
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx --workspace=packages/frontend vitest run --coverage.enabled=false src/components/CaseworkerDashboardV2/TakenInbox.test.tsx`
Expected: the first new test FAILs (no signing panel); the second passes trivially.

- [ ] **Step 3: Implement**

In `TakenInbox.tsx`:
- add the imports `import SigningPanel from '../signing/SigningPanel';` and `import { useTaskSignature } from '../signing/useTaskSignature';`;
- directly after `const selected = visible.find((t) => t.id === selectedId) ?? null;`, add `const sig = useTaskSignature(selected?.id ?? null);`. Confirm no `return` precedes that line inside the component, because hooks must not run conditionally.
- replace the `Acties` branch for a claimed task:

```tsx
              ) : sig?.required ? (
                <SigningPanel
                  taskId={selected.id}
                  spec={sig}
                  onCompleted={() => {
                    // Same as the form's completion below: the panel unmounts
                    // when the task leaves the list, so the parent owns the message.
                    setActionMessage({ type: 'success', text: 'Taak voltooid.' });
                    loadTasks();
                  }}
                />
              ) : (
                <TaskFormViewer
```

The existing `TaskFormViewer` element and its props follow unchanged.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx --workspace=packages/frontend vitest run --coverage.enabled=false src/components/CaseworkerDashboardV2 src/pages`
Expected: PASS. If any other test renders `TakenInbox` with a `businessApi` mock lacking `validsign`, the hook swallows the error and the test still passes. Add the mock anyway where a test asserts the actions area.

- [ ] **Step 5: Typecheck and lint**

Run: `npm run type-check --workspace=packages/frontend && npm run lint --workspace=packages/frontend`
Expected: no errors.

- [ ] **Step 6: Commit** (ask first)

```bash
git add packages/frontend/src/components/CaseworkerDashboardV2/TakenInbox.tsx packages/frontend/src/components/CaseworkerDashboardV2/TakenInbox.test.tsx
git commit -F <scratchpad>/b4-msg.txt
```
Message: `feat(caseworker): sign through ValidSign from the task inbox when a task requires it`

### Task B5: Dashboard start entry "Besluit voorbereiden"

**Files:**
- Create: `packages/frontend/src/components/CaseworkerDashboard/BesluitStartSection.tsx`, `BesluitStartSection.test.tsx`
- Modify: `packages/frontend/src/pages/caseworker-v2/modes.config.ts` (after the `Capaciteit` group)
- Modify: `packages/frontend/src/components/CaseworkerDashboardV2/SectionRouter.tsx`, `SectionRouter.test.tsx`

**Interfaces:**
- Produces: section id `besluit-starten`, which starts `GedelegeerdBesluitProcess` with `{}` variables.

- [ ] **Step 1: Write the failing tests**

Create `BesluitStartSection.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BesluitStartSection from './BesluitStartSection';

const mockBusinessApi = vi.hoisted(() => ({ process: { start: vi.fn() } }));
vi.mock('../../services/api', () => ({ businessApi: mockBusinessApi }));

const indiener = { sub: '1', roles: ['besluit-indiener'] } as never;

beforeEach(() => mockBusinessApi.process.start.mockResolvedValue({ success: true }));
afterEach(() => vi.clearAllMocks());

describe('BesluitStartSection', () => {
  it('refuses a user without the besluit-indiener role', () => {
    render(<BesluitStartSection user={{ sub: '1', roles: ['caseworker'] } as never} />);
    expect(screen.getByText('Geen toegang')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Besluit voorbereiden' })).toBeNull();
  });

  it('starts the process and confirms it', async () => {
    const user = userEvent.setup();
    render(<BesluitStartSection user={indiener} />);
    await user.click(screen.getByRole('button', { name: 'Besluit voorbereiden' }));
    expect(await screen.findByText('Besluit in voorbereiding')).toBeInTheDocument();
    expect(mockBusinessApi.process.start).toHaveBeenCalledWith('GedelegeerdBesluitProcess', {});
  });

  it('says so when the start fails', async () => {
    mockBusinessApi.process.start.mockResolvedValue({ success: false });
    const user = userEvent.setup();
    render(<BesluitStartSection user={indiener} />);
    await user.click(screen.getByRole('button', { name: 'Besluit voorbereiden' }));
    expect(await screen.findByText('Het besluit kon niet worden gestart.')).toBeInTheDocument();
  });
});
```

In `SectionRouter.test.tsx`, add next to the `CapacityClaimSection` mock:

```tsx
vi.mock('../CaseworkerDashboard/BesluitStartSection', () => ({
  default: () => <div>besluit-starten</div>,
}));
```

Add `['besluit-starten', 'besluit-starten'],` to the routing `it.each` table.

- [ ] **Step 2: Run them to verify they fail**

Run: `npx --workspace=packages/frontend vitest run --coverage.enabled=false src/components/CaseworkerDashboard/BesluitStartSection.test.tsx src/components/CaseworkerDashboardV2/SectionRouter.test.tsx`
Expected: FAIL. The module is not found, and the route is unknown.

- [ ] **Step 3: Implement the section**

Create `BesluitStartSection.tsx`:

```tsx
import { useState } from 'react';
import { businessApi } from '../../services/api';
import type { KeycloakUser } from '@ronl/shared';

interface Props {
  user: KeycloakUser | null;
}

/**
 * Starts "Besluitvorming onder gedelegeerde bevoegdheid": a process a
 * medewerker begins from the dashboard, unlike the citizen-initiated
 * requests (Kapvergunning, Thuisbatterij) that arrive from outside it.
 */
export default function BesluitStartSection({ user }: Props) {
  const [started, setStarted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user?.roles?.includes('besluit-indiener')) {
    return (
      <div className="max-w-lg">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
          <h2 className="text-lg font-bold text-gray-800 mb-2">Geen toegang</h2>
          <p className="text-gray-400 text-sm">
            Alleen een indiener kan een besluit onder gedelegeerde bevoegdheid voorbereiden.
          </p>
        </div>
      </div>
    );
  }

  if (started) {
    return (
      <div className="max-w-lg">
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <h2 className="text-lg font-bold text-gray-800 mb-2">Besluit in voorbereiding</h2>
          <p className="text-gray-500 text-sm mb-5">
            De eerste taak, <strong>Kies de juiste beslissingssjabloon</strong>, staat in je
            takenlijst.
          </p>
          <button
            onClick={() => setStarted(false)}
            className="text-sm font-medium hover:underline"
            style={{ color: 'var(--color-primary)' }}
          >
            Nog een besluit voorbereiden
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-base font-semibold text-gray-800 mb-1">
          Besluitvorming onder gedelegeerde bevoegdheid
        </h2>
        <p className="text-sm text-gray-500 mb-6 leading-relaxed">
          Bereid een besluit voor, laat het toetsen door Juridische Zaken en dien het in ter
          ondertekening. Valt het besluit buiten de gedelegeerde bevoegdheid, dan escaleer je naar
          de bevoegde bestuursautoriteit.
        </p>
        {error && (
          <div className="mb-4 p-3 rounded-lg text-sm bg-red-50 text-red-700 border border-red-200">
            {error}
          </div>
        )}
        <button
          onClick={async () => {
            setError(null);
            try {
              const res = await businessApi.process.start('GedelegeerdBesluitProcess', {});
              if (res.success) setStarted(true);
              else setError('Het besluit kon niet worden gestart.');
            } catch {
              setError('Het besluit kon niet worden gestart.');
            }
          }}
          className="px-5 py-2.5 text-sm font-medium text-white rounded-lg transition-opacity hover:opacity-90"
          style={{ backgroundColor: 'var(--color-primary)' }}
        >
          Besluit voorbereiden
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Route and menu**

In `SectionRouter.tsx`, add `import BesluitStartSection from '../CaseworkerDashboard/BesluitStartSection';`. After the capacity-claim lines, add:

```tsx
  // ── Besluitvorming onder gedelegeerde bevoegdheid ─────────────────
  if (sectionId === 'besluit-starten') return <BesluitStartSection user={user} />;
```

In `modes.config.ts`, after the `Capaciteit` group's closing `},`, add:

```ts
      {
        label: 'Besluitvorming',
        items: [
          {
            id: 'besluit-starten',
            label: 'Besluit voorbereiden',
            authRequired: true,
            requiredRoles: ['besluit-indiener'],
          },
        ],
      },
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx --workspace=packages/frontend vitest run --coverage.enabled=false src/components/CaseworkerDashboard/BesluitStartSection.test.tsx src/components/CaseworkerDashboardV2 src/pages/caseworker-v2`
Expected: PASS. If a `modes.config` test pins the full menu shape, add the new group there too.

- [ ] **Step 6: Typecheck and lint**

Run: `npm run type-check --workspace=packages/frontend && npm run lint --workspace=packages/frontend`
Expected: no errors.

- [ ] **Step 7: Commit** (ask first)

```bash
git add packages/frontend/src/components/CaseworkerDashboard/BesluitStartSection.tsx packages/frontend/src/components/CaseworkerDashboard/BesluitStartSection.test.tsx packages/frontend/src/components/CaseworkerDashboardV2/SectionRouter.tsx packages/frontend/src/components/CaseworkerDashboardV2/SectionRouter.test.tsx packages/frontend/src/pages/caseworker-v2/modes.config.ts
git commit -F <scratchpad>/b5-msg.txt
```
Message: `feat(caseworker): dashboard start for besluitvorming onder gedelegeerde bevoegdheid`

### Task B6: Parser fixture for the new BPMN

**Files:**
- Create: `packages/backend/src/rip-swimlane/__fixtures__/declared/GedelegeerdBesluitProcess.bpmn`, a byte copy of LDE's `$B/GedelegeerdBesluitProcess.bpmn` from Task A3
- Modify: `packages/backend/src/rip-swimlane/bpmn-swimlane.test.ts` (append)

**Interfaces:**
- Consumes: `parseSwimlane`, `FIXTURES` (already in the test file).

- [ ] **Step 1: Copy the fixture**

Run: `cp ../linked-data-explorer/packages/frontend/public/examples/flevoland/besluitvorming-gedelegeerd/GedelegeerdBesluitProcess.bpmn packages/backend/src/rip-swimlane/__fixtures__/declared/`

- [ ] **Step 2: Write the test**

Append to `bpmn-swimlane.test.ts`:

```ts
describe('parseSwimlane — besluitvorming onder gedelegeerde bevoegdheid', () => {
  const key = 'GedelegeerdBesluitProcess';
  const m = parseSwimlane(
    readFileSync(join(FIXTURES, 'declared', `${key}.bpmn`), 'utf-8'),
    key
  );

  it('reads six lanes, each human lane holding its own besluit role', () => {
    expect(m.lanes.map((l) => [l.key, l.candidateGroups])).toEqual([
      ['Lane_Indiener', ['besluit-indiener']],
      ['Lane_Juridisch', ['besluit-jurist']],
      ['Lane_Systeem', undefined],
      ['Lane_Bestuursautoriteit', ['besluit-bestuursautoriteit']],
      ['Lane_Ondertekenaar', ['besluit-ondertekenaar']],
      ['Lane_Registratie', ['besluit-registratie']],
    ]);
  });

  it('declares the six phases', () => {
    expect(m.phaseSet?.scheme).toBe('bpmn');
    expect(m.phaseSet?.phases.map((p) => [p.code, p.codeLabel])).toEqual([
      ['voorbereiding', 'Fase 1'],
      ['toetsing', 'Fase 2'],
      ['memorandum', 'Fase 3'],
      ['ondertekening', 'Fase 4'],
      ['escalatie', 'Fase 5'],
      ['registratie', 'Fase 6'],
    ]);
  });

  it('puts every node in the phase the design groups it under', () => {
    expect(Object.fromEntries(m.nodes.map((n) => [n.id, n.phase]))).toEqual({
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

  it('treats the declined-signature path back to "6 Dien in" as a rework loop', () => {
    const back = m.edges.filter((e) => e.back).map((e) => [e.from, e.to]);
    expect(back).toEqual([['Gateway_Ondertekend', 'Task_DienIn']]);
  });
});
```

- [ ] **Step 3: Run it**

Run: `npx --workspace=packages/backend jest --config jest.config.js --coverage=false src/rip-swimlane`
Expected: PASS. The parser already supports declared phases (#298), so this pins behaviour rather than driving new code. If any expectation fails, the BPMN from A3 is wrong. Fix it in LDE first, then re-copy it here.

- [ ] **Step 4: Commit** (ask first)

```bash
git add packages/backend/src/rip-swimlane/__fixtures__/declared/GedelegeerdBesluitProcess.bpmn packages/backend/src/rip-swimlane/bpmn-swimlane.test.ts
git commit -F <scratchpad>/b6-msg.txt
```
Message: `test(swimlane): pin the besluitvorming gedelegeerd lanes, phases and rework loop`

### Task B7: Document the generic signing contract

**Files:**
- Modify: `docs/VALIDSIGN.md`

- [ ] **Step 1: Add the section**

Append a section `## Configuring signing for a process`. Write it with the Write tool to a scratchpad file, then append it with a short `node -e` script; do not use a heredoc. The section text:

```markdown
## Configuring signing for a process

Any process signs a task through ValidSign without code in RBA:

1. Give the user task `ronl:signatureRef="<document id>"`. LDE bundles that `.document` into the deployment.
2. Give the document a `signOff` zone. ValidSign's signature field is anchored at its first line; without it there is nothing to sign.
3. Keep a `camunda:formRef` on the task as the fallback. It is shown when the signing spec cannot be fetched, and it must set `approvalStatus` (`approved` or `rejected`) as signing does.
4. Branch on `approvalStatus` after the task. Signing completes the task server-side, writing `approvalStatus` and the `validsign*` variables.

Every task view (the Infra-board and the caseworker task inbox) shows the signing panel through `useTaskSignature`. Signing state belongs to the task that created the package (`validsignTaskId`), so a process that loops back to a new signing task after a declined signature starts afresh.

The signed document and its evidence summary are archived to eDOCS as `<templateId>-<businessKey>-signed.pdf` and `-evidence.pdf`, titled `<businessKey> — <template name> (ondertekend) — getekend document` and `… — bewijsoverzicht`.
```

- [ ] **Step 2: Commit** (ask first)

```bash
git add docs/VALIDSIGN.md
git commit -F <scratchpad>/b7-msg.txt
```
Message: `docs(validsign): how a process configures signing without code`

### Task B8: Hand-off for Part B, and the walk-through

- [ ] **Step 1:** Hand the user the RBA suites and wait for "green": `npm test` (backend and frontend), and the e2e journeys including R2.1's signing journey. The R2.1 journey still signs through the moved panel; its archived names change, which is expected (Global Constraints).
- [ ] **Step 2:** On green, push `feat/besluitvorming-gedelegeerd` and open the RBA PR to `acc`. The body is written to a file and has no attribution. It lists:
  - the manual step for ACC and PROD: create the five roles and two users in Keycloak there, because the realm is not re-imported;
  - the companion LDE PR.
- [ ] **Step 3:** Hand the user the walk-through on local, with ValidSign stub mode on (the default):
  1. In LDE, deploy `gedelegeerd-besluit-route.dmn` **without an Organization**. Deploy `GedelegeerdBesluitProcess` from the Modeler; it bundles the forms and the document.
  2. Re-import the realm on the local Keycloak, so the roles and users exist. This is the user's own step; do not run it.
  3. Log in as `test-indiener-flevoland` and go to Besluitvorming → Besluit voorbereiden. Steps 1 and 2: use € 10.000. Then log in as `test-besluit-flevoland` for Advies en toetsing (binnen mandaat, niet politiek gevoelig). Back as indiener: step 4 (voorwaarden vervuld), then 6 Dien in.
  4. As `test-besluit-flevoland`, claim Onderteken. The signing panel appears. Choose "Onderteken nu", complete the stub ceremony, and the task completes within one poll interval. Registreer, then Archiveer.
  5. Run it again with € 60.000, which takes the memorandum path. Choose "Niet akkoord" at advies/akkoord, which escalates to Neem besluit.
  6. Run it a third time, declining at Onderteken. The case goes back to 6 Dien in. Resubmit; the new Onderteken task must offer a fresh signing panel (Review Focus 1).
  7. Along the way: the stepper shows "Fase n · stap n van 6", and the lane steps show the six lanes.
