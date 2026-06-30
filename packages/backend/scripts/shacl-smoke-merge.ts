// packages/backend/scripts/shacl-smoke-merge.ts
//
// Deterministic smoke for merge-simulated validation. Rather than hitting the live
// SPARQL endpoint (whose data drifts), it injects a fixed "already-published" graph
// via the service's GraphFetcher, so the outcome is stable. Demonstrates the core
// value of merge mode: it catches a collision spread ACROSS publications that
// file-local validation cannot see, because the offending values live in different
// files (one uploaded, one already in the store).
//
// Run from packages/backend:  npx ts-node scripts/shacl-smoke-merge.ts

import { ShaclValidationService } from '../src/services/shacl-validation.service';

// Uploaded file: organisation with a SINGLE homepage — clean on its own.
const LOCAL_ORG = `
@prefix cv:   <http://data.europa.eu/m8g/> .
@prefix foaf: <http://xmlns.com/foaf/0.1/> .
@prefix skos: <http://www.w3.org/2004/02/skos/core#> .
@prefix dct:  <http://purl.org/dc/terms/> .

<https://organisaties.overheid.nl/14866/Provincie_Flevoland> a cv:PublicOrganisation ;
    dct:identifier "Provincie_Flevoland" ;
    skos:prefLabel "Provincie Flevoland"@nl ;
    foaf:homepage <https://flevoland.nl/home> ;
    dct:spatial <https://publications.europa.eu/resource/authority/country/NLD> .
`;

// Already-published graph for the same subject — a DIFFERENT (www.) homepage.
// In production this comes back from the SPARQL CONSTRUCT; here it is fixed.
const PUBLISHED_ORG = `
@prefix cv:   <http://data.europa.eu/m8g/> .
@prefix foaf: <http://xmlns.com/foaf/0.1/> .

<https://organisaties.overheid.nl/14866/Provincie_Flevoland> a cv:PublicOrganisation ;
    foaf:homepage <https://www.flevoland.nl/home> .
`;

const ronlErrors = (r: Awaited<ReturnType<ShaclValidationService['validateFile']>>) =>
  r.layers['ronl-custom'].issues.filter((i) => i.severity === 'error').length;

async function main(): Promise<void> {
  // Inject a fixed published graph instead of calling TriplyDB.
  const svc = new ShaclValidationService(async () => PUBLISHED_ORG);

  // Control: file-local sees only the single homepage in the file -> RONL clean.
  const local = await svc.validateFile(LOCAL_ORG);
  console.log('file-local -> RONL errors:', ronlErrors(local));

  // Merge: union with the published www. homepage -> two homepages -> maxCount fires.
  const merged = await svc.validateMerged(LOCAL_ORG, 'https://example.test/sparql');
  console.log('merge-sim  -> RONL errors:', ronlErrors(merged));
  for (const issue of merged.layers['ronl-custom'].issues) {
    console.log(`   [${issue.severity}] ${issue.code} — ${issue.message}`);
    if (issue.location) console.log(`           @ ${issue.location}`);
  }

  const ok = ronlErrors(local) === 0 && ronlErrors(merged) === 1;
  console.log(
    `\n${ok ? 'PASS' : 'FAIL'}: file-local clean (got ${ronlErrors(local)}), ` +
      `merge catches the cross-publication homepage collision (got ${ronlErrors(merged)}).`
  );
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
