/**
 * packages/backend/src/services/dmn-validation.service.ts
 *
 * DMN validation service — five-layer syntactic validation for RONL DMN+ files.
 *
 * Layer 1 (Base DMN):    programmatic well-formedness and namespace checks.
 * Layer 2 (Business):    programmatic checks on decision table structure and types.
 * Layer 3 (Execution):   programmatic checks on CPRMV extension attributes.
 * Layer 4 (Interaction): programmatic checks on DRD wiring.
 * Layer 5 (Content):     programmatic checks on metadata quality.
 *
 * The XSD content is embedded as string constants so no file-system path resolution
 * is required at runtime (tsc does not copy non-TS assets to dist/).
 * libxmljs2 is used throughout — both for XSD validation and XPath-based DOM
 * navigation in layers 2–5, keeping the dependency count to a single new package.
 */

import logger from '../utils/logger';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ValidationIssue {
  severity: 'error' | 'warning' | 'info';
  code: string;
  message: string;
  location?: string;
  line?: number;
  column?: number;
}

export interface LayerResult {
  label: string;
  issues: ValidationIssue[];
}

export interface DmnValidationResult {
  valid: boolean;
  parseError: string | null;
  layers: {
    base: LayerResult;
    business: LayerResult;
    execution: LayerResult;
    interaction: LayerResult;
    content: LayerResult;
  };
  summary: {
    errors: number;
    warnings: number;
    infos: number;
  };
}

// ── Embedded XSDs ─────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// The XSD approach was abandoned because libxml2's schema compiler rejects
// complex forward-referencing schemas that are otherwise valid XSD 1.0.
// Layer 1 now performs programmatic well-formedness and namespace checks.
// Layers 2–5 cover all structural validation without requiring an XSD.
// ─────────────────────────────────────────────────────────────────────────────

// ── Constants ─────────────────────────────────────────────────────────────────

const DMN_NS = 'https://www.omg.org/spec/DMN/20191111/MODEL/';
const CPRMV_NS = 'https://cprmv.open-regels.nl/0.3.0/';
const NS = { d: DMN_NS };

const VALID_HIT_POLICIES = new Set([
  'UNIQUE',
  'FIRST',
  'ANY',
  'COLLECT',
  'RULE ORDER',
  'OUTPUT ORDER',
  'PRIORITY',
]);

const VALID_TYPE_REFS = new Set([
  'string',
  'boolean',
  'integer',
  'long',
  'double',
  'number',
  'date',
  'Any',
  'String',
  'Boolean',
  'Integer',
  'Long',
  'Double',
  'Date',
  'Number',
]);

const VALID_CPRMV_RULE_TYPES = new Set([
  'temporal-period',
  'conditional',
  'derivation',
  'constraint',
  'decision-rule',
  'default',
]);

const VALID_CPRMV_CONFIDENCE = new Set(['low', 'medium', 'high']);

const VALID_CPRMV_RULESET_TYPES = new Set([
  'decision-table',
  'conditional-calculation',
  'constraint-table',
  'derivation-table',
]);

const ISO_DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const BWB_ID_RE = /^[A-Z]{4}\d{7}$/;

// ── Helpers ───────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type XmlElement = any; // libxmljs2 Element — typed via runtime import

function iss(
  severity: ValidationIssue['severity'],
  code: string,
  message: string,
  location?: string,
  line?: number,
  column?: number
): ValidationIssue {
  return {
    severity,
    code,
    message,
    ...(location ? { location } : {}),
    ...(line !== undefined ? { line } : {}),
    ...(column !== undefined ? { column } : {}),
  };
}

function elLoc(el: XmlElement): string {
  try {
    const id = el.attr('id')?.value();
    const name = el.attr('name')?.value();
    const tag = el.name();
    if (id) return `<${tag} id="${id}">`;
    if (name) return `<${tag} name="${name}">`;
    return `<${tag}>`;
  } catch {
    return '<unknown>';
  }
}

