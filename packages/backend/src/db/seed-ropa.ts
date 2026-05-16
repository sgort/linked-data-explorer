import pool from './pool';
import { upsertRopa } from '../services/ropa.service';

export async function seedRopa(): Promise<void> {
  if (!pool) {
    console.error('[seed-ropa] DATABASE_URL not configured — aborting');
    process.exit(1);
  }

  console.log('[seed-ropa] Seeding RoPA records…');

  // ─── 1. AWB Shell — Flevoland ─────────────────────────────────────────────
  const flevolandShellId = await upsertRopa({
    bpmnProcessId: 'AwbShellProcess',
    processLevel: 'shell',
    title: 'AWB Shell — Tree Felling Permit (procedural)',
    controllerName: 'Provincie Flevoland',
    controllerContact: 'avg@flevoland.nl',
    dpoContact: 'fg@flevoland.nl',
    purpose:
      'Processing of tree felling permit applications under the Dutch Administrative Law Act (Awb), covering receipt acknowledgement, completeness check, decision subprocess, citizen notification, and archiving.',
    legalBasisUri: 'https://data.europa.eu/eli/reg/2016/679/art_6_par_1_lit_e/oj',
    legalBasisLabel: 'Algemene wet bestuursrecht (Awb)',
    gdprArticle: 'Art. 6(1)(e) — Public task',
    dataSubjects:
      'Natural persons and legal entities applying for a tree felling permit within the Province of Flevoland.',
    recipients:
      'Internal caseworkers (candidateGroups=caseworker); archiving system (Archiefwet); eDOCS document management system (dossier reference only).',
    thirdCountryTransfers: false,
    retentionPeriod: '7 years minimum (Archiefwet baseline via ArchivesActRetention DMN)',
    securityMeasures:
      'TLS in transit; PostgreSQL at rest; Keycloak-gated caseworker access (candidateGroups claim); audit log per request; task claim required before personal data is accessible.',
    status: 'active',
    schemaVersion: 1,
    personalDataFields: [
      {
        id: 'f1a',
        ropaRecordId: '',
        formId: 'awb-notify-applicant',
        fieldKey: 'applicantId',
        fieldLabel: 'Applicant ID (BSN)',
        dataCategory: 'identity',
        specialCategory: false,
        sortOrder: 0,
      },
      {
        id: 'f1b',
        ropaRecordId: '',
        formId: 'awb-notify-applicant',
        fieldKey: 'dossierReference',
        fieldLabel: 'Dossier reference number',
        dataCategory: 'identity',
        specialCategory: false,
        sortOrder: 1,
      },
      {
        id: 'f1c',
        ropaRecordId: '',
        formId: 'awb-notify-applicant',
        fieldKey: 'receiptDate',
        fieldLabel: 'Date of receipt',
        dataCategory: 'identity',
        specialCategory: false,
        sortOrder: 2,
      },
      {
        id: 'f1d',
        ropaRecordId: '',
        formId: 'awb-notify-applicant',
        fieldKey: 'awbDeadlineDate',
        fieldLabel: 'Decision deadline (Awb 4:13)',
        dataCategory: 'identity',
        specialCategory: false,
        sortOrder: 3,
      },
      {
        id: 'f1e',
        ropaRecordId: '',
        formId: 'awb-notify-applicant',
        fieldKey: 'notificationMethod',
        fieldLabel: 'Notification method',
        dataCategory: 'identity',
        specialCategory: false,
        sortOrder: 4,
      },
    ],
  });
  console.log(`[seed-ropa] AwbShellProcess (Flevoland) → ${flevolandShellId}`);

  // ─── 2. Tree Felling Permit — subprocess ──────────────────────────────────
  const treeFellingId = await upsertRopa({
    bpmnProcessId: 'TreeFellingPermitSubProcess',
    processLevel: 'subprocess',
    title: 'Tree Felling Permit — material law assessment',
    controllerName: 'Provincie Flevoland',
    controllerContact: 'avg@flevoland.nl',
    dpoContact: 'fg@flevoland.nl',
    purpose:
      'Assessing and deciding on tree felling permit applications under the Environmental Activities Act (Omgevingswet), including automated DMN evaluation, caseworker review, and optional replacement tree requirement.',
    legalBasisUri: 'https://data.europa.eu/eli/reg/2016/679/art_6_par_1_lit_e/oj',
    legalBasisLabel: 'Omgevingswet / Wet algemene bepalingen omgevingsrecht (Wabo)',
    gdprArticle: 'Art. 6(1)(e) — Public task',
    dataSubjects:
      'Natural persons and legal entities requesting a tree felling permit within the Province of Flevoland.',
    recipients:
      'Internal caseworkers (candidateGroups=caseworker); archiving system. eDOCS external task worker receives the dossier reference only — no personal data.',
    thirdCountryTransfers: false,
    retentionPeriod:
      'Minimum 5 years for permit decisions (ArchivesActRetention DMN — resultaat=Granted or Rejected)',
    securityMeasures:
      'TLS in transit; PostgreSQL at rest; task claim required before review form is accessible; role-based access (caseworker group); audit log.',
    status: 'active',
    schemaVersion: 1,
    personalDataFields: [
      {
        id: 'f2a',
        ropaRecordId: '',
        formId: 'kapvergunning-start',
        fieldKey: 'applicantId',
        fieldLabel: 'Applicant ID (pre-filled, hidden)',
        dataCategory: 'identity',
        specialCategory: false,
        sortOrder: 0,
      },
      {
        id: 'f2b',
        ropaRecordId: '',
        formId: 'kapvergunning-start',
        fieldKey: 'treeDiameter',
        fieldLabel: 'Tree diameter (cm)',
        dataCategory: 'other',
        specialCategory: false,
        sortOrder: 1,
      },
      {
        id: 'f2c',
        ropaRecordId: '',
        formId: 'kapvergunning-start',
        fieldKey: 'protectedArea',
        fieldLabel: 'Tree located in protected area',
        dataCategory: 'other',
        specialCategory: false,
        sortOrder: 2,
      },
    ],
  });
  console.log(`[seed-ropa] TreeFellingPermitSubProcess → ${treeFellingId}`);

  // ─── 3. AWB Shell — Zorgtoeslag ───────────────────────────────────────────
  const zorgShellId = await upsertRopa({
    bpmnProcessId: 'AwbZorgtoeslagProcess',
    processLevel: 'shell',
    title: 'AWB Shell — Zorgtoeslag (procedural)',
    //controllerName: 'Belastingdienst / Dienst Toeslagen',
    controllerName: 'Provincie Flevoland / Dienst Toeslagen',
    controllerContact: 'toeslagen@belastingdienst.nl',
    dpoContact: 'fg@belastingdienst.nl',
    purpose:
      'Processing of health care allowance (zorgtoeslag) applications under the Dutch Administrative Law Act (Awb), covering receipt acknowledgement, completeness check, provisional entitlement subprocess, citizen notification, and archiving.',
    legalBasisUri: 'https://data.europa.eu/eli/reg/2016/679/art_6_par_1_lit_c/oj',
    legalBasisLabel: 'Wet op de zorgtoeslag (Wzt) jo. Algemene wet bestuursrecht (Awb)',
    gdprArticle: 'Art. 6(1)(c) — Legal obligation',
    dataSubjects: 'Dutch residents applying for health care allowance (zorgtoeslag).',
    recipients:
      'Internal caseworkers (candidateGroups=caseworker); Belastingdienst income verification (final settlement); archiving system.',
    thirdCountryTransfers: false,
    retentionPeriod:
      '7 years (fiscal data retention under Wzt art. 16 and Algemene wet inzake rijksbelastingen)',
    securityMeasures:
      'TLS in transit; PostgreSQL at rest; Keycloak authentication; task claim gating; audit log per request; tenant isolation (municipality=toeslagen).',
    status: 'active',
    schemaVersion: 1,
    personalDataFields: [
      {
        id: 'f3a',
        ropaRecordId: '',
        formId: 'zorgtoeslag-notify-applicant',
        fieldKey: 'applicantId',
        fieldLabel: 'Applicant ID (BSN)',
        dataCategory: 'identity',
        specialCategory: false,
        sortOrder: 0,
      },
      {
        id: 'f3b',
        ropaRecordId: '',
        formId: 'zorgtoeslag-notify-applicant',
        fieldKey: 'dossierReference',
        fieldLabel: 'Dossier reference number',
        dataCategory: 'identity',
        specialCategory: false,
        sortOrder: 1,
      },
      {
        id: 'f3c',
        ropaRecordId: '',
        formId: 'zorgtoeslag-notify-applicant',
        fieldKey: 'notificationMethod',
        fieldLabel: 'Notification method',
        dataCategory: 'identity',
        specialCategory: false,
        sortOrder: 2,
      },
    ],
  });
  console.log(`[seed-ropa] AwbZorgtoeslagProcess → ${zorgShellId}`);

  // ─── 4. Zorgtoeslag Provisional — subprocess ──────────────────────────────
  const zorgProvisionalId = await upsertRopa({
    bpmnProcessId: 'ZorgtoeslagProvisionalSubProcess',
    processLevel: 'subprocess',
    title: 'Zorgtoeslag — provisional entitlement assessment',
    controllerName: 'Provincie Flevoland / Dienst Toeslagen',
    //controllerName: 'Belastingdienst / Dienst Toeslagen',
    controllerContact: 'toeslagen@belastingdienst.nl',
    dpoContact: 'fg@belastingdienst.nl',
    purpose:
      'Assessing provisional health care allowance (zorgtoeslag) entitlement based on income, household composition, residence, and insurance status, as mandated by the Wet op de zorgtoeslag (Wzt). Includes automated DMN evaluation and caseworker review.',
    legalBasisUri: 'https://data.europa.eu/eli/reg/2016/679/art_6_par_1_lit_c/oj',
    legalBasisLabel: 'Wet op de zorgtoeslag (Wzt)',
    gdprArticle: 'Art. 6(1)(c) — Legal obligation',
    dataSubjects: 'Dutch residents submitting a provisional zorgtoeslag application.',
    recipients:
      'Internal caseworkers (candidateGroups=caseworker); Belastingdienst income verification service (final settlement phase only); archiving system.',
    thirdCountryTransfers: false,
    retentionPeriod: '7 years (Wzt art. 16 and AWR fiscal retention)',
    securityMeasures:
      'TLS in transit; PostgreSQL at rest; Keycloak authentication; task claim gating; audit log; tenant isolation (municipality=toeslagen).',
    status: 'active',
    schemaVersion: 1,
    personalDataFields: [
      {
        id: 'f4a',
        ropaRecordId: '',
        formId: 'zorgtoeslag-provisional-start',
        fieldKey: 'geboortedatum',
        fieldLabel: 'Date of birth',
        dataCategory: 'identity',
        specialCategory: false,
        sortOrder: 0,
      },
      {
        id: 'f4b',
        ropaRecordId: '',
        formId: 'zorgtoeslag-provisional-start',
        fieldKey: 'leeftijdOpDatumBerekening',
        fieldLabel: 'Age on calculation date',
        dataCategory: 'identity',
        specialCategory: false,
        sortOrder: 1,
      },
      {
        id: 'f4c',
        ropaRecordId: '',
        formId: 'zorgtoeslag-provisional-start',
        fieldKey: 'leeftijdOpLaatsteDagVorigeMaand',
        fieldLabel: 'Age on last day of previous month',
        dataCategory: 'identity',
        specialCategory: false,
        sortOrder: 2,
      },
      {
        id: 'f4d',
        ropaRecordId: '',
        formId: 'zorgtoeslag-provisional-start',
        fieldKey: 'leeftijdOpLaatsteDagHuidigeMaand',
        fieldLabel: 'Age on last day of current month',
        dataCategory: 'identity',
        specialCategory: false,
        sortOrder: 3,
      },
      {
        id: 'f4e',
        ropaRecordId: '',
        formId: 'zorgtoeslag-provisional-start',
        fieldKey: 'overlijdensdatum',
        fieldLabel: 'Date of death',
        dataCategory: 'civil status',
        specialCategory: false,
        sortOrder: 4,
      },
      {
        id: 'f4f',
        ropaRecordId: '',
        formId: 'zorgtoeslag-provisional-start',
        fieldKey: 'woonachtigNL',
        fieldLabel: 'Resident in the Netherlands',
        dataCategory: 'residence',
        specialCategory: false,
        sortOrder: 5,
      },
      {
        id: 'f4g',
        ropaRecordId: '',
        formId: 'zorgtoeslag-provisional-start',
        fieldKey: 'rechtmatigVerblijfNL',
        fieldLabel: 'Lawful residence in the Netherlands',
        dataCategory: 'residence',
        specialCategory: false,
        sortOrder: 6,
      },
      {
        id: 'f4h',
        ropaRecordId: '',
        formId: 'zorgtoeslag-provisional-start',
        fieldKey: 'statusZorgverzekerd',
        fieldLabel: 'Health insurance status',
        dataCategory: 'health',
        specialCategory: true,
        sortOrder: 7,
      },
      {
        id: 'f4i',
        ropaRecordId: '',
        formId: 'zorgtoeslag-provisional-start',
        fieldKey: 'gedetineerd',
        fieldLabel: 'Detained',
        dataCategory: 'criminal',
        specialCategory: true,
        sortOrder: 8,
      },
      {
        id: 'f4j',
        ropaRecordId: '',
        formId: 'zorgtoeslag-provisional-start',
        fieldKey: 'toetsingsinkomen',
        fieldLabel: 'Assessment income (EUR)',
        dataCategory: 'financial',
        specialCategory: false,
        sortOrder: 9,
      },
      {
        id: 'f4k',
        ropaRecordId: '',
        formId: 'zorgtoeslag-provisional-start',
        fieldKey: 'woonlandfactorBuitenland',
        fieldLabel: 'Country factor (abroad residents)',
        dataCategory: 'residence',
        specialCategory: false,
        sortOrder: 10,
      },
    ],
  });
  console.log(`[seed-ropa] ZorgtoeslagProvisionalSubProcess → ${zorgProvisionalId}`);

  console.log('[seed-ropa] Done.');
  process.exit(0);
}

seedRopa().catch((err) => {
  console.error('[seed-ropa] Fatal:', err);
  process.exit(1);
});
