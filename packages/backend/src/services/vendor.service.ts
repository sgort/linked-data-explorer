import axios from 'axios';
import { VendorService as VendorServiceType } from '../types/vendor.types'; // Renamed import to avoid conflict
import logger from '../utils/logger';
import { getErrorMessage } from '../utils/errors';
import { sparqlService } from './sparql.service';

/**
 * Service for managing vendor implementations
 * Fetches vendor services based on reference DMNs
 */
class VendorServiceImpl {
  /**
   * Get all vendor services for a specific endpoint
   *
   * @param endpoint - SPARQL endpoint URL
   * @returns Array of vendor services
   */
  async getAllVendorServices(endpoint?: string): Promise<VendorServiceType[]> {
    try {
      logger.info('Fetching all vendor services', {
        ...(endpoint && { endpoint }),
      });

      const query = `
PREFIX ronl: <https://regels.overheid.nl/ontology#>
PREFIX dct: <http://purl.org/dc/terms/>
PREFIX schema: <http://schema.org/>
PREFIX foaf: <http://xmlns.com/foaf/0.1/>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

SELECT DISTINCT ?vendorService ?basedOn ?basedOnIdentifier
                ?implementedBy 
                (SAMPLE(?implementedByName_) AS ?implementedByName)
                (SAMPLE(?providerName_) AS ?providerName)
                (SAMPLE(?providerLogo_) AS ?providerLogo)
                (SAMPLE(?providerHomepage_) AS ?providerHomepage)
                (SAMPLE(?contactName_) AS ?contactName)
                (SAMPLE(?contactEmail_) AS ?contactEmail)
                (SAMPLE(?contactTelephone_) AS ?contactTelephone)
                (SAMPLE(?serviceUrl_) AS ?serviceUrl)
                (SAMPLE(?license_) AS ?license)
                (SAMPLE(?accessType_) AS ?accessType)
                (SAMPLE(?description_) AS ?description)
WHERE {
  ?vendorService a ronl:VendorService ;
                 ronl:basedOn ?basedOn .
  
  # Get reference DMN identifier
  OPTIONAL {
    ?basedOn dct:identifier ?basedOnIdentifier .
  }
  
  # Implementation platform
  OPTIONAL { 
    ?vendorService ronl:implementedBy ?implementedBy .
    # Try to get platform name (prefer Dutch, fallback to any language)
    OPTIONAL {
      ?implementedBy skos:prefLabel ?implementedByName_ .
      FILTER(LANG(?implementedByName_) = "nl" || LANG(?implementedByName_) = "" || !isLiteral(?implementedByName_))
    }
  }
  
  # Vendor provider organization
  OPTIONAL {
    ?vendorService schema:provider ?provider .
    
    OPTIONAL { ?provider schema:name ?providerName_ }
    OPTIONAL { ?provider schema:image ?providerLogo_ }
    OPTIONAL { ?provider foaf:homepage ?providerHomepage_ }
    
    # Contact point (use blank node or URI)
    OPTIONAL {
      ?provider schema:contactPoint ?contact .
      OPTIONAL { ?contact schema:name ?contactName_ }
      OPTIONAL { ?contact schema:email ?contactEmail_ }
      OPTIONAL { ?contact schema:telephone ?contactTelephone_ }
    }
  }
  
  # Service details
  OPTIONAL { ?vendorService schema:url ?serviceUrl_ }
  OPTIONAL { ?vendorService schema:license ?license_ }
  OPTIONAL { ?vendorService ronl:accessType ?accessType_ }
  OPTIONAL { 
    ?vendorService dct:description ?description_ .
    FILTER(LANG(?description_) = "nl" || LANG(?description_) = "" || !isLiteral(?description_))
  }
}
GROUP BY ?vendorService ?basedOn ?basedOnIdentifier ?implementedBy
ORDER BY ?basedOnIdentifier ?providerName
`;

      // Use the public executeSparqlQuery method instead of private executeQuery
      const data = await sparqlService.executeSparqlQuery(endpoint || '', query);
      const bindings = data.results?.bindings || [];

      logger.info(`Found ${bindings.length} vendor service records`);

      // Group by vendor service URI to handle any remaining duplicates
      const vendorMap = new Map<string, VendorServiceType>();

      for (const binding of bindings) {
        const id = binding.vendorService.value;

        if (!vendorMap.has(id)) {
          // Resolve logo URL if present
          let logoUrl: string | undefined;
          if (binding.providerLogo?.value) {
            // Handle relative paths (e.g., ./assets/logo.png)
            if (binding.providerLogo.value.startsWith('./assets/')) {
              // Use logoResolver to get full URL from TriplyDB
              logoUrl = await this.resolveVendorLogo(binding.providerLogo.value, endpoint);
            } else if (binding.providerLogo.value.startsWith('http')) {
              logoUrl = binding.providerLogo.value;
            }
          }

          vendorMap.set(id, {
            id,
            basedOn: binding.basedOn.value,
            basedOnIdentifier: binding.basedOnIdentifier?.value,
            implementedBy: binding.implementedBy?.value,
            implementedByName: binding.implementedByName?.value,
            provider: {
              name: binding.providerName?.value || 'Unknown Vendor',
              logoUrl,
              homepage: binding.providerHomepage?.value,
              contactPoint: {
                name: binding.contactName?.value,
                email: binding.contactEmail?.value,
                telephone: binding.contactTelephone?.value,
              },
            },
            serviceUrl: binding.serviceUrl?.value,
            license: binding.license?.value,
            accessType: binding.accessType?.value,
            description: binding.description?.value,
          });
        }
      }

      const vendorServices = Array.from(vendorMap.values());
      logger.info(`Processed ${vendorServices.length} unique vendor services`);

      return vendorServices;
    } catch (error) {
      logger.error('Error fetching vendor services', {
        error: getErrorMessage(error),
      });
      throw error;
    }
  }