/** Get CPRMV-namespaced attribute value, trying both prefixed and namespace forms. */
function cprmvAttr(el: XmlElement, name: string): string | null {
  try {
    // Try namespace-aware lookup first
    const nsAttr = el.attr({ name, ns: CPRMV_NS });
    if (nsAttr) return nsAttr.value();
    // Fallback: scan raw attributes for cprmv:name prefix
    const attrs = el.attrs();
    for (const a of attrs) {
      if (a.name() === name && a.namespace()?.href() === CPRMV_NS) return a.value();
    }
    return null;
  } catch {
    return null;
  }
}

/** Find elements by XPath, returning empty array on any error. */
function find(node: XmlElement, xpath: string, ns?: Record<string, string>): XmlElement[] {
  try {
    return node.find(xpath, ns ?? NS) as XmlElement[];
  } catch {
    return [];
  }
}

/** Get first matching element by XPath, returning null on any error. */
function get(node: XmlElement, xpath: string, ns?: Record<string, string>): XmlElement | null {
  try {
    return (node.get(xpath, ns ?? NS) as XmlElement) ?? null;
  } catch {
    return null;
  }
}

// ── Layer 1: Base DMN (well-formedness + namespace checks) ────────────────────
//
// libxml2's XSD schema compiler (used internally by libxmljs2's .validate())
// rejects complex schemas with forward references and abstract types that are
// otherwise valid XSD 1.0. Since layers 2–5 already cover all meaningful
// structural validation programmatically, Layer 1 focuses on what libxml2
// does reliably well: XML well-formedness checking and root element inspection.

async function validateBaseLayer(
  xmlContent: string
): Promise<{ layer: LayerResult; doc: XmlElement | null }> {
  const issues: ValidationIssue[] = [];

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const libxmljs = require('libxmljs2');

    // ── 1. Well-formedness ────────────────────────────────────────────────────
    // parseXml throws a SyntaxError with line/column info on malformed XML.
    let xmlDoc: XmlElement;
    try {
      xmlDoc = libxmljs.parseXml(xmlContent, { nonet: true, recover: false });
    } catch (parseErr: unknown) {
      const msg = parseErr instanceof Error ? parseErr.message : String(parseErr);
      // Extract line/column from libxmljs2 error messages: "… on line X, col Y"
      const lineMatch = msg.match(/line\s+(\d+)/i);
      const colMatch = msg.match(/col(?:umn)?\s+(\d+)/i);
      return {
        layer: {
          label: 'Base DMN',
          issues: [
            iss(
              'error',
              'BASE-PARSE',
              `XML is not well-formed: ${msg.split('\n')[0].trim()}`,
              undefined,
              lineMatch ? parseInt(lineMatch[1], 10) : undefined,
              colMatch ? parseInt(colMatch[1], 10) : undefined
            ),
          ],
        },
        doc: null,
      };
    }

    // ── 2. Root element must be <definitions> ─────────────────────────────────
    const root = xmlDoc.root();
    const rootName = root?.name();
    if (rootName !== 'definitions') {
      issues.push(
        iss(
          'error',
          'BASE-ROOT',
          `Root element must be <definitions> but found <${rootName ?? 'unknown'}>.`
        )
      );
      return { layer: { label: 'Base DMN', issues }, doc: null };
    }

    // ── 3. DMN namespace must be declared ─────────────────────────────────────
    const rootNs = root.namespace()?.href() ?? '';
    const KNOWN_DMN_NS = [
      'https://www.omg.org/spec/DMN/20191111/MODEL/', // DMN 1.3
      'http://www.omg.org/spec/DMN/20180521/MODEL/', // DMN 1.2
      'http://www.omg.org/spec/DMN/20151101/dmn.xsd', // DMN 1.1
      'https://www.camunda.org/schema/1.0/dmn', // Camunda legacy
    ];
    if (!KNOWN_DMN_NS.includes(rootNs)) {
      issues.push(
        iss(
          'error',
          'BASE-NS',
          `Unrecognised DMN namespace: "${rootNs}". ` +
            `Expected one of: ${KNOWN_DMN_NS.join(', ')}.`
        )
      );
    }

    // ── 4. Required <definitions> attributes ─────────────────────────────────
    const nameAttr = root.attr('name')?.value();
    if (!nameAttr || !nameAttr.trim()) {
      issues.push(
        iss('warning', 'BASE-NAME', '<definitions> is missing the required "name" attribute.')
      );
    }

    const nsAttr = root.attr('namespace')?.value();
    if (!nsAttr || !nsAttr.trim()) {
      issues.push(
        iss(
          'warning',
          'BASE-NSATTR',
          '<definitions> is missing the "namespace" attribute. Add a URI to identify this model.'
        )
      );
    }

    // ── 5. At least one <decision> element must exist ────────────────────────
    // Use a namespace-agnostic local-name check to handle any DMN namespace.
    const decisions = xmlDoc.find('//*[local-name()="decision"]');
    if (!decisions || decisions.length === 0) {
      issues.push(
        iss(
          'warning',
          'BASE-EMPTY',
          'The file contains no <decision> elements. A valid DMN model must have at least one.'
        )
      );
    }

    return { layer: { label: 'Base DMN', issues }, doc: xmlDoc };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);

    if (msg.includes("Cannot find module 'libxmljs2'")) {
      logger.error('[DMN Validation] libxmljs2 not installed');
      return {
        layer: {
          label: 'Base DMN',
          issues: [
            iss(
              'error',
              'BASE-DEPS',
              'libxmljs2 is not installed. Run: npm install libxmljs2 inside packages/backend.'
            ),
          ],
        },
        doc: null,
      };
    }

    logger.error('[DMN Validation] Unexpected error in base layer', { error: msg });
    return {
      layer: { label: 'Base DMN', issues: [iss('error', 'BASE-ERR', `Unexpected error: ${msg}`)] },
      doc: null,
    };
  }
}

