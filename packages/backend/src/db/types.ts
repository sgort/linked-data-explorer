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

export type RopaRecordRow = {
  id: string;
  bpmn_process_id: string;
  process_level: string;
  title: string;
  controller_name: string;
  controller_contact: string;
  dpo_contact: string | null;
  purpose: string;
  legal_basis_uri: string;
  legal_basis_label: string;
  gdpr_article: string;
  data_subjects: string;
  recipients: string;
  third_country_transfers: boolean;
  third_country_details: string | null;
  retention_period: string;
  security_measures: string;
  status: string;
  schema_version: number;
  created_at: Date;
  updated_at: Date;
};

export type RopaFieldRow = {
  id: string;
  ropa_record_id: string;
  form_id: string;
  field_key: string;
  field_label: string;
  data_category: string;
  special_category: boolean;
  sort_order: number;
};
