// packages/frontend/src/components/DsoExplorer/QualityProfileTab.tsx
//
// The Quality Profile tab: the quality profile of the activity selected in
// the Activities tab, together with the evidence behind every number. See
// design_handoff_dso_quality_profile/README.md §3 for the full spec and
// docs/dso-activity-dossier.md §8 for why the profile is never collapsed
// into one grade.

import { Download, Gauge, Loader2 } from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';

import { authoritiesByLevel, findAuthorityByOin, shortName } from '../../data/dsoAuthorities';
import {
  DecisionNamingItem,
  DsoDossier,
  DsoEnv,
  getActiviteitDossier,
  IdClass,
  InputNamingItem,
  RuleSet,
  RuleSetQuality,
} from '../../services/dsoService';
import { Section, TYPERING_META } from './shared';

// ── Design tokens local to this tab (README "Design tokens") ────────────────

/**
 * The share of "good" items, used for matrix cell backgrounds and value
 * text. A DESIGN choice, not derived from the data — kept in one named
 * constant per the task brief so it is easy to change or drop.
 */
const TONE_THRESHOLDS = { green: 0.8, amber: 0.4 } as const;

type Tone = 'green' | 'amber' | 'red' | 'none';

function toneForRatio(ratio: number | null): Tone {
  // `ratio` is only ever a finite fraction or null (every caller guards the
  // division by a `total` truthiness check first), so there is no NaN case
  // to special-case here.
  if (ratio === null) return 'none';
  if (ratio >= TONE_THRESHOLDS.green) return 'green';
  if (ratio >= TONE_THRESHOLDS.amber) return 'amber';
  return 'red';
}

const TONE_TEXT: Record<Tone, string> = {
  green: 'text-green-700',
  amber: 'text-amber-700',
  red: 'text-red-700',
  none: 'text-slate-400',
};

const TONE_BG: Record<Tone, string> = {
  green: 'bg-green-50',
  amber: 'bg-amber-50',
  red: 'bg-red-50',
  none: 'bg-white',
};

const TONE_BAR: Record<Tone, string> = {
  green: 'bg-green-500',
  amber: 'bg-amber-400',
  red: 'bg-red-400',
  none: 'bg-slate-200',
};

