/**
 * Default Document Templates
 *
 * Destination: packages/frontend/src/components/DocumentComposer/defaultTemplates.ts
 *
 * Seeded on first load, exactly like the example forms in FormEditor.tsx.
 * Templates are marked readonly so they cannot be deleted.
 */

import { DocumentTemplate } from '../../types/document.types';

/** Helper: create an empty TipTap doc with one paragraph */
function emptyDoc(text = '') {
  return {
    type: 'doc' as const,
    content: [
      {
        type: 'paragraph',
        content: text ? [{ type: 'text', text }] : [],
      },
    ],
  };
}

/** Helper: create a heading node */
function heading(level: 1 | 2 | 3, text: string) {
  return {
    type: 'doc' as const,
    content: [
      {
        type: 'heading',
        attrs: { level },
        content: [{ type: 'text', text }],
      },
    ],
  };
}

/** Helper: create a doc with multiple paragraphs */
function paragraphs(lines: string[]) {
  return {
    type: 'doc' as const,
    content: lines.map((line) => ({
      type: 'paragraph',
      content: line ? [{ type: 'text', text: line }] : [],
    })),
  };
}

export const TREE_FELLING_BESCHIKKING: DocumentTemplate = {
  id: 'example_treefelling_beschikking',
  name: 'Kapvergunning Beschikking (Example)',
  description: 'Formele beschikking Awb voor de kapvergunning — TreeFelling Permit Process',
  processKey: 'AwbShellProcess',
  serviceId: 'TreeFellingPermit',
  schemaVersion: 1,
  readonly: false,
  status: 'example',
  language: 'en',
  organization: 'flevoland',
  createdAt: '2026-03-07T00:00:00.000Z',
  updatedAt: '2026-03-07T00:00:00.000Z',
  assets: [],
  bindings: [
    {
      id: 'b1',
      placeholder: '{{dossierReference}}',
      variableKey: 'dossierReference',
      source: 'process',
      label: 'Dossiernummer',
    },
    {
      id: 'b2',
      placeholder: '{{permitDecision}}',
      variableKey: 'permitDecision',
      source: 'dmn_output',
      label: 'Vergunningsbesluit',
    },
    {
      id: 'b3',
      placeholder: '{{finalMessage}}',
      variableKey: 'finalMessage',
      source: 'dmn_output',
      label: 'Beslissingstekst',
    },
    {
      id: 'b4',
      placeholder: '{{replacementInfo}}',
      variableKey: 'replacementInfo',
      source: 'dmn_output',
      label: 'Herplantinformatie',
    },
    {
      id: 'b5',
      placeholder: '{{applicationDate}}',
      variableKey: 'applicationDate',
      source: 'process',
      label: 'Aanvraagdatum',
    },
    {
      id: 'b6',
      placeholder: '{{applicantId}}',
      variableKey: 'applicantId',
      source: 'process',
      label: 'BSN / Aanvrager-ID',
    },
  ],
  zones: {
    letterhead: {
      blocks: [
        {
          id: 'lh_org_name',
          type: 'text',
          label: 'Organisatienaam',
          content: {
            type: 'doc',
            content: [
              {
                type: 'heading',
                attrs: { level: 1 },
                content: [{ type: 'text', text: 'Provincie Flevoland' }],
              },
              {
                type: 'paragraph',
                content: [
                  {
                    type: 'text',
                    text: 'Omgevingsdienst — Afdeling Vergunningen',
                    marks: [{ type: 'italic' }],
                  },
                ],
              },
            ],
          },
        },
        {
          id: 'lh_separator',
          type: 'separator',
          label: 'Scheidingslijn',
        },
      ],
    },
    contactInformation: {
      blocks: [
        {
          id: 'ci_address',
          type: 'text',
          label: 'Contactgegevens',
          content: paragraphs([
            'Postbus 1234',
            '1234 AB Lelystad',
            'Tel: 0320 - 265 911',
            'E-mail: vergunningen@flevoland.nl',
            'www.flevoland.nl',
          ]),
        },
      ],
    },
    reference: {
      blocks: [
        {
          id: 'ref_header',
          type: 'text',
          label: 'Kenmerk en datum',
          content: paragraphs([
            'Kenmerk: {{dossierReference}}',
            'Datum: {{applicationDate}}',
            'Betreft: Beslissing op aanvraag kapvergunning',
          ]),
        },
        {
          id: 'ref_subject',
          type: 'text',
          label: 'Geachte aanvrager',
          content: emptyDoc('Geachte aanvrager (BSN/ID: {{applicantId}}),'),
        },
      ],
    },
    body: {
      blocks: [
        {
          id: 'body_intro',
          type: 'text',
          label: 'Inleiding',
          content: {
            type: 'doc',
            content: [
              {
                type: 'paragraph',
                content: [
                  {
                    type: 'text',
                    text: 'Op uw aanvraag voor een kapvergunning hebben wij het volgende besloten.',
                  },
                ],
              },
            ],
          },
        },
        {
          id: 'body_decision_heading',
          type: 'text',
          label: 'Besluit',
          content: heading(2, 'Besluit'),
        },
        {
          id: 'body_decision',
          type: 'variable',
          variableKey: 'permitDecision',
          label: 'Vergunningsbesluit (variabel)',
        },
        {
          id: 'body_message',
          type: 'variable',
          variableKey: 'finalMessage',
          label: 'Beslissingstekst (variabel)',
        },
        {
          id: 'body_motivation_heading',
          type: 'text',
          label: 'Motivering',
          content: heading(2, 'Motivering'),
        },
        {
          id: 'body_motivation',
          type: 'text',
          label: 'Motiveringstekst',
          content: paragraphs([
            'Dit besluit is genomen op grond van de Algemene wet bestuursrecht (Awb) en de lokale kapverordening.',
            'Bij de beoordeling is rekening gehouden met de diameter van de boom, de ligging in een beschermd gebied en de ecologische waarden.',
          ]),
        },
      ],
    },
    closing: {
      blocks: [
        {
          id: 'cl_replacement',
          type: 'variable',
          variableKey: 'replacementInfo',
          label: 'Herplantinformatie (variabel)',
        },
        {
          id: 'cl_appeal_heading',
          type: 'text',
          label: 'Bezwaarmogelijkheid',
          content: heading(2, 'Bezwaar en beroep'),
        },
        {
          id: 'cl_appeal_text',
          type: 'text',
          label: 'Bezwaartekst',
          content: paragraphs([
            'Tegen dit besluit kunt u binnen zes weken na de verzenddatum bezwaar maken.',
            'U stuurt uw bezwaarschrift naar: Provincie Flevoland, t.a.v. de Commissie Bezwaarschriften, Postbus 1234, 1234 AB Lelystad.',
            'Vermeld in uw bezwaarschrift: uw naam en adres, de datum, het dossiernummer ({{dossierReference}}), en de redenen van uw bezwaar.',
            'In spoedeisende gevallen kunt u een voorlopige voorziening vragen bij de voorzieningenrechter van de rechtbank Midden-Nederland.',
          ]),
        },
      ],
    },
    signOff: {
      blocks: [
        {
          id: 'so_closing',
          type: 'text',
          label: 'Afsluiting',
          content: emptyDoc('Hoogachtend,'),
        },
        {
          id: 'so_spacer',
          type: 'spacer',
          label: 'Ruimte handtekening',
        },
        {
          id: 'so_name',
          type: 'text',
          label: 'Naam en functie',
          content: paragraphs([
            'Namens Burgemeester en Wethouders van Provincie Flevoland,',
            '',
            'Hoofd afdeling Vergunningen',
          ]),
        },
      ],
    },
    annex: null,
  },
};