  /**
   * Get vendor services for a specific DMN
   *
   * @param dmnId - DMN identifier or URI
   * @param endpoint - SPARQL endpoint URL
   * @returns Array of vendor services for this DMN
   */
  async getVendorServicesForDmn(dmnId: string, endpoint?: string): Promise<VendorServiceType[]> {
    try {
      logger.info('Fetching vendor services for DMN', { dmnId });

      const allVendors = await this.getAllVendorServices(endpoint);

      // Filter by DMN identifier or URI
      const filtered = allVendors.filter(
        (vendor) =>
          vendor.basedOnIdentifier === dmnId ||
          vendor.basedOn === dmnId ||
          vendor.basedOn.endsWith(`/${dmnId}/dmn`)
      );

      logger.info(`Found ${filtered.length} vendor services for DMN ${dmnId}`);
      return filtered;
    } catch (error) {
      logger.error('Error fetching vendor services for DMN', {
        dmnId,
        error: getErrorMessage(error),
      });
      throw error;
    }
  }

  /**
   * Resolve vendor logo URL from relative path
   * Uses similar approach to DMN logo resolution
   *
   * @param logoPath - Relative path from TTL (e.g., "./assets/logo.png")
   * @param endpoint - SPARQL endpoint URL
   * @returns Full logo URL or undefined
   */
  private async resolveVendorLogo(
    logoPath: string,
    endpoint?: string
  ): Promise<string | undefined> {
    try {
      // Extract filename from path
      const filename = logoPath.split('/').pop();
      if (!filename) return undefined;

      // Extract account and dataset from endpoint
      const match = endpoint?.match(/datasets\/([^/]+)\/([^/]+)/);
      if (!match) return undefined;

      const [, account, dataset] = match;

      // Fetch assets from TriplyDB
      const assetsUrl = `https://api.open-regels.triply.cc/datasets/${account}/${dataset}/assets`;

      const response = await axios.get(assetsUrl);

      // Type the assets response
      interface TriplyAsset {
        assetName: string;
        identifier: string;
        versions: Array<{
          id: string;
          url: string;
          fileSize: number;
        }>;
      }

      const assets = response.data as TriplyAsset[];

      // Find matching asset
      const matchingAsset = assets.find((a) => a.assetName === filename);

      if (matchingAsset && matchingAsset.versions?.length > 0) {
        return matchingAsset.versions[0].url;
      }

      return undefined;
    } catch (error) {
      logger.warn('Failed to resolve vendor logo URL', {
        logoPath,
        error: getErrorMessage(error),
      });
      return undefined;
    }
  }
}

// Export singleton instance
export const vendorService = new VendorServiceImpl();
export default vendorService;
