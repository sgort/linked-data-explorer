import fs from 'fs';
import path from 'path';

const REPO_ROOT = path.join(__dirname, '..', '..', '..');
const FIXTURES_ROOT = path.join(REPO_ROOT, 'e2e-fixtures');
const PUBLIC_ROOT = path.join(REPO_ROOT, 'packages', 'frontend', 'public', 'examples');

/**
 * packages/frontend/public/examples/ and e2e-fixtures/ hold the same artefacts.
 *
 * The Modeler serves the first; LDE imports and deploys the second. They must be
 * byte-identical apart from four deliberate labels, listed below — and they are
 * today, for all nineteen overlapping files. Nothing enforced that until this
 * test: the conformance was incidental, maintained by whoever last remembered,
 * which is the same footing the manifest's decisions were on before #187.
 *
 * `example-fixture-parity.test.ts` guards a different pair —
 * examples/organizations/rip-phase-2x against e2e-fixtures — and demands exact
 * equality, because those carry no labels.
 *
 * ── The four sanctioned differences ─────────────────────────────────────────
 *
 * 1. forms      `"e2eFixture": true`, present only in the fixtures copy.
 * 2. documents  `"status": "example"` becomes `"status": "e2e"`. LDE's
 *               process_definitions CHECK permits example | wip | e2e.
 * 3. BPMN       the process key gains an `E2E` suffix, so a fixture deploys
 *               under its own Operaton key instead of colliding with the seeded
 *               example. The suffix appears in ids, calledElement refs and prose.
 * 4. BPMN       an `Annotation_E2EFixture` text annotation, its association and
 *               their two diagram elements, warning on the canvas that
 *               e2e-fixtures/ is the source of truth.
 *
 * Anything else is drift, and this test names the file and the lines.
 */

/** Fixture filename -> the name the same artefact has under public/examples. */
const RENAMED: Record<string, string> = {
  'TreeFellingPermitSubProcessE2E.bpmn': 'TreeFellingPermitSubProcess.bpmn',
  'ThuisbatterijSubsidieDecisionSubProcessE2E.bpmn': 'ThuisbatterijSubsidieDecisionSubProcess.bpmn',
  'ZorgtoeslagProvisionalSubProcessE2E.bpmn': 'ZorgtoeslagProvisionalSubProcess.bpmn',
};

/** Process keys that gain the E2E suffix, longest first so replacement is unambiguous. */
const RENAMED_KEYS = Object.keys(RENAMED)
  .map((f) => f.replace(/E2E\.bpmn$/, ''))
  .sort((a, b) => b.length - a.length);

function stripSanctionedLabels(text: string, isBpmn: boolean): string {
  let out = text;
  // 1. the e2eFixture marker
  out = out.replace(/^[ \t]*"e2eFixture":\s*true,?\r?\n/gm, '');
  // 2. the document status label
  out = out.replace(/"status":\s*"(?:example|e2e)"/g, '"status": "<label>"');
  if (isBpmn) {
    // 4. the on-canvas E2E warning, its association and both diagram elements
    out = out.replace(
      /[ \t]*<bpmn:textAnnotation id="Annotation_E2EFixture">[\s\S]*?<\/bpmn:textAnnotation>\r?\n?/g,
      ''
    );
    out = out.replace(/[ \t]*<bpmn:association id="Association_E2EFixture"[^>]*\/>\r?\n?/g, '');
    out = out.replace(
      /[ \t]*<bpmndi:BPMNShape id="[^"]*Annotation_E2EFixture[^"]*"[\s\S]*?<\/bpmndi:BPMNShape>\r?\n?/g,
      ''
    );
    out = out.replace(
      /[ \t]*<bpmndi:BPMNEdge id="[^"]*Association_E2EFixture[^"]*"[\s\S]*?<\/bpmndi:BPMNEdge>\r?\n?/g,
      ''
    );
    // 3. the E2E key suffix, wherever it appears — ids, refs, prose
    for (const key of RENAMED_KEYS) {
      out = out.split(`${key}E2E`).join(key);
    }
    // Removing the annotation block leaves the blank line that preceded it next
    // to the one that followed it, so the fixtures copy ends up one blank line
    // richer than the examples copy at that spot. That is an artefact of the
    // removal, not drift: collapse runs of blank lines on both sides.
    out = out.replace(/(?:[ \t]*\r?\n){2,}/g, '\n\n');
  }
  return out;
}

function overlappingFiles(): Array<{ tenant: string; fixture: string; example: string }> {
  const out: Array<{ tenant: string; fixture: string; example: string }> = [];
  for (const tenant of fs.readdirSync(FIXTURES_ROOT)) {
    const dir = path.join(FIXTURES_ROOT, tenant);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const file of fs.readdirSync(dir)) {
      if (!fs.statSync(path.join(dir, file)).isFile()) continue;
      const example = RENAMED[file] ?? file;
      if (fs.existsSync(path.join(PUBLIC_ROOT, tenant, example))) {
        out.push({ tenant, fixture: file, example });
      }
    }
  }
  return out;
}

describe('public/examples and e2e-fixtures differ only by their labels', () => {
  const pairs = overlappingFiles();

  it('finds the overlapping artefacts', () => {
    // A guard on the guard: if this ever reads zero, the test below is asserting
    // nothing at all and would pass an empty repository.
    expect(pairs.length).toBeGreaterThan(15);
  });

  it('every overlapping file matches once the sanctioned labels are removed', () => {
    const problems: string[] = [];
    for (const { tenant, fixture, example } of pairs) {
      const isBpmn = fixture.endsWith('.bpmn');
      const a = stripSanctionedLabels(
        fs.readFileSync(path.join(FIXTURES_ROOT, tenant, fixture), 'utf8'),
        isBpmn
      );
      const b = stripSanctionedLabels(
        fs.readFileSync(path.join(PUBLIC_ROOT, tenant, example), 'utf8'),
        isBpmn
      );
      if (a !== b) {
        const al = a.split('\n');
        const bl = b.split('\n');
        const firstDiff = al.findIndex((line, i) => line !== bl[i]);
        problems.push(
          `${tenant}/${fixture}: drifts from public/examples/${tenant}/${example} (first difference at line ${firstDiff + 1})`
        );
      }
    }
    expect(problems).toEqual([]);
  });

  it('the fixtures copy actually carries the labels it is allowed to carry', () => {
    // Without this, deleting a label from BOTH copies would pass the test above
    // while quietly losing the distinction the labels exist to make.
    const problems: string[] = [];
    for (const { tenant, fixture } of pairs) {
      const text = fs.readFileSync(path.join(FIXTURES_ROOT, tenant, fixture), 'utf8');
      if (fixture.endsWith('.form') && !text.includes('"e2eFixture"')) {
        problems.push(`${tenant}/${fixture}: form is missing the "e2eFixture" marker`);
      }
      if (fixture.endsWith('.document') && !/"status":\s*"e2e"/.test(text)) {
        problems.push(`${tenant}/${fixture}: document is not marked "status": "e2e"`);
      }
      if (fixture.endsWith('.bpmn') && !text.includes('Annotation_E2EFixture')) {
        problems.push(`${tenant}/${fixture}: BPMN is missing the on-canvas E2E FIXTURE warning`);
      }
    }
    expect(problems).toEqual([]);
  });
});