export const ZORGTOESLAG_PROVISIONAL_BESCHIKKING: DocumentTemplate = {
  id: 'example_zorgtoeslag_provisional_beschikking',
  name: 'Zorgtoeslag Voorlopige Beschikking (Example)',
  description:
    'Formele beschikking Awb voor de voorlopige zorgtoeslag — ZorgtoeslagProvisionalSubProcess',
  processKey: 'AwbZorgtoeslagProcess',
  serviceId: 'ZorgtoeslagProvisional',
  schemaVersion: 1,
  readonly: false,
  status: 'example',
  language: 'en',
  organization: 'toeslagen',
  createdAt: '2026-03-17T00:00:00.000Z',
  updatedAt: '2026-03-17T00:00:00.000Z',
  assets: [],
  bindings: [
    {
      id: 'b1',
      placeholder: '{{dossierReference}}',
      variableKey: 'dossierReference',
      source: 'process',
      label: 'Dossiernummer',
    },
    {
      id: 'b2',
      placeholder: '{{applicationDate}}',
      variableKey: 'applicationDate',
      source: 'process',
      label: 'Aanvraagdatum',
    },
    {
      id: 'b3',
      placeholder: '{{applicantId}}',
      variableKey: 'applicantId',
      source: 'process',
      label: 'BSN / Aanvrager-ID',
    },
    {
      id: 'b4',
      placeholder: '{{provisionalDecision}}',
      variableKey: 'provisionalDecision',
      source: 'dmn_output',
      label: 'Beslissing voorlopige toeslag',
    },
    {
      id: 'b5',
      placeholder: '{{finalMessage}}',
      variableKey: 'finalMessage',
      source: 'dmn_output',
      label: 'Beslissingstekst',
    },
    {
      id: 'b6',
      placeholder: '{{provisionalAmount}}',
      variableKey: 'provisionalAmount',
      source: 'dmn_output',
      label: 'Maandbedrag (EUR)',
    },
  ],
  zones: {
    letterhead: {
      blocks: [
        {
          id: 'lh_org_name',
          type: 'text',
          label: 'Organisatienaam',
          content: {
            type: 'doc',
            content: [
              {
                type: 'heading',
                attrs: { level: 1 },
                content: [{ type: 'text', text: 'Belastingdienst / Toeslagen' }],
              },
              {
                type: 'paragraph',
                content: [
                  {
                    type: 'text',
                    text: 'Afdeling Zorgtoeslag',
                    marks: [{ type: 'italic' }],
                  },
                ],
              },
            ],
          },
        },
        {
          id: 'lh_separator',
          type: 'separator',
          label: 'Scheidingslijn',
        },
      ],
    },
    contactInformation: {
      blocks: [
        {
          id: 'ci_address',
          type: 'text',
          label: 'Contactgegevens',
          content: paragraphs([
            'Postbus 385',
            '6400 AJ Heerlen',
            'Tel: 0800 - 0543 (gratis)',
            'E-mail: toeslagen@belastingdienst.nl',
            'www.belastingdienst.nl/toeslagen',
          ]),
        },
      ],
    },
    reference: {
      blocks: [
        {
          id: 'ref_header',
          type: 'text',
          label: 'Kenmerk en datum',
          content: paragraphs([
            'Kenmerk: {{dossierReference}}',
            'Datum: {{applicationDate}}',
            'Betreft: Beslissing voorlopige zorgtoeslag {{applicationDate}}',
          ]),
        },
        {
          id: 'ref_subject',
          type: 'text',
          label: 'Geachte aanvrager',
          content: emptyDoc('Geachte aanvrager (BSN: {{applicantId}}),'),
        },
      ],
    },
    body: {
      blocks: [
        {
          id: 'body_intro',
          type: 'text',
          label: 'Inleiding',
          content: {
            type: 'doc',
            content: [
              {
                type: 'paragraph',
                content: [
                  {
                    type: 'text',
                    text: 'Op uw aanvraag voor zorgtoeslag hebben wij op basis van uw geschatte inkomen en huishoudenssamenstelling het volgende voorlopige besluit genomen.',
                  },
                ],
              },
            ],
          },
        },
        {
          id: 'body_decision_heading',
          type: 'text',
          label: 'Besluit',
          content: heading(2, 'Besluit'),
        },
        {
          id: 'body_decision',
          type: 'variable',
          variableKey: 'provisionalDecision',
          label: 'Beslissing voorlopige toeslag (variabel)',
        },
        {
          id: 'body_amount',
          type: 'variable',
          variableKey: 'provisionalAmount',
          label: 'Maandbedrag (variabel)',
        },
        {
          id: 'body_message',
          type: 'variable',
          variableKey: 'finalMessage',
          label: 'Beslissingstekst (variabel)',
        },
        {
          id: 'body_motivation_heading',
          type: 'text',
          label: 'Motivering',
          content: heading(2, 'Motivering'),
        },
        {
          id: 'body_motivation',
          type: 'text',
          label: 'Motiveringstekst',
          content: paragraphs([
            'Dit besluit is genomen op grond van de Wet op de zorgtoeslag (Wzt) en de Algemene wet bestuursrecht (Awb).',
            'De voorlopige toeslag is berekend op basis van uw opgegeven of geschatte inkomen voor het lopende jaar en uw huishoudenssamenstelling.',
            'Na afloop van het toeslagjaar ontvangt u een definitieve berekening op basis van uw werkelijke jaarinkomen (Wzt art. 16).',
          ]),
        },
      ],
    },
    closing: {
      blocks: [
        {
          id: 'cl_settlement_notice',
          type: 'text',
          label: 'Definitieve afrekening',
          content: paragraphs([
            'Na vaststelling van uw definitieve jaarinkomen door de Belastingdienst ontvangt u een definitieve beschikking.',
            'Afhankelijk van uw werkelijke inkomen kan de toeslag worden bijgesteld. U ontvangt dan een nabetaling of ontvangt een terugvorderingsbericht.',
          ]),
        },
        {
          id: 'cl_appeal_heading',
          type: 'text',
          label: 'Bezwaarmogelijkheid',
          content: heading(2, 'Bezwaar en beroep'),
        },
        {
          id: 'cl_appeal_text',
          type: 'text',
          label: 'Bezwaartekst',
          content: paragraphs([
            'Tegen dit besluit kunt u binnen zes weken na de verzenddatum bezwaar maken (Awb 6:7).',
            'U stuurt uw bezwaarschrift naar: Belastingdienst/Toeslagen, t.a.v. Bezwaar en Beroep, Postbus 385, 6400 AJ Heerlen.',
            'Vermeld in uw bezwaarschrift: uw naam, adres en BSN, de datum, het kenmerk ({{dossierReference}}), en de redenen van uw bezwaar.',
          ]),
        },
      ],
    },
    signOff: {
      blocks: [
        {
          id: 'so_closing',
          type: 'text',
          label: 'Afsluiting',
          content: emptyDoc('Hoogachtend,'),
        },
        {
          id: 'so_spacer',
          type: 'spacer',
          label: 'Ruimte handtekening',
        },
        {
          id: 'so_name',
          type: 'text',
          label: 'Naam en functie',
          content: paragraphs([
            'Namens de Belastingdienst / Toeslagen,',
            '',
            'Hoofd afdeling Zorgtoeslag',
          ]),
        },
      ],
    },
    annex: null,
  },
};

