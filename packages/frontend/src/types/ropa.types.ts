export type ProcessLevel = 'shell' | 'subprocess';
export type RopaStatus = 'draft' | 'active' | 'archived';
export type DataCategory =
  'identity' | 'financial' | 'residence' | 'health' | 'civil status' | 'criminal' | 'other';

export interface RopaPersonalDataField {
  id: string;
  ropaRecordId: string;
  formId: string;
  fieldKey: string;
  fieldLabel: string;
  dataCategory: DataCategory;
  specialCategory: boolean;
  sortOrder: number;
}

export interface RopaRecord {
  id: string;
  bpmnProcessId: string;
  processLevel: ProcessLevel;
  title: string;
  controllerName: string;
  controllerContact: string;
  dpoContact?: string;
  purpose: string;
  legalBasisUri: string;
  legalBasisLabel: string;
  gdprArticle: string;
  dataSubjects: string;
  recipients: string;
  thirdCountryTransfers: boolean;
  thirdCountryDetails?: string;
  retentionPeriod: string;
  securityMeasures: string;
  status: RopaStatus;
  schemaVersion: number;
  personalDataFields: RopaPersonalDataField[];
  createdAt: string;
  updatedAt: string;
}
