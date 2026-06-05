// packages/backend/scripts/shacl-smoke-rules.ts
//
// Smoke test for the rule URI-collision shape (ronl:RuleUniquenessShape). Loads two
// fixtures from tests/fixtures/shacl/ and asserts the expected outcomes:
//   - rule-collision-fail.ttl : three cpsv:Rule blocks under ONE subject URI ->
//                               2 errors (one each on dct:title and dct:description),
//                               each naming the three collided values.
//   - rule-collision-pass.ttl : the same three rules under unique URIs -> valid.
//
// Run from packages/backend:  npx ts-node scripts/shacl-smoke-rules.ts

import { readFileSync } from 'fs';
import path from 'path';
import { shaclValidationService } from '../src/services/shacl-validation.service';

const FIXTURES = path.resolve(__dirname, '../tests/fixtures/shacl');

async function main(): Promise<void> {
    const fail = readFileSync(path.join(FIXTURES, 'rule-collision-fail.ttl'), 'utf8');
    const pass = readFileSync(path.join(FIXTURES, 'rule-collision-pass.ttl'), 'utf8');

    console.log('### rule-collision-fail.ttl (must FAIL) ###');
    const rf = await shaclValidationService.validateFile(fail);
    console.log('valid:', rf.valid, '| summary:', JSON.stringify(rf.summary));
    for (const issue of rf.layers['ronl-custom'].issues) {
        console.log(`  [${issue.severity}] ${issue.code} — ${issue.message}`);
        if (issue.location) console.log(`           @ ${issue.location}`);
    }

    console.log('\n### rule-collision-pass.ttl (must PASS) ###');
    const rp = await shaclValidationService.validateFile(pass);
    console.log('valid:', rp.valid, '| summary:', JSON.stringify(rp.summary));

    const ok = !rf.valid && rf.summary.errors === 2 && rp.valid && rp.summary.errors === 0;
    console.log(`\n${ok ? 'PASS' : 'FAIL'}: expected fail=2 errors, pass=0 errors.`);
    process.exit(ok ? 0 : 1);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});