const NAMING_META: Record<IdClass, { chip: string; bar: string; label: string; legend: string }> = {
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

const NAMING_ORDER: IdClass[] = ['semantic', 'opaque-resolvable', 'opaque-dangling'];

type RuleSetKey = 'conclusie' | 'indieningsvereisten';
const RULE_SET_ORDER: RuleSetKey[] = ['conclusie', 'indieningsvereisten'];
const RULE_SET_LABEL: Record<RuleSetKey, string> = {
  conclusie: 'Conclusie',
  indieningsvereisten: 'Indieningsvereisten',
};

type DimKey = 'decisionNaming' | 'inputNaming' | 'labelCoverage' | 'refResolvability';
const DIMENSIONS: DimKey[] = ['decisionNaming', 'inputNaming', 'labelCoverage', 'refResolvability'];
const DIMENSION_LABEL: Record<DimKey, string> = {
  decisionNaming: 'Decision naming',
  inputNaming: 'Input naming',
  labelCoverage: 'Label coverage',
  refResolvability: 'Ref resolvability',
};

// ── Helpers ───────────────────────────────────────────────────────────────

/**
 * Mirrors scripts/dso-dossier.mjs#plainText: CDATA is unwrapped *before* the
 * generic tag strip, because `<![CDATA[…]]>` contains no `>` until its own
 * terminator — a naive `<[^>]+>` strip would eat the payload along with it.
 * Article text comes from the same STOP/IMOP pipeline as that script's input.
 */
function plainText(xml: string | null): string {
  if (!xml) return '';
  return xml
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<LiNummer>([\s\S]*?)<\/LiNummer>/g, '$1 ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Parses an article label from a juridische regel's wId, e.g. "Art. 15.2 lid 5". */
function articleLabel(wId: string | null): string | null {
  if (!wId) return null;
  const m = wId.match(/art_([\d.]+)(?:__para_(\d+))?/);
  if (!m) return null;
  return `Art. ${m[1]}${m[2] ? ` lid ${m[2]}` : ''}`;
}

/** The IMOW activity URN's local name, e.g. "HoutopstandVellen". */
function localName(urn: string): string {
  const m = urn.match(/\.activiteit\.(.+)$/);
  return m ? m[1] : urn;
}

/** Same URN, same local name, under a different authority's prefix. */
function buildCompareUrn(urn: string, code: string): string | null {
  const m = urn.match(/^(nl\.imow-)[a-z0-9]+(\.activiteit\..+)$/i);
  if (!m) return null;
  return `${m[1]}${code}${m[2]}`;
}

interface Metric {
  bold: string;
  rest: string;
  tone: Tone;
  ratio: number | null;
}

function decisionMetric(rsq: RuleSetQuality): Metric {
  const { total, semantic, opaque } = rsq.decisionNaming;
  const ratio = total ? semantic / total : null;
  const pct = total ? Math.round((opaque / total) * 100) : 0;
  return {
    bold: `${semantic}/${total} semantic`,
    rest: `${opaque} opaque (${pct}%)`,
    tone: toneForRatio(ratio),
    ratio,
  };
}

function inputMetric(rsq: RuleSetQuality): Metric {
  const { total, semantic, opaque } = rsq.inputNaming;
  const ratio = total ? semantic / total : null;
  const pct = total ? Math.round((opaque / total) * 100) : 0;
  return {
    bold: `${semantic}/${total} semantic`,
    rest: `${opaque} opaque (${pct}%)`,
    tone: toneForRatio(ratio),
    ratio,
  };
}

function labelMetric(rsq: RuleSetQuality): Metric {
  const { inputs, withQuestion } = rsq.labelCoverage;
  const ratio = inputs ? withQuestion / inputs : null;
  return {
    bold: `${withQuestion}/${inputs}`,
    rest: 'carry a question',
    tone: toneForRatio(ratio),
    ratio,
  };
}

function refMetric(rsq: RuleSetQuality): Metric {
  const { total, resolved, dangling } = rsq.refResolvability;
  if (total === 0) {
    return { bold: 'none', rest: 'no references', tone: 'none', ratio: null };
  }
  const ratio = resolved / total;
  return {
    bold: `${resolved} resolved`,
    rest: `${dangling} dangling`,
    tone: toneForRatio(ratio),
    ratio,
  };
}

function metricFor(dim: DimKey, rsq: RuleSetQuality): Metric {
  switch (dim) {
    case 'decisionNaming':
      return decisionMetric(rsq);
    case 'inputNaming':
      return inputMetric(rsq);
    case 'labelCoverage':
      return labelMetric(rsq);
    case 'refResolvability':
      return refMetric(rsq);
  }
}

// ── Small presentational pieces ──────────────────────────────────────────────

const NamingChip: React.FC<{ cls: IdClass }> = ({ cls }) => (
  <span
    className={`inline-block px-1.5 py-0.5 text-[10px] font-medium rounded border ${NAMING_META[cls].chip}`}
  >
    {NAMING_META[cls].label}
  </span>
);

const NamingBar: React.FC<{ items: { class: IdClass }[] }> = ({ items }) => {
  const total = items.length;
  return (
    <div className="h-2 rounded-full bg-slate-100 overflow-hidden flex">
      {total > 0 &&
        NAMING_ORDER.map((cls) => {
          const count = items.filter((i) => i.class === cls).length;
          if (count === 0) return null;
          return (
            <div
              key={cls}
              className={NAMING_META[cls].bar}
              style={{ width: `${(count / total) * 100}%` }}
            />
          );
        })}
    </div>
  );
};

const SingleBar: React.FC<{ ratio: number | null; color: string }> = ({ ratio, color }) => (
  <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
    {ratio !== null && <div className={`h-full ${color}`} style={{ width: `${ratio * 100}%` }} />}
  </div>
);

const MetricRow: React.FC<{ label: string; metric: Metric; bar: React.ReactNode }> = ({
  label,
  metric,
  bar,
}) => (
  <div className="grid grid-cols-[130px_1fr_150px] gap-3 items-center">
    <span className="text-xs text-slate-500">{label}</span>
    {bar}
    <span className="text-xs">
      <span className={`font-semibold ${TONE_TEXT[metric.tone]}`}>{metric.bold}</span>{' '}
      <span className="text-slate-400">{metric.rest}</span>
    </span>
  </div>
);

function barFor(dim: DimKey, rsq: RuleSetQuality): React.ReactNode {
  switch (dim) {
    case 'decisionNaming':
      return <NamingBar items={rsq.decisionNaming.items} />;
    case 'inputNaming':
      return <NamingBar items={rsq.inputNaming.items} />;
    case 'labelCoverage':
      return <SingleBar ratio={labelMetric(rsq).ratio} color="bg-blue-500" />;
    case 'refResolvability':
      return <SingleBar ratio={refMetric(rsq).ratio} color="bg-green-500" />;
  }
}

const DecisionsTable: React.FC<{ items: DecisionNamingItem[]; issuesOnly: boolean }> = ({
  items,
  issuesOnly,
}) => {
  const rows = issuesOnly ? items.filter((i) => i.class !== 'semantic') : items;
  if (issuesOnly && rows.length === 0) {
    return <p className="text-xs text-slate-400 italic">No issues — every decision is semantic.</p>;
  }
  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      <div className="grid grid-cols-[1fr_140px] bg-slate-50 border-b border-slate-200">
        <span className="px-2.5 py-1.5 text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
          Decision
        </span>
        <span className="px-2.5 py-1.5 text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
          Naming
        </span>
      </div>
      {rows.map((item, i) => (
        <div
          key={`${item.name}-${i}`}
          className="grid grid-cols-[1fr_140px] px-2.5 py-1.5 border-b border-slate-100 last:border-b-0 items-center"
        >
          {item.class === 'semantic' ? (
            <span className="text-xs text-slate-800">{item.name}</span>
          ) : (
            <span className="font-mono text-[11px] text-slate-500 break-all">{item.name}</span>
          )}
          <NamingChip cls={item.class} />
        </div>
      ))}
    </div>
  );
};

const InputsTable: React.FC<{ items: InputNamingItem[]; issuesOnly: boolean }> = ({
  items,
  issuesOnly,
}) => {
  const rows = issuesOnly ? items.filter((i) => !(i.class === 'semantic' && i.question)) : items;
  if (issuesOnly && rows.length === 0) {
    return (
      <p className="text-xs text-slate-400 italic">
        No issues — every input is semantic and carries a question.
      </p>
    );
  }
  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      <div className="grid grid-cols-[1fr_140px_1.3fr] bg-slate-50 border-b border-slate-200">
        <span className="px-2.5 py-1.5 text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
          Input
        </span>
        <span className="px-2.5 py-1.5 text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
          Naming
        </span>
        <span className="px-2.5 py-1.5 text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
          Question
        </span>
      </div>
      {rows.map((item, i) => (
        <div
          key={`${item.name}-${i}`}
          className="grid grid-cols-[1fr_140px_1.3fr] px-2.5 py-1.5 border-b border-slate-100 last:border-b-0 items-center"
        >
          {item.class === 'semantic' ? (
            <span className="text-xs text-slate-800">{item.name}</span>
          ) : (
            <span className="font-mono text-[11px] text-slate-500 break-all">{item.name}</span>
          )}
          <NamingChip cls={item.class} />
          {item.question ? (
            <span className="text-xs text-slate-600">{item.question}</span>
          ) : (
            <span className="text-xs italic text-red-700">no question</span>
          )}
        </div>
      ))}
    </div>
  );
};

