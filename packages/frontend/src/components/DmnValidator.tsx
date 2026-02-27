/**
 * packages/frontend/src/components/DmnValidator.tsx
 *
 * Multi-file DMN Validator — drop any number of .dmn / .xml files,
 * validate them all against the RONL DMN+ layers, compare side-by-side.
 *
 * Calls: POST /v1/dmns/validate
 */

import {
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  FileText,
  Info,
  Plus,
  ShieldCheck,
  X,
} from 'lucide-react';
import React, { useRef, useState } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ValidationIssue {
  severity: 'error' | 'warning' | 'info';
  code: string;
  message: string;
  location?: string;
  line?: number;
  column?: number;
}

interface LayerResult {
  label: string;
  issues: ValidationIssue[];
}

interface ValidationResult {
  valid: boolean;
  parseError: string | null;
  layers: {
    base: LayerResult;
    business: LayerResult;
    execution: LayerResult;
    interaction: LayerResult;
    content: LayerResult;
  };
  summary: { errors: number; warnings: number; infos: number };
}

interface DmnEntry {
  id: string;
  name: string;
  size: number;
  content: string;
  isValidating: boolean;
  result: ValidationResult | null;
  error: string | null;
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function SeverityIcon({ severity, size = 13 }: { severity: string; size?: number }) {
  if (severity === 'error')
    return <AlertCircle size={size} className="text-red-500 flex-shrink-0 mt-0.5" />;
  if (severity === 'warning')
    return <AlertTriangle size={size} className="text-yellow-500 flex-shrink-0 mt-0.5" />;
  return <Info size={size} className="text-blue-400 flex-shrink-0 mt-0.5" />;
}

function IssueRow({ issue }: { issue: ValidationIssue }) {
  const bg =
    issue.severity === 'error'
      ? 'bg-red-50 border-red-100'
      : issue.severity === 'warning'
        ? 'bg-yellow-50 border-yellow-100'
        : 'bg-blue-50 border-blue-100';

  return (
    <div className={`flex items-start gap-2 px-2.5 py-2 rounded border text-xs ${bg}`}>
      <SeverityIcon severity={issue.severity} />
      <div className="flex-1 min-w-0">
        <span className="font-mono text-slate-400 mr-1">{issue.code}</span>
        <span className="text-slate-700">{issue.message}</span>
        {issue.location && (
          <span className="block mt-0.5 font-mono text-slate-400 truncate">{issue.location}</span>
        )}
        {issue.line && (
          <span className="block mt-0.5 text-slate-400">
            Line {issue.line}
            {issue.column ? `, col ${issue.column}` : ''}
          </span>
        )}
      </div>
    </div>
  );
}

function LayerSection({ layer }: { layer: LayerResult }) {
  const [open, setOpen] = useState(false);

  const errorCount = layer.issues.filter((i) => i.severity === 'error').length;
  const warningCount = layer.issues.filter((i) => i.severity === 'warning').length;
  const infoCount = layer.issues.filter((i) => i.severity === 'info').length;
  const allClear = layer.issues.length === 0;

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
      >
        <div className="flex items-center gap-1.5 min-w-0">
          {allClear ? (
            <CheckCircle size={13} className="text-green-500 flex-shrink-0" />
          ) : (
            <SeverityIcon
              severity={errorCount > 0 ? 'error' : warningCount > 0 ? 'warning' : 'info'}
            />
          )}
          <span className="text-xs font-medium text-slate-700 truncate">{layer.label}</span>
        </div>
        <div className="flex items-center gap-1 ml-2 flex-shrink-0">
          {allClear && <span className="text-[10px] text-green-600 font-medium">OK</span>}
          {errorCount > 0 && (
            <span className="px-1 py-0.5 rounded-full bg-red-100 text-red-700 text-[10px] font-medium">
              {errorCount}E
            </span>
          )}
          {warningCount > 0 && (
            <span className="px-1 py-0.5 rounded-full bg-yellow-100 text-yellow-700 text-[10px] font-medium">
              {warningCount}W
            </span>
          )}
          {infoCount > 0 && (
            <span className="px-1 py-0.5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-medium">
              {infoCount}I
            </span>
          )}
          {open ? (
            <ChevronUp size={12} className="text-slate-400 ml-0.5" />
          ) : (
            <ChevronDown size={12} className="text-slate-400 ml-0.5" />
          )}
        </div>
      </button>

      {open && (
        <div className="px-2.5 py-2 space-y-1.5 bg-white">
          {layer.issues.length === 0 ? (
            <p className="text-xs text-slate-400 italic">No issues found.</p>
          ) : (
            layer.issues.map((issue, idx) => (
              <IssueRow key={`${issue.code}-${idx}`} issue={issue} />
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ── Entry card ────────────────────────────────────────────────────────────────

interface EntryCardProps {
  entry: DmnEntry;
  onRemove: (id: string) => void;
  onValidate: (id: string) => void;
}

function EntryCard({ entry, onRemove, onValidate }: EntryCardProps) {
  const { id, name, size, isValidating, result, error } = entry;

  return (
    <div className="flex flex-col bg-white border border-slate-200 rounded-xl overflow-hidden min-w-0 flex-1 basis-80">
      {/* Card header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100 bg-slate-50 flex-shrink-0">
        <FileText size={16} className="text-slate-400 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="font-medium text-slate-800 text-sm truncate" title={name}>
            {name}
          </p>
          <p className="text-xs text-slate-400">{(size / 1024).toFixed(1)} KB</p>
        </div>
        <button
          onClick={() => onValidate(id)}
          disabled={isValidating}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex-shrink-0"
        >
          {isValidating ? (
            <>
              <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Validating…
            </>
          ) : (
            <>
              <ShieldCheck size={13} />
              Validate
            </>
          )}
        </button>
        <button
          onClick={() => onRemove(id)}
          className="p-1.5 text-slate-400 hover:text-slate-600 rounded hover:bg-slate-200 transition-colors flex-shrink-0"
          title="Remove"
        >
          <X size={14} />
        </button>
      </div>

      {/* Card body */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {/* Error */}
        {error && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700">
            <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Not yet validated */}
        {!result && !error && !isValidating && (
          <p className="text-xs text-slate-400 italic p-2">Press Validate to run checks.</p>
        )}

        {/* Validating spinner */}
        {isValidating && (
          <div className="flex items-center gap-2 p-2 text-xs text-slate-500">
            <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            Running validation…
          </div>
        )}

        {/* Result */}
        {result && !isValidating && (
          <>
            {/* Summary */}
            <div
              className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border ${
                result.valid ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
              }`}
            >
              {result.valid ? (
                <CheckCircle size={16} className="text-green-500 flex-shrink-0" />
              ) : (
                <AlertCircle size={16} className="text-red-500 flex-shrink-0" />
              )}
              <span
                className={`text-xs font-semibold ${result.valid ? 'text-green-700' : 'text-red-700'}`}
              >
                {result.valid ? 'Valid' : 'Invalid'}
              </span>
              <div className="flex gap-1 ml-auto flex-wrap justify-end">
                {result.summary.errors > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 text-[10px] font-medium">
                    {result.summary.errors}E
                  </span>
                )}
                {result.summary.warnings > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full bg-yellow-100 text-yellow-700 text-[10px] font-medium">
                    {result.summary.warnings}W
                  </span>
                )}
                {result.summary.infos > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-medium">
                    {result.summary.infos}I
                  </span>
                )}
                {result.valid && result.summary.warnings === 0 && (
                  <span className="text-[10px] text-green-600 font-medium">All checks passed</span>
                )}
              </div>
            </div>

            {result.parseError && (
              <div className="flex items-start gap-2 bg-red-50 border border-red-100 rounded p-2 text-xs text-red-600">
                <AlertCircle size={12} className="flex-shrink-0 mt-0.5" />
                <span>{result.parseError}</span>
              </div>
            )}

            {/* Layers */}
            <div className="space-y-1.5">
              {Object.values(result.layers).map((layer) => (
                <LayerSection key={layer.label} layer={layer} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

interface DmnValidatorProps {
  apiBaseUrl: string;
}

const DmnValidator: React.FC<DmnValidatorProps> = ({ apiBaseUrl }) => {
  const [entries, setEntries] = useState<DmnEntry[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [dropError, setDropError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── File handling ───────────────────────────────────────────────────────────

  const addFiles = (files: FileList | File[]) => {
    const arr = Array.from(files);
    const rejected = arr.filter((f) => !f.name.endsWith('.dmn') && !f.name.endsWith('.xml'));

    if (rejected.length > 0) {
      setDropError(`Skipped ${rejected.length} file(s) — only .dmn and .xml are accepted.`);
      setTimeout(() => setDropError(null), 4000);
    }

    arr
      .filter((f) => f.name.endsWith('.dmn') || f.name.endsWith('.xml'))
      .forEach((file) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          setEntries((prev) => [
            ...prev,
            {
              id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
              name: file.name,
              size: file.size,
              content: e.target?.result as string,
              isValidating: false,
              result: null,
              error: null,
            },
          ]);
        };
        reader.readAsText(file);
      });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    addFiles(e.dataTransfer.files);
  };

  const handleRemove = (id: string) => setEntries((prev) => prev.filter((e) => e.id !== id));

  // ── Validation ──────────────────────────────────────────────────────────────

  const validateEntry = async (id: string) => {
    const entry = entries.find((e) => e.id === id);
    if (!entry) return;

    setEntries((prev) =>
      prev.map((e) => (e.id === id ? { ...e, isValidating: true, result: null, error: null } : e))
    );

    try {
      const response = await fetch(`${apiBaseUrl}/v1/dmns/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: entry.content }),
      });
      const data = (await response.json()) as {
        success: boolean;
        data?: ValidationResult;
        error?: { message: string };
      };
      if (!response.ok || !data.success) {
        throw new Error(data.error?.message ?? `Server error: ${response.status}`);
      }
      setEntries((prev) =>
        prev.map((e) =>
          e.id === id ? { ...e, isValidating: false, result: data.data!, error: null } : e
        )
      );
    } catch (err) {
      setEntries((prev) =>
        prev.map((e) =>
          e.id === id
            ? {
                ...e,
                isValidating: false,
                error: err instanceof Error ? err.message : 'Validation request failed.',
              }
            : e
        )
      );
    }
  };

  const validateAll = () =>
    entries.forEach((e) => {
      if (!e.isValidating) validateEntry(e.id);
    });

  // ── Render ──────────────────────────────────────────────────────────────────

  const hasEntries = entries.length > 0;
  const allDone = hasEntries && entries.every((e) => e.result !== null || e.error !== null);

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">
      {/* Header */}
      <div className="px-6 py-4 bg-white border-b border-slate-200 flex-shrink-0 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ShieldCheck size={20} className="text-blue-600" />
          <div>
            <h2 className="text-lg font-semibold text-slate-800">DMN Validator</h2>
            <p className="text-sm text-slate-500">
              Validate one or more DMN files against the RONL DMN+ syntactic layers before
              publishing.
            </p>
          </div>
        </div>
        {hasEntries && (
          <div className="flex items-center gap-2 flex-shrink-0">
            {!allDone && (
              <button
                onClick={validateAll}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
              >
                <ShieldCheck size={15} />
                Validate all
              </button>
            )}
            <button
              onClick={() => setEntries([])}
              className="flex items-center gap-2 px-3 py-2 text-slate-500 text-sm rounded-lg hover:bg-slate-100 transition-colors border border-slate-200"
            >
              <X size={14} />
              Clear all
            </button>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-hidden flex flex-col p-6 gap-4">
        {/* Drop zone — compact when files are loaded, full-height when empty */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`flex-shrink-0 border-2 border-dashed rounded-xl transition-colors cursor-pointer ${
            hasEntries ? 'py-3' : 'flex-1 flex items-center justify-center'
          } ${
            isDragging
              ? 'border-blue-400 bg-blue-50'
              : 'border-slate-300 bg-white hover:border-blue-400 hover:bg-blue-50'
          }`}
        >
          <div className={`flex items-center justify-center gap-3 ${hasEntries ? '' : 'flex-col'}`}>
            <Plus
              size={hasEntries ? 18 : 36}
              className={isDragging ? 'text-blue-500' : 'text-slate-400'}
            />
            {hasEntries ? (
              <span className="text-sm text-slate-500">
                Drop more files or click to browse — .dmn or .xml
              </span>
            ) : (
              <>
                <p className="text-slate-600 font-medium text-lg">Drop DMN files here</p>
                <p className="text-slate-400 text-sm">
                  or click to browse — .dmn or .xml, multiple files supported
                </p>
              </>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".dmn,.xml"
            multiple
            onChange={(e) => {
              if (e.target.files) addFiles(e.target.files);
              e.target.value = '';
            }}
            className="hidden"
          />
        </div>

        {/* Drop error toast */}
        {dropError && (
          <div className="flex-shrink-0 flex items-center gap-2 bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-2 text-sm text-yellow-700">
            <AlertTriangle size={15} className="flex-shrink-0" />
            {dropError}
          </div>
        )}

        {/* Entry cards — scrollable horizontal row */}
        {hasEntries && (
          <div className="flex-1 overflow-x-auto overflow-y-hidden">
            <div
              className={`flex gap-4 h-full ${entries.length === 1 ? 'max-w-2xl mx-auto' : ''}`}
              style={{ minWidth: entries.length > 1 ? `${entries.length * 340}px` : undefined }}
            >
              {entries.map((entry) => (
                <EntryCard
                  key={entry.id}
                  entry={entry}
                  onRemove={handleRemove}
                  onValidate={validateEntry}
                />
              ))}
            </div>
          </div>
        )}

        {/* Legend */}
        {hasEntries && (
          <p className="flex-shrink-0 text-xs text-slate-400">
            E = error · W = warning · I = informational. Click a layer header to expand its issues.
          </p>
        )}
      </div>
    </div>
  );
};

export default DmnValidator;
