// packages/backend/scripts/shacl-smoke.ts
//
// Milestone-1 smoke test for the SHACL validation service, runnable before the
// HTTP route exists. Feeds the merged Flevoland fixture (one organisation subject
// carrying two divergent foaf:homepage values — the result of unioning File A and
// File B) through validateFile and prints the report.
//
// Asserts on the RONL Custom layer specifically: exactly one error on focus node
// Provincie_Flevoland, path foaf:homepage. Independent of whether the CPSV-AP layer
// is vendored (which, once present, also flags this fixture for missing dct:spatial).
//
// Run from packages/backend:  npx ts-node scripts/shacl-smoke.ts

import { shaclValidationService } from '../src/services/shacl-validation.service';

const MERGED_FIXTURE = `
@prefix cv:   <http://data.europa.eu/m8g/> .
@prefix foaf: <http://xmlns.com/foaf/0.1/> .
@prefix skos: <http://www.w3.org/2004/02/skos/core#> .
@prefix dct:  <http://purl.org/dc/terms/> .

<https://organisaties.overheid.nl/14866/Provincie_Flevoland> a cv:PublicOrganisation ;
    dct:identifier "Provincie_Flevoland" ;
    skos:prefLabel "Provincie Flevoland"@nl ;
    foaf:homepage <https://flevoland.nl/home> ;
    foaf:homepage <https://www.flevoland.nl/home> ;
    cv:spatial <https://publications.europa.eu/resource/authority/country/NLD> .
`;

async function main(): Promise<void> {
  const result = await shaclValidationService.validateFile(MERGED_FIXTURE);

  console.log('valid     :', result.valid);
  console.log('parseError:', result.parseError);
  console.log('summary   :', JSON.stringify(result.summary));
  for (const [key, layer] of Object.entries(result.layers)) {
    if (layer.issues.length === 0) continue;
    console.log(`\nlayer ${key} (${layer.label}):`);
    for (const issue of layer.issues) {
      console.log(`  [${issue.severity}] ${issue.code} — ${issue.message}`);
      if (issue.location) console.log(`           @ ${issue.location}`);
    }
  }

  const ronlErrors = result.layers['ronl-custom'].issues.filter((i) => i.severity === 'error').length;
  const ok = ronlErrors === 1;
  console.log(`\n${ok ? 'PASS' : 'FAIL'}: expected exactly one error in the RONL Custom layer (got ${ronlErrors}).`);
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