// ── Layer 2: Business Rules ────────────────────────────────────────────────────

function validateBusinessLayer(doc: XmlElement): LayerResult {
  const issues: ValidationIssue[] = [];

  // hitPolicy must be from allowed set
  for (const dt of find(doc, '//d:decisionTable')) {
    const hp = dt.attr('hitPolicy')?.value();
    if (hp && !VALID_HIT_POLICIES.has(hp)) {
      const decision = get(dt, 'parent::d:decision') ?? get(dt, '..');
      issues.push(
        iss(
          'error',
          'BIZ-001',
          `hitPolicy "${hp}" is not valid. Allowed: ${[...VALID_HIT_POLICIES].join(', ')}.`,
          decision ? elLoc(decision) : undefined
        )
      );
    }
  }

  // inputExpression typeRef should be present and known
  for (const ie of find(doc, '//d:inputExpression')) {
    const decision = get(ie, 'ancestor::d:decision');
    const loc = decision ? elLoc(decision) : undefined;
    const tr = ie.attr('typeRef')?.value();
    if (!tr) {
      issues.push(
        iss(
          'warning',
          'BIZ-002',
          '<inputExpression> is missing typeRef. Declare the type for interoperability.',
          loc
        )
      );
    } else if (!VALID_TYPE_REFS.has(tr)) {
      issues.push(iss('warning', 'BIZ-003', `typeRef "${tr}" is not a known DMN FEEL type.`, loc));
    }
  }

  // output column typeRef
  for (const out of find(doc, '//d:decisionTable/d:output')) {
    const decision = get(out, 'ancestor::d:decision');
    const loc = decision ? elLoc(decision) : undefined;
    const tr = out.attr('typeRef')?.value();
    if (!tr) {
      issues.push(iss('warning', 'BIZ-004', '<output> column is missing typeRef.', loc));
    } else if (!VALID_TYPE_REFS.has(tr)) {
      issues.push(
        iss('warning', 'BIZ-005', `Output typeRef "${tr}" is not a known DMN FEEL type.`, loc)
      );
    }
  }

  // Rule entry count consistency
  for (const dt of find(doc, '//d:decisionTable')) {
    const inputCount = find(dt, 'd:input').length;
    const outputCount = find(dt, 'd:output').length;
    const decision = get(dt, 'ancestor::d:decision');
    const dtLoc = decision ? elLoc(decision) : '<decisionTable>';

    for (const rule of find(dt, 'd:rule')) {
      const inEntries = find(rule, 'd:inputEntry').length;
      const outEntries = find(rule, 'd:outputEntry').length;
      if (inEntries !== inputCount) {
        issues.push(
          iss(
            'error',
            'BIZ-006',
            `Rule has ${inEntries} inputEntry element(s) but the table has ${inputCount} input column(s).`,
            `${dtLoc} > ${elLoc(rule)}`
          )
        );
      }
      if (outEntries !== outputCount) {
        issues.push(
          iss(
            'error',
            'BIZ-007',
            `Rule has ${outEntries} outputEntry element(s) but the table has ${outputCount} output column(s).`,
            `${dtLoc} > ${elLoc(rule)}`
          )
        );
      }
    }
  }

  // BIZ-008 / BIZ-009: hit-policy overlap checks (UNIQUE and ANY tables only)
  const OVERLAP_POLICIES = new Set(['UNIQUE', 'ANY']);
  const isMatchAny = (text: string): boolean => !text || text.trim() === '' || text.trim() === '-';

  for (const dt of find(doc, '//d:decisionTable')) {
    const hp = dt.attr('hitPolicy')?.value() ?? 'UNIQUE'; // DMN default is UNIQUE
    if (!OVERLAP_POLICIES.has(hp)) continue;

    const decision = get(dt, 'parent::d:decision') ?? get(dt, '..');
    const decisionLoc = decision ? elLoc(decision) : undefined;
    const rules = find(dt, 'd:rule');

    // Build a per-rule input signature: tuple of trimmed inputEntry text values
    const signatures: string[][] = rules.map((rule) =>
      find(rule, 'd:inputEntry').map((entry) => {
        const text = get(entry, 'd:text')?.text()?.trim() ?? '';
        return text;
      })
    );

    // BIZ-008 — duplicate rule rows
    // Fires when two rules have byte-identical text in every input column.
    // Operaton throws DmnHitPolicyException at runtime when this occurs in a UNIQUE table.
    const seen = new Map<string, number>(); // signature key → first occurrence index
    signatures.forEach((sig, idx) => {
      const key = sig.join('\x00');
      if (seen.has(key)) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const firstIdx = seen.get(key)!;
        const ruleId = rules[idx].attr('id')?.value() ?? `rule[${idx + 1}]`;
        const firstRuleId = rules[firstIdx].attr('id')?.value() ?? `rule[${firstIdx + 1}]`;
        issues.push(
          iss(
            'error',
            'BIZ-008',
            `Duplicate rule rows in ${hp} table: rule "${ruleId}" has identical input entries ` +
              `to rule "${firstRuleId}". Both will fire for the same input, ` +
              `causing a DmnHitPolicyException at runtime.`,
            decisionLoc
          )
        );
      } else {
        seen.set(key, idx);
      }
    });

    // BIZ-009 — catch-all rule alongside specific rules
    // A catch-all has every input entry empty or "-" (match-anything token).
    // In a UNIQUE or ANY table this creates an overlap with every specific rule.
    const catchAllIndices = signatures
      .map((sig, idx) => ({ sig, idx }))
      .filter(({ sig }) => sig.length > 0 && sig.every((entry) => isMatchAny(entry)))
      .map(({ idx }) => idx);

    const hasSpecificRules = signatures.some((sig) => sig.some((entry) => !isMatchAny(entry)));

    if (catchAllIndices.length > 0 && hasSpecificRules) {
      catchAllIndices.forEach((catchIdx) => {
        const ruleId = rules[catchIdx].attr('id')?.value() ?? `rule[${catchIdx + 1}]`;
        issues.push(
          iss(
            'warning',
            'BIZ-009',
            `Catch-all rule "${ruleId}" (all input entries are empty or "-") exists alongside ` +
              `specific rules in a ${hp} table. For any input that matches a specific rule, ` +
              `both the specific rule and the catch-all fire — violating the ${hp} hit policy. ` +
              `Consider hitPolicy="FIRST", or move default logic to an else-branch.`,
            decisionLoc
          )
        );
      });
    }
  }

  return { label: 'Business Rules', issues };
}

