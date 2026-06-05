// packages/backend/scripts/shacl-smoke-rules.ts
//
// Smoke test for the rule shapes. Loads fixtures from tests/fixtures/shacl/ and
// asserts on the RONL Custom layer specifically (so it is independent of whether the
// CPSV-AP shapes are vendored — those add their own, separate findings):
//   - rule-collision-fail.ttl : three cpsv:Rule blocks under ONE subject URI ->
//                               2 RONL errors (dct:title + dct:description uniqueLang).
//   - rule-collision-pass.ttl : the same three rules under unique URIs -> 0 RONL errors.
//   - cpsv-ap-conformant.ttl  : a fully conformant Rule -> valid, 0 errors in both layers.
//
// Run from packages/backend:  npx ts-node scripts/shacl-smoke-rules.ts

import { readFileSync } from 'fs';
import path from 'path';
import { shaclValidationService } from '../src/services/shacl-validation.service';

const FIXTURES = path.resolve(__dirname, '../tests/fixtures/shacl');

async function main(): Promise<void> {
  const fail = readFileSync(path.join(FIXTURES, 'rule-collision-fail.ttl'), 'utf8');
  const pass = readFileSync(path.join(FIXTURES, 'rule-collision-pass.ttl'), 'utf8');
  const conformant = readFileSync(path.join(FIXTURES, 'cpsv-ap-conformant.ttl'), 'utf8');

  console.log('### rule-collision-fail.ttl (must FAIL) ###');
  const rf = await shaclValidationService.validateFile(fail);
  console.log('valid:', rf.valid, '| summary:', JSON.stringify(rf.summary));
  for (const issue of rf.layers['ronl-custom'].issues) {
    console.log(`  [${issue.severity}] ${issue.code} — ${issue.message}`);
    if (issue.location) console.log(`           @ ${issue.location}`);
  }

  console.log('\n### rule-collision-pass.ttl (must PASS the RONL layer) ###');
  const rp = await shaclValidationService.validateFile(pass);
  console.log('valid:', rp.valid, '| summary:', JSON.stringify(rp.summary));

  console.log('\n### cpsv-ap-conformant.ttl (must be valid in both layers) ###');
  const rc = await shaclValidationService.validateFile(conformant);
  console.log('valid:', rc.valid, '| summary:', JSON.stringify(rc.summary));

  const ronlErrors = (r: Awaited<ReturnType<typeof shaclValidationService.validateFile>>) =>
    r.layers['ronl-custom'].issues.filter((i) => i.severity === 'error').length;

  const ok = ronlErrors(rf) === 2 && ronlErrors(rp) === 0 && rc.valid && rc.summary.errors === 0;
  console.log(
    `\n${ok ? 'PASS' : 'FAIL'}: expected RONL fail=2, RONL pass=0, conformant clean ` +
      `(got fail=${ronlErrors(rf)}, pass=${ronlErrors(rp)}, conformant valid=${rc.valid}/${rc.summary.errors}E).`
  );
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
