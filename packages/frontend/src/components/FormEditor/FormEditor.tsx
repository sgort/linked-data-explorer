import { LayoutTemplate } from 'lucide-react';
import React, { useEffect, useState } from 'react';

import { FormService } from '../../services/formService';
import { FormSchema } from '../../types';
import FormCanvas from './FormCanvas';
import FormList from './FormList';

const TREE_FELLING_REVIEW_SCHEMA: Record<string, unknown> = {
  schemaVersion: 16,
  type: 'default',
  id: 'tree-felling-review',
  executionPlatform: 'Camunda Platform',
  executionPlatformVersion: '7.21.0',
  components: [
    { id: 'Text_Header', type: 'text', text: '# Tree felling permit – case worker review' },
    {
      id: 'Field_ReviewError',
      type: 'textfield',
      label: 'Validation message',
      key: 'reviewError',
      disabled: true,
      readonly: true,
      description: 'If this is filled, fix the issue below and submit again.',
    },
    { id: 'Text_Current', type: 'text', text: '## Current (DMN) decisions' },
    {
      id: 'Field_PermitDecision',
      type: 'textfield',
      label: 'permitDecision (current)',
      key: 'permitDecision',
      disabled: true,
      readonly: true,
    },
    {
      id: 'Field_ReplacementDecision',
      type: 'textfield',
      label: 'replacementDecision (current)',
      key: 'replacementDecision',
      disabled: true,
      readonly: true,
      description: 'May be empty/null if permit was rejected.',
    },
    {
      id: 'Text_Action',
      type: 'text',
      text: '## Review action\n- **Confirm**: keep DMN decisions as-is\n- **Reject**: force permitDecision = `Reject`\n- **Change**: override decisions below\n',
    },
    {
      id: 'Field_ReviewAction',
      type: 'select',
      label: 'What do you want to do?',
      key: 'reviewAction',
      validate: { required: true },
      values: [
        { label: 'Confirm (keep DMN decisions)', value: 'confirm' },
        { label: 'Reject (force rejection)', value: 'reject' },
        { label: 'Change (override decisions)', value: 'change' },
      ],
    },
    {
      id: 'Field_ReviewPermitDecision',
      type: 'select',
      label: 'New permitDecision (required when action = Change)',
      key: 'reviewPermitDecision',
      values: [
        { label: 'Permit', value: 'Permit' },
        { label: 'Reject', value: 'Reject' },
      ],
    },
    {
      id: 'Field_ReviewReplacementDecision',
      type: 'radio',
      label: 'Is a replacement tree required?',
      key: 'reviewReplacementDecision',
      validate: { required: true },
      values: [
        { label: 'Yes – replacement required', value: true },
        { label: 'No – replacement not required', value: false },
      ],
    },
    {
      id: 'Button_Submit',
      type: 'button',
      label: 'Submit review',
      action: 'submit',
    },
  ],
};

const AWB_NOTIFY_APPLICANT_SCHEMA: Record<string, unknown> = {
  schemaVersion: 16,
  type: 'default',
  id: 'awb-notify-applicant',
  executionPlatform: 'Camunda Platform',
  executionPlatformVersion: '7.21.0',
  components: [
    { id: 'Text_Header', type: 'text', text: '# Phase 6 – Notify applicant of decision (Awb 3:6)' },
    { id: 'Text_AppDetails', type: 'text', text: '## Application details' },
    {
      id: 'Field_TreeDiameter',
      type: 'textfield',
      label: 'Tree diameter (cm)',
      key: 'treeDiameter',
      readonly: true,
      disabled: true,
    },
    {
      id: 'Field_ProtectedArea',
      type: 'textfield',
      label: 'Protected area',
      key: 'protectedArea',
      readonly: true,
      disabled: true,
    },
    { id: 'Text_Decision', type: 'text', text: '## Decision information' },
    {
      id: 'Field_Status',
      type: 'textfield',
      label: 'Status',
      key: 'status',
      readonly: true,
      disabled: true,
    },
    {
      id: 'Field_PermitDecision',
      type: 'textfield',
      label: 'Permit decision',
      key: 'permitDecision',
      readonly: true,
      disabled: true,
    },
    {
      id: 'Field_FinalMessage',
      type: 'textarea',
      label: 'Decision message',
      key: 'finalMessage',
      readonly: true,
      disabled: true,
    },
    {
      id: 'Field_ReplacementInfo',
      type: 'textarea',
      label: 'Replacement information',
      key: 'replacementInfo',
      readonly: true,
      disabled: true,
    },
    { id: 'Text_Action', type: 'text', text: '## Notification action' },
    {
      id: 'Field_NotificationMethod',
      type: 'select',
      label: 'Notification method',
      key: 'notificationMethod',
      validate: { required: true },
      values: [
        { label: 'Email', value: 'email' },
        { label: 'Letter (Post)', value: 'letter' },
        { label: 'Phone call', value: 'phone' },
        { label: 'Citizen portal', value: 'portal' },
      ],
      description: 'How should the applicant be informed of this decision?',
    },
    {
      id: 'Field_NotificationNotes',
      type: 'textarea',
      label: 'Additional notes',
      key: 'notificationNotes',
      description: 'Optional. These notes will be included in the notification to the applicant.',
    },
    {
      id: 'Field_ApplicantNotified',
      type: 'checkbox',
      label: 'I confirm the applicant will be notified',
      key: 'applicantNotified',
      validate: { required: true },
    },
    {
      id: 'Button_Submit',
      type: 'button',
      label: 'Confirm notification',
      action: 'submit',
    },
  ],
};

