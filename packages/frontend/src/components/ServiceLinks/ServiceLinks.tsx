import React from 'react';

import { ServiceLink } from '../../types';

/**
 * Display name of the other end of a dct:requires link: the DMN identifier
 * when that service has a DMN in the list, else the service title, else the
 * last path segment of the service URI, else the URI itself.
 */
export function serviceLinkName(link: ServiceLink): string {
  if (link.dmnIdentifier) return link.dmnIdentifier;
  if (link.title) return link.title;
  const tail = link.service.split('/').filter(Boolean).pop();
  return tail && link.service.includes('/') ? tail : link.service;
}

interface ServiceLinksProps {
  requires?: ServiceLink[];
  requiredBy?: ServiceLink[];
  className?: string;
}

const LinkLine: React.FC<{ label: string; links: ServiceLink[] }> = ({ label, links }) => (
  <div>
    {label}
    {links.map((link, i) => (
      <React.Fragment key={link.service}>
        {i > 0 && ', '}
        <span title={link.service}>{serviceLinkName(link)}</span>
      </React.Fragment>
    ))}
  </div>
);

/**
 * The services a DMN's public service requires, and the services that require
 * it (sgort/ttl-editor#223). Context only: LDE does not act on these links;
 * the order of execution lives in the BPMN.
 */
const ServiceLinks: React.FC<ServiceLinksProps> = ({ requires, requiredBy, className }) => {
  const hasRequires = !!requires && requires.length > 0;
  const hasRequiredBy = !!requiredBy && requiredBy.length > 0;
  if (!hasRequires && !hasRequiredBy) return null;

  return (
    <div className={`text-xs text-slate-500 ${className ?? ''}`.trim()}>
      {hasRequires && <LinkLine label="Requires: " links={requires} />}
      {hasRequiredBy && <LinkLine label="Required by: " links={requiredBy} />}
    </div>
  );
};

export default ServiceLinks;
