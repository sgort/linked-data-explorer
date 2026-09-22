import fs from 'fs';
import path from 'path';

const REPO_ROOT = path.join(__dirname, '..', '..', '..');
const FIXTURES_ROOT = path.join(REPO_ROOT, 'e2e-fixtures');
const MANIFEST_PATH = path.join(FIXTURES_ROOT, 'manifest.json');

/**
 * The bundle's DMN dependencies.
 *
 * Every process here calls decisions, and the manifest used to say nothing about
 * any of them: it described `bpmn`, `forms`, `documents` and `subProcesses` and
 * shipped no `.dmn` at all. A stack rebuilt from the documented bundle therefore
 * deployed cleanly, served its start forms cleanly, and then failed at the first
 * business rule task with
 *
 *   no decision definition deployed with key 'AwbCompletenessCheck'
 *   and tenant-id 'null': decisionDefinition is null
 *
 * — one key at a time, four rounds of the same discovery, with nothing in the
 * bundle to suggest a DMN was ever involved (#187).
 *
 * These tests make the manifest answerable to the BPMN rather than to whoever
 * last remembered. The invariant that matters is the last one: every
 * camunda:decisionRef in every fixture is declared. Adding a process that calls
 * a decision nobody shipped now fails here instead of on someone's laptop.
 */

interface FixtureEntry {
  processDefinitionKey: string;
  bpmn: string;
  forms: string[];
  documents: string[];
  decisions?: string[];
  subProcesses?: FixtureEntry[];
}

interface SharedDecisions {
  files: Record<string, string[]>;
  external: Record<string, string>;
}

function readManifest(): {
  sharedDecisions: SharedDecisions;
  tenants: Record<string, FixtureEntry[]>;
} {
  const raw = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8')) as Record<string, unknown>;
  const { sharedDecisions, ...tenants } = raw;
  return {
    sharedDecisions: sharedDecisions as SharedDecisions,
    tenants: tenants as Record<string, FixtureEntry[]>,
  };
}

function allEntries(entries: FixtureEntry[]): FixtureEntry[] {
  return entries.flatMap((e) => [e, ...allEntries(e.subProcesses ?? [])]);
}

/** Every decision key the bundle can satisfy: shipped in a file, or named as external. */
function providedKeys(shared: SharedDecisions): Set<string> {
  return new Set([...Object.values(shared.files).flat(), ...Object.keys(shared.external)]);
}

describe('e2e-fixtures decision dependencies (#187)', () => {
  it('ships every decision file it declares', () => {
    const { sharedDecisions } = readManifest();
    const missing = Object.keys(sharedDecisions.files).filter(
      (rel) => !fs.existsSync(path.join(FIXTURES_ROOT, rel))
    );
    expect(missing).toEqual([]);
  });

  it('each shipped file provides exactly the decisions it claims', () => {
    const { sharedDecisions } = readManifest();
    const problems: string[] = [];
    for (const [rel, claimed] of Object.entries(sharedDecisions.files)) {
      const xml = fs.readFileSync(path.join(FIXTURES_ROOT, rel), 'utf8');
      const actual = [...xml.matchAll(/<decision\s+id="([^"]+)"/g)].map((m) => m[1]).sort();
      const expected = [...claimed].sort();
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        problems.push(
          `${rel}: declares ${JSON.stringify(expected)} but holds ${JSON.stringify(actual)}`
        );
      }
    }
    expect(problems).toEqual([]);
  });

  it("every entry's declared decisions match the decisionRefs in its BPMN", () => {
    const { tenants } = readManifest();
    const problems: string[] = [];
    for (const [tenant, entries] of Object.entries(tenants)) {
      for (const entry of allEntries(entries)) {
        const xml = fs.readFileSync(path.join(FIXTURES_ROOT, tenant, entry.bpmn), 'utf8');
        const refs = [
          ...new Set([...xml.matchAll(/camunda:decisionRef="([^"]+)"/g)].map((m) => m[1])),
        ].sort();
        const declared = [...(entry.decisions ?? [])].sort();
        if (JSON.stringify(refs) !== JSON.stringify(declared)) {
          problems.push(
            `${tenant}/${entry.processDefinitionKey}: BPMN calls ${JSON.stringify(refs)}, manifest declares ${JSON.stringify(declared)}`
          );
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it('every decision any fixture calls is shipped or declared external', () => {
    // The invariant #187 is actually about. A process that calls a decision the
    // bundle neither ships nor names is a stack that deploys and then fails at
    // its first business rule task.
    const { sharedDecisions, tenants } = readManifest();
    const provided = providedKeys(sharedDecisions);
    const undeclared: string[] = [];
    for (const [tenant, entries] of Object.entries(tenants)) {
      for (const entry of allEntries(entries)) {
        const xml = fs.readFileSync(path.join(FIXTURES_ROOT, tenant, entry.bpmn), 'utf8');
        for (const m of xml.matchAll(/camunda:decisionRef="([^"]+)"/g)) {
          if (!provided.has(m[1])) {
            undeclared.push(`${tenant}/${entry.processDefinitionKey} calls ${m[1]}`);
          }
        }
      }
    }
    expect([...new Set(undeclared)]).toEqual([]);
  });

  it('every businessRuleTask resolves the untenanted decision', () => {
    // The trap that cost an afternoon: the DMNs are deployed WITHOUT an
    // Organization, and the BPMN must say so. A businessRuleTask without
    // decisionRefTenantId="${null}" resolves inside the process's own tenant,
    // where the engine will not find it — and the error names the key, not the
    // missing attribute, so it reads as a missing deployment.
    const { tenants } = readManifest();
    const problems: string[] = [];
    for (const [tenant, entries] of Object.entries(tenants)) {
      for (const entry of allEntries(entries)) {
        const xml = fs.readFileSync(path.join(FIXTURES_ROOT, tenant, entry.bpmn), 'utf8');
        for (const m of xml.matchAll(/<bpmn:businessRuleTask\b[^>]*>/g)) {
          const tag = m[0];
          if (!tag.includes('camunda:decisionRef=')) continue;
          if (!tag.includes('camunda:decisionRefTenantId="${null}"')) {
            const id = /id="([^"]+)"/.exec(tag)?.[1] ?? '(unknown)';
            problems.push(
              `${tenant}/${entry.processDefinitionKey}: ${id} has no decisionRefTenantId="\${null}"`
            );
          }
        }
      }
    }
    expect(problems).toEqual([]);
  });
});
