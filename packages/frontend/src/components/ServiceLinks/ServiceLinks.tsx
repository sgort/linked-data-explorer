import React from 'react';

import { ServiceLink } from '../../types';
import { serviceLinkName } from './serviceLinkName';

interface ServiceLinksProps {
  requires?: ServiceLink[];
  requiredBy?: ServiceLink[];
  className?: string;
  /** Classes for the "Requires:" / "Required by:" labels, to match the host card. */
  labelClassName?: string;
}

const LinkLine: React.FC<{ label: string; links: ServiceLink[]; labelClassName?: string }> = ({
  label,
  links,
  labelClassName,
}) => (
  <div>
    <span className={labelClassName}>{label}</span>{' '}
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
const ServiceLinks: React.FC<ServiceLinksProps> = ({
  requires,
  requiredBy,
  className,
  labelClassName,
}) => {
  const hasRequires = !!requires && requires.length > 0;
  const hasRequiredBy = !!requiredBy && requiredBy.length > 0;
  if (!hasRequires && !hasRequiredBy) return null;

  return (
    <div className={`text-xs text-slate-500 ${className ?? ''}`.trim()}>
      {hasRequires && (
        <LinkLine label="Requires:" links={requires} labelClassName={labelClassName} />
      )}
      {hasRequiredBy && (
        <LinkLine label="Required by:" links={requiredBy} labelClassName={labelClassName} />
      )}
    </div>
  );
};

export default ServiceLinks;
