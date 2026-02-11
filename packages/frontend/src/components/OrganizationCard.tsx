// NEW FILE: packages/frontend/src/components/OrganizationCard.tsx

import { Building2, ExternalLink, Globe } from 'lucide-react';
import React, { useEffect, useState } from 'react';

import { resolveLogo } from '../utils/logoResolver';

interface OrganizationCardProps {
  organization: {
    uri: string;
    identifier: string;
    name: string;
    homepage?: string;
    logo?: string;
    spatial?: string;
  };
  endpoint: string;
  size?: 'small' | 'medium' | 'large';
}

const OrganizationCard: React.FC<OrganizationCardProps> = ({
  organization,
  endpoint,
  size = 'medium',
}) => {
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoError, setLogoError] = useState(false);

  useEffect(() => {
    if (organization.logo) {
      resolveLogo(organization.logo, endpoint).then((url) => {
        setLogoUrl(url);
      });
    }
  }, [organization.logo, endpoint]);

  const sizeClasses = {
    small: {
      container: 'p-3',
      logo: 'w-12 h-12',
      title: 'text-sm',
      subtitle: 'text-xs',
    },
    medium: {
      container: 'p-4',
      logo: 'w-16 h-16',
      title: 'text-base',
      subtitle: 'text-sm',
    },
    large: {
      container: 'p-6',
      logo: 'w-24 h-24',
      title: 'text-lg',
      subtitle: 'text-base',
    },
  };

  const classes = sizeClasses[size];

  return (
    <div
      className={`bg-white border border-slate-200 rounded-lg hover:shadow-md transition-shadow ${classes.container}`}
    >
      <div className="flex items-start gap-4">
        {/* Logo */}
        <div
          className={`flex-shrink-0 ${classes.logo} bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-center overflow-hidden`}
        >
          {logoUrl && !logoError ? (
            <img
              src={logoUrl}
              alt={`${organization.name} logo`}
              className="w-full h-full object-contain p-2"
              onError={() => setLogoError(true)}
            />
          ) : (
            <Building2
              className="text-slate-400"
              size={size === 'small' ? 20 : size === 'medium' ? 24 : 32}
            />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Name */}
          <h3 className={`font-semibold text-slate-800 truncate ${classes.title}`}>
            {organization.name}
          </h3>

          {/* Identifier */}
          <p className={`text-slate-500 font-mono truncate ${classes.subtitle}`}>
            {organization.identifier}
          </p>

          {/* Homepage */}
          {organization.homepage && (
            <a
              href={organization.homepage}
              target="_blank"
              rel="noreferrer"
              className={`flex items-center gap-1 text-blue-600 hover:text-blue-700 hover:underline mt-2 ${classes.subtitle}`}
            >
              <Globe size={14} />
              <span className="truncate">Website</span>
              <ExternalLink size={12} />
            </a>
          )}

          {/* Spatial (Country) */}
          {organization.spatial && (
            <p className={`text-slate-400 mt-1 ${classes.subtitle}`}>
              📍 {organization.spatial.split('/').pop()}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default OrganizationCard;