const KAPVERGUNNING_START_SCHEMA: Record<string, unknown> = {
  schemaVersion: 16,
  type: 'default',
  id: 'kapvergunning-start',
  executionPlatform: 'Camunda Platform',
  executionPlatformVersion: '7.21.0',
  components: [
    {
      id: 'Text_Header',
      type: 'text',
      text: '# Apply for a tree felling permit',
    },
    {
      id: 'Text_Intro',
      type: 'text',
      text: 'Use this form to submit your tree felling permit application. Your application will be assessed automatically based on municipal regulations (APV). You will receive a decision and, if applicable, information about replacement requirements.',
    },
    {
      id: 'Field_TreeDiameter',
      type: 'number',
      label: 'Tree diameter (cm)',
      key: 'treeDiameter',
      validate: { required: true, min: 1, max: 500 },
      description:
        'Measure the trunk diameter at 1.30 metres above ground level (breast height). Examples: small tree 10–20 cm · medium tree 30–50 cm · large tree 60+ cm.',
    },
    {
      id: 'Field_ProtectedArea',
      type: 'checkbox',
      label: 'The tree is located in a protected area',
      key: 'protectedArea',
      description:
        'Protected areas include nature reserves, conservation zones, heritage sites, and areas with special environmental protection status.',
    },
    {
      id: 'Button_Submit',
      type: 'button',
      label: 'Submit application',
      action: 'submit',
    },
  ],
};

const FormEditor: React.FC = () => {
  const [forms, setForms] = useState<FormSchema[]>(FormService.getForms());
  const [activeFormId, setActiveFormId] = useState<string | null>(null);

  const activeForm = forms.find((f) => f.id === activeFormId) || null;

  /**
   * Seed both awb-notify-applicant and tree-felling-review example on first visit
   */
  useEffect(() => {
    const existing = FormService.getForms();
    const existingIds = new Set(existing.map((f) => f.id));
    const added: FormSchema[] = [];

    if (!existingIds.has('example_kapvergunning_start')) {
      const example: FormSchema = {
        id: 'example_kapvergunning_start',
        name: 'Kapvergunning Start (Example)',
        description: 'Citizen-facing start form for the AWB Tree Felling Permit process',
        schema: KAPVERGUNNING_START_SCHEMA,
        createdAt: '2026-03-05T00:00:00.000Z',
        updatedAt: '2026-03-05T00:00:00.000Z',
        readonly: true,
        status: 'example',
      };
      FormService.saveForm(example);
      added.push(example);
    }

    if (!existingIds.has('example_tree_felling_review')) {
      const example: FormSchema = {
        id: 'example_tree_felling_review',
        name: 'Tree Felling Review (Example)',
        description: 'Caseworker review form for the Tree Felling Permit subprocess',
        schema: TREE_FELLING_REVIEW_SCHEMA,
        createdAt: '2026-03-05T00:00:00.000Z',
        updatedAt: '2026-03-05T00:00:00.000Z',
        readonly: true,
        status: 'example',
      };
      FormService.saveForm(example);
      added.push(example);
    }

    if (!existingIds.has('example_awb_notify_applicant')) {
      const example: FormSchema = {
        id: 'example_awb_notify_applicant',
        name: 'AWB Notify Applicant (Example)',
        description: 'Phase 6 notification form for the AWB Shell process (Awb 3:6)',
        schema: AWB_NOTIFY_APPLICANT_SCHEMA,
        createdAt: '2026-03-05T00:00:00.000Z',
        updatedAt: '2026-03-05T00:00:00.000Z',
        readonly: true,
        status: 'example',
      };
      FormService.saveForm(example);
      added.push(example);
    }

    if (added.length > 0) {
      const allForms = FormService.getForms();
      setForms(allForms);
      setActiveFormId(added[0].id);
    }
  }, []);

  const handleCreateForm = () => {
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
  };

  const handleLoadForm = (formId: string) => {
    const form = FormService.getForm(formId);
    if (form) setActiveFormId(form.id);
  };

  const handleSaveForm = (schema: Record<string, unknown>) => {
    if (!activeFormId) return;
    const form = FormService.getForm(activeFormId);
    if (form) {
      FormService.saveForm({ ...form, schema, updatedAt: new Date().toISOString() });
      setForms(FormService.getForms());
    }
  };

  const handleDeleteForm = (formId: string) => {
    const form = FormService.getForm(formId);
    if (form?.readonly) {
      alert('Cannot delete example forms');
      return;
    }
    if (confirm('Delete this form?')) {
      FormService.deleteForm(formId);
      setForms(FormService.getForms());
      if (activeFormId === formId) setActiveFormId(null);
    }
  };

  const handleUpdateFormName = (formId: string, name: string) => {
    const form = FormService.getForm(formId);
    if (form) {
      FormService.saveForm({ ...form, name, updatedAt: new Date().toISOString() });
      setForms(FormService.getForms());
    }
  };

  const handleCloseForm = () => setActiveFormId(null);

  return (
    <div className="flex h-full bg-slate-50">
      <FormList
        forms={forms}
        activeFormId={activeFormId}
        onCreateForm={handleCreateForm}
        onLoadForm={handleLoadForm}
        onDeleteForm={handleDeleteForm}
        onUpdateFormName={handleUpdateFormName}
      />

      <div className="flex-1 flex flex-col border-x border-slate-200">
        {activeForm ? (
          <FormCanvas
            schema={activeForm.schema}
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
