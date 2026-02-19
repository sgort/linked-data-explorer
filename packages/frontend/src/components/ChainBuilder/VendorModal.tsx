import { Building2, ExternalLink, Mail, Phone, X } from 'lucide-react';
import React, { useEffect, useState } from 'react';

import { VendorService } from '../../types/vendor.types';

interface VendorModalProps {
  dmnIdentifier: string;
  dmnTitle: string;
  endpoint: string;
  onClose: () => void;
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

const VendorModal: React.FC<VendorModalProps> = ({
  dmnIdentifier,
  dmnTitle,
  endpoint,
  onClose,
}) => {
  const [vendors, setVendors] = useState<VendorService[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchVendors = async () => {
      try {
        setIsLoading(true);
        const url = `${API_BASE_URL}/v1/vendors/dmn/${encodeURIComponent(dmnIdentifier)}?endpoint=${encodeURIComponent(endpoint)}`;
        const response = await fetch(url);
        const data = await response.json();

        if (data.success) {
          setVendors(data.data.vendorServices);
        } else {
          setError(data.error || 'Failed to fetch vendor services');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setIsLoading(false);
      }
    };

    fetchVendors();
  }, [dmnIdentifier, endpoint]);

  const getAccessTypeBadge = (accessType?: string) => {
    const config = {
      'iam-required': { label: 'IAM Required', color: 'bg-amber-100 text-amber-700' },
      public: { label: 'Public Access', color: 'bg-green-100 text-green-700' },
      'api-key': { label: 'API Key Required', color: 'bg-blue-100 text-blue-700' },
    };

    const { label, color } = config[accessType as keyof typeof config] || {
      label: accessType || 'Unknown',
      color: 'bg-slate-100 text-slate-700',
    };

    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${color}`}>
        {label}
      </span>
    );
  };

  const getLicenseBadge = (license?: string) => {
    const config = {
      Commercial: { color: 'bg-purple-100 text-purple-700' },
      'Open Source': { color: 'bg-green-100 text-green-700' },
      Free: { color: 'bg-blue-100 text-blue-700' },
    };

    const color = config[license as keyof typeof config]?.color || 'bg-slate-100 text-slate-700';

    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${color}`}>
        {license || 'Unknown License'}
      </span>
    );
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-slate-200">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <Building2 size={24} className="text-blue-600" />
              <h2 className="text-xl font-bold text-slate-900">Vendor Implementations</h2>
            </div>
            <p className="text-sm text-slate-600">
              Available implementations for <strong>{dmnTitle}</strong> ({dmnIdentifier})
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {isLoading && (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <p className="text-sm text-slate-600 mt-4">Loading vendor services...</p>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
              <p className="font-medium">Error loading vendor services</p>
              <p className="text-sm mt-1">{error}</p>
            </div>
          )}

          {!isLoading && !error && vendors.length === 0 && (
            <div className="text-center py-12">
              <Building2 size={48} className="text-slate-300 mx-auto mb-4" />
              <p className="text-slate-600">No vendor implementations found</p>
            </div>
          )}

          {!isLoading && !error && vendors.length > 0 && (
            <div className="space-y-6">
              {vendors.map((vendor) => (
                <div
                  key={vendor.id}
                  className="border border-slate-200 rounded-lg p-6 hover:border-blue-300 transition-colors"
                >
                  {/* Vendor Header */}
                  <div className="flex items-start gap-4 mb-4">
                    {vendor.provider.logoUrl && (
                      <img
                        src={vendor.provider.logoUrl}
                        alt={vendor.provider.name}
                        className="w-24 h-20 object-contain rounded border border-slate-200 bg-white p-2"
                      />
                    )}
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-slate-900">
                        {vendor.provider.name}
                      </h3>
                      {vendor.implementedByName && (
                        <p className="text-sm text-slate-600">
                          Platform: <span className="font-medium">{vendor.implementedByName}</span>
                        </p>
                      )}
                      <div className="flex items-center gap-2 mt-2">
                        {getLicenseBadge(vendor.license)}
                        {getAccessTypeBadge(vendor.accessType)}
                      </div>
                    </div>
                  </div>

                  {/* Description */}
                  {vendor.description && (
                    <p className="text-sm text-slate-700 mb-4">{vendor.description}</p>
                  )}

                  {/* Service URL */}
                  {vendor.serviceUrl && (
                    <div className="mb-4">
                      <a
                        href={vendor.serviceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 font-medium"
                      >
                        <ExternalLink size={14} />
                        Access Service
                      </a>
                    </div>
                  )}

                  {/* Contact Information */}
                  {vendor.provider.contactPoint && (
                    <div className="border-t border-slate-200 pt-4">
                      <h4 className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">
                        Contact Information
                      </h4>
                      <div className="space-y-2">
                        {vendor.provider.contactPoint.name && (
                          <div className="flex items-center gap-2 text-sm text-slate-700">
                            <span className="font-medium">Contact:</span>
                            <span>{vendor.provider.contactPoint.name}</span>
                          </div>
                        )}
                        {vendor.provider.contactPoint.email && (
                          <div className="flex items-center gap-2 text-sm">
                            <Mail size={14} className="text-slate-400" />

                            <a
                              href={`mailto:${vendor.provider.contactPoint.email}`}
                              className="text-blue-600 hover:text-blue-700"
                            >
                              {vendor.provider.contactPoint.email}
                            </a>
                          </div>
                        )}
                        {vendor.provider.contactPoint.telephone && (
                          <div className="flex items-center gap-2 text-sm">
                            <Phone size={14} className="text-slate-400" />

                            <a
                              href={`tel:${vendor.provider.contactPoint.telephone}`}
                              className="text-blue-600 hover:text-blue-700"
                            >
                              {vendor.provider.contactPoint.telephone}
                            </a>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Vendor Homepage */}
                  {vendor.provider.homepage && (
                    <div className="mt-4">
                      <a
                        href={vendor.provider.homepage}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 text-xs text-slate-600 hover:text-slate-700"
                      >
                        <ExternalLink size={12} />
                        {vendor.provider.homepage}
                      </a>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200 p-4 bg-slate-50">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-slate-600 hover:bg-slate-700 text-white rounded-lg font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default VendorModal;
