import { LayoutTemplate } from 'lucide-react';
import React, { useEffect, useState } from 'react';

import { FormService } from '../../services/formService';
import { FormSchema } from '../../types';
import { EXAMPLE_VERSIONS, getStoredVersion, setStoredVersion } from '../../utils/exampleVersions';
import FormCanvas from './FormCanvas';
import FormList from './FormList';

const EXAMPLE_FORMS: ReadonlyArray<{
  id: string;
  name: string;
  description: string;
  path: string;
  language?: 'en' | 'nl' | 'de';
  organization?: string;
}> = [
  {
    id: 'example_kapvergunning_start',
    name: 'Kapvergunning Start (Example)',
    description: 'Citizen-facing start form for the AWB Tree Felling Permit process',
    path: '/examples/flevoland/kapvergunning-start.form',
    language: 'en',
    organization: 'flevoland',
  },
  {
    id: 'example_tree_felling_review',
    name: 'Tree Felling Review (Example)',
    description: 'Caseworker review form for the Tree Felling Permit subprocess',
    path: '/examples/flevoland/tree-felling-review.form',
    language: 'en',
    organization: 'flevoland',
  },
  {
    id: 'example_kapvergunning_missing_info',
    name: 'Kapvergunning Aanvullende Gegevens (Example)',
    description:
      'Caseworker form for requesting missing information on a tree felling permit application (Awb 4:5)',
    path: '/examples/flevoland/kapvergunning-aanvullende-gegevens.form',
    language: 'nl',
    organization: 'flevoland',
  },
  {
    id: 'example_awb_notify_applicant',
    name: 'AWB Notify Applicant (Example)',
    description: 'Phase 6 notification form for the AWB Shell process (Awb 3:6)',
    path: '/examples/flevoland/awb-notify-applicant.form',
    language: 'en',
    organization: 'flevoland',
  },
  {
    id: 'example_thuisbatterij_start',
    name: 'Thuisbatterij Subsidie Start (Example)',
    description:
      'Citizen-facing start form for the Thuisbatterij subsidy process — supplies the inputs the RechtEnHoogteSubsidieThuisbatterij DRD evaluates',
    path: '/examples/flevoland/recht-en-hoogte-subsidie-thuisbatterij.form',
    language: 'nl',
    organization: 'flevoland',
  },
  {
    id: 'example_thuisbatterij_review',
    name: 'Thuisbatterij Subsidie Review (Example)',
    description: 'Caseworker review form for the Thuisbatterij subsidy decision subprocess',
    path: '/examples/flevoland/thuisbatterij-subsidie-review.form',
    language: 'nl',
    organization: 'flevoland',
  },
  {
    id: 'example_thuisbatterij_notify_applicant',
    name: 'Thuisbatterij Notify Applicant (Example)',
    description: 'Phase 6 notification form for the Thuisbatterij subsidy process (Awb 3:6)',
    path: '/examples/flevoland/awb-notify-applicant-thuisbatterij.form',
    language: 'en',
    organization: 'flevoland',
  },
  {
    id: 'example_thuisbatterij_missing_info',
    name: 'Thuisbatterij Aanvullende Gegevens (Example)',
    description:
      'Caseworker form for requesting missing information on a Thuisbatterij subsidy application (Awb 4:5)',
    path: '/examples/flevoland/thuisbatterij-aanvullende-gegevens.form',
    language: 'nl',
    organization: 'flevoland',
  },
  {
    id: 'example_zorgtoeslag_notify_applicant',
    name: 'Zorgtoeslag Notify Applicant (Example)',
    description: 'Phase 6 notification form for the AWB Zorgtoeslag process (Awb 3:6)',
    path: '/examples/toeslagen/zorgtoeslag-notify-applicant.form',
    language: 'en',
    organization: 'toeslagen',
  },
  {
    id: 'example_zorgtoeslag_provisional_start',
    name: 'Zorgtoeslag Provisional Start (Example)',
    description: 'Citizen-facing start form for the Zorgtoeslag Provisional Entitlement process',
    path: '/examples/toeslagen/zorgtoeslag-provisional-start.form',
    language: 'en',
    organization: 'toeslagen',
  },
  {
    id: 'example_zorgtoeslag_missing_info',
    name: 'Zorgtoeslag Aanvullende Gegevens (Example)',
    description:
      'Caseworker form for requesting missing information on a Zorgtoeslag application (Awb 4:5)',
    path: '/examples/toeslagen/zorgtoeslag-aanvullende-gegevens.form',
    language: 'nl',
    organization: 'toeslagen',
  },
  {
    id: 'example_zorgtoeslag_provisional_review',
    name: 'Zorgtoeslag Provisional Review (Example)',
    description: 'Caseworker review form for the Zorgtoeslag Provisional Entitlement subprocess',
    path: '/examples/toeslagen/zorgtoeslag-provisional-review.form',
    language: 'en',
    organization: 'toeslagen',
  },
  {
    id: 'example_zorgtoeslag_final_review',
    name: 'Zorgtoeslag Final Settlement Review (Example)',
    description: 'Caseworker review form for the Zorgtoeslag Final Settlement subprocess',
    path: '/examples/toeslagen/zorgtoeslag-final-review.form',
    language: 'en',
    organization: 'toeslagen',
  },
  {
    id: 'example_dvtp_consent_start',
    name: 'DvTP Consent Start (Example)',
    description: 'Citizen start form for the DvTP consent-granting process (Flow A)',
    path: '/examples/dvtp/dvtp-consent-start.form',
    language: 'nl',
    organization: 'bzk',
  },
  {
    id: 'example_dvtp_consent_info',
    name: 'DvTP Consent Info (Example)',
    description: 'Pre-consent information screen — force-read (FR-05/06/07/08)',
    path: '/examples/dvtp/dvtp-consent-info.form',
    language: 'nl',
    organization: 'bzk',
  },
  {
    id: 'example_dvtp_consent_decision',
    name: 'DvTP Consent Decision (Example)',
    description: 'Citizen consent decision form — binary grant or refuse (FR-09/10)',
    path: '/examples/dvtp/dvtp-consent-decision.form',
    language: 'nl',
    organization: 'bzk',
  },
  {
    id: 'example_hr_capacity_intake_nl',
    name: 'HR — Overleggen en classificeren (Voorbeeld, NL)',
    description: 'Dutch sibling of the capacity claim intake form.',
    path: '/examples/flevoland/HR-capacity/nl/capacity-claim-intake.nl.form',
    language: 'nl',
    organization: 'flevoland',
  },
  {
    id: 'example_hr_capacity_staffing_nl',
    name: 'HR — Formatieclaim opstellen (Voorbeeld, NL)',
    description: 'Dutch sibling of the staffing claim form.',
    path: '/examples/flevoland/HR-capacity/nl/capacity-claim-staffing.nl.form',
    language: 'nl',
    organization: 'flevoland',
  },
  {
    id: 'example_hr_capacity_hiring_nl',
    name: 'HR — Inhuurclaim opstellen (Voorbeeld, NL)',
    description: 'Dutch sibling of the hiring claim form.',
    path: '/examples/flevoland/HR-capacity/nl/capacity-claim-hiring.nl.form',
    language: 'nl',
    organization: 'flevoland',
  },
  {
    id: 'example_hr_capacity_submit_nl',
    name: 'HR — Agenderen Directievergadering (Voorbeeld, NL)',
    description: 'Dutch sibling of the submit-to-board form.',
    path: '/examples/flevoland/HR-capacity/nl/capacity-claim-submit.nl.form',
    language: 'nl',
    organization: 'flevoland',
  },
  {
    id: 'example_hr_capacity_board_decision_nl',
    name: 'HR — Directiebesluit (Voorbeeld, NL)',
    description: 'Dutch sibling of the board decision form.',
    path: '/examples/flevoland/HR-capacity/nl/capacity-claim-board-decision.nl.form',
    language: 'nl',
    organization: 'flevoland',
  },
  {
    id: 'example_hr_capacity_reconsideration_nl',
    name: 'HR — Heroverwegingsoverleg (Voorbeeld, NL)',
    description: 'Dutch sibling of the reconsideration form.',
    path: '/examples/flevoland/HR-capacity/nl/capacity-claim-reconsideration.nl.form',
    language: 'nl',
    organization: 'flevoland',
  },
  {
    id: 'example_hr_capacity_handover_nl',
    name: 'HR — Overdracht capaciteitsclaim (Voorbeeld, NL)',
    description: 'Dutch sibling of the handover form.',
    path: '/examples/flevoland/HR-capacity/nl/capacity-claim-handover.nl.form',
    language: 'nl',
    organization: 'flevoland',
  },
  {
    id: 'example_hr_capacity_register_reservation_nl',
    name: 'HR — Financiële reservering registreren (Voorbeeld, NL)',
    description: 'Dutch sibling of the register reservation form.',
    path: '/examples/flevoland/HR-capacity/nl/capacity-claim-register-reservation.nl.form',
    language: 'nl',
    organization: 'flevoland',
  },
  {
    id: 'example_besluit_gb_sjabloon_kiezen',
    name: 'Besluit GB — 1. Kies sjabloon (Voorbeeld, NL)',
    description: 'Indiener kiest het type besluit en het bijbehorende sjabloon',
    path: '/examples/flevoland/besluitvorming-gedelegeerd/besluit-gb-sjabloon-kiezen.form',
    language: 'nl',
    organization: 'flevoland',
  },
  {
    id: 'example_besluit_gb_sjabloon_invullen',
    name: 'Besluit GB — 2. Vul sjabloon in (Voorbeeld, NL)',
    description:
      'Indiener vult onderwerp, motivering, financiële gevolgen en voorgesteld besluit in',
    path: '/examples/flevoland/besluitvorming-gedelegeerd/besluit-gb-sjabloon-invullen.form',
    language: 'nl',
    organization: 'flevoland',
  },
  {
    id: 'example_besluit_gb_advies_toetsing',
    name: 'Besluit GB — Advies en toetsing (Voorbeeld, NL)',
    description: 'Juridische Zaken toetst en adviseert',
    path: '/examples/flevoland/besluitvorming-gedelegeerd/besluit-gb-advies-toetsing.form',
    language: 'nl',
    organization: 'flevoland',
  },
  {
    id: 'example_besluit_gb_voorwaarden',
    name: 'Besluit GB — 4. Controleer voorwaarden (Voorbeeld, NL)',
    description: 'Indiener bevestigt de voorwaarden voor gedelegeerde bevoegdheid',
    path: '/examples/flevoland/besluitvorming-gedelegeerd/besluit-gb-voorwaarden.form',
    language: 'nl',
    organization: 'flevoland',
  },
  {
    id: 'example_besluit_gb_memorandum',
    name: 'Besluit GB — 5. Memorandum (Voorbeeld, NL)',
    description: 'Indiener vult het formele memorandum in',
    path: '/examples/flevoland/besluitvorming-gedelegeerd/besluit-gb-memorandum.form',
    language: 'nl',
    organization: 'flevoland',
  },
  {
    id: 'example_besluit_gb_akkoord',
    name: 'Besluit GB — Advies / akkoord (Voorbeeld, NL)',
    description: 'Juridische Zaken geeft akkoord of escaleert',
    path: '/examples/flevoland/besluitvorming-gedelegeerd/besluit-gb-akkoord.form',
    language: 'nl',
    organization: 'flevoland',
  },
  {
    id: 'example_besluit_gb_indienen',
    name: 'Besluit GB — 6. Indienen (Voorbeeld, NL)',
    description: 'Indiener dient het besluit in voor ondertekening',
    path: '/examples/flevoland/besluitvorming-gedelegeerd/besluit-gb-indienen.form',
    language: 'nl',
    organization: 'flevoland',
  },
  {
    id: 'example_besluit_gb_ondertekenen',
    name: 'Besluit GB — Ondertekenen (Voorbeeld, NL)',
    description: 'Terugvalformulier voor ondertekening (ValidSign is de normale route)',
    path: '/examples/flevoland/besluitvorming-gedelegeerd/besluit-gb-ondertekenen.form',
    language: 'nl',
    organization: 'flevoland',
  },
  {
    id: 'example_besluit_gb_escalatie',
    name: 'Besluit GB — Escaleren (Voorbeeld, NL)',
    description: 'Indiener escaleert naar de bevoegde bestuursautoriteit',
    path: '/examples/flevoland/besluitvorming-gedelegeerd/besluit-gb-escalatie.form',
    language: 'nl',
    organization: 'flevoland',
  },
  {
    id: 'example_besluit_gb_besluit_nemen',
    name: 'Besluit GB — Neem besluit (Voorbeeld, NL)',
    description: 'Bevoegde bestuursautoriteit neemt het besluit',
    path: '/examples/flevoland/besluitvorming-gedelegeerd/besluit-gb-besluit-nemen.form',
    language: 'nl',
    organization: 'flevoland',
  },
  {
    id: 'example_besluit_gb_registreren',
    name: 'Besluit GB — Ontvang en registreer (Voorbeeld, NL)',
    description: 'Registratie & Beheer registreert in het zaaksysteem',
    path: '/examples/flevoland/besluitvorming-gedelegeerd/besluit-gb-registreren.form',
    language: 'nl',
    organization: 'flevoland',
  },
  {
    id: 'example_besluit_gb_archiveren',
    name: 'Besluit GB — Archiveer (Voorbeeld, NL)',
    description: 'Registratie & Beheer archiveert volgens bewaartermijn',
    path: '/examples/flevoland/besluitvorming-gedelegeerd/besluit-gb-archiveren.form',
    language: 'nl',
    organization: 'flevoland',
  },
];