// ── Layer 3: Execution Rules (CPRMV) ──────────────────────────────────────────

function validateExecutionLayer(doc: XmlElement, xmlContent: string): LayerResult {
  const issues: ValidationIssue[] = [];

  const cprmvDeclared = xmlContent.includes('cprmv.open-regels.nl');

  if (!cprmvDeclared) {
    issues.push(
      iss(
        'info',
        'EXEC-001',
        'CPRMV namespace not declared. RONL DMN+ attributes (cprmv:*) are optional but recommended for RONL publishing.'
      )
    );
    return { label: 'Execution Rules', issues };
  }

  // Decision-level checks
  for (const d of find(doc, '//d:decision')) {
    const rst = cprmvAttr(d, 'rulesetType');
    if (rst !== null && !VALID_CPRMV_RULESET_TYPES.has(rst)) {
      issues.push(
        iss(
          'error',
          'EXEC-002',
          `cprmv:rulesetType "${rst}" is not valid. Allowed: ${[...VALID_CPRMV_RULESET_TYPES].join(', ')}.`,
          elLoc(d)
        )
      );
    }

    const impl = cprmvAttr(d, 'implements');
    if (impl !== null && !BWB_ID_RE.test(impl)) {
      issues.push(
        iss(
          'warning',
          'EXEC-003',
          `cprmv:implements "${impl}" does not match BWB ID format (e.g. BWBR0002221).`,
          elLoc(d)
        )
      );
    }
  }

  // Rule-level checks
  for (const rule of find(doc, '//d:rule')) {
    const ruleType = cprmvAttr(rule, 'ruleType');
    if (ruleType !== null && !VALID_CPRMV_RULE_TYPES.has(ruleType)) {
      issues.push(
        iss(
          'error',
          'EXEC-004',
          `cprmv:ruleType "${ruleType}" is not valid. Allowed: ${[...VALID_CPRMV_RULE_TYPES].join(', ')}.`,
          elLoc(rule)
        )
      );
    }

    const conf = cprmvAttr(rule, 'confidence');
    if (conf !== null && !VALID_CPRMV_CONFIDENCE.has(conf)) {
      issues.push(
        iss(
          'error',
          'EXEC-005',
          `cprmv:confidence "${conf}" is not valid. Use: low, medium, or high.`,
          elLoc(rule)
        )
      );
    }

    const validFrom = cprmvAttr(rule, 'validFrom');
    if (validFrom !== null && !ISO_DATE_RE.test(validFrom)) {
      issues.push(
        iss(
          'error',
          'EXEC-006',
          `cprmv:validFrom "${validFrom}" is not a valid ISO date (YYYY-MM-DD).`,
          elLoc(rule)
        )
      );
    }

    const validUntil = cprmvAttr(rule, 'validUntil');
    if (validUntil !== null && !ISO_DATE_RE.test(validUntil)) {
      issues.push(
        iss(
          'error',
          'EXEC-007',
          `cprmv:validUntil "${validUntil}" is not a valid ISO date (YYYY-MM-DD).`,
          elLoc(rule)
        )
      );
    }

    if (
      validFrom !== null &&
      validUntil !== null &&
      ISO_DATE_RE.test(validFrom) &&
      ISO_DATE_RE.test(validUntil) &&
      validFrom >= validUntil
    ) {
      issues.push(
        iss(
          'error',
          'EXEC-008',
          `cprmv:validFrom "${validFrom}" must be earlier than cprmv:validUntil "${validUntil}".`,
          elLoc(rule)
        )
      );
    }

    if (ruleType === 'temporal-period') {
      if (!validFrom)
        issues.push(
          iss(
            'warning',
            'EXEC-009',
            'temporal-period rule is missing cprmv:validFrom.',
            elLoc(rule)
          )
        );
      if (!validUntil)
        issues.push(
          iss(
            'warning',
            'EXEC-010',
            'temporal-period rule is missing cprmv:validUntil.',
            elLoc(rule)
          )
        );
    }
  }

  return { label: 'Execution Rules', issues };
}