export const ZORGTOESLAG_FINAL_BESCHIKKING: DocumentTemplate = {
  id: 'example_zorgtoeslag_final_beschikking',
  name: 'Zorgtoeslag Definitieve Beschikking (Example)',
  description:
    'Formele beschikking Awb voor de definitieve afrekening zorgtoeslag — ZorgtoeslagFinalSubProcess',
  processKey: 'ZorgtoeslagFinalSubProcess',
  serviceId: 'ZorgtoeslagFinal',
  schemaVersion: 1,
  readonly: false,
  status: 'example',
  language: 'en',
  organization: 'toeslagen',
  createdAt: '2026-03-17T00:00:00.000Z',
  updatedAt: '2026-03-17T00:00:00.000Z',
  assets: [],
  bindings: [
    {
      id: 'b1',
      placeholder: '{{dossierReference}}',
      variableKey: 'dossierReference',
      source: 'process',
      label: 'Dossiernummer',
    },
    {
      id: 'b2',
      placeholder: '{{applicationDate}}',
      variableKey: 'applicationDate',
      source: 'process',
      label: 'Aanvraagdatum',
    },
    {
      id: 'b3',
      placeholder: '{{applicantId}}',
      variableKey: 'applicantId',
      source: 'process',
      label: 'BSN / Aanvrager-ID',
    },
    {
      id: 'b4',
      placeholder: '{{settlementOutcome}}',
      variableKey: 'settlementOutcome',
      source: 'dmn_output',
      label: 'Uitkomst afrekening',
    },
    {
      id: 'b5',
      placeholder: '{{finalMessage}}',
      variableKey: 'finalMessage',
      source: 'dmn_output',
      label: 'Beslissingstekst',
    },
    {
      id: 'b6',
      placeholder: '{{provisionalAmount}}',
      variableKey: 'provisionalAmount',
      source: 'process',
      label: 'Voorlopig maandbedrag (EUR)',
    },
    {
      id: 'b7',
      placeholder: '{{finalIncome}}',
      variableKey: 'finalIncome',
      source: 'process',
      label: 'Definitief jaarinkomen (EUR)',
    },
  ],
  zones: {
    letterhead: {
      blocks: [
        {
          id: 'lh_org_name',
          type: 'text',
          label: 'Organisatienaam',
          content: {
            type: 'doc',
            content: [
              {
                type: 'heading',
                attrs: { level: 1 },
                content: [{ type: 'text', text: 'Belastingdienst / Toeslagen' }],
              },
              {
                type: 'paragraph',
                content: [
                  {
                    type: 'text',
                    text: 'Afdeling Zorgtoeslag — Definitieve afrekening',
                    marks: [{ type: 'italic' }],
                  },
                ],
              },
            ],
          },
        },
        {
          id: 'lh_separator',
          type: 'separator',
          label: 'Scheidingslijn',
        },
      ],
    },
    contactInformation: {
      blocks: [
        {
          id: 'ci_address',
          type: 'text',
          label: 'Contactgegevens',
          content: paragraphs([
            'Postbus 385',
            '6400 AJ Heerlen',
            'Tel: 0800 - 0543 (gratis)',
            'E-mail: toeslagen@belastingdienst.nl',
            'www.belastingdienst.nl/toeslagen',
          ]),
        },
      ],
    },
    reference: {
      blocks: [
        {
          id: 'ref_header',
          type: 'text',
          label: 'Kenmerk en datum',
          content: paragraphs([
            'Kenmerk: {{dossierReference}}',
            'Datum: {{applicationDate}}',
            'Betreft: Definitieve afrekening zorgtoeslag',
          ]),
        },
        {
          id: 'ref_subject',
          type: 'text',
          label: 'Geachte aanvrager',
          content: emptyDoc('Geachte aanvrager (BSN: {{applicantId}}),'),
        },
      ],
    },
    body: {
      blocks: [
        {
          id: 'body_intro',
          type: 'text',
          label: 'Inleiding',
          content: {
            type: 'doc',
            content: [
              {
                type: 'paragraph',
                content: [
                  {
                    type: 'text',
                    text: 'Uw definitieve jaarinkomen is vastgesteld door de Belastingdienst. Op basis hiervan is uw recht op zorgtoeslag definitief berekend en vergeleken met de ontvangen voorschotten.',
                  },
                ],
              },
            ],
          },
        },
        {
          id: 'body_summary_heading',
          type: 'text',
          label: 'Overzicht',
          content: heading(2, 'Overzicht afrekening'),
        },
        {
          id: 'body_provisional_amount',
          type: 'variable',
          variableKey: 'provisionalAmount',
          label: 'Ontvangen voorschot per maand (variabel)',
        },
        {
          id: 'body_final_income',
          type: 'variable',
          variableKey: 'finalIncome',
          label: 'Definitief jaarinkomen (variabel)',
        },
        {
          id: 'body_decision_heading',
          type: 'text',
          label: 'Besluit',
          content: heading(2, 'Besluit'),
        },
        {
          id: 'body_settlement_outcome',
          type: 'variable',
          variableKey: 'settlementOutcome',
          label: 'Uitkomst afrekening (variabel)',
        },
        {
          id: 'body_message',
          type: 'variable',
          variableKey: 'finalMessage',
          label: 'Beslissingstekst (variabel)',
        },
        {
          id: 'body_motivation_heading',
          type: 'text',
          label: 'Motivering',
          content: heading(2, 'Motivering'),
        },
        {
          id: 'body_motivation',
          type: 'text',
          label: 'Motiveringstekst',
          content: paragraphs([
            'Dit besluit is genomen op grond van de Wet op de zorgtoeslag (Wzt) artikel 16 en de Algemene wet bestuursrecht (Awb).',
            'De definitieve berekening is gebaseerd op uw door de Belastingdienst vastgestelde jaarinkomen en uw huishoudenssamenstelling gedurende het toeslagjaar.',
          ]),
        },
      ],
    },
    closing: {
      blocks: [
        {
          id: 'cl_appeal_heading',
          type: 'text',
          label: 'Bezwaarmogelijkheid',
          content: heading(2, 'Bezwaar en beroep'),
        },
        {
          id: 'cl_appeal_text',
          type: 'text',
          label: 'Bezwaartekst',
          content: paragraphs([
            'Tegen dit besluit kunt u binnen zes weken na de verzenddatum bezwaar maken (Awb 6:7).',
            'U stuurt uw bezwaarschrift naar: Belastingdienst/Toeslagen, t.a.v. Bezwaar en Beroep, Postbus 385, 6400 AJ Heerlen.',
            'Vermeld in uw bezwaarschrift: uw naam, adres en BSN, de datum, het kenmerk ({{dossierReference}}), en de redenen van uw bezwaar.',
          ]),
        },
      ],
    },
    signOff: {
      blocks: [
        {
          id: 'so_closing',
          type: 'text',
          label: 'Afsluiting',
          content: emptyDoc('Hoogachtend,'),
        },
        {
          id: 'so_spacer',
          type: 'spacer',
          label: 'Ruimte handtekening',
        },
        {
          id: 'so_name',
          type: 'text',
          label: 'Naam en functie',
          content: paragraphs([
            'Namens de Belastingdienst / Toeslagen,',
            '',
            'Hoofd afdeling Zorgtoeslag',
          ]),
        },
      ],
    },
    annex: null,
  },
};