type FooterDraft = {
  language?: FormSchema['language'];
  organization?: string;
};

const FormEditor: React.FC = () => {
  const [forms, setForms] = useState<FormSchema[]>(FormService.getForms());
  const [activeFormId, setActiveFormId] = useState<string | null>(null);
  const [draft, setDraft] = useState<FooterDraft>({});
  const [hasFooterChanges, setHasFooterChanges] = useState(false);
  const [hasCanvasChanges, setHasCanvasChanges] = useState(false);

  const activeForm = forms.find((f) => f.id === activeFormId) || null;

  /** True when the user has unsaved canvas edits or unsaved footer edits. */
  const hasUnsavedChanges = hasCanvasChanges || hasFooterChanges;

  /** Confirm with the user before discarding unsaved changes. Returns true to proceed. */
  const confirmDiscardIfDirty = (): boolean => {
    if (!hasUnsavedChanges) return true;
    return window.confirm('You have unsaved changes on this form.\n\nDiscard them and continue?');
  };

  const resetEditState = () => {
    setDraft({});
    setHasFooterChanges(false);
    setHasCanvasChanges(false);
  };

  /** Effective footer value: draft wins when user has touched the field, else committed value. */
  const effectiveLanguage = 'language' in draft ? draft.language : activeForm?.language;
  const effectiveOrganization =
    'organization' in draft ? draft.organization : activeForm?.organization;

  /**
   * Seed / refresh versioned example forms on mount.
   * Re-fetches from public/examples/ whenever EXAMPLE_VERSIONS
   * has been bumped above the version stored in localStorage.
   */
  useEffect(() => {
    const seed = async () => {
      const updated: FormSchema[] = [];

      for (const def of EXAMPLE_FORMS) {
        if (getStoredVersion(def.id) >= EXAMPLE_VERSIONS[def.id]) continue;

        const schema = await fetch(def.path).then((r) => r.json());
        const form: FormSchema = {
          id: def.id,
          name: def.name,
          description: def.description,
          schema,
          createdAt: '2026-03-05T00:00:00.000Z',
          updatedAt: new Date().toISOString(),
          readonly: false,
          status: 'example',
          language: def.language,
          organization: def.organization,
        };
        FormService.saveForm(form);
        setStoredVersion(def.id, EXAMPLE_VERSIONS[def.id]);
        updated.push(form);
      }

      if (updated.length > 0) {
        setForms(FormService.getForms());
        setActiveFormId(updated[0].id);
      }
    };

    seed();
  }, []);

  useEffect(() => {
    FormService.hydrateFromServer().then(setForms);
  }, []);

  const handleCreateForm = () => {
    if (!confirmDiscardIfDirty()) return;
    const newForm: FormSchema = {
      id: `form_${Date.now()}`,
      name: 'New Form',
      schema: {
        schemaVersion: 16,
        type: 'default',
        id: `form_${Date.now()}`,
        executionPlatform: 'Camunda Platform',
        executionPlatformVersion: '7.21.0',
        components: [],
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'wip',
    };
    FormService.saveForm(newForm);
    setForms(FormService.getForms());
    setActiveFormId(newForm.id);
    resetEditState();
  };

  const handleImportForm = (
    schema: Record<string, unknown>,
    name: string,
    inferredLanguage?: string,
    inferredOrganization?: string,
    isE2EFixture?: boolean
  ) => {
    const newForm: FormSchema = {
      id: `form_${Date.now()}`,
      name,
      schema,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: isE2EFixture ? 'e2e' : 'wip',
      language: inferredLanguage as FormSchema['language'] | undefined,
      organization: inferredOrganization,
    };
    FormService.saveForm(newForm);
    setForms(FormService.getForms());
    setActiveFormId(newForm.id);
    resetEditState();
  };

  const handleLoadForm = (formId: string) => {
    if (formId === activeFormId) return;
    if (!confirmDiscardIfDirty()) return;
    const form = FormService.getForm(formId);
    if (form) {
      setActiveFormId(form.id);
      resetEditState();
    }
  };

  const handleSaveForm = (schema: Record<string, unknown>) => {
    if (!activeFormId) return;
    const form = FormService.getForm(activeFormId);
    if (!form) return;

    const merged: FormSchema = {
      ...form,
      schema,
      language: 'language' in draft ? draft.language : form.language,
      organization: 'organization' in draft ? draft.organization : form.organization,
      updatedAt: new Date().toISOString(),
    };
    FormService.saveForm(merged);
    setForms(FormService.getForms());
    resetEditState();
  };

  const handleDeleteForm = (formId: string) => {
    const form = FormService.getForm(formId);
    if (form?.status === 'example') {
      alert('Cannot delete example forms');
      return;
    }
    if (confirm('Delete this form?')) {
      FormService.deleteForm(formId);
      setForms(FormService.getForms());
      if (activeFormId === formId) {
        setActiveFormId(null);
        resetEditState();
      }
    }
  };

  const handleUpdateFormName = (formId: string, name: string) => {
    const form = FormService.getForm(formId);
    if (form) {
      FormService.saveForm({ ...form, name, updatedAt: new Date().toISOString() });
      setForms(FormService.getForms());
    }
  };

  const handleLanguageChange = (language: FormSchema['language']) => {
    if (!activeFormId) return;
    setDraft((d) => ({ ...d, language }));
    setHasFooterChanges(true);
  };

  const handleOrganizationChange = (organization: string | undefined) => {
    if (!activeFormId) return;
    setDraft((d) => ({ ...d, organization }));
    setHasFooterChanges(true);
  };

  const handleCloseForm = () => {
    if (!confirmDiscardIfDirty()) return;
    setActiveFormId(null);
    resetEditState();
  };

  return (
    <div className="flex h-full bg-slate-50">
      <FormList
        forms={forms}
        activeFormId={activeFormId}
        activeForm={activeForm}
        effectiveLanguage={effectiveLanguage}
        effectiveOrganization={effectiveOrganization}
        onCreateForm={handleCreateForm}
        onImportForm={handleImportForm}
        onLoadForm={handleLoadForm}
        onDeleteForm={handleDeleteForm}
        onUpdateFormName={handleUpdateFormName}
        onLanguageChange={handleLanguageChange}
        onOrganizationChange={handleOrganizationChange}
      />

      <div className="flex-1 flex flex-col border-x border-slate-200">
        {activeForm ? (
          <FormCanvas
            key={activeFormId}
            schema={activeForm.schema}
            effectiveLanguage={effectiveLanguage}
            effectiveOrganization={effectiveOrganization}
            hasFooterChanges={hasFooterChanges}
            onDirtyChange={setHasCanvasChanges}
            onSave={handleSaveForm}
            onClose={handleCloseForm}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="w-32 h-32 mx-auto mb-4 rounded-full bg-slate-100 flex items-center justify-center">
                <LayoutTemplate size={48} className="text-slate-300" />
              </div>
              <h3 className="text-lg font-medium text-slate-600 mb-2">No form selected</h3>
              <p className="text-sm text-slate-400 mb-4">
                Create a new form or select an existing one
              </p>
              <button
                onClick={handleCreateForm}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Create New Form
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default FormEditor;