// ── Activity summary card (README §3b) ──────────────────────────────────────

const ActivitySummaryCard: React.FC<{ dossier: DsoDossier; authorityPrefix?: string }> = ({
  dossier,
  authorityPrefix,
}) => {
  const legalTitle = `${authorityPrefix ? `${authorityPrefix} — ` : ''}${
    dossier.legalSource.regelingTitel ?? '—'
  }`;
  const { withArticleText, rules } = dossier.qualityProfile.legalTraceability;
  const ratio = rules ? withArticleText / rules : null;
  return (
    <div
      className="bg-white border border-slate-200 rounded-lg px-4 py-3 grid gap-4"
      style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))' }}
    >
      <Section title="Legal source">
        <p className="text-xs text-slate-600">{legalTitle}</p>
      </Section>
      <Section title="Activity identity">
        <div className="flex items-center gap-2">
          <NamingChip cls={dossier.qualityProfile.activityIdentity} />
          <span className="font-mono text-[10px] text-slate-400">{localName(dossier.urn)}</span>
        </div>
      </Section>
      <Section title="Legal traceability">
        <div className="h-2 rounded-full bg-slate-100 overflow-hidden mb-1">
          {ratio !== null && (
            <div className="h-full bg-green-500" style={{ width: `${ratio * 100}%` }} />
          )}
        </div>
        <p className="text-xs font-medium text-green-700">
          {withArticleText}/{rules} rules traced to article text
        </p>
      </Section>
    </div>
  );
};

// ── Failures box (README §3g) ────────────────────────────────────────────────

const FailuresBox: React.FC<{ failures: { step: string; detail: string }[] }> = ({ failures }) => (
  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700">
    <p className="font-semibold mb-1">Incomplete legs</p>
    <ul className="space-y-0.5">
      {failures.map((f, i) => (
        <li key={i}>
          {f.step}: {f.detail}
        </li>
      ))}
    </ul>
  </div>
);

// ── Scorecard layout (README §3c) ────────────────────────────────────────────

