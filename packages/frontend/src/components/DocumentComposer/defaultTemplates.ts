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
  readonly: true,
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

export const DEFAULT_TEMPLATES: DocumentTemplate[] = [TREE_FELLING_BESCHIKKING];
