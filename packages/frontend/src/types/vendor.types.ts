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
  id: string;
  basedOn: string;
  basedOnIdentifier?: string;
  implementedBy?: string;
  implementedByName?: string;
  provider: VendorOrganization;
  serviceUrl?: string;
  license?: string;
  accessType?: string;
  description?: string;
}
