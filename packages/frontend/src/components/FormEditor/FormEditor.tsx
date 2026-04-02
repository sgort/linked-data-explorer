import { LayoutTemplate } from 'lucide-react';
import React, { useEffect, useState } from 'react';

import { FormService } from '../../services/formService';
import { FormSchema } from '../../types';
import { EXAMPLE_VERSIONS, getStoredVersion, setStoredVersion } from '../../utils/exampleVersions';
import FormCanvas from './FormCanvas';
import FormList from './FormList';

const EXAMPLE_FORMS = [
  {
    id: 'example_kapvergunning_start',
    name: 'Kapvergunning Start (Example)',
    description: 'Citizen-facing start form for the AWB Tree Felling Permit process',
    path: '/examples/flevoland/kapvergunning-start.form',
  },
  {
    id: 'example_tree_felling_review',
    name: 'Tree Felling Review (Example)',
    description: 'Caseworker review form for the Tree Felling Permit subprocess',
    path: '/examples/flevoland/tree-felling-review.form',
  },
  {
    id: 'example_awb_notify_applicant',
    name: 'AWB Notify Applicant (Example)',
    description: 'Phase 6 notification form for the AWB Shell process (Awb 3:6)',
    path: '/examples/flevoland/awb-notify-applicant.form',
  },
  {
    id: 'example_zorgtoeslag_notify_applicant',
    name: 'Zorgtoeslag Notify Applicant (Example)',
    description: 'Phase 6 notification form for the AWB Zorgtoeslag process (Awb 3:6)',
    path: '/examples/toeslagen/zorgtoeslag-notify-applicant.form',
  },
  {
    id: 'example_zorgtoeslag_provisional_start',
    name: 'Zorgtoeslag Provisional Start (Example)',
    description: 'Citizen-facing start form for the Zorgtoeslag Provisional Entitlement process',
    path: '/examples/toeslagen/zorgtoeslag-provisional-start.form',
  },
  {
    id: 'example_zorgtoeslag_provisional_review',
    name: 'Zorgtoeslag Provisional Review (Example)',
    description: 'Caseworker review form for the Zorgtoeslag Provisional Entitlement subprocess',
    path: '/examples/toeslagen/zorgtoeslag-provisional-review.form',
  },
  {
    id: 'example_zorgtoeslag_final_review',
    name: 'Zorgtoeslag Final Settlement Review (Example)',
    description: 'Caseworker review form for the Zorgtoeslag Final Settlement subprocess',
    path: '/examples/toeslagen/zorgtoeslag-final-review.form',
  },
];

const FormEditor: React.FC = () => {
  const [forms, setForms] = useState<FormSchema[]>(FormService.getForms());
  const [activeFormId, setActiveFormId] = useState<string | null>(null);

  const activeForm = forms.find((f) => f.id === activeFormId) || null;

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

  const handleImportForm = (schema: Record<string, unknown>, name: string) => {
    const newForm: FormSchema = {
      id: `form_${Date.now()}`,
      name,
      schema,
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
    if (form?.status === 'example') {
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
        onImportForm={handleImportForm}
        onLoadForm={handleLoadForm}
        onDeleteForm={handleDeleteForm}
        onUpdateFormName={handleUpdateFormName}
      />

      <div className="flex-1 flex flex-col border-x border-slate-200">
        {activeForm ? (
          <FormCanvas
            key={activeFormId}
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
