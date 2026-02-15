/**
 * Vendor Service type definitions
 * Based on RONL Ontology v1.0 vendor integration vocabulary
 */

import { DmnModel } from "./dmn.types";

export interface VendorContact {
  name?: string;
  email?: string;
  telephone?: string;
}

export interface VendorOrganization {
  name: string;
  logoUrl?: string;
  homepage?: string;
  contactPoint?: VendorContact;
}

export interface VendorService {
  id: string; // URI of the vendor service
  basedOn: string; // URI of the reference DMN
  basedOnIdentifier?: string; // Identifier of reference DMN (e.g., "SVB_LeeftijdsInformatie")
  implementedBy?: string; // Implementation platform URI
  implementedByName?: string; // Platform name (e.g., "Blueriq")
  provider: VendorOrganization;
  serviceUrl?: string; // URL to access the vendor service
  license?: string; // e.g., "Commercial", "Open Source"
  accessType?: string; // e.g., "iam-required", "public", "api-key"
  description?: string;
}

export interface DmnWithVendors {
  dmn: DmnModel; // From existing dmn.types.ts
  vendorServices: VendorService[];
}

export interface VendorServiceListResponse {
  success: boolean;
  data: {
    vendorServices: VendorService[];
    count: number;
  };
  error?: string;
}