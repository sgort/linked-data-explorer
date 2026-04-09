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
  processKey: 'AwbShellProcess',
  serviceId: 'ZorgtoeslagProvisional',
  schemaVersion: 1,
  readonly: false,
  status: 'example',
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

export const DEFAULT_TEMPLATES: DocumentTemplate[] = [
  TREE_FELLING_BESCHIKKING,
  ZORGTOESLAG_PROVISIONAL_BESCHIKKING,
  ZORGTOESLAG_FINAL_BESCHIKKING,
  DVTP_CONSENT_RECEIPT,
];
