// packages/backend/scripts/shacl-smoke-requires.ts
//
// Pins what the real, vendored shapes say about dct:requires (#316). The unit
// tests mock the validator (its RDF stack is ESM-only, which Jest here cannot
// load), so only a run against the real shapes notices when a shape or
// validator change turns this into more errors, or makes it disappear.
//
//   - cpsv-ap-requires.ttl : a conformant PublicService with dct:requires to a
//     service described in another graph. Since #315 that is exactly one
//     CPSV-AP issue, a SHACL-CLASS WARNING at the dct:requires path; RONL and
//     CPRMV report nothing, and the file is valid.
//   - the same file with the required service described, but not as a
//     cpsv:PublicService : the class check still applies, so it stays an ERROR.
//     The warning is only for what this file cannot see.
//
// Run from packages/backend:  npx ts-node scripts/shacl-smoke-requires.ts

import { readFileSync } from 'fs';
import path from 'path';
import { shaclValidationService } from '../src/services/shacl-validation.service';

const FIXTURES = path.resolve(__dirname, '../tests/fixtures/shacl');
const REQUIRED = 'https://regels.overheid.nl/services/other';

type Result = Awaited<ReturnType<typeof shaclValidationService.validateFile>>;

function show(label: string, r: Result): void {
  console.log(`### ${label} ###`);
  console.log('valid:', r.valid, '| summary:', JSON.stringify(r.summary));
  for (const [key, layer] of Object.entries(r.layers)) {
    for (const issue of layer.issues) {
      console.log(`  ${key} [${issue.severity}] ${issue.code} @ ${issue.location ?? ''}`);
    }
  }
}

async function main(): Promise<void> {
  const external = readFileSync(path.join(FIXTURES, 'cpsv-ap-requires.ttl'), 'utf8');
  // Describe the required service in this file, with a title but no class.
  const described = `${external}\n<${REQUIRED}> dct:title "Ander"@nl .\n`;

  const re = await shaclValidationService.validateFile(external);
  show('cpsv-ap-requires.ttl (required service in another graph)', re);
  const rd = await shaclValidationService.validateFile(described);
  show('required service described here, not as a PublicService', rd);

  const cpsv = (r: Result) => r.layers['cpsv-ap'].issues;
  const others = (r: Result) =>
    r.layers['ronl-custom'].issues.length + r.layers.cprmv.issues.length;
  const isRequiresClass = (i: { code: string; location?: string }) =>
    i.code === 'SHACL-CLASS' && (i.location ?? '').endsWith('dct:requires');

  const externalOk =
    re.complete &&
    re.valid &&
    cpsv(re).length === 1 &&
    isRequiresClass(cpsv(re)[0]) &&
    cpsv(re)[0].severity === 'warning' &&
    others(re) === 0;
  const describedOk =
    rd.complete && !rd.valid && cpsv(rd).some((i) => isRequiresClass(i) && i.severity === 'error');

  const ok = externalOk && describedOk;
  console.log(
    `\n${ok ? 'PASS' : 'FAIL'}: expected one SHACL-CLASS warning on dct:requires for the external ` +
      `service (got ${
        cpsv(re)
          .map((i) => `${i.severity} ${i.code}`)
          .join(', ') || 'none'
      }; other layers ${others(re)}), and an error once it is described ` +
      `(got ${describedOk ? 'an error' : 'none'}).`
  );
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
