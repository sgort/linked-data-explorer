// packages/frontend/src/components/DsoExplorer/shared.tsx
//
// Small pieces shared between DsoExplorer.tsx and QualityProfileTab.tsx.
// Extracted into their own module (rather than exported from DsoExplorer.tsx)
// so QualityProfileTab.tsx can import them without a circular import between
// the shell and the tab it renders.

import React from 'react';

export const TYPERING_META: Record<string, { label: string; color: string }> = {
  indieningsvereisten: {
    label: 'Submission requirements',
    color: 'bg-blue-100 text-blue-700 border-blue-200',
  },
  Indieningsvereisten: {
    label: 'Submission requirements',
    color: 'bg-blue-100 text-blue-700 border-blue-200',
  },
  conclusie: {
    label: 'Decision criteria',
    color: 'bg-purple-100 text-purple-700 border-purple-200',
  },
  Conclusie: {
    label: 'Decision criteria',
    color: 'bg-purple-100 text-purple-700 border-purple-200',
  },
  maatregelen: { label: 'Measures', color: 'bg-amber-100 text-amber-700 border-amber-200' },
  Maatregelen: { label: 'Measures', color: 'bg-amber-100 text-amber-700 border-amber-200' },
};

export const Section: React.FC<{ title: string; children: React.ReactNode }> = ({
  title,
  children,
}) => (
  <div>
    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
      {title}
    </p>
    {children}
  </div>
);
