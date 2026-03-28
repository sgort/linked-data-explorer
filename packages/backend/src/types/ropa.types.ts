export type ProcessLevel = 'shell' | 'subprocess';
export type RopaStatus = 'draft' | 'active' | 'archived';

export interface RopaPersonalDataField {
  id: string;
  ropaRecordId: string;
  formId: string;
  fieldKey: string;
  fieldLabel: string;
  dataCategory: string;
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

/** Subset safe for public exposure — no internal contact details */
export type PublicRopaRecord = Omit<
  RopaRecord,
  'schemaVersion' | 'controllerContact' | 'dpoContact'
>;
