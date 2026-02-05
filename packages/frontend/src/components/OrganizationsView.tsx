// NEW FILE: packages/frontend/src/components/OrganizationsView.tsx

import { Building2, Loader2, RefreshCw } from 'lucide-react';
import React, { useEffect, useState } from 'react';

import { executeSparqlQuery } from '../services/sparqlService';
import { SparqlResponse } from '../types';
import { COMMON_PREFIXES } from '../utils/constants';
import OrganizationCard from './OrganizationCard';

interface Organization {
  uri: string;
  identifier: string;
  name: string;
  homepage?: string;
  logo?: string;
  spatial?: string;
}

interface OrganizationsViewProps {
  endpoint: string;
}

const ORGANIZATIONS_QUERY = `${COMMON_PREFIXES}
SELECT ?organization ?identifier ?name ?homepage ?logo ?spatial
WHERE {
  ?organization a cv:PublicOrganisation ;
                dct:identifier ?identifier ;
                skos:prefLabel ?name .

  OPTIONAL { ?organization foaf:homepage ?homepage }
  OPTIONAL { ?organization foaf:logo ?logo }
  OPTIONAL { ?organization schema:image ?logo }
  OPTIONAL { ?organization cv:spatial ?spatial }

  FILTER(LANG(?name) = "nl" || LANG(?name) = "")
}
ORDER BY ?name`;

const OrganizationsView: React.FC<OrganizationsViewProps> = ({ endpoint }) => {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadOrganizations = async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await executeSparqlQuery(ORGANIZATIONS_QUERY, endpoint);
      const orgs = parseOrganizations(result);
      setOrganizations(orgs);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load organizations');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrganizations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint]);

  const parseOrganizations = (result: SparqlResponse): Organization[] => {
    return result.results.bindings.map((binding) => ({
      uri: binding.organization?.value || '',
      identifier: binding.identifier?.value || '',
      name: binding.name?.value || '',
      homepage: binding.homepage?.value,
      logo: binding.logo?.value,
      spatial: binding.spatial?.value,
    }));
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-400">
        <Loader2 className="animate-spin mb-2" size={32} />
        <p className="text-sm animate-pulse">Loading organizations...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md">
          <p className="text-red-800 text-sm mb-3">{error}</p>
          <button
            onClick={loadOrganizations}
            className="flex items-center gap-2 text-red-600 hover:text-red-700 text-sm font-medium"
          >
            <RefreshCw size={14} />
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (organizations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-400">
        <Building2 size={48} className="mb-3" />
        <p className="text-sm">No organizations found in this dataset</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-200 bg-white flex justify-between items-center">
        <div className="flex items-center gap-3">
          <Building2 className="text-blue-600" size={24} />
          <div>
            <h2 className="text-lg font-semibold text-slate-800">Organizations</h2>
            <p className="text-xs text-slate-500">
              {organizations.length} organization{organizations.length !== 1 ? 's' : ''} found
            </p>
          </div>
        </div>
        <button
          onClick={loadOrganizations}
          className="flex items-center gap-2 px-3 py-2 text-sm text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors"
        >
          <RefreshCw size={14} />
          Refresh
        </button>
      </div>

      {/* Organizations Grid */}
      <div className="flex-1 overflow-auto p-6 bg-slate-50">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {organizations.map((org) => (
            <OrganizationCard key={org.uri} organization={org} endpoint={endpoint} size="medium" />
          ))}
        </div>
      </div>
    </div>
  );
};

export default OrganizationsView;