export const DVTP_CONSENT_RECEIPT: DocumentTemplate = {
  id: 'example_dvtp_consent_receipt',
  name: 'DvTP Toestemmingsbewijs (Example)',
  description: 'Formeel ontvangstbewijs van geregistreerde toestemming — DvTP Flow A',
  processKey: 'DvtpToestemmingGevenProcess',
  serviceId: 'DvtpConsent',
  schemaVersion: 1,
  readonly: true,
  status: 'example',
  language: 'nl',
  organization: 'bzk',
  createdAt: '2026-03-19T00:00:00.000Z',
  updatedAt: '2026-03-19T00:00:00.000Z',
  assets: [],
  bindings: [
    {
      id: 'b1',
      placeholder: '{{consentReference}}',
      variableKey: 'consentReference',
      source: 'process',
      label: 'Toestemmingskenmerk',
    },
    {
      id: 'b2',
      placeholder: '{{applicantId}}',
      variableKey: 'applicantId',
      source: 'process',
      label: 'BSN / Burger-ID',
    },
    {
      id: 'b3',
      placeholder: '{{serviceName}}',
      variableKey: 'serviceName',
      source: 'process',
      label: 'Naam dienst',
    },
    {
      id: 'b4',
      placeholder: '{{serviceDoel}}',
      variableKey: 'serviceDoel',
      source: 'process',
      label: 'Doel gegevensuitwisseling',
    },
    {
      id: 'b5',
      placeholder: '{{serviceScope}}',
      variableKey: 'serviceScope',
      source: 'process',
      label: 'Gedeelde gegevens',
    },
    {
      id: 'b6',
      placeholder: '{{configTtlLabel}}',
      variableKey: 'configTtlLabel',
      source: 'dmn_output',
      label: 'Geldigheid toestemming',
    },
    {
      id: 'b7',
      placeholder: '{{consentDate}}',
      variableKey: 'consentDate',
      source: 'process',
      label: 'Datum toestemming',
    },
    {
      id: 'b8',
      placeholder: '{{consentExpiry}}',
      variableKey: 'consentExpiry',
      source: 'process',
      label: 'Vervaldatum toestemming',
    },
    {
      id: 'b9',
      placeholder: '{{initiatorId}}',
      variableKey: 'initiatorId',
      source: 'process',
      label: 'Initiator-ID',
    },
  ],
  zones: {
    letterhead: {
      blocks: [
        {
          id: 'lh_org_name',
          type: 'text',
          label: 'Organisatienaam',
          content: {
            type: 'doc',
            content: [
              {
                type: 'heading',
                attrs: { level: 1 },
                content: [{ type: 'text', text: 'DvTP Toestemmingsportaal' }],
              },
              {
                type: 'paragraph',
                content: [
                  {
                    type: 'text',
                    text: 'Dienst Verlening via Toestemming met Private partijen',
                    marks: [{ type: 'italic' }],
                  },
                ],
              },
            ],
          },
        },
        { id: 'lh_separator', type: 'separator', label: 'Scheidingslijn' },
      ],
    },
    contactInformation: {
      blocks: [
        {
          id: 'ci_address',
          type: 'text',
          label: 'Contactgegevens',
          content: {
            type: 'doc',
            content: [
              {
                type: 'paragraph',
                content: [
                  {
                    type: 'text',
                    text: 'Ministerie van Binnenlandse Zaken en Koninkrijksrelaties',
                  },
                ],
              },
              {
                type: 'paragraph',
                content: [{ type: 'text', text: 'Postbus 20011 · 2500 EA Den Haag' }],
              },
              { type: 'paragraph', content: [{ type: 'text', text: 'E-mail: dvtp@minbzk.nl' }] },
              {
                type: 'paragraph',
                content: [{ type: 'text', text: 'www.digitaleoverheid.nl/dvtp' }],
              },
            ],
          },
        },
      ],
    },
    reference: {
      blocks: [
        {
          id: 'ref_header',
          type: 'text',
          label: 'Kenmerk en datum',
          content: {
            type: 'doc',
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: 'Kenmerk: {{consentReference}}' }],
              },
              { type: 'paragraph', content: [{ type: 'text', text: 'Datum: {{consentDate}}' }] },
              {
                type: 'paragraph',
                content: [
                  {
                    type: 'text',
                    text: 'Betreft: Ontvangstbewijs toestemming gegevensuitwisseling',
                  },
                ],
              },
            ],
          },
        },
        {
          id: 'ref_subject',
          type: 'text',
          label: 'Aanhef',
          content: {
            type: 'doc',
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: 'Geachte burger (ID: {{applicantId}}),' }],
              },
            ],
          },
        },
      ],
    },
    body: {
      blocks: [
        {
          id: 'body_intro',
          type: 'text',
          label: 'Inleiding',
          content: {
            type: 'doc',
            content: [
              {
                type: 'paragraph',
                content: [
                  {
                    type: 'text',
                    text: 'Uw toestemming voor gegevensuitwisseling is geregistreerd. Dit document dient als officieel ontvangstbewijs.',
                  },
                ],
              },
            ],
          },
        },
        {
          id: 'body_service_heading',
          type: 'text',
          label: 'Dienst',
          content: {
            type: 'doc',
            content: [
              {
                type: 'heading',
                attrs: { level: 2 },
                content: [{ type: 'text', text: 'Dienst waarvoor u toestemming heeft gegeven' }],
              },
            ],
          },
        },
        {
          id: 'body_service_name',
          type: 'variable',
          variableKey: 'serviceName',
          label: 'Naam dienst (variabel)',
        },
        {
          id: 'body_service_doel',
          type: 'variable',
          variableKey: 'serviceDoel',
          label: 'Doel (variabel)',
        },
        {
          id: 'body_service_scope',
          type: 'variable',
          variableKey: 'serviceScope',
          label: 'Gedeelde gegevens (variabel)',
        },
        {
          id: 'body_duration_heading',
          type: 'text',
          label: 'Duur',
          content: {
            type: 'doc',
            content: [
              {
                type: 'heading',
                attrs: { level: 2 },
                content: [{ type: 'text', text: 'Geldigheid' }],
              },
            ],
          },
        },
        {
          id: 'body_ttl',
          type: 'variable',
          variableKey: 'configTtlLabel',
          label: 'Geldigheid (variabel)',
        },
        {
          id: 'body_expiry',
          type: 'variable',
          variableKey: 'consentExpiry',
          label: 'Vervaldatum (variabel)',
        },
        {
          id: 'body_legal',
          type: 'text',
          label: 'Wettelijke basis',
          content: {
            type: 'doc',
            content: [
              {
                type: 'heading',
                attrs: { level: 2 },
                content: [{ type: 'text', text: 'Wettelijke basis' }],
              },
              {
                type: 'paragraph',
                content: [
                  {
                    type: 'text',
                    text: 'Deze toestemming is verleend op grond van AVG artikel 6 lid 1 sub a (toestemming van de betrokkene) en de DvTP-specificatie.',
                  },
                ],
              },
            ],
          },
        },
      ],
    },
    closing: {
      blocks: [
        {
          id: 'cl_withdrawal',
          type: 'text',
          label: 'Intrekking',
          content: {
            type: 'doc',
            content: [
              {
                type: 'heading',
                attrs: { level: 2 },
                content: [{ type: 'text', text: 'Toestemming intrekken' }],
              },
              {
                type: 'paragraph',
                content: [
                  {
                    type: 'text',
                    text: 'U kunt uw toestemming te allen tijde intrekken via het DvTP Toestemmingsportaal. De intrekking heeft geen terugwerkende kracht voor reeds gedeelde gegevens (AVG art. 7 lid 3).',
                  },
                ],
              },
              {
                type: 'paragraph',
                content: [
                  {
                    type: 'text',
                    text: 'Vermeld bij intrekking uw kenmerk: {{consentReference}}.',
                  },
                ],
              },
            ],
          },
        },
      ],
    },
    signOff: {
      blocks: [
        {
          id: 'so_closing',
          type: 'text',
          label: 'Afsluiting',
          content: {
            type: 'doc',
            content: [
              { type: 'paragraph', content: [{ type: 'text', text: 'Met vriendelijke groet,' }] },
            ],
          },
        },
        { id: 'so_spacer', type: 'spacer', label: 'Ruimte handtekening' },
        {
          id: 'so_name',
          type: 'text',
          label: 'Naam en functie',
          content: {
            type: 'doc',
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: 'Namens het DvTP Toestemmingsportaal,' }],
              },
              { type: 'paragraph', content: [] },
              {
                type: 'paragraph',
                content: [
                  { type: 'text', text: 'Directie Digitale Overheid — Ministerie van BZK' },
                ],
              },
            ],
          },
        },
      ],
    },
    annex: null,
  },
};

