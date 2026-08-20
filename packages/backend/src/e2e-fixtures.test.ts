import fs from 'fs';
import path from 'path';

const FIXTURES_ROOT = path.join(__dirname, '..', '..', '..', 'e2e-fixtures');
const MANIFEST_PATH = path.join(FIXTURES_ROOT, 'manifest.json');

interface FixtureEntry {
  processDefinitionKey: string;
  bpmn: string;
  forms: string[];
  documents: string[];
  source: string;
  subProcesses?: FixtureEntry[];
}

type Manifest = Record<string, FixtureEntry[]>;

function readManifest(): Manifest {
  const raw = fs.readFileSync(MANIFEST_PATH, 'utf8');
  return JSON.parse(raw) as Manifest;
}

function allEntries(entries: FixtureEntry[]): FixtureEntry[] {
  return entries.flatMap((entry) => [entry, ...(entry.subProcesses ?? [])]);
}

describe('e2e-fixtures/manifest.json', () => {
  it('exists and parses as JSON', () => {
    expect(() => readManifest()).not.toThrow();
  });

  it('every declared file exists under its tenant directory', () => {
    const manifest = readManifest();
    for (const [tenant, entries] of Object.entries(manifest)) {
      for (const entry of allEntries(entries)) {
        for (const file of [entry.bpmn, ...entry.forms, ...entry.documents]) {
          const filePath = path.join(FIXTURES_ROOT, tenant, file);
          expect(fs.existsSync(filePath)).toBe(true);
        }
      }
    }
  });

  it("every entry's BPMN id matches its declared processDefinitionKey", () => {
    const manifest = readManifest();
    for (const [tenant, entries] of Object.entries(manifest)) {
      for (const entry of allEntries(entries)) {
        const bpmnPath = path.join(FIXTURES_ROOT, tenant, entry.bpmn);
        const xml = fs.readFileSync(bpmnPath, 'utf8');
        expect(xml).toMatch(new RegExp(`<bpmn:process\\s+id="${entry.processDefinitionKey}"`));
      }
    }
  });

  // BPMN 2.0's tProcess is an ordered sequence — laneSet*, flowElement*, artifact*,
  // resourceRole*, correlationSubscription*, supports* — so once an artifact
  // (textAnnotation / association / group) appears, no further flow element may
  // follow it. Operaton validates against the XSD at deploy time and rejects the
  // whole deployment if it doesn't hold.
  //
  // This is not hypothetical: the commit that added the on-canvas "E2E FIXTURE"
  // warning inserted its textAnnotation and association directly after the first
  // flow element in every fixture, which made four of the five undeployable.
  // Nothing caught it, because these fixtures are hand-edited and never round-trip
  // through bpmn-js — which would have re-serialised them into schema order and
  // silently repaired the mistake.
  it('every fixture BPMN keeps artifacts after its flow elements, as the schema requires', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const libxmljs = require('libxmljs2');
    const ARTIFACTS = new Set(['textAnnotation', 'association', 'group']);
    const ALLOWED_AFTER_ARTIFACT = new Set([
      ...ARTIFACTS,
      'resourceRole',
      'correlationSubscription',
      'supports',
    ]);

    const manifest = readManifest();
    for (const [tenant, entries] of Object.entries(manifest)) {
      for (const entry of allEntries(entries)) {
        const bpmnPath = path.join(FIXTURES_ROOT, tenant, entry.bpmn);
        const doc = libxmljs.parseXml(fs.readFileSync(bpmnPath, 'utf8'));
        const processes = doc.find('//bpmn:process', {
          bpmn: 'http://www.omg.org/spec/BPMN/20100524/MODEL',
        });

        expect(processes.length).toBeGreaterThan(0);

        for (const proc of processes) {
          let sawArtifact = false;
          for (const child of proc.childNodes()) {
            if (child.type() !== 'element') continue;
            const name = child.name();
            if (ARTIFACTS.has(name)) {
              sawArtifact = true;
              continue;
            }
            if (sawArtifact) {
              throw new Error(
                `${tenant}/${entry.bpmn}: <${name}> follows an artifact inside ` +
                  `<bpmn:process id="${entry.processDefinitionKey}">. Move every ` +
                  `textAnnotation/association/group to the end of the process element.`
              );
            }
          }
        }
      }
    }
  });

  it("a shell's calledElement references match its nested subProcess keys", () => {
    const manifest = readManifest();
    for (const [tenant, entries] of Object.entries(manifest)) {
      for (const shell of entries) {
        if (!shell.subProcesses?.length) continue;
        const bpmnPath = path.join(FIXTURES_ROOT, tenant, shell.bpmn);
        const xml = fs.readFileSync(bpmnPath, 'utf8');
        for (const sub of shell.subProcesses) {
          expect(xml).toMatch(new RegExp(`calledElement="${sub.processDefinitionKey}"`));
        }
      }
    }
  });
});
