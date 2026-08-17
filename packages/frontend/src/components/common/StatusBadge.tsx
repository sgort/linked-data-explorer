import React from 'react';

export type ArtefactStatus = 'example' | 'wip' | 'dso' | 'e2e';

interface StatusBadgeProps {
  status: ArtefactStatus | undefined;
  /** Overrides the default label for the 'wip' status (DocumentList uses 'DRAFT'). */
  wipLabel?: string;
  /** 'sm' = text-[10px] (ProcessList/FormList), 'xs' = text-[9px] (DocumentList). */
  size?: 'sm' | 'xs';
}

const CONFIG: Record<ArtefactStatus, { label: string; className: string }> = {
  example: { label: 'EXAMPLE', className: 'bg-blue-100 text-blue-700' },
  wip: { label: 'WIP', className: 'bg-amber-100 text-amber-700' },
  dso: { label: 'DSO', className: 'bg-green-100 text-green-700' },
  e2e: { label: 'E2E', className: 'bg-indigo-100 text-indigo-700' },
};

/** Small pill badge for an artefact's status. Shared by ProcessList, FormList, DocumentList. */
const StatusBadge: React.FC<StatusBadgeProps> = ({ status, wipLabel, size = 'sm' }) => {
  if (!status) return null;
  const entry = CONFIG[status];
  if (!entry) return null;

  const label = status === 'wip' && wipLabel ? wipLabel : entry.label;
  const sizeClass = size === 'xs' ? 'text-[9px]' : 'text-[10px]';

  return (
    <span
      className={`${sizeClass} px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${entry.className}`}
    >
      {label}
    </span>
  );
};

export default StatusBadge;