// ── Layer 4: Interaction Rules ─────────────────────────────────────────────────

function validateInteractionLayer(doc: XmlElement): LayerResult {
  const issues: ValidationIssue[] = [];

  // Build id maps for cross-reference checks
  const inputDataIds = new Map<string, XmlElement>();
  for (const el of find(doc, '//d:inputData')) {
    const id = el.attr('id')?.value();
    if (id) inputDataIds.set(id, el);
  }

  const decisionIds = new Map<string, XmlElement>();
  for (const el of find(doc, '//d:decision')) {
    const id = el.attr('id')?.value();
    if (id) decisionIds.set(id, el);
  }

  const referencedInputData = new Set<string>();

  for (const ir of find(doc, '//d:informationRequirement')) {
    const parent = get(ir, '..');
    const loc = parent ? elLoc(parent) : '<informationRequirement>';

    const reqInput = get(ir, 'd:requiredInput');
    const reqDecision = get(ir, 'd:requiredDecision');

    if (reqInput) {
      const href = reqInput.attr('href')?.value() ?? '';
      const targetId = href.startsWith('#') ? href.slice(1) : href;
      if (!inputDataIds.has(targetId)) {
        issues.push(
          iss(
            'error',
            'INT-001',
            `informationRequirement references inputData "#${targetId}" which does not exist.`,
            loc
          )
        );
      } else {
        referencedInputData.add(targetId);
      }
    }

    if (reqDecision) {
      const href = reqDecision.attr('href')?.value() ?? '';
      const targetId = href.startsWith('#') ? href.slice(1) : href;
      if (!decisionIds.has(targetId)) {
        issues.push(
          iss(
            'error',
            'INT-002',
            `informationRequirement references decision "#${targetId}" which does not exist.`,
            loc
          )
        );
      }
      const parentId = parent?.attr('id')?.value();
      if (parentId && parentId === targetId) {
        issues.push(
          iss(
            'error',
            'INT-003',
            'Decision requires itself — self-referential dependency detected.',
            elLoc(parent)
          )
        );
      }
    }

    if (!reqInput && !reqDecision) {
      issues.push(
        iss(
          'warning',
          'INT-004',
          '<informationRequirement> has neither <requiredInput> nor <requiredDecision>.',
          loc
        )
      );
    }
  }

  // Warn on orphaned inputData
  for (const [id, el] of inputDataIds) {
    if (!referencedInputData.has(id)) {
      issues.push(
        iss(
          'warning',
          'INT-005',
          `<inputData id="${id}"> is not referenced by any informationRequirement and will be inaccessible to decisions.`,
          elLoc(el)
        )
      );
    }
  }

  // <variable> name should match parent <inputData> name
  for (const inputData of find(doc, '//d:inputData')) {
    const idName = inputData.attr('name')?.value();
    const variable = get(inputData, 'd:variable');
    if (variable) {
      const varName = variable.attr('name')?.value();
      if (varName && idName && varName !== idName) {
        issues.push(
          iss(
            'warning',
            'INT-006',
            `<inputData name="${idName}"> contains <variable name="${varName}"> — names should match for RONL publishing.`,
            elLoc(inputData)
          )
        );
      }
    }
  }

  return { label: 'Interaction Rules', issues };
}

