/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useEffect, useState } from 'react';

import { FormService } from '../../services/formService';
import { FormSchema } from '../../types';

interface FormTemplateSelectorProps {
  element: any;
  modeling: any;
  selectedFormRef?: string;
}

const FormTemplateSelector: React.FC<FormTemplateSelectorProps> = ({
  element,
  modeling,
  selectedFormRef,
}) => {
  const [forms, setForms] = useState<FormSchema[]>([]);
  const [selectedId, setSelectedId] = useState<string>(selectedFormRef ?? '');

  useEffect(() => {
    setForms(FormService.getForms());
  }, []);

  // Keep selection in sync when the active element changes
  useEffect(() => {
    setSelectedId(selectedFormRef ?? '');
  }, [selectedFormRef]);

  const handleSelect = (schemaId: string) => {
    setSelectedId(schemaId);

    if (!schemaId) {
      modeling.updateProperties(element, {
        'camunda:formRef': undefined,
        'camunda:formRefBinding': undefined,
      });
      return;
    }

    modeling.updateProperties(element, {
      'camunda:formRef': schemaId,
      'camunda:formRefBinding': 'latest',
      // Clear legacy HTML formKey if present
      'camunda:formKey': undefined,
    });
  };

  if (forms.length === 0) {
    return (
      <div className="p-3 bg-white border-t border-slate-200">
        <div className="text-sm text-slate-500">
          No forms available — create one in the Form Editor first.
        </div>
      </div>
    );
  }

  const selectedForm = forms.find((f) => (f.schema as Record<string, unknown>).id === selectedId);

  return (
    <div className="p-3 bg-white border-t border-slate-200">
      <label className="block text-xs font-medium text-slate-700 mb-2">Link to Form</label>
      <select
        value={selectedId}
        onChange={(e) => handleSelect(e.target.value)}
        className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-green-500 focus:outline-none bg-white"
      >
        <option value="">-- Select a form --</option>
        {forms.map((form) => {
          const schemaId = (form.schema as Record<string, unknown>).id as string;
          return (
            <option key={form.id} value={schemaId}>
              {form.name}
            </option>
          );
        })}
      </select>

      {selectedForm && (
        <div className="mt-2 p-2 rounded text-xs bg-green-50 text-slate-600">
          <div className="font-medium text-green-700 mb-1">📝 {selectedForm.name}</div>
          {selectedForm.description && (
            <div className="text-slate-500 mb-1">{selectedForm.description}</div>
          )}
          <div className="text-slate-500 font-mono text-[10px]">
            formRef: {selectedId} · binding: latest
          </div>
        </div>
      )}
    </div>
  );
};

export default FormTemplateSelector;
