export type Bpmn = {
  id: string;
  bpmnProcessId: string;
  name: string;
  description?: string;
  xml: string;
  processRole: string;
  calledElement?: string;
  linkedDmnTemplates: string[];
  status: string;
  readonly: boolean;
  schemaVersion: number;
  createdAt: Date;
  updatedAt: Date;
};

export type Form = {
  id: string;
  name: string;
  description?: string;
  schema: Record<string, unknown>;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  readonly: boolean;
};

export type Document = {
  id: string;
  name: string;
  description?: string;
  processKey?: string;
  serviceId?: string;
  schemaVersion: number;
  zones: unknown;
  bindings: unknown;
  assets: unknown;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  readonly: boolean;
};