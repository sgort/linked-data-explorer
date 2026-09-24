// packages/frontend/src/components/DsoExplorer/shared.tsx
//
// Small components shared between DsoExplorer.tsx and QualityProfileTab.tsx.
// Extracted into their own module (rather than exported from DsoExplorer.tsx)
// so QualityProfileTab.tsx can import them without a circular import between
// the shell and the tab it renders. Shared constants and helpers live in
// tokens.ts: a .tsx module that exports anything besides components breaks
// React Fast Refresh.

import React from 'react';

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
