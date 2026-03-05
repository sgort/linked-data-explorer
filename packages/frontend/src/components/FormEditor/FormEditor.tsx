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
  ],
};

const FormEditor: React.FC = () => {
  const [forms, setForms] = useState<FormSchema[]>(FormService.getForms());
  const [activeFormId, setActiveFormId] = useState<string | null>(null);

  const activeForm = forms.find((f) => f.id === activeFormId) || null;

  /**
   * Seed the tree-felling-review example on first visit
   */
  useEffect(() => {
    const existing = FormService.getForms();
    if (!existing.find((f) => f.id === 'example_tree_felling_review')) {
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
      const allForms = FormService.getForms();
      setForms(allForms);
      setActiveFormId(example.id);
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