export const HR_CAPACITY_BOARD_DECISION_NOTIFICATION_NL: DocumentTemplate = {
  id: 'board-decision-notification-nl',
  name: 'HR — Directiebesluit-notificatie (Voorbeeld, NL)',
  description:
    'Formele kennisgeving van het directiebesluit aan de aanvragende manager — Beheer capaciteitsclaim.',
  processKey: 'ManagementCapacityClaimProcess',
  serviceId: 'CapacityClaim',
  schemaVersion: 1,
  readonly: false,
  status: 'example',
  language: 'nl',
  organization: 'flevoland',
  createdAt: '2026-04-26T12:00:00.000Z',
  updatedAt: '2026-04-26T12:00:00.000Z',
  assets: [],
  bindings: [
    {
      id: 'b1',
      placeholder: '{{requestType}}',
      variableKey: 'requestType',
      source: 'process',
      label: 'Type aanvraag',
    },
    {
      id: 'b2',
      placeholder: '{{organizationalUnit}}',
      variableKey: 'organizationalUnit',
      source: 'process',
      label: 'Organisatie-eenheid',
    },
    {
      id: 'b3',
      placeholder: '{{department}}',
      variableKey: 'department',
      source: 'process',
      label: 'Afdeling',
    },
    {
      id: 'b4',
      placeholder: '{{jobTitle}}',
      variableKey: 'jobTitle',
      source: 'process',
      label: 'Functietitel',
    },
    {
      id: 'b5',
      placeholder: '{{functionCode}}',
      variableKey: 'functionCode',
      source: 'process',
      label: 'Functiecode',
    },
    {
      id: 'b6',
      placeholder: '{{annualCostsAfter}}',
      variableKey: 'annualCostsAfter',
      source: 'process',
      label: 'Jaarlijkse kosten',
    },
    {
      id: 'b7',
      placeholder: '{{fundingSource}}',
      variableKey: 'fundingSource',
      source: 'process',
      label: 'Financieringsbron',
    },
    {
      id: 'b8',
      placeholder: '{{boardDecision}}',
      variableKey: 'boardDecision',
      source: 'process',
      label: 'Besluit',
    },
    {
      id: 'b9',
      placeholder: '{{decisionConditions}}',
      variableKey: 'decisionConditions',
      source: 'process',
      label: 'Voorwaarden',
    },
    {
      id: 'b10',
      placeholder: '{{rejectionReason}}',
      variableKey: 'rejectionReason',
      source: 'process',
      label: 'Reden afwijzing',
    },
    {
      id: 'b11',
      placeholder: '{{decisionDate}}',
      variableKey: 'decisionDate',
      source: 'process',
      label: 'Besluitdatum',
    },
    {
      id: 'b12',
      placeholder: '{{boardMinuteReference}}',
      variableKey: 'boardMinuteReference',
      source: 'process',
      label: 'Kenmerk notulen',
    },
    {
      id: 'b13',
      placeholder: '{{decisionRoute}}',
      variableKey: 'decisionRoute',
      source: 'dmn_output',
      label: 'Vervolgroute',
    },
    {
      id: 'b14',
      placeholder: '{{advisoryGroup}}',
      variableKey: 'advisoryGroup',
      source: 'dmn_output',
      label: 'Adviesgroep',
    },
  ],
  zones: {
    letterhead: {
      blocks: [
        {
          id: 'lh_org_name',
          type: 'text',
          label: 'Organisatienaam',
          content: {
            type: 'doc',
            content: [
              {
                type: 'heading',
                attrs: { level: 1 },
                content: [{ type: 'text', text: 'Provincie Flevoland' }],
              },
              {
                type: 'paragraph',
                content: [
                  {
                    type: 'text',
                    marks: [{ type: 'italic' }],
                    text: 'Directieraad — Besluit capaciteitsclaim',
                  },
                ],
              },
            ],
          },
        },
        { id: 'lh_separator', type: 'separator', label: 'Separator' },
      ],
    },
    contactInformation: {
      blocks: [
        {
          id: 'ci_address',
          type: 'text',
          label: 'Contactgegevens Directiesecretariaat',
          content: {
            type: 'doc',
            content: [
              { type: 'paragraph', content: [{ type: 'text', text: 'Directiesecretariaat' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'Provincie Flevoland' }] },
              {
                type: 'paragraph',
                content: [{ type: 'text', text: 'E-mail: directiesecretariaat@flevoland.nl' }],
              },
              {
                type: 'paragraph',
                content: [{ type: 'text', text: 'Verwerking via: IOU portaal' }],
              },
            ],
          },
        },
      ],
    },
    reference: {
      blocks: [
        {
          id: 'ref_header',
          type: 'text',
          label: 'Kenmerk en datum',
          content: {
            type: 'doc',
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: 'Kenmerk: {{boardMinuteReference}}' }],
              },
              {
                type: 'paragraph',
                content: [{ type: 'text', text: 'Besluitdatum: {{decisionDate}}' }],
              },
              {
                type: 'paragraph',
                content: [
                  {
                    type: 'text',
                    text: 'Betreft: Besluit capaciteitsclaim — {{jobTitle}} ({{organizationalUnit}})',
                  },
                ],
              },
            ],
          },
        },
        {
          id: 'ref_addressee',
          type: 'text',
          label: 'Geachte',
          content: {
            type: 'doc',
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: 'Geachte manager van {{organizationalUnit}},' }],
              },
            ],
          },
        },
      ],
    },
    body: {
      blocks: [
        {
          id: 'body_intro',
          type: 'text',
          label: 'Inleiding',
          content: {
            type: 'doc',
            content: [
              {
                type: 'paragraph',
                content: [
                  {
                    type: 'text',
                    text: 'De Directieraad heeft in zijn wekelijkse vergadering op {{decisionDate}} een besluit genomen over uw capaciteitsclaim voor de functie ',
                  },
                  { type: 'text', marks: [{ type: 'bold' }], text: '{{jobTitle}}' },
                  { type: 'text', text: ' (type: {{requestType}}).' },
                ],
              },
            ],
          },
        },
        {
          id: 'body_claim_heading',
          type: 'text',
          label: 'Claimgegevens',
          content: {
            type: 'doc',
            content: [
              {
                type: 'heading',
                attrs: { level: 2 },
                content: [{ type: 'text', text: 'Claimgegevens' }],
              },
            ],
          },
        },
        {
          id: 'body_claim_details',
          type: 'text',
          label: 'Details',
          content: {
            type: 'doc',
            content: [
              {
                type: 'paragraph',
                content: [
                  { type: 'text', marks: [{ type: 'bold' }], text: 'Functietitel: ' },
                  { type: 'text', text: '{{jobTitle}}' },
                ],
              },
              {
                type: 'paragraph',
                content: [
                  { type: 'text', marks: [{ type: 'bold' }], text: 'Functiecode: ' },
                  { type: 'text', text: '{{functionCode}}' },
                ],
              },
              {
                type: 'paragraph',
                content: [
                  { type: 'text', marks: [{ type: 'bold' }], text: 'Organisatie-eenheid: ' },
                  { type: 'text', text: '{{organizationalUnit}}' },
                ],
              },
              {
                type: 'paragraph',
                content: [
                  { type: 'text', marks: [{ type: 'bold' }], text: 'Afdeling: ' },
                  { type: 'text', text: '{{department}}' },
                ],
              },
              {
                type: 'paragraph',
                content: [
                  { type: 'text', marks: [{ type: 'bold' }], text: 'Type aanvraag: ' },
                  { type: 'text', text: '{{requestType}}' },
                ],
              },
              {
                type: 'paragraph',
                content: [
                  { type: 'text', marks: [{ type: 'bold' }], text: 'Jaarlijkse kosten: ' },
                  { type: 'text', text: '€ {{annualCostsAfter}}' },
                ],
              },
              {
                type: 'paragraph',
                content: [
                  { type: 'text', marks: [{ type: 'bold' }], text: 'Financieringsbron: ' },
                  { type: 'text', text: '{{fundingSource}}' },
                ],
              },
            ],
          },
        },
        {
          id: 'body_decision_heading',
          type: 'text',
          label: 'Besluit',
          content: {
            type: 'doc',
            content: [
              {
                type: 'heading',
                attrs: { level: 2 },
                content: [{ type: 'text', text: 'Besluit van de Directieraad' }],
              },
            ],
          },
        },
        {
          id: 'body_decision_details',
          type: 'text',
          label: 'Besluitgegevens',
          content: {
            type: 'doc',
            content: [
              {
                type: 'paragraph',
                content: [
                  { type: 'text', marks: [{ type: 'bold' }], text: 'Uitkomst: ' },
                  { type: 'text', text: '{{boardDecision}}' },
                ],
              },
              {
                type: 'paragraph',
                content: [
                  { type: 'text', marks: [{ type: 'bold' }], text: 'Kenmerk notulen: ' },
                  { type: 'text', text: '{{boardMinuteReference}}' },
                ],
              },
              {
                type: 'paragraph',
                content: [
                  {
                    type: 'text',
                    marks: [{ type: 'bold' }],
                    text: 'Voorwaarden (indien akkoord): ',
                  },
                  { type: 'text', text: '{{decisionConditions}}' },
                ],
              },
              {
                type: 'paragraph',
                content: [
                  {
                    type: 'text',
                    marks: [{ type: 'bold' }],
                    text: 'Reden afwijzing (indien afgewezen): ',
                  },
                  { type: 'text', text: '{{rejectionReason}}' },
                ],
              },
            ],
          },
        },
        {
          id: 'body_next_heading',
          type: 'text',
          label: 'Vervolg',
          content: {
            type: 'doc',
            content: [
              {
                type: 'heading',
                attrs: { level: 2 },
                content: [{ type: 'text', text: 'Vervolgstappen' }],
              },
            ],
          },
        },
        {
          id: 'body_next_details',
          type: 'text',
          label: 'Acties',
          content: {
            type: 'doc',
            content: [
              {
                type: 'paragraph',
                content: [
                  { type: 'text', marks: [{ type: 'bold' }], text: 'Bij akkoord: ' },
                  {
                    type: 'text',
                    text: 'de claim wordt overgedragen aan {{advisoryGroup}} langs route {{decisionRoute}}. Parallel registreert de financial controller de reservering in het financiële systeem.',
                  },
                ],
              },
              {
                type: 'paragraph',
                content: [
                  { type: 'text', marks: [{ type: 'bold' }], text: 'Bij afwijzing: ' },
                  {
                    type: 'text',
                    text: 'u wordt uitgenodigd voor een heroverweging samen met de HR Business Partner en de Personeelscontroller. Zij kunt de claim revideren en opnieuw indienen of de claim intrekken.',
                  },
                ],
              },
            ],
          },
        },
      ],
    },
    closing: {
      blocks: [
        {
          id: 'cl_contact',
          type: 'text',
          label: 'Contactinformatie',
          content: {
            type: 'doc',
            content: [
              {
                type: 'paragraph',
                content: [
                  {
                    type: 'text',
                    text: 'Voor vragen over dit besluit kunt u contact opnemen met het Directiesecretariaat via directiesecretariaat@flevoland.nl onder vermelding van kenmerk {{boardMinuteReference}}.',
                  },
                ],
              },
            ],
          },
        },
      ],
    },
    signOff: {
      blocks: [
        {
          id: 'so_closing',
          type: 'text',
          label: 'Afsluiting',
          content: {
            type: 'doc',
            content: [
              { type: 'paragraph', content: [{ type: 'text', text: 'Met vriendelijke groet,' }] },
            ],
          },
        },
        { id: 'so_spacer', type: 'spacer', label: 'Ruimte handtekening' },
        {
          id: 'so_name',
          type: 'text',
          label: 'Naam en functie',
          content: {
            type: 'doc',
            content: [
              { type: 'paragraph', content: [{ type: 'text', text: 'Namens de Directieraad,' }] },
              { type: 'paragraph' },
              {
                type: 'paragraph',
                content: [
                  { type: 'text', marks: [{ type: 'bold' }], text: 'Secretaris Directieraad' },
                ],
              },
              { type: 'paragraph', content: [{ type: 'text', text: 'Provincie Flevoland' }] },
            ],
          },
        },
      ],
    },
    annex: null,
  },
};

