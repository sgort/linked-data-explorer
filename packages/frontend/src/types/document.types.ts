/**
 * Document Composer — Type Definitions
 *
 * Destination: packages/frontend/src/types/document.types.ts
 *
 * Mirrors the FormSchema / BpmnProcess pattern established in the codebase.
 * Zones use camelCase keys; ZONE_META provides Dutch display labels and ordering.
 */

// ─── Zone model ──────────────────────────────────────────────────────────────

export interface DocumentZone {
  blocks: DocumentBlock[];
}

/**
 * All mandatory zones + optional annex.
 * Ordered to match Dutch administrative letter convention (NEN-ISO 27001 / VBGB).
 */
export interface DocumentZones {
  letterhead: DocumentZone;
  contactInformation: DocumentZone;
  reference: DocumentZone;
  body: DocumentZone;
  closing: DocumentZone;
  signOff: DocumentZone;
  annex?: DocumentZone | null;
}

export type ZoneId = keyof DocumentZones;

export interface ZoneMeta {
  label: string; // Dutch display label
  labelEn: string; // English internal name
  required: boolean;
  description: string;
}

export const ZONE_META: Record<ZoneId, ZoneMeta> = {
  letterhead: {
    label: 'Letterhead',
    labelEn: 'Letterhead',
    required: true,
    description: 'Logo, organisation name and house style elements',
  },
  contactInformation: {
    label: 'Contact Information',
    labelEn: 'Contact Information',
    required: true,
    description: 'Address, phone, email and website of the organisation',
  },
  reference: {
    label: 'Reference',
    labelEn: 'Reference',
    required: true,
    description: 'File number, date, subject and case handler',
  },
  body: {
    label: 'Body',
    labelEn: 'Body',
    required: true,
    description: 'Decision, motivation and considerations (Awb art. 3:46)',
  },
  closing: {
    label: 'Closing',
    labelEn: 'Closing',
    required: true,
    description: 'Appeal options, deadlines and next steps',
  },
  signOff: {
    label: 'Sign-off',
    labelEn: 'Sign-off',
    required: true,
    description: 'Name, role and signature of the signatory',
  },
  annex: {
    label: 'Annex',
    labelEn: 'Annex',
    required: false,
    description: 'Optional annexes to the decision',
  },
};

/** Ordered zone IDs for rendering — annex always last */
export const ZONE_ORDER: ZoneId[] = [
  'letterhead',
  'contactInformation',
  'reference',
  'body',
  'closing',
  'signOff',
  'annex',
];

// ─── Block model ─────────────────────────────────────────────────────────────

export type BlockType = 'text' | 'image' | 'variable' | 'separator' | 'spacer';

export interface DocumentBlock {
  id: string;
  type: BlockType;
  /**
   * TipTap ProseMirror JSON document.
   * Present for type === 'text'. May contain {{placeholder}} text nodes
   * that are resolved at render/export time.
   */
  content?: TipTapDoc;
  /** TriplyDB asset URL. Present for type === 'image'. */
  assetUrl?: string;
  /** Operaton process variable key. Present for type === 'variable'. */
  variableKey?: string;
  /** Human-readable display label shown in the block header. */
  label?: string;
}

/** Minimal TipTap JSON doc shape (ProseMirror). */
export interface TipTapDoc {
  type: 'doc';
  content: TipTapNode[];
}

export interface TipTapNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TipTapNode[];
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
  text?: string;
}

// ─── Binding model ───────────────────────────────────────────────────────────

export type BindingSource = 'process' | 'dmn_output';

export interface VariableBinding {
  id: string;
  /** Mustache-style placeholder used in text blocks: e.g. "{{permitDecision}}" */
  placeholder: string;
  /** Operaton process variable name: e.g. "permitDecision" */
  variableKey: string;
  source: BindingSource;
  /** Optional descriptive label shown in the binding panel */
  label?: string;
}

// ─── Template model ──────────────────────────────────────────────────────────

export interface DocumentTemplate {
  id: string;
  name: string;
  description?: string;
  /**
   * Operaton process definition key this template belongs to.
   * Used for variable discovery and citizen-side rendering lookup.
   */
  processKey?: string;
  /**
   * Chain Composer service identifier this template is associated with.
   * Informational — enables template discovery in the right panel.
   */
  serviceId?: string;
  schemaVersion: number;
  zones: DocumentZones;
  bindings: VariableBinding[];
  /** TriplyDB asset URLs used in this template (for dependency tracking). */
  assets: string[];
  createdAt: string;
  updatedAt: string;
  readonly?: boolean;
  status?: 'example' | 'wip' | 'e2e';
  /** ISO 639-1 language code (e.g. 'en', 'nl', 'de'). Undefined means language-agnostic. */
  language?: 'en' | 'nl' | 'de';
  /** Organization key (e.g. 'flevoland', 'heusden'). Used for list grouping. */
  organization?: string;
}

// ─── Drag-and-drop transfer types ────────────────────────────────────────────

/** Carried in dnd-kit DragStartEvent.active.data.current */
export interface DragData {
  type: 'new-block' | 'existing-block';
  blockType?: BlockType; // for new-block
  blockId?: string; // for existing-block
  sourceZoneId?: ZoneId; // for existing-block
  assetUrl?: string; // for new-block of type 'image'
  variableKey?: string; // for new-block of type 'variable'
  label?: string;
}

// ─── Asset model (mirrors TriplyDBAsset in types/index.ts) ───────────────────

export interface DocumentAsset {
  id: string;
  name: string;
  url: string;
  size: number;
  contentType: string;
}

// ─── Variable hint (from Operaton history API) ───────────────────────────────

export interface ProcessVariableHint {
  name: string;
  type: string; // e.g. 'String', 'Boolean', 'Integer'
  exampleValue?: unknown;
}