const ScorecardCard: React.FC<{
  ruleSetKey: RuleSetKey;
  quality: RuleSetQuality | null;
  ruleMeta: RuleSet | null;
  issuesOnly: boolean;
  openDecisions: boolean;
  openInputs: boolean;
  onToggleDecisions: () => void;
  onToggleInputs: () => void;
}> = ({
  ruleSetKey,
  quality,
  ruleMeta,
  issuesOnly,
  openDecisions,
  openInputs,
  onToggleDecisions,
  onToggleInputs,
}) => {
  const meta = TYPERING_META[ruleSetKey];
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-col gap-3.5">
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded border ${meta.color}`}>
          {meta.label}
        </span>
        <span className="text-xs font-medium text-slate-600">{RULE_SET_LABEL[ruleSetKey]}</span>
        {quality && (
          <span className="text-xs text-slate-400">
            · {quality.decisionNaming.total} decisions, {quality.inputNaming.total} inputs
          </span>
        )}
        {ruleMeta && (
          <span className="ml-auto font-mono text-[10px] text-slate-400">
            id: {ruleMeta.identifier} · STTR v{ruleMeta.sttrVersie ?? '—'} ·{' '}
            {ruleMeta.begindatum ?? '—'}
          </span>
        )}
      </div>

      {!quality ? (
        <p className="text-xs text-slate-400 italic">Not present for this activity.</p>
      ) : (
        <>
          <div className="flex flex-col gap-2.5">
            {DIMENSIONS.map((dim) => (
              <MetricRow
                key={dim}
                label={DIMENSION_LABEL[dim]}
                metric={metricFor(dim, quality)}
                bar={barFor(dim, quality)}
              />
            ))}
          </div>

          <div className="border-t border-slate-100 pt-2.5 flex gap-4">
            <button onClick={onToggleDecisions} className="text-xs text-blue-600 hover:underline">
              {openDecisions
                ? 'Hide decisions'
                : `Show decisions (${quality.decisionNaming.total})`}
            </button>
            <button onClick={onToggleInputs} className="text-xs text-blue-600 hover:underline">
              {openInputs ? 'Hide inputs' : `Show inputs (${quality.inputNaming.total})`}
            </button>
          </div>

          {openDecisions && (
            <DecisionsTable items={quality.decisionNaming.items} issuesOnly={issuesOnly} />
          )}
          {openInputs && <InputsTable items={quality.inputNaming.items} issuesOnly={issuesOnly} />}
        </>
      )}
    </div>
  );
};

// ── Matrix layout (README §3d) — always used for Compare ────────────────────

interface MatrixColumn {
  key: string;
  authorityLabel?: string;
  ruleSetKey: RuleSetKey;
  quality: RuleSetQuality | null;
  ruleMeta: RuleSet | null;
}

interface MatrixSelection {
  colKey: string;
  dim: DimKey;
}

const DrillDown: React.FC<{ column: MatrixColumn; dim: DimKey; issuesOnly: boolean }> = ({
  column,
  dim,
  issuesOnly,
}) => {
  const title = `${column.authorityLabel ? `${column.authorityLabel} · ` : ''}${
    RULE_SET_LABEL[column.ruleSetKey]
  } · ${DIMENSION_LABEL[dim]}`;
  const q = column.quality;
  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <div className="bg-slate-50 border-b border-slate-200 px-3 py-2 text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
        {title} <span className="normal-case font-normal">— click any cell above to drill in</span>
      </div>
      <div className="p-3">
        {!q ? (
          <p className="text-xs text-slate-400 italic">Not present for this activity.</p>
        ) : dim === 'decisionNaming' ? (
          <DecisionsTable items={q.decisionNaming.items} issuesOnly={issuesOnly} />
        ) : dim === 'inputNaming' ? (
          <InputsTable items={q.inputNaming.items} issuesOnly={issuesOnly} />
        ) : dim === 'labelCoverage' ? (
          <InputsTable
            items={
              issuesOnly ? q.inputNaming.items.filter((i) => !i.question) : q.inputNaming.items
            }
            issuesOnly={false}
          />
        ) : q.refResolvability.total === 0 ? (
          <p className="text-xs text-slate-500">This rule set carries no cross-references.</p>
        ) : (
          <p className="text-xs text-slate-500">
            {q.refResolvability.resolved} reference{q.refResolvability.resolved === 1 ? '' : 's'}{' '}
            resolved, {q.refResolvability.dangling} dangling.
          </p>
        )}
      </div>
    </div>
  );
};

const MatrixLayout: React.FC<{
  columns: MatrixColumn[];
  issuesOnly: boolean;
  matrixSel: MatrixSelection | null;
  onSelect: (colKey: string, dim: DimKey) => void;
}> = ({ columns, issuesOnly, matrixSel, onSelect }) => {
  const selectedColumn = matrixSel ? columns.find((c) => c.key === matrixSel.colKey) : undefined;

  return (
    <div className="space-y-3">
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div
          className="grid"
          style={{ gridTemplateColumns: `160px repeat(${columns.length}, minmax(0,1fr))` }}
        >
          <div className="bg-slate-50 px-3 py-2 text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
            Dimension
          </div>
          {columns.map((col) => {
            const meta = TYPERING_META[col.ruleSetKey];
            return (
              <div key={col.key} className="bg-slate-50 px-3 py-2 border-l border-slate-200">
                {col.authorityLabel && (
                  <p className="text-xs font-semibold text-slate-700">{col.authorityLabel}</p>
                )}
                <span
                  className={`inline-block mt-0.5 px-1.5 py-0.5 text-[10px] font-medium rounded border ${meta.color}`}
                >
                  {meta.label}
                </span>
                <p className="mt-0.5 font-mono text-[10px] text-slate-400">
                  {col.ruleMeta
                    ? `id: ${col.ruleMeta.identifier} · v${col.ruleMeta.sttrVersie ?? '—'}`
                    : '—'}
                </p>
              </div>
            );
          })}

          {DIMENSIONS.map((dim) => (
            <React.Fragment key={dim}>
              <div className="px-3 py-2.5 text-xs text-slate-500 border-t border-slate-200 flex items-center">
                {DIMENSION_LABEL[dim]}
              </div>
              {columns.map((col) => {
                const metric = col.quality ? metricFor(dim, col.quality) : null;
                const selected = matrixSel?.colKey === col.key && matrixSel.dim === dim;
                return (
                  <button
                    key={`${col.key}-${dim}`}
                    onClick={() => onSelect(col.key, dim)}
                    disabled={!metric}
                    className={`text-left border-l border-t border-slate-200 px-3 py-2.5 transition-colors hover:brightness-95 ${
                      metric ? TONE_BG[metric.tone] : 'bg-white'
                    }`}
                    style={selected ? { boxShadow: 'inset 0 0 0 2px #60a5fa' } : undefined}
                  >
                    {metric ? (
                      <>
                        <p className="text-xs">
                          <span className={`font-semibold ${TONE_TEXT[metric.tone]}`}>
                            {metric.bold}
                          </span>{' '}
                          <span className="text-slate-400">{metric.rest}</span>
                        </p>
                        <div className="mt-1 h-1.5 rounded-full bg-slate-200 overflow-hidden">
                          {metric.ratio !== null && (
                            <div
                              className={`h-full ${TONE_BAR[metric.tone]}`}
                              style={{ width: `${metric.ratio * 100}%` }}
                            />
                          )}
                        </div>
                      </>
                    ) : (
                      <p className="text-xs text-slate-400 italic">Not present</p>
                    )}
                  </button>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>

      {selectedColumn && matrixSel && (
        <DrillDown column={selectedColumn} dim={matrixSel.dim} issuesOnly={issuesOnly} />
      )}
    </div>
  );
};

// ── Legal source card (README §3e) ───────────────────────────────────────────

const LegalSourceCard: React.FC<{
  dossier: DsoDossier;
  showAllRules: boolean;
  onToggleShowAll: () => void;
}> = ({ dossier, showAllRules, onToggleShowAll }) => {
  const rules = dossier.legalSource.juridischeRegels;
  const visible = showAllRules ? rules : rules.slice(0, 3);
  return (
    <div className="bg-white border border-slate-200 rounded-lg px-4 py-3 space-y-2.5">
      <Section title={`Legal source (${rules.length})`}>
        <p className="text-xs text-slate-600">
          {dossier.legalSource.regelingTitel ?? '—'}
          {dossier.annotation.groep && (
            <span className="text-[10px] text-slate-400"> · Groep: {dossier.annotation.groep}</span>
          )}
        </p>
      </Section>
      {visible.map((r, i) => {
        const label = articleLabel(r.wId);
        const isVergunningplicht = r.kwalificatie === 'vergunningplicht';
        return (
          <div
            key={r.identificatie ?? i}
            className="grid grid-cols-[120px_1fr] gap-3 border-t border-slate-100 pt-2.5"
          >
            <div>
              <p className="text-xs font-semibold text-slate-800">{label ?? '—'}</p>
              {r.kwalificatie && (
                <span
                  className={`inline-block mt-1 px-1.5 py-0.5 text-[10px] font-medium rounded border ${
                    isVergunningplicht
                      ? 'bg-blue-100 text-blue-700 border-blue-200'
                      : 'bg-slate-100 text-slate-600 border-slate-200'
                  }`}
                >
                  {r.kwalificatie}
                </span>
              )}
            </div>
            <div>
              <p className="text-xs leading-[18px] text-slate-600">{plainText(r.articleText)}</p>
              {r.locaties.length > 0 && (
                <p className="text-[10px] text-slate-400 mt-1">
                  Werkingsgebied:{' '}
                  {r.locaties
                    .map((l) => l.naam)
                    .filter(Boolean)
                    .join(', ')}
                </p>
              )}
              {r.wId && (
                <p className="font-mono text-[10px] text-slate-300 truncate mt-0.5" title={r.wId}>
                  {r.wId}
                </p>
              )}
            </div>
          </div>
        );
      })}
      {rules.length > 3 && (
        <button onClick={onToggleShowAll} className="text-xs text-blue-600 hover:underline">
          {showAllRules ? 'Show fewer' : `Show all ${rules.length} rules`}
        </button>
      )}
    </div>
  );
};

// ── Context toolbar (README §3a) ─────────────────────────────────────────────

const ContextToolbar: React.FC<{
  dossier: DsoDossier;
  compareCode: string;
  onCompareCodeChange: (code: string) => void;
  compareOptions: { code: string; label: string }[];
  issuesOnly: boolean;
  onIssuesOnlyChange: (v: boolean) => void;
}> = ({
  dossier,
  compareCode,
  onCompareCodeChange,
  compareOptions,
  issuesOnly,
  onIssuesOnlyChange,
}) => {
  const authority = dossier.bestuursorgaan?.oin
    ? findAuthorityByOin(dossier.bestuursorgaan.oin)
    : undefined;
  const authorityPill = authority
    ? `${shortName(authority)} · ${authority.code}`
    : dossier.bestuursorgaan?.code;

  return (
    <div className="border-b border-slate-200 bg-white shrink-0">
      <div className="p-3 flex gap-3 items-start border-b border-slate-100">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-slate-800">
              {dossier.omschrijving ?? dossier.urn}
            </span>
            {authorityPill && (
              <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-slate-100 text-slate-600 border border-slate-200">
                {authorityPill}
              </span>
            )}
          </div>
          <p className="text-[10px] text-slate-400 font-mono break-all mt-0.5">{dossier.urn}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <label htmlFor="dso-quality-compare" className="text-xs text-slate-400">
            Compare with
          </label>
          <select
            id="dso-quality-compare"
            value={compareCode}
            onChange={(e) => onCompareCodeChange(e.target.value)}
            className="px-2.5 py-1 text-xs rounded-md border border-slate-300 bg-white text-slate-600 focus:ring-2 focus:ring-blue-500 focus:outline-none"
          >
            <option value="">—</option>
            {compareOptions.map((o) => (
              <option key={o.code} value={o.code}>
                {o.label}
              </option>
            ))}
          </select>
          <button
            onClick={() => {
              // TODO: wire to renderDossier() Markdown export — the next task.
            }}
            className="px-2 py-1 text-[10px] bg-white border border-slate-200 text-slate-600 rounded hover:bg-slate-50 transition-colors inline-flex items-center gap-1"
          >
            <Download size={11} /> Dossier .md
          </button>
        </div>
      </div>
      <div className="px-3 py-2 flex flex-wrap gap-4 items-center text-[10px] text-slate-500">
        <span className="italic text-slate-400">
          Two axes: how much is readable as it stands, and how much the dossier had to recover.
        </span>
        {NAMING_ORDER.map((cls) => (
          <span key={cls} className="flex items-center gap-1">
            <span className={`inline-block w-2 h-2 rounded-[2px] ${NAMING_META[cls].bar}`} />
            {NAMING_META[cls].legend}
          </span>
        ))}
        <label className="ml-auto flex items-center gap-1.5 text-xs text-slate-600">
          <input
            type="checkbox"
            checked={issuesOnly}
            onChange={(e) => onIssuesOnlyChange(e.target.checked)}
          />
          Issues only
        </label>
      </div>
    </div>
  );
};

// ── Footer (README §3f) ──────────────────────────────────────────────────────

const Footer: React.FC<{ dossier: DsoDossier }> = ({ dossier }) => (
  <div className="p-3 border-t border-slate-200 bg-white flex justify-between shrink-0">
    <p className="text-xs text-slate-500">
      Dossier retrieved {dossier.provenance.fetchedAt} · {dossier.provenance.env} · valid on{' '}
      {dossier.provenance.datum ?? 'today'}
    </p>
    <p className="text-[10px] text-slate-400 italic">
      Environment and date are part of the result — rule ids do not carry across.
    </p>
  </div>
);

// ── Main component ───────────────────────────────────────────────────────────

export interface QualityProfileTabProps {
  selectedUrn: string | null;
  selectedDatum?: string;
  authorityOin: string;
  env: DsoEnv;
  onGoToActivities: () => void;
}

const QualityProfileTab: React.FC<QualityProfileTabProps> = ({
  selectedUrn,
  selectedDatum,
  authorityOin,
  env,
  onGoToActivities,
}) => {
  const [dossier, setDossier] = useState<DsoDossier | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [compareCode, setCompareCode] = useState('');
  const [compareDossier, setCompareDossier] = useState<DsoDossier | null>(null);
  const [compareError, setCompareError] = useState<string | null>(null);

  const [issuesOnly, setIssuesOnly] = useState(false);
  const [openTables, setOpenTables] = useState<Record<string, boolean>>({});
  const [matrixSel, setMatrixSel] = useState<MatrixSelection | null>(null);
  const [showAllRules, setShowAllRules] = useState(false);

  // The dossier route's `authority` query param is a bevoegd-gezag CODE
  // (e.g. "gm0995" — see dossier.service.ts's `gezagCode` /
  // zoekRegelingen({ bevoegdGezag: [...] })), never an OIN. `authorityOin`
  // is the Activities tab's Authority <select> value, which is keyed by OIN
  // throughout ActiviteitenTab — so it has to be resolved through the
  // authorities register before it can be passed on. `undefined` (never the
  // raw OIN) when there is no selection or no match.
  const authorityCode = authorityOin ? findAuthorityByOin(authorityOin)?.code : undefined;

  // Fetch the primary dossier whenever the selected activity (or the
  // context it is read in) changes. Reset every piece of local UI state
  // that was scoped to the previous activity.
  useEffect(() => {
    if (!selectedUrn) {
      setDossier(null);
      setError(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setDossier(null);
    setCompareCode('');
    setCompareDossier(null);
    setCompareError(null);
    setMatrixSel(null);
    setOpenTables({});
    setShowAllRules(false);

    getActiviteitDossier(selectedUrn, env, selectedDatum, authorityCode)
      .then((d) => {
        if (!cancelled) setDossier(d);
      })
      .catch((e) => {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : 'Failed to load';
        if (msg.includes('404')) {
          setError(
            `This activity is not available in the ${env === 'prod' ? 'production' : 'pre-production'} DSO environment.`
          );
        } else if (msg.includes('400') && !authorityCode) {
          setError(
            'This national activity needs an authority — choose one in the Activities tab’s Authority select.'
          );
        } else {
          setError(msg);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedUrn, env, selectedDatum, authorityCode]);

  // Compare fetch — same env and datum, the same local name under the
  // compared authority's prefix.
  useEffect(() => {
    if (!compareCode || !dossier) {
      setCompareDossier(null);
      setCompareError(null);
      return;
    }
    const compareUrn = buildCompareUrn(dossier.urn, compareCode);
    if (!compareUrn) return;
    let cancelled = false;
    setCompareError(null);
    getActiviteitDossier(compareUrn, env, selectedDatum, authorityCode)
      .then((d) => {
        if (!cancelled) setCompareDossier(d);
      })
      .catch((e) => {
        if (!cancelled) setCompareError(e instanceof Error ? e.message : 'Failed to load');
      });
    return () => {
      cancelled = true;
    };
  }, [compareCode, dossier, env, selectedDatum, authorityCode]);

  const currentAuthority = useMemo(
    () =>
      dossier?.bestuursorgaan?.oin ? findAuthorityByOin(dossier.bestuursorgaan.oin) : undefined,
    [dossier?.bestuursorgaan?.oin]
  );

  const compareOptions = useMemo(() => {
    const level = currentAuthority?.level ?? 'gemeente';
    return authoritiesByLevel(level)
      .filter((a) => a.code !== dossier?.bestuursorgaan?.code)
      .map((a) => ({ code: a.code, label: shortName(a) }));
  }, [currentAuthority, dossier?.bestuursorgaan?.code]);

  const compareAuthority = useMemo(
    () =>
      compareDossier?.bestuursorgaan?.oin
        ? findAuthorityByOin(compareDossier.bestuursorgaan.oin)
        : undefined,
    [compareDossier?.bestuursorgaan?.oin]
  );

  const toggleTable = (key: string) => setOpenTables((prev) => ({ ...prev, [key]: !prev[key] }));

  // ── Empty / loading / error states (README §3g) ───────────────────────────

  if (!selectedUrn) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-2 text-center p-6">
        <Gauge size={28} className="text-slate-300" />
        <p className="text-sm font-medium text-slate-600">No activity selected</p>
        <p className="text-xs text-slate-400 max-w-[420px]">
          Select an activity in the Activities tab — its quality profile opens here.
        </p>
        <button
          onClick={onGoToActivities}
          className="bg-slate-700 text-white text-xs rounded-lg px-3 py-1.5 hover:bg-slate-800 transition-colors"
        >
          Go to Activities
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-2 text-center p-6">
        <Loader2 size={20} className="animate-spin text-slate-400" />
        <p className="text-sm text-slate-500">Loading…</p>
        <p className="text-xs text-slate-400 max-w-[420px]">
          Building dossier — legal source, annotation and rule sets…
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-2 text-center p-6">
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 max-w-[480px]">
          {error}
        </div>
      </div>
    );
  }

  if (!dossier) return null;

  const primaryAuthorityLabel = currentAuthority ? shortName(currentAuthority) : undefined;
  const compareAuthorityLabel = compareAuthority ? shortName(compareAuthority) : undefined;

  const columns: MatrixColumn[] = compareDossier
    ? [
        {
          key: 'primary-conclusie',
          authorityLabel: primaryAuthorityLabel,
          ruleSetKey: 'conclusie',
          quality: dossier.qualityProfile.ruleSets.conclusie,
          ruleMeta: dossier.decisionCriteria,
        },
        {
          key: 'primary-indieningsvereisten',
          authorityLabel: primaryAuthorityLabel,
          ruleSetKey: 'indieningsvereisten',
          quality: dossier.qualityProfile.ruleSets.indieningsvereisten,
          ruleMeta: dossier.submissionRequirements,
        },
        {
          key: 'compare-conclusie',
          authorityLabel: compareAuthorityLabel,
          ruleSetKey: 'conclusie',
          quality: compareDossier.qualityProfile.ruleSets.conclusie,
          ruleMeta: compareDossier.decisionCriteria,
        },
        {
          key: 'compare-indieningsvereisten',
          authorityLabel: compareAuthorityLabel,
          ruleSetKey: 'indieningsvereisten',
          quality: compareDossier.qualityProfile.ruleSets.indieningsvereisten,
          ruleMeta: compareDossier.submissionRequirements,
        },
      ]
    : [];

  return (
    <div className="flex flex-col h-full">
      <ContextToolbar
        dossier={dossier}
        compareCode={compareCode}
        onCompareCodeChange={setCompareCode}
        compareOptions={compareOptions}
        issuesOnly={issuesOnly}
        onIssuesOnlyChange={setIssuesOnly}
      />

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        <div
          className="shrink-0 grid gap-3"
          style={{ gridTemplateColumns: compareDossier ? 'repeat(2,minmax(0,1fr))' : '1fr' }}
        >
          <ActivitySummaryCard
            dossier={dossier}
            authorityPrefix={compareDossier ? primaryAuthorityLabel : undefined}
          />
          {compareDossier && (
            <ActivitySummaryCard dossier={compareDossier} authorityPrefix={compareAuthorityLabel} />
          )}
        </div>

        {compareError && (
          <div className="shrink-0 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
            Compare failed to load: {compareError}
          </div>
        )}

        {dossier.provenance.failures.length > 0 && (
          <div className="shrink-0">
            <FailuresBox failures={dossier.provenance.failures} />
          </div>
        )}
        {compareDossier && compareDossier.provenance.failures.length > 0 && (
          <div className="shrink-0">
            <FailuresBox failures={compareDossier.provenance.failures} />
          </div>
        )}

        <div className="shrink-0">
          {compareDossier ? (
            <MatrixLayout
              columns={columns}
              issuesOnly={issuesOnly}
              matrixSel={matrixSel}
              onSelect={(colKey, dim) =>
                setMatrixSel((prev) =>
                  prev?.colKey === colKey && prev.dim === dim ? null : { colKey, dim }
                )
              }
            />
          ) : (
            <div
              className="grid gap-3 items-start"
              style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(420px,1fr))' }}
            >
              {RULE_SET_ORDER.map((key) => (
                <ScorecardCard
                  key={key}
                  ruleSetKey={key}
                  quality={dossier.qualityProfile.ruleSets[key]}
                  ruleMeta={
                    key === 'conclusie' ? dossier.decisionCriteria : dossier.submissionRequirements
                  }
                  issuesOnly={issuesOnly}
                  openDecisions={!!openTables[`${key}-decisions`]}
                  openInputs={!!openTables[`${key}-inputs`]}
                  onToggleDecisions={() => toggleTable(`${key}-decisions`)}
                  onToggleInputs={() => toggleTable(`${key}-inputs`)}
                />
              ))}
            </div>
          )}
        </div>

        <div className="shrink-0">
          <LegalSourceCard
            dossier={dossier}
            showAllRules={showAllRules}
            onToggleShowAll={() => setShowAllRules((v) => !v)}
          />
        </div>
      </div>

      <Footer dossier={dossier} />
    </div>
  );
};

export default QualityProfileTab;