export const HR_CAPACITY_HANDOVER_NL: DocumentTemplate = {
  id: 'capacity-claim-handover-nl',
  name: 'HR — Overdracht capaciteitsclaim (Voorbeeld, NL)',
  description:
    'Overdrachtsdocument naar werving of inkoop na directie-akkoord op de capaciteitsclaim.',
  processKey: 'ManagementCapacityClaimProcess',
  serviceId: 'CapacityClaim',
  schemaVersion: 1,
  readonly: false,
  status: 'example',
  language: 'nl',
  organization: 'flevoland',
  createdAt: '2026-04-26T12:00:00.000Z',
  updatedAt: '2026-04-26T12:00:00.000Z',
  assets: [],
  bindings: [
    {
      id: 'b1',
      placeholder: '{{requestType}}',
      variableKey: 'requestType',
      source: 'process',
      label: 'Type aanvraag',
    },
    {
      id: 'b2',
      placeholder: '{{organizationalUnit}}',
      variableKey: 'organizationalUnit',
      source: 'process',
      label: 'Organisatie-eenheid',
    },
    {
      id: 'b3',
      placeholder: '{{department}}',
      variableKey: 'department',
      source: 'process',
      label: 'Afdeling',
    },
    {
      id: 'b4',
      placeholder: '{{jobTitle}}',
      variableKey: 'jobTitle',
      source: 'process',
      label: 'Functietitel',
    },
    {
      id: 'b5',
      placeholder: '{{functionCode}}',
      variableKey: 'functionCode',
      source: 'process',
      label: 'Functiecode',
    },
    {
      id: 'b6',
      placeholder: '{{description}}',
      variableKey: 'description',
      source: 'process',
      label: 'Onderbouwing',
    },
    {
      id: 'b7',
      placeholder: '{{startDate}}',
      variableKey: 'startDate',
      source: 'process',
      label: 'Startdatum',
    },
    {
      id: 'b8',
      placeholder: '{{endDate}}',
      variableKey: 'endDate',
      source: 'process',
      label: 'Einddatum',
    },
    {
      id: 'b9',
      placeholder: '{{hoursMin}}',
      variableKey: 'hoursMin',
      source: 'process',
      label: 'Uren (min)',
    },
    {
      id: 'b10',
      placeholder: '{{hoursMax}}',
      variableKey: 'hoursMax',
      source: 'process',
      label: 'Uren (max)',
    },
    {
      id: 'b11',
      placeholder: '{{fteMin}}',
      variableKey: 'fteMin',
      source: 'process',
      label: 'FTE (min)',
    },
    {
      id: 'b12',
      placeholder: '{{fteMax}}',
      variableKey: 'fteMax',
      source: 'process',
      label: 'FTE (max)',
    },
    {
      id: 'b13',
      placeholder: '{{scale}}',
      variableKey: 'scale',
      source: 'process',
      label: 'Schaal',
    },
    {
      id: 'b14',
      placeholder: '{{employmentConditionChanges}}',
      variableKey: 'employmentConditionChanges',
      source: 'process',
      label: 'Aanpassingen arbeidsvoorwaarden',
    },
    {
      id: 'b15',
      placeholder: '{{hourlyWageMin}}',
      variableKey: 'hourlyWageMin',
      source: 'process',
      label: 'Uurtarief (min)',
    },
    {
      id: 'b16',
      placeholder: '{{hourlyWageMax}}',
      variableKey: 'hourlyWageMax',
      source: 'process',
      label: 'Uurtarief (max)',
    },
    {
      id: 'b17',
      placeholder: '{{durationMonths}}',
      variableKey: 'durationMonths',
      source: 'process',
      label: 'Duur in maanden',
    },
    {
      id: 'b18',
      placeholder: '{{procurementPolicyDeviationReason}}',
      variableKey: 'procurementPolicyDeviationReason',
      source: 'process',
      label: 'Afwijking inkoopbeleid',
    },
    {
      id: 'b19',
      placeholder: '{{annualCostsAfter}}',
      variableKey: 'annualCostsAfter',
      source: 'process',
      label: 'Jaarlijkse kosten',
    },
    {
      id: 'b20',
      placeholder: '{{fundingSource}}',
      variableKey: 'fundingSource',
      source: 'process',
      label: 'Financieringsbron',
    },
    {
      id: 'b21',
      placeholder: '{{hrmAdvice}}',
      variableKey: 'hrmAdvice',
      source: 'process',
      label: 'Advies HRM-unit',
    },
    {
      id: 'b22',
      placeholder: '{{boardDecision}}',
      variableKey: 'boardDecision',
      source: 'process',
      label: 'Besluit',
    },
    {
      id: 'b23',
      placeholder: '{{decisionConditions}}',
      variableKey: 'decisionConditions',
      source: 'process',
      label: 'Voorwaarden',
    },
    {
      id: 'b24',
      placeholder: '{{decisionDate}}',
      variableKey: 'decisionDate',
      source: 'process',
      label: 'Besluitdatum',
    },
    {
      id: 'b25',
      placeholder: '{{boardMinuteReference}}',
      variableKey: 'boardMinuteReference',
      source: 'process',
      label: 'Kenmerk notulen',
    },
    {
      id: 'b26',
      placeholder: '{{decisionRoute}}',
      variableKey: 'decisionRoute',
      source: 'dmn_output',
      label: 'Vervolgroute',
    },
    {
      id: 'b27',
      placeholder: '{{candidateGroups}}',
      variableKey: 'candidateGroups',
      source: 'dmn_output',
      label: 'Taakgroepen',
    },
    {
      id: 'b28',
      placeholder: '{{advisoryGroup}}',
      variableKey: 'advisoryGroup',
      source: 'dmn_output',
      label: 'Adviesgroep',
    },
  ],
  zones: {
    letterhead: {
      blocks: [
        {
          id: 'lh_org_name',
          type: 'text',
          label: 'Organisatienaam',
          content: {
            type: 'doc',
            content: [
              {
                type: 'heading',
                attrs: { level: 1 },
                content: [{ type: 'text', text: 'Provincie Flevoland' }],
              },
              {
                type: 'paragraph',
                content: [
                  {
                    type: 'text',
                    marks: [{ type: 'italic' }],
                    text: 'Directiesecretariaat — Overdracht capaciteitsclaim',
                  },
                ],
              },
            ],
          },
        },
        { id: 'lh_separator', type: 'separator', label: 'Separator' },
      ],
    },
    contactInformation: {
      blocks: [
        {
          id: 'ci_address',
          type: 'text',
          label: 'Contactgegevens Directiesecretariaat',
          content: {
            type: 'doc',
            content: [
              { type: 'paragraph', content: [{ type: 'text', text: 'Directiesecretariaat' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'Provincie Flevoland' }] },
              {
                type: 'paragraph',
                content: [{ type: 'text', text: 'E-mail: directiesecretariaat@flevoland.nl' }],
              },
              {
                type: 'paragraph',
                content: [{ type: 'text', text: 'Verwerking via: IOU portaal' }],
              },
            ],
          },
        },
      ],
    },
    reference: {
      blocks: [
        {
          id: 'ref_header',
          type: 'text',
          label: 'Kenmerk en datum',
          content: {
            type: 'doc',
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: 'Kenmerk: {{boardMinuteReference}}' }],
              },
              {
                type: 'paragraph',
                content: [{ type: 'text', text: 'Besluitdatum: {{decisionDate}}' }],
              },
              {
                type: 'paragraph',
                content: [
                  {
                    type: 'text',
                    text: 'Betreft: Overdracht goedgekeurde capaciteitsclaim — {{jobTitle}} ({{organizationalUnit}})',
                  },
                ],
              },
            ],
          },
        },
        {
          id: 'ref_addressee',
          type: 'text',
          label: 'Geachte',
          content: {
            type: 'doc',
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: "Geachte collega's van {{advisoryGroup}}," }],
              },
            ],
          },
        },
      ],
    },
    body: {
      blocks: [
        {
          id: 'body_intro',
          type: 'text',
          label: 'Inleiding',
          content: {
            type: 'doc',
            content: [
              {
                type: 'paragraph',
                content: [
                  {
                    type: 'text',
                    text: 'De Directieraad heeft op {{decisionDate}} de onderstaande capaciteitsclaim goedgekeurd (type: ',
                  },
                  { type: 'text', marks: [{ type: 'bold' }], text: '{{requestType}}' },
                  { type: 'text', text: ', route: ' },
                  { type: 'text', marks: [{ type: 'bold' }], text: '{{decisionRoute}}' },
                  {
                    type: 'text',
                    text: '). U wordt verzocht het vervolg op te pakken conform de onderstaande specificaties en — waar van toepassing — de vigerende procedures voor werving (HRM) of inhuur (Inkoop en Planning & Control).',
                  },
                ],
              },
            ],
          },
        },
        {
          id: 'body_claim_heading',
          type: 'text',
          label: 'Claimgegevens',
          content: {
            type: 'doc',
            content: [
              {
                type: 'heading',
                attrs: { level: 2 },
                content: [{ type: 'text', text: 'Claimgegevens' }],
              },
            ],
          },
        },
        {
          id: 'body_claim_details',
          type: 'text',
          label: 'Details',
          content: {
            type: 'doc',
            content: [
              {
                type: 'paragraph',
                content: [
                  { type: 'text', marks: [{ type: 'bold' }], text: 'Functietitel: ' },
                  { type: 'text', text: '{{jobTitle}}' },
                ],
              },
              {
                type: 'paragraph',
                content: [
                  { type: 'text', marks: [{ type: 'bold' }], text: 'Functiecode: ' },
                  { type: 'text', text: '{{functionCode}}' },
                ],
              },
              {
                type: 'paragraph',
                content: [
                  { type: 'text', marks: [{ type: 'bold' }], text: 'Organisatie-eenheid: ' },
                  { type: 'text', text: '{{organizationalUnit}}' },
                ],
              },
              {
                type: 'paragraph',
                content: [
                  { type: 'text', marks: [{ type: 'bold' }], text: 'Afdeling: ' },
                  { type: 'text', text: '{{department}}' },
                ],
              },
              {
                type: 'paragraph',
                content: [
                  { type: 'text', marks: [{ type: 'bold' }], text: 'Startdatum: ' },
                  { type: 'text', text: '{{startDate}}' },
                ],
              },
              {
                type: 'paragraph',
                content: [
                  { type: 'text', marks: [{ type: 'bold' }], text: 'Einddatum: ' },
                  { type: 'text', text: '{{endDate}}' },
                ],
              },
              {
                type: 'paragraph',
                content: [
                  { type: 'text', marks: [{ type: 'bold' }], text: 'Onderbouwing: ' },
                  { type: 'text', text: '{{description}}' },
                ],
              },
            ],
          },
        },
        {
          id: 'body_staffing_heading',
          type: 'text',
          label: 'Staffing-specifieke velden',
          content: {
            type: 'doc',
            content: [
              {
                type: 'heading',
                attrs: { level: 3 },
                content: [{ type: 'text', text: 'Bij staffing (indien van toepassing)' }],
              },
            ],
          },
        },
        {
          id: 'body_staffing_details',
          type: 'text',
          label: 'Staffing-details',
          content: {
            type: 'doc',
            content: [
              {
                type: 'paragraph',
                content: [
                  { type: 'text', marks: [{ type: 'bold' }], text: 'Uren/FTE: ' },
                  {
                    type: 'text',
                    text: '{{hoursMin}}–{{hoursMax}} uur ({{fteMin}}–{{fteMax}} FTE)',
                  },
                ],
              },
              {
                type: 'paragraph',
                content: [
                  { type: 'text', marks: [{ type: 'bold' }], text: 'Schaal: ' },
                  { type: 'text', text: '{{scale}}' },
                ],
              },
              {
                type: 'paragraph',
                content: [
                  {
                    type: 'text',
                    marks: [{ type: 'bold' }],
                    text: 'Aanpassingen arbeidsvoorwaarden: ',
                  },
                  { type: 'text', text: '{{employmentConditionChanges}}' },
                ],
              },
            ],
          },
        },
        {
          id: 'body_hiring_heading',
          type: 'text',
          label: 'Hiring-specifieke velden',
          content: {
            type: 'doc',
            content: [
              {
                type: 'heading',
                attrs: { level: 3 },
                content: [{ type: 'text', text: 'Bij inhuur (indien van toepassing)' }],
              },
            ],
          },
        },
        {
          id: 'body_hiring_details',
          type: 'text',
          label: 'Hiring-details',
          content: {
            type: 'doc',
            content: [
              {
                type: 'paragraph',
                content: [
                  { type: 'text', marks: [{ type: 'bold' }], text: 'Duur: ' },
                  { type: 'text', text: '{{durationMonths}} maanden' },
                ],
              },
              {
                type: 'paragraph',
                content: [
                  { type: 'text', marks: [{ type: 'bold' }], text: 'Uurtarief: ' },
                  { type: 'text', text: '€ {{hourlyWageMin}} – € {{hourlyWageMax}}' },
                ],
              },
              {
                type: 'paragraph',
                content: [
                  { type: 'text', marks: [{ type: 'bold' }], text: 'Uren: ' },
                  { type: 'text', text: '{{hoursMin}}–{{hoursMax}} per week' },
                ],
              },
              {
                type: 'paragraph',
                content: [
                  { type: 'text', marks: [{ type: 'bold' }], text: 'Afwijking inkoopbeleid: ' },
                  { type: 'text', text: '{{procurementPolicyDeviationReason}}' },
                ],
              },
            ],
          },
        },
        {
          id: 'body_finance_heading',
          type: 'text',
          label: 'Financiële gegevens',
          content: {
            type: 'doc',
            content: [
              {
                type: 'heading',
                attrs: { level: 2 },
                content: [{ type: 'text', text: 'Financiële gegevens' }],
              },
            ],
          },
        },
        {
          id: 'body_finance_details',
          type: 'text',
          label: 'Financiën',
          content: {
            type: 'doc',
            content: [
              {
                type: 'paragraph',
                content: [
                  { type: 'text', marks: [{ type: 'bold' }], text: 'Jaarlijkse kosten: ' },
                  { type: 'text', text: '€ {{annualCostsAfter}}' },
                ],
              },
              {
                type: 'paragraph',
                content: [
                  { type: 'text', marks: [{ type: 'bold' }], text: 'Financieringsbron: ' },
                  { type: 'text', text: '{{fundingSource}}' },
                ],
              },
              {
                type: 'paragraph',
                content: [
                  { type: 'text', marks: [{ type: 'bold' }], text: 'Advies HRM-unit: ' },
                  { type: 'text', text: '{{hrmAdvice}}' },
                ],
              },
            ],
          },
        },
        {
          id: 'body_decision_heading',
          type: 'text',
          label: 'Besluit',
          content: {
            type: 'doc',
            content: [
              {
                type: 'heading',
                attrs: { level: 2 },
                content: [{ type: 'text', text: 'Besluit van de Directieraad' }],
              },
            ],
          },
        },
        {
          id: 'body_decision_details',
          type: 'text',
          label: 'Besluitgegevens',
          content: {
            type: 'doc',
            content: [
              {
                type: 'paragraph',
                content: [
                  { type: 'text', marks: [{ type: 'bold' }], text: 'Uitkomst: ' },
                  { type: 'text', text: '{{boardDecision}}' },
                ],
              },
              {
                type: 'paragraph',
                content: [
                  { type: 'text', marks: [{ type: 'bold' }], text: 'Kenmerk notulen: ' },
                  { type: 'text', text: '{{boardMinuteReference}}' },
                ],
              },
              {
                type: 'paragraph',
                content: [
                  { type: 'text', marks: [{ type: 'bold' }], text: 'Voorwaarden: ' },
                  { type: 'text', text: '{{decisionConditions}}' },
                ],
              },
            ],
          },
        },
        {
          id: 'body_instructions_heading',
          type: 'text',
          label: 'Instructies',
          content: {
            type: 'doc',
            content: [
              {
                type: 'heading',
                attrs: { level: 2 },
                content: [{ type: 'text', text: 'Handelingsinstructies' }],
              },
            ],
          },
        },
        {
          id: 'body_instructions',
          type: 'text',
          label: 'Stappen',
          content: {
            type: 'doc',
            content: [
              {
                type: 'paragraph',
                content: [
                  { type: 'text', marks: [{ type: 'bold' }], text: '1. Route: ' },
                  {
                    type: 'text',
                    text: '{{decisionRoute}} — afhandeling conform de geldende procedure binnen {{advisoryGroup}}.',
                  },
                ],
              },
              {
                type: 'paragraph',
                content: [
                  { type: 'text', marks: [{ type: 'bold' }], text: '2. Taakgroepen: ' },
                  { type: 'text', text: '{{candidateGroups}}' },
                ],
              },
              {
                type: 'paragraph',
                content: [
                  { type: 'text', marks: [{ type: 'bold' }], text: '3. Parallel: ' },
                  {
                    type: 'text',
                    text: 'de financial controller registreert de reservering op basis van dit besluit.',
                  },
                ],
              },
              {
                type: 'paragraph',
                content: [
                  { type: 'text', marks: [{ type: 'bold' }], text: '4. Bevestig ontvangst ' },
                  {
                    type: 'text',
                    text: 'via het IOU portaal en vermeld uw interne referentie (vacature-ID of inkoopcase-ID) bij afronding van de overdrachtstaak.',
                  },
                ],
              },
            ],
          },
        },
      ],
    },
    closing: {
      blocks: [
        {
          id: 'cl_contact',
          type: 'text',
          label: 'Contactinformatie',
          content: {
            type: 'doc',
            content: [
              {
                type: 'paragraph',
                content: [
                  {
                    type: 'text',
                    text: 'Voor vragen over deze overdracht kunt u contact opnemen met het Directiesecretariaat via directiesecretariaat@flevoland.nl onder vermelding van kenmerk {{boardMinuteReference}}.',
                  },
                ],
              },
            ],
          },
        },
      ],
    },
    signOff: {
      blocks: [
        {
          id: 'so_closing',
          type: 'text',
          label: 'Afsluiting',
          content: {
            type: 'doc',
            content: [
              { type: 'paragraph', content: [{ type: 'text', text: 'Met vriendelijke groet,' }] },
            ],
          },
        },
        { id: 'so_spacer', type: 'spacer', label: 'Ruimte handtekening' },
        {
          id: 'so_name',
          type: 'text',
          label: 'Naam en functie',
          content: {
            type: 'doc',
            content: [
              { type: 'paragraph', content: [{ type: 'text', text: 'Namens de Directieraad,' }] },
              { type: 'paragraph' },
              {
                type: 'paragraph',
                content: [
                  { type: 'text', marks: [{ type: 'bold' }], text: 'Secretaris Directieraad' },
                ],
              },
              { type: 'paragraph', content: [{ type: 'text', text: 'Provincie Flevoland' }] },
            ],
          },
        },
      ],
    },
    annex: null,
  },
};

export const DEFAULT_TEMPLATES: DocumentTemplate[] = [
  TREE_FELLING_BESCHIKKING,
  ZORGTOESLAG_PROVISIONAL_BESCHIKKING,
  ZORGTOESLAG_FINAL_BESCHIKKING,
  DVTP_CONSENT_RECEIPT,
  HR_CAPACITY_BOARD_DECISION_NOTIFICATION_NL,
  HR_CAPACITY_HANDOVER_NL,
];
