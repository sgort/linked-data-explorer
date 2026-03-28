import { Loader2, Save, X } from 'lucide-react';
import React, { useEffect, useState } from 'react';

import { BpmnService } from '../../services/bpmnService';
import { FormService } from '../../services/formService';
import { DataCategory, RopaPersonalDataField, RopaRecord } from '../../types/ropa.types';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

const DATA_CATEGORIES: DataCategory[] = [
  'identity',
  'financial',
  'residence',
  'health',
  'civil status',
  'criminal',
  'other',
];

const GDPR_ARTICLES = [
  'Art. 6(1)(a) — Consent',
  'Art. 6(1)(b) — Contract',
  'Art. 6(1)(c) — Legal obligation',
  'Art. 6(1)(d) — Vital interests',
  'Art. 6(1)(e) — Public task',
  'Art. 6(1)(f) — Legitimate interests',
];

type Tab = 'record' | 'fields' | 'bpmn' | 'status';

interface RopaRecordEditorProps {
  record: RopaRecord | null;
  onSave: (record: RopaRecord) => Promise<void>;
  onCancel: () => void;
}

// ─── Blank record factory ────────────────────────────────────────────────────

function blankRecord(): RopaRecord {
  return {
    id: '',
    bpmnProcessId: '',
    processLevel: 'subprocess',
    title: '',
    controllerName: '',
    controllerContact: '',
    dpoContact: '',
    purpose: '',
    legalBasisUri: '',
    legalBasisLabel: '',
    gdprArticle: 'Art. 6(1)(e) — Public task',
    dataSubjects: '',
    recipients: '',
    thirdCountryTransfers: false,
    thirdCountryDetails: '',
    retentionPeriod: '',
    securityMeasures: '',
    status: 'draft',
    schemaVersion: 1,
    personalDataFields: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

// ─── Shared field styles ─────────────────────────────────────────────────────

const inputCls =
  'w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-teal-500 focus:outline-none bg-white';
const labelCls = 'block text-xs font-semibold text-slate-600 mb-1';
const textareaCls =
  'w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-teal-500 focus:outline-none bg-white resize-none';

// ─── Component ───────────────────────────────────────────────────────────────

const RopaRecordEditor: React.FC<RopaRecordEditorProps> = ({ record, onSave, onCancel }) => {
  const [local, setLocal] = useState<RopaRecord>(record ?? blankRecord());
  const [activeTab, setActiveTab] = useState<Tab>('record');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Legal basis lookup state
  const [legalResults, setLegalResults] = useState<{ uri: string; label: string }[]>([]);
  const [legalLoading, setLegalLoading] = useState(false);
  const [legalError, setLegalError] = useState<string | null>(null);

  // BPMN link state — read the ronl:ropaRef from the matching process XML
  const [bpmnRopaRef, setBpmnRopaRef] = useState<string | undefined>(undefined);
  const [bpmnLinkLoading, setBpmnLinkLoading] = useState(false);

  useEffect(() => {
    setLocal(record ?? blankRecord());
    setActiveTab('record');
    setSaveError(null);
    setLegalResults([]);
    setLegalError(null);
  }, [record]);

  // When the BPMN link tab is opened, read the current ropaRef from the process XML
  useEffect(() => {
    if (activeTab !== 'bpmn' || !local.bpmnProcessId) return;
    setBpmnLinkLoading(true);
    const processes = BpmnService.getProcesses();
    const match = processes.find((p) => p.bpmnProcessId === local.bpmnProcessId);
    const ref = match?.xml.match(/ronl:ropaRef="([^"]+)"/)?.[1];
    setBpmnRopaRef(ref);
    setBpmnLinkLoading(false);
  }, [activeTab, local.bpmnProcessId]);

  // ─── Field helpers ─────────────────────────────────────────────────────────

  const set = (key: keyof RopaRecord, value: unknown) =>
    setLocal((prev) => ({ ...prev, [key]: value }));

  // ─── Tab: Record — legal basis lookup ────────────────────────────────────

  const handleLegalLookup = async () => {
    setLegalLoading(true);
    setLegalError(null);
    setLegalResults([]);
    try {
      const query = `
PREFIX cpsv: <http://purl.org/vocab/cpsv#>
PREFIX cv:   <http://data.europa.eu/m8g/>
PREFIX dct:  <http://purl.org/dc/terms/>
PREFIX eli:  <http://data.europa.eu/eli/ontology#>

SELECT ?serviceTitle ?legalResource
WHERE {
  ?service a cpsv:PublicService ;
           dct:title ?serviceTitle ;
           cv:hasLegalResource ?legalResource .
  ?legalResource a eli:LegalResource .
  FILTER(LANG(?serviceTitle) = "nl" || LANG(?serviceTitle) = "")
}
ORDER BY ?serviceTitle`;

      const res = await fetch(`${API_BASE}/v1/triplydb/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint:
            'https://api.open-regels.triply.cc/datasets/RONL/ronl-knowledge-graph/services/ronl-knowledge-graph/sparql',
          query,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as {
        results?: {
          bindings?: { serviceTitle: { value: string }; legalResource: { value: string } }[];
        };
      };
      const bindings = data.results?.bindings ?? [];
      const deduped = new Map<string, string>();
      for (const b of bindings) {
        deduped.set(b.legalResource.value, b.serviceTitle.value);
      }
      setLegalResults([...deduped.entries()].map(([uri, label]) => ({ uri, label })));
      if (deduped.size === 0) setLegalError('No legal resources found in the knowledge graph.');
    } catch (e) {
      setLegalError(e instanceof Error ? e.message : 'Lookup failed');
    } finally {
      setLegalLoading(false);
    }
  };

  // ─── Tab: Fields — hydrate from linked forms ──────────────────────────────

  const handleHydrate = () => {
    // Find the process XML matching bpmnProcessId
    const processes = BpmnService.getProcesses();
    const match = processes.find((p) => p.bpmnProcessId === local.bpmnProcessId);
    if (!match) return;

    // Extract all camunda:formRef values from the XML
    const formRefs = [
      ...new Set([...match.xml.matchAll(/camunda:formRef="([^"]+)"/g)].map((m) => m[1])),
    ];

    const allForms = FormService.getForms();
    const existingKeys = new Set(local.personalDataFields.map((f) => f.fieldKey));
    const newFields: RopaPersonalDataField[] = [];
    let sortOrder = local.personalDataFields.length;

    for (const ref of formRefs) {
      const form = allForms.find((f) => (f.schema as Record<string, unknown>).id === ref);
      if (!form) continue;

      const components =
        ((form.schema as Record<string, unknown>).components as Record<string, unknown>[]) ?? [];

      for (const comp of components) {
        const key = comp.key as string | undefined;
        const label = comp.label as string | undefined;
        // Skip components without a key (text blocks, buttons, headings)
        if (!key || existingKeys.has(key)) continue;
        newFields.push({
          id: `field_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          ropaRecordId: local.id,
          formId: ref,
          fieldKey: key,
          fieldLabel: label ?? key,
          dataCategory: 'other',
          specialCategory: false,
          sortOrder: sortOrder++,
        });
        existingKeys.add(key);
      }
    }

    setLocal((prev) => ({
      ...prev,
      personalDataFields: [...prev.personalDataFields, ...newFields],
    }));
  };

  const handleUpdateField = (index: number, key: keyof RopaPersonalDataField, value: unknown) => {
    setLocal((prev) => {
      const fields = [...prev.personalDataFields];
      fields[index] = { ...fields[index], [key]: value };
      return { ...prev, personalDataFields: fields };
    });
  };

  const handleRemoveField = (index: number) => {
    setLocal((prev) => ({
      ...prev,
      personalDataFields: prev.personalDataFields.filter((_, i) => i !== index),
    }));
  };

  // ─── Tab: BPMN link ───────────────────────────────────────────────────────

  // Write ronl:ropaRef into the process XML and save via BpmnService
  const handleWriteBpmnLink = () => {
    if (!local.id || !local.bpmnProcessId) return;
    const processes = BpmnService.getProcesses();
    const proc = processes.find((p) => p.bpmnProcessId === local.bpmnProcessId);
    if (!proc) return;

    let xml = proc.xml;
    if (!xml.includes('xmlns:ronl=')) {
      xml = xml.replace(/(<(?:bpmn:)?definitions\b)/, '$1 xmlns:ronl="http://ronl.nl/schema/1.0"');
    }
    if (xml.includes('ronl:ropaRef=')) {
      xml = xml.replace(/ronl:ropaRef="[^"]*"/, `ronl:ropaRef="${local.id}"`);
    } else {
      xml = xml.replace(/(<(?:bpmn:)?process\b[^>]*?)(\/?>)/, `$1 ronl:ropaRef="${local.id}"$2`);
    }
    BpmnService.saveProcess({ ...proc, xml, updatedAt: new Date().toISOString() });
    setBpmnRopaRef(local.id);
  };

  const handleRemoveBpmnLink = () => {
    if (!local.bpmnProcessId) return;
    const processes = BpmnService.getProcesses();
    const proc = processes.find((p) => p.bpmnProcessId === local.bpmnProcessId);
    if (!proc) return;
    const xml = proc.xml.replace(/\s*ronl:ropaRef="[^"]*"/, '');
    BpmnService.saveProcess({ ...proc, xml, updatedAt: new Date().toISOString() });
    setBpmnRopaRef(undefined);
  };

  // ─── Save ─────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    setIsSaving(true);
    setSaveError(null);
    try {
      await onSave({ ...local, updatedAt: new Date().toISOString() });
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setIsSaving(false);
    }
  };

  // ─── Tab button ───────────────────────────────────────────────────────────

  const TabBtn: React.FC<{ tab: Tab; label: string }> = ({ tab, label }) => (
    <button
      onClick={() => setActiveTab(tab)}
      className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
        activeTab === tab
          ? 'border-teal-600 text-teal-700'
          : 'border-transparent text-slate-500 hover:text-slate-700'
      }`}
    >
      {label}
    </button>
  );

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full bg-white">
      {/* ── Top bar ── */}
      <div className="h-14 border-b border-slate-200 px-6 flex items-center justify-between shrink-0">
        <h2 className="text-sm font-semibold text-slate-800 truncate">
          {local.title || 'New RoPA record'}
        </h2>
        <div className="flex items-center gap-2">
          {saveError && <span className="text-xs text-red-600">{saveError}</span>}
          <button
            onClick={onCancel}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X size={16} />
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700 disabled:opacity-50 transition-colors"
          >
            {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Save
          </button>
        </div>
      </div>

      {/* ── Tab bar ── */}
      <div className="flex border-b border-slate-200 px-6 shrink-0">
        <TabBtn tab="record" label="Record" />
        <TabBtn tab="fields" label="Personal Data Fields" />
        <TabBtn tab="bpmn" label="BPMN Link" />
        <TabBtn tab="status" label="Status" />
      </div>

      {/* ── Tab content ── */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* ────────── TAB: RECORD ────────── */}
        {activeTab === 'record' && (
          <div className="space-y-5 max-w-2xl">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className={labelCls}>Title</label>
                <input
                  className={inputCls}
                  value={local.title}
                  onChange={(e) => set('title', e.target.value)}
                  placeholder="e.g. Tree Felling Permit — material law processing"
                />
              </div>

              <div>
                <label className={labelCls}>BPMN process ID</label>
                <input
                  className={inputCls}
                  value={local.bpmnProcessId}
                  onChange={(e) => set('bpmnProcessId', e.target.value)}
                  placeholder="e.g. TreeFellingPermitSubProcess"
                />
              </div>

              <div>
                <label className={labelCls}>Process level</label>
                <select
                  className={inputCls}
                  value={local.processLevel}
                  onChange={(e) => set('processLevel', e.target.value)}
                >
                  <option value="shell">Shell</option>
                  <option value="subprocess">Subprocess</option>
                </select>
              </div>
            </div>

            <hr className="border-slate-200" />

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Controller name</label>
                <input
                  className={inputCls}
                  value={local.controllerName}
                  onChange={(e) => set('controllerName', e.target.value)}
                  placeholder="e.g. Province of Flevoland"
                />
              </div>
              <div>
                <label className={labelCls}>Controller contact</label>
                <input
                  className={inputCls}
                  value={local.controllerContact}
                  onChange={(e) => set('controllerContact', e.target.value)}
                  placeholder="e.g. avg@flevoland.nl"
                />
              </div>
              <div className="col-span-2">
                <label className={labelCls}>DPO contact (optional)</label>
                <input
                  className={inputCls}
                  value={local.dpoContact ?? ''}
                  onChange={(e) => set('dpoContact', e.target.value)}
                  placeholder="e.g. fg@flevoland.nl"
                />
              </div>
            </div>

            <hr className="border-slate-200" />

            <div>
              <label className={labelCls}>Purpose</label>
              <textarea
                className={textareaCls}
                rows={3}
                value={local.purpose}
                onChange={(e) => set('purpose', e.target.value)}
                placeholder="Describe the purpose of this processing activity…"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>GDPR article</label>
                <select
                  className={inputCls}
                  value={local.gdprArticle}
                  onChange={(e) => set('gdprArticle', e.target.value)}
                >
                  {GDPR_ARTICLES.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Legal basis lookup */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className={labelCls}>Legal basis (eli:LegalResource)</label>
                <button
                  onClick={handleLegalLookup}
                  disabled={legalLoading}
                  className="flex items-center gap-1 text-xs text-teal-700 font-medium hover:underline disabled:opacity-50"
                >
                  {legalLoading && <Loader2 size={11} className="animate-spin" />}
                  Lookup from knowledge graph
                </button>
              </div>

              {legalResults.length > 0 && (
                <div className="mb-2 border border-slate-200 rounded-md max-h-36 overflow-y-auto">
                  {legalResults.map((r) => (
                    <button
                      key={r.uri}
                      onClick={() => {
                        set('legalBasisUri', r.uri);
                        set('legalBasisLabel', r.label);
                        setLegalResults([]);
                      }}
                      className="w-full text-left px-3 py-2 text-xs hover:bg-teal-50 border-b border-slate-100 last:border-0"
                    >
                      <span className="font-medium text-slate-700">{r.label}</span>
                      <span className="block text-[10px] text-slate-400 font-mono truncate">
                        {r.uri}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {legalError && <p className="text-xs text-red-600 mb-2">{legalError}</p>}

              <input
                className={inputCls}
                value={local.legalBasisLabel}
                onChange={(e) => set('legalBasisLabel', e.target.value)}
                placeholder="e.g. Wet op de zorgtoeslag"
              />
              <input
                className={`${inputCls} mt-2 font-mono text-xs`}
                value={local.legalBasisUri}
                onChange={(e) => set('legalBasisUri', e.target.value)}
                placeholder="https://data.europa.eu/eli/…"
              />
            </div>

            <hr className="border-slate-200" />

            <div>
              <label className={labelCls}>Data subjects</label>
              <textarea
                className={textareaCls}
                rows={2}
                value={local.dataSubjects}
                onChange={(e) => set('dataSubjects', e.target.value)}
                placeholder="e.g. Dutch residents applying for health care allowance"
              />
            </div>

            <div>
              <label className={labelCls}>Recipients</label>
              <textarea
                className={textareaCls}
                rows={2}
                value={local.recipients}
                onChange={(e) => set('recipients', e.target.value)}
                placeholder="e.g. Internal caseworkers; archiving system"
              />
            </div>

            <div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={local.thirdCountryTransfers}
                  onChange={(e) => set('thirdCountryTransfers', e.target.checked)}
                  className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                />
                <span className={labelCls.replace('mb-1', '')}>Third country transfers</span>
              </label>
              {local.thirdCountryTransfers && (
                <textarea
                  className={`${textareaCls} mt-2`}
                  rows={2}
                  value={local.thirdCountryDetails ?? ''}
                  onChange={(e) => set('thirdCountryDetails', e.target.value)}
                  placeholder="Describe the transfer and safeguards…"
                />
              )}
            </div>

            <div>
              <label className={labelCls}>Retention period</label>
              <input
                className={inputCls}
                value={local.retentionPeriod}
                onChange={(e) => set('retentionPeriod', e.target.value)}
                placeholder="e.g. 7 years (Archiefwet baseline)"
              />
            </div>

            <div>
              <label className={labelCls}>Security measures</label>
              <textarea
                className={textareaCls}
                rows={2}
                value={local.securityMeasures}
                onChange={(e) => set('securityMeasures', e.target.value)}
                placeholder="e.g. TLS in transit, PostgreSQL at rest, Keycloak-gated access, audit log"
              />
            </div>
          </div>
        )}

        {/* ────────── TAB: PERSONAL DATA FIELDS ────────── */}
        {activeTab === 'fields' && (
          <div className="max-w-4xl">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-slate-600">
                Fields collected by the forms linked to this process. Non-personal fields (routing
                variables, buttons, headings) can be removed.
              </p>
              <button
                onClick={handleHydrate}
                disabled={!local.bpmnProcessId}
                className="shrink-0 ml-4 px-3 py-1.5 text-xs font-medium bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-40 transition-colors"
                title={
                  !local.bpmnProcessId
                    ? 'Set BPMN process ID on the Record tab first'
                    : 'Read linked forms and append missing field rows'
                }
              >
                Hydrate from forms
              </button>
            </div>

            {local.personalDataFields.length === 0 ? (
              <div className="text-center py-12 text-slate-400 border-2 border-dashed border-slate-200 rounded-lg">
                <p className="text-sm">No fields yet.</p>
                <p className="text-xs mt-1">
                  Set a BPMN process ID on the Record tab, then click &quot;Hydrate from
                  forms&quot;.
                </p>
              </div>
            ) : (
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="text-left px-3 py-2 border border-slate-200 font-semibold text-slate-600">
                      Form
                    </th>
                    <th className="text-left px-3 py-2 border border-slate-200 font-semibold text-slate-600">
                      Field key
                    </th>
                    <th className="text-left px-3 py-2 border border-slate-200 font-semibold text-slate-600">
                      Label
                    </th>
                    <th className="text-left px-3 py-2 border border-slate-200 font-semibold text-slate-600">
                      Category
                    </th>
                    <th className="text-center px-3 py-2 border border-slate-200 font-semibold text-slate-600">
                      Art. 9/10
                    </th>
                    <th className="px-3 py-2 border border-slate-200"></th>
                  </tr>
                </thead>
                <tbody>
                  {local.personalDataFields.map((field, i) => (
                    <tr key={field.id} className="hover:bg-slate-50">
                      <td className="px-3 py-1.5 border border-slate-200 font-mono text-[10px] text-slate-500">
                        {field.formId}
                      </td>
                      <td className="px-3 py-1.5 border border-slate-200 font-mono">
                        {field.fieldKey}
                      </td>
                      <td className="px-3 py-1.5 border border-slate-200">
                        <input
                          value={field.fieldLabel}
                          onChange={(e) => handleUpdateField(i, 'fieldLabel', e.target.value)}
                          className="w-full px-1.5 py-1 border border-slate-200 rounded text-xs focus:ring-1 focus:ring-teal-400 focus:outline-none"
                        />
                      </td>
                      <td className="px-3 py-1.5 border border-slate-200">
                        <select
                          value={field.dataCategory}
                          onChange={(e) => handleUpdateField(i, 'dataCategory', e.target.value)}
                          className="w-full px-1.5 py-1 border border-slate-200 rounded text-xs focus:ring-1 focus:ring-teal-400 focus:outline-none bg-white"
                        >
                          {DATA_CATEGORIES.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-1.5 border border-slate-200 text-center">
                        <input
                          type="checkbox"
                          checked={field.specialCategory}
                          onChange={(e) =>
                            handleUpdateField(i, 'specialCategory', e.target.checked)
                          }
                          className="rounded border-slate-300 text-red-600 focus:ring-red-500"
                        />
                      </td>
                      <td className="px-3 py-1.5 border border-slate-200 text-center">
                        <button
                          onClick={() => handleRemoveField(i)}
                          className="text-slate-300 hover:text-red-500 transition-colors"
                        >
                          <X size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* ────────── TAB: BPMN LINK ────────── */}
        {activeTab === 'bpmn' && (
          <div className="max-w-lg space-y-5">
            <p className="text-sm text-slate-600">
              Link this RoPA record to its BPMN process by writing{' '}
              <code className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded">
                ronl:ropaRef
              </code>{' '}
              into the process XML. The record must be saved first so it has an ID.
            </p>

            <div className="border border-slate-200 rounded-lg p-4 space-y-3">
              <div>
                <p className={labelCls}>BPMN process ID</p>
                <p className="text-sm font-mono text-slate-700">
                  {local.bpmnProcessId || '— not set —'}
                </p>
              </div>

              <div>
                <p className={labelCls}>RoPA record ID</p>
                <p className="text-sm font-mono text-slate-700">
                  {local.id || '— save the record first —'}
                </p>
              </div>

              <div>
                <p className={labelCls}>Current ronl:ropaRef in BPMN XML</p>
                {bpmnLinkLoading ? (
                  <p className="text-xs text-slate-400">Reading…</p>
                ) : bpmnRopaRef ? (
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-xs font-mono px-2 py-1 rounded ${
                        bpmnRopaRef === local.id
                          ? 'bg-teal-50 text-teal-700'
                          : 'bg-amber-50 text-amber-700'
                      }`}
                    >
                      {bpmnRopaRef}
                    </span>
                    {bpmnRopaRef === local.id ? (
                      <span className="text-[10px] text-teal-600 font-medium">✓ Linked</span>
                    ) : (
                      <span className="text-[10px] text-amber-600 font-medium">
                        Points to a different record
                      </span>
                    )}
                  </div>
                ) : (
                  <span className="text-xs text-slate-400">Not linked</span>
                )}
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleWriteBpmnLink}
                disabled={!local.id || !local.bpmnProcessId}
                className="px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700 disabled:opacity-40 transition-colors"
              >
                Write ronl:ropaRef to BPMN
              </button>
              {bpmnRopaRef && (
                <button
                  onClick={handleRemoveBpmnLink}
                  className="px-4 py-2 bg-white border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors"
                >
                  Remove link
                </button>
              )}
            </div>

            {!local.id && (
              <p className="text-xs text-amber-600">
                Save the record on the Record tab first — the ID is required to write the link.
              </p>
            )}
          </div>
        )}

        {/* ────────── TAB: STATUS ────────── */}
        {activeTab === 'status' && (
          <div className="max-w-md space-y-5">
            <div className="border border-slate-200 rounded-lg p-4">
              <p className={labelCls}>Current status</p>
              <span
                className={`inline-block mt-1 text-xs font-bold px-2.5 py-1 rounded-full uppercase tracking-wide ${
                  local.status === 'draft'
                    ? 'bg-slate-100 text-slate-600'
                    : local.status === 'active'
                      ? 'bg-green-100 text-green-700'
                      : 'bg-amber-100 text-amber-700'
                }`}
              >
                {local.status}
              </span>
            </div>

            <div className="space-y-3">
              <button
                onClick={() => set('status', 'draft')}
                disabled={local.status === 'draft'}
                className="w-full px-4 py-2.5 text-sm font-medium border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition-colors text-left"
              >
                <span className="font-semibold">Set Draft</span>
                <span className="block text-xs text-slate-400 mt-0.5">
                  Internal only — not visible on the public site.
                </span>
              </button>

              <button
                onClick={() => {
                  if (
                    confirm(
                      'Activating this record will make it publicly visible on ropa.flevoland.nl. Continue?'
                    )
                  ) {
                    set('status', 'active');
                  }
                }}
                disabled={local.status === 'active'}
                className="w-full px-4 py-2.5 text-sm font-medium border border-green-300 rounded-lg text-green-700 bg-green-50 hover:bg-green-100 disabled:opacity-40 transition-colors text-left"
              >
                <span className="font-semibold">Set Active</span>
                <span className="block text-xs text-green-600 mt-0.5">
                  Publicly visible via GET /v1/ropa/public.
                </span>
              </button>

              <button
                onClick={() => set('status', 'archived')}
                disabled={local.status === 'archived'}
                className="w-full px-4 py-2.5 text-sm font-medium border border-amber-300 rounded-lg text-amber-700 bg-amber-50 hover:bg-amber-100 disabled:opacity-40 transition-colors text-left"
              >
                <span className="font-semibold">Set Archived</span>
                <span className="block text-xs text-amber-600 mt-0.5">
                  Hidden from public site. Retained for audit purposes.
                </span>
              </button>
            </div>

            <p className="text-xs text-slate-400">
              Status changes take effect after saving the record.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default RopaRecordEditor;