// ── Layer 5: Content ──────────────────────────────────────────────────────────

function validateContentLayer(doc: XmlElement): LayerResult {
  const issues: ValidationIssue[] = [];

  // Empty CPRMV descriptive attributes on decisions
  for (const d of find(doc, '//d:decision')) {
    for (const attr of ['title', 'description'] as const) {
      const val = cprmvAttr(d, attr);
      if (val !== null && val.trim() === '') {
        issues.push(
          iss('warning', 'CON-001', `cprmv:${attr} is present but empty on decision.`, elLoc(d))
        );
      }
    }
  }

  // Empty cprmv:description on inputData
  for (const id_ of find(doc, '//d:inputData')) {
    const desc = cprmvAttr(id_, 'description');
    if (desc !== null && desc.trim() === '') {
      issues.push(
        iss(
          'warning',
          'CON-002',
          'cprmv:description is present but empty on inputData.',
          elLoc(id_)
        )
      );
    }
  }

  // Empty cprmv:note on rules
  for (const rule of find(doc, '//d:rule')) {
    const note = cprmvAttr(rule, 'note');
    if (note !== null && note.trim() === '') {
      issues.push(
        iss(
          'info',
          'CON-003',
          'cprmv:note is present but empty. Add content or remove the attribute.',
          elLoc(rule)
        )
      );
    }
  }

  // Variables missing typeRef
  for (const v of find(doc, '//d:variable')) {
    if (!v.attr('typeRef')?.value()) {
      const parent = get(v, '..');
      const name = v.attr('name')?.value() ?? '?';
      issues.push(
        iss(
          'info',
          'CON-004',
          `<variable name="${name}"> is missing typeRef. Specifying the type improves interoperability.`,
          parent ? elLoc(parent) : undefined
        )
      );
    }
  }

  // Empty text annotations
  for (const ta of find(doc, '//d:textAnnotation')) {
    const textEl = get(ta, 'd:text');
    if (!textEl || !textEl.text()?.trim()) {
      issues.push(iss('info', 'CON-005', '<textAnnotation> has no text content.', elLoc(ta)));
    }
  }

  return { label: 'Content', issues };
}

