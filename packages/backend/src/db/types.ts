// db/types.ts

export type BpmnRow = {
  lde_id: string;
  bpmn_process_id: string;
  name: string;
  description: string | null;
  xml: string;
  process_role: string;
  called_element: string | null;
  linked_dmn_templates: string[] | null;
  status: string;
  readonly: boolean;
  schema_version: number;
  created_at: Date;
  updated_at: Date;
};

export type FormRow = {
  id: string;
  name: string;
  description: string | null;
  schema: string; // stored as JSON string
  status: string;
  created_at: Date;
  updated_at: Date;
};

export type DocumentRow = {
  id: string;
  name: string;
  description: string | null;
  process_key: string | null;
  service_id: string | null;
  schema_version: number;
  zones: string;
  bindings: string;
  assets: string;
  status: string;
  created_at: Date;
  updated_at: Date;
};