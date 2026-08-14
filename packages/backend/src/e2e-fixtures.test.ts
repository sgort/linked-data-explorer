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