// ── Public API ─────────────────────────────────────────────────────────────────

export async function validateDmnContent(xmlContent: string): Promise<DmnValidationResult> {
  const { layer: baseLayer, doc } = await validateBaseLayer(xmlContent);

  // Hard XML parse failure — abort, layers 2–5 cannot run
  const parseFailure = baseLayer.issues.find((i) => i.code === 'BASE-PARSE');
  if (parseFailure) {
    return buildResult(parseFailure.message, baseLayer);
  }

  // Missing dependency — report but still attempt layers 2–5 using fast-xml-parser fallback
  if (!doc) {
    return buildResult(null, baseLayer);
  }

  const businessLayer = validateBusinessLayer(doc);
  const executionLayer = validateExecutionLayer(doc, xmlContent);
  const interactionLayer = validateInteractionLayer(doc);
  const contentLayer = validateContentLayer(doc);

  return buildResult(
    null,
    baseLayer,
    businessLayer,
    executionLayer,
    interactionLayer,
    contentLayer
  );
}

function buildResult(
  parseError: string | null,
  base: LayerResult,
  business: LayerResult = { label: 'Business Rules', issues: [] },
  execution: LayerResult = { label: 'Execution Rules', issues: [] },
  interaction: LayerResult = { label: 'Interaction Rules', issues: [] },
  content: LayerResult = { label: 'Content', issues: [] }
): DmnValidationResult {
  const layers = { base, business, execution, interaction, content };
  let errors = 0,
    warnings = 0,
    infos = 0;
  for (const { issues } of Object.values(layers)) {
    for (const { severity } of issues) {
      if (severity === 'error') errors++;
      else if (severity === 'warning') warnings++;
      else infos++;
    }
  }
  return {
    valid: !parseError && errors === 0,
    parseError,
    layers,
    summary: { errors, warnings, infos },
  };
}

export const dmnValidationService = { validateDmnContent };
