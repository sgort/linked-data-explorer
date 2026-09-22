// packages/frontend/src/components/DsoExplorer/shared.tsx
//
// Small pieces shared between DsoExplorer.tsx and QualityProfileTab.tsx.
// Extracted into their own module (rather than exported from DsoExplorer.tsx)
// so QualityProfileTab.tsx can import them without a circular import between
// the shell and the tab it renders.

import React from 'react';

import { IdClass } from '../../services/dsoService';

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

// ── Naming-class design tokens (README "Design tokens") ─────────────────────
//
// Shared between QualityProfileTab (the Scorecard/Matrix naming bars) and the
// Activities tab's detail-panel teaser (DsoExplorer.tsx), so the class
// colours and the "share of good items" tone never drift between the two
// places that show the same figures.

/**
 * The share of "good" items, used for the teaser value colour and the
 * Matrix's cell backgrounds/value text. A DESIGN choice, not derived from the
 * data — kept in one named constant so it is easy to change or drop.
 */
export const TONE_THRESHOLDS = { green: 0.8, amber: 0.4 } as const;

export type Tone = 'green' | 'amber' | 'red' | 'none';

export function toneForRatio(ratio: number | null): Tone {
  // `ratio` is only ever a finite fraction or null (every caller guards the
  // division by a `total` truthiness check first), so there is no NaN case
  // to special-case here.
  if (ratio === null) return 'none';
  if (ratio >= TONE_THRESHOLDS.green) return 'green';
  if (ratio >= TONE_THRESHOLDS.amber) return 'amber';
  return 'red';
}

export const TONE_TEXT: Record<Tone, string> = {
  green: 'text-green-700',
  amber: 'text-amber-700',
  red: 'text-red-700',
  none: 'text-slate-400',
};

export const NAMING_META: Record<
  IdClass,
  { chip: string; bar: string; label: string; legend: string }
> = {
  semantic: {
    chip: 'bg-green-100 text-green-700 border-green-200',
    bar: 'bg-green-500',
    label: 'semantic',
    legend: 'semantic — readable as-is',
  },
  'opaque-resolvable': {
    chip: 'bg-amber-100 text-amber-700 border-amber-200',
    bar: 'bg-amber-400',
    label: 'opaque · resolvable',
    legend: 'opaque, resolvable — recovered via its question',
  },
  'opaque-dangling': {
    chip: 'bg-red-50 text-red-700 border-red-200',
    bar: 'bg-red-400',
    label: 'opaque · dangling',
    legend: 'opaque, dangling — nothing to recover from',
  },
};

export const NAMING_ORDER: IdClass[] = ['semantic', 'opaque-resolvable', 'opaque-dangling'];
