/**
 * packages/backend/src/services/dmn-validation.service.ts
 *
 * DMN validation service — five-layer syntactic validation for RONL DMN+ files.
 *
 * Layer 1 (Base DMN):    libxmljs2 XSD validation against the embedded DMN 1.3 XSD.
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
// Source of truth: packages/backend/src/xsd/ (kept for documentation/review)

const DMN13_XSD = `<?xml version="1.0" encoding="UTF-8"?>
<xs:schema
  xmlns:xs="http://www.w3.org/2001/XMLSchema"
  xmlns:dmn="https://www.omg.org/spec/DMN/20191111/MODEL/"
  targetNamespace="https://www.omg.org/spec/DMN/20191111/MODEL/"
  elementFormDefault="qualified"
  attributeFormDefault="unqualified">

  <xs:simpleType name="HitPolicy">
    <xs:restriction base="xs:string">
      <xs:enumeration value="UNIQUE"/>
      <xs:enumeration value="FIRST"/>
      <xs:enumeration value="ANY"/>
      <xs:enumeration value="COLLECT"/>
      <xs:enumeration value="RULE ORDER"/>
      <xs:enumeration value="OUTPUT ORDER"/>
      <xs:enumeration value="PRIORITY"/>
    </xs:restriction>
  </xs:simpleType>

  <xs:simpleType name="BuiltinAggregator">
    <xs:restriction base="xs:string">
      <xs:enumeration value="SUM"/><xs:enumeration value="COUNT"/>
      <xs:enumeration value="MIN"/><xs:enumeration value="MAX"/>
      <xs:enumeration value="LIST"/>
    </xs:restriction>
  </xs:simpleType>

  <xs:simpleType name="DecisionTableOrientation">
    <xs:restriction base="xs:string">
      <xs:enumeration value="Rule-as-Row"/>
      <xs:enumeration value="Rule-as-Column"/>
      <xs:enumeration value="CrossTable"/>
    </xs:restriction>
  </xs:simpleType>

  <xs:complexType name="tDMNElement" abstract="true">
    <xs:sequence>
      <xs:element name="description" type="xs:string" minOccurs="0"/>
      <xs:element name="extensionElements" type="dmn:tExtensionElements" minOccurs="0"/>
    </xs:sequence>
    <xs:attribute name="id" type="xs:ID"/>
    <xs:attribute name="label" type="xs:string"/>
    <xs:anyAttribute namespace="##other" processContents="lax"/>
  </xs:complexType>

  <xs:complexType name="tExtensionElements">
    <xs:sequence>
      <xs:any namespace="##other" processContents="lax" minOccurs="0" maxOccurs="unbounded"/>
    </xs:sequence>
  </xs:complexType>

  <xs:complexType name="tNamedElement" abstract="true">
    <xs:complexContent>
      <xs:extension base="dmn:tDMNElement">
        <xs:attribute name="name" type="xs:string" use="required"/>
      </xs:extension>
    </xs:complexContent>
  </xs:complexType>

  <xs:element name="definitions" type="dmn:tDefinitions"/>
  <xs:complexType name="tDefinitions">
    <xs:complexContent>
      <xs:extension base="dmn:tNamedElement">
        <xs:sequence>
          <xs:element name="import"             type="dmn:tImport"           minOccurs="0" maxOccurs="unbounded"/>
          <xs:element name="itemDefinition"     type="dmn:tItemDefinition"   minOccurs="0" maxOccurs="unbounded"/>
          <xs:element ref="dmn:decision"                                     minOccurs="0" maxOccurs="unbounded"/>
          <xs:element ref="dmn:inputData"                                    minOccurs="0" maxOccurs="unbounded"/>
          <xs:element ref="dmn:businessKnowledgeModel"                       minOccurs="0" maxOccurs="unbounded"/>
          <xs:element ref="dmn:knowledgeSource"                              minOccurs="0" maxOccurs="unbounded"/>
          <xs:element ref="dmn:textAnnotation"                               minOccurs="0" maxOccurs="unbounded"/>
          <xs:element ref="dmn:association"                                  minOccurs="0" maxOccurs="unbounded"/>
          <xs:any namespace="##other" processContents="lax" minOccurs="0" maxOccurs="unbounded"/>
        </xs:sequence>
        <xs:attribute name="namespace"           type="xs:anyURI" use="required"/>
        <xs:attribute name="exporter"            type="xs:string"/>
        <xs:attribute name="exporterVersion"     type="xs:string"/>
        <xs:attribute name="expressionLanguage"  type="xs:anyURI"/>
        <xs:attribute name="typeLanguage"        type="xs:anyURI"/>
      </xs:extension>
    </xs:complexContent>
  </xs:complexType>

  <xs:complexType name="tDRGElement" abstract="true">
    <xs:complexContent><xs:extension base="dmn:tNamedElement"/></xs:complexContent>
  </xs:complexType>

  <xs:element name="decision" type="dmn:tDecision"/>
  <xs:complexType name="tDecision">
    <xs:complexContent>
      <xs:extension base="dmn:tDRGElement">
        <xs:sequence>
          <xs:element name="question"            type="xs:string"                      minOccurs="0"/>
          <xs:element name="allowedAnswers"      type="xs:string"                      minOccurs="0"/>
          <xs:element name="variable"            type="dmn:tInformationItem"           minOccurs="0"/>
          <xs:element name="informationRequirement" type="dmn:tInformationRequirement" minOccurs="0" maxOccurs="unbounded"/>
          <xs:element name="knowledgeRequirement"   type="dmn:tKnowledgeRequirement"   minOccurs="0" maxOccurs="unbounded"/>
          <xs:element name="authorityRequirement"   type="dmn:tAuthorityRequirement"   minOccurs="0" maxOccurs="unbounded"/>
          <xs:element name="decisionTable"       type="dmn:tDecisionTable"             minOccurs="0"/>
          <xs:element name="literalExpression"   type="dmn:tLiteralExpression"         minOccurs="0"/>
          <xs:element name="context"             type="dmn:tContext"                   minOccurs="0"/>
          <xs:element name="invocation"          type="dmn:tInvocation"                minOccurs="0"/>
          <xs:element name="relation"            type="dmn:tRelation"                  minOccurs="0"/>
          <xs:element name="list"                type="dmn:tList"                      minOccurs="0"/>
        </xs:sequence>
      </xs:extension>
    </xs:complexContent>
  </xs:complexType>

  <xs:element name="inputData" type="dmn:tInputData"/>
  <xs:complexType name="tInputData">
    <xs:complexContent>
      <xs:extension base="dmn:tDRGElement">
        <xs:sequence>
          <xs:element name="variable" type="dmn:tInformationItem" minOccurs="0"/>
        </xs:sequence>
      </xs:extension>
    </xs:complexContent>
  </xs:complexType>

  <xs:element name="businessKnowledgeModel" type="dmn:tBusinessKnowledgeModel"/>
  <xs:complexType name="tBusinessKnowledgeModel">
    <xs:complexContent>
      <xs:extension base="dmn:tDRGElement">
        <xs:sequence>
          <xs:element name="variable"             type="dmn:tInformationItem"       minOccurs="0"/>
          <xs:element name="knowledgeRequirement" type="dmn:tKnowledgeRequirement"  minOccurs="0" maxOccurs="unbounded"/>
          <xs:element name="authorityRequirement" type="dmn:tAuthorityRequirement"  minOccurs="0" maxOccurs="unbounded"/>
        </xs:sequence>
      </xs:extension>
    </xs:complexContent>
  </xs:complexType>

  <xs:element name="knowledgeSource" type="dmn:tKnowledgeSource"/>
  <xs:complexType name="tKnowledgeSource">
    <xs:complexContent>
      <xs:extension base="dmn:tDRGElement">
        <xs:sequence>
          <xs:element name="authorityRequirement" type="dmn:tAuthorityRequirement" minOccurs="0" maxOccurs="unbounded"/>
        </xs:sequence>
        <xs:attribute name="locationURI" type="xs:anyURI"/>
      </xs:extension>
    </xs:complexContent>
  </xs:complexType>

  <xs:complexType name="tInformationRequirement">
    <xs:complexContent>
      <xs:extension base="dmn:tDMNElement">
        <xs:sequence>
          <xs:element name="requiredDecision" type="dmn:tDMNElementReference" minOccurs="0"/>
          <xs:element name="requiredInput"    type="dmn:tDMNElementReference" minOccurs="0"/>
        </xs:sequence>
      </xs:extension>
    </xs:complexContent>
  </xs:complexType>

  <xs:complexType name="tKnowledgeRequirement">
    <xs:complexContent>
      <xs:extension base="dmn:tDMNElement">
        <xs:sequence>
          <xs:element name="requiredKnowledge" type="dmn:tDMNElementReference"/>
        </xs:sequence>
      </xs:extension>
    </xs:complexContent>
  </xs:complexType>

  <xs:complexType name="tAuthorityRequirement">
    <xs:complexContent>
      <xs:extension base="dmn:tDMNElement">
        <xs:sequence>
          <xs:element name="requiredDecision"  type="dmn:tDMNElementReference" minOccurs="0"/>
          <xs:element name="requiredInput"     type="dmn:tDMNElementReference" minOccurs="0"/>
          <xs:element name="requiredAuthority" type="dmn:tDMNElementReference" minOccurs="0"/>
        </xs:sequence>
      </xs:extension>
    </xs:complexContent>
  </xs:complexType>

  <xs:complexType name="tExpression" abstract="true">
    <xs:complexContent>
      <xs:extension base="dmn:tDMNElement">
        <xs:attribute name="typeRef" type="xs:QName"/>
      </xs:extension>
    </xs:complexContent>
  </xs:complexType>

  <xs:complexType name="tLiteralExpression">
    <xs:complexContent>
      <xs:extension base="dmn:tExpression">
        <xs:sequence>
          <xs:element name="text" type="xs:string" minOccurs="0"/>
        </xs:sequence>
        <xs:attribute name="expressionLanguage" type="xs:anyURI"/>
      </xs:extension>
    </xs:complexContent>
  </xs:complexType>

  <xs:complexType name="tUnaryTests">
    <xs:complexContent>
      <xs:extension base="dmn:tDMNElement">
        <xs:sequence>
          <xs:element name="text" type="xs:string" minOccurs="0"/>
        </xs:sequence>
        <xs:attribute name="expressionLanguage" type="xs:anyURI"/>
      </xs:extension>
    </xs:complexContent>
  </xs:complexType>

  <xs:complexType name="tDecisionTable">
    <xs:complexContent>
      <xs:extension base="dmn:tExpression">
        <xs:sequence>
          <xs:element name="input"      type="dmn:tInputClause"            minOccurs="0" maxOccurs="unbounded"/>
          <xs:element name="output"     type="dmn:tOutputClause"           minOccurs="1" maxOccurs="unbounded"/>
          <xs:element name="annotation" type="dmn:tRuleAnnotationClause"   minOccurs="0" maxOccurs="unbounded"/>
          <xs:element name="rule"       type="dmn:tDecisionRule"           minOccurs="0" maxOccurs="unbounded"/>
        </xs:sequence>
        <xs:attribute name="hitPolicy"            type="dmn:HitPolicy"                 default="UNIQUE"/>
        <xs:attribute name="aggregation"          type="dmn:BuiltinAggregator"/>
        <xs:attribute name="preferredOrientation" type="dmn:DecisionTableOrientation"/>
        <xs:attribute name="outputLabel"          type="xs:string"/>
      </xs:extension>
    </xs:complexContent>
  </xs:complexType>

  <xs:complexType name="tInputClause">
    <xs:complexContent>
      <xs:extension base="dmn:tDMNElement">
        <xs:sequence>
          <xs:element name="inputExpression" type="dmn:tLiteralExpression"/>
          <xs:element name="inputValues"     type="dmn:tUnaryTests"        minOccurs="0"/>
        </xs:sequence>
        <xs:attribute name="label" type="xs:string"/>
      </xs:extension>
    </xs:complexContent>
  </xs:complexType>

  <xs:complexType name="tOutputClause">
    <xs:complexContent>
      <xs:extension base="dmn:tDMNElement">
        <xs:sequence>
          <xs:element name="outputValues"       type="dmn:tUnaryTests"         minOccurs="0"/>
          <xs:element name="defaultOutputEntry" type="dmn:tLiteralExpression"  minOccurs="0"/>
        </xs:sequence>
        <xs:attribute name="name"    type="xs:string"/>
        <xs:attribute name="label"   type="xs:string"/>
        <xs:attribute name="typeRef" type="xs:QName"/>
      </xs:extension>
    </xs:complexContent>
  </xs:complexType>

  <xs:complexType name="tRuleAnnotationClause">
    <xs:complexContent>
      <xs:extension base="dmn:tDMNElement">
        <xs:attribute name="name" type="xs:string" use="required"/>
      </xs:extension>
    </xs:complexContent>
  </xs:complexType>

  <xs:complexType name="tDecisionRule">
    <xs:complexContent>
      <xs:extension base="dmn:tDMNElement">
        <xs:sequence>
          <xs:element name="inputEntry"      type="dmn:tUnaryTests"        minOccurs="0" maxOccurs="unbounded"/>
          <xs:element name="outputEntry"     type="dmn:tLiteralExpression" minOccurs="1" maxOccurs="unbounded"/>
          <xs:element name="annotationEntry" type="dmn:tRuleAnnotation"    minOccurs="0" maxOccurs="unbounded"/>
        </xs:sequence>
      </xs:extension>
    </xs:complexContent>
  </xs:complexType>

  <xs:complexType name="tRuleAnnotation">
    <xs:complexContent>
      <xs:extension base="dmn:tDMNElement">
        <xs:sequence>
          <xs:element name="text" type="xs:string" minOccurs="0"/>
        </xs:sequence>
      </xs:extension>
    </xs:complexContent>
  </xs:complexType>

  <xs:complexType name="tContext">
    <xs:complexContent>
      <xs:extension base="dmn:tExpression">
        <xs:sequence>
          <xs:element name="contextEntry" type="dmn:tContextEntry" minOccurs="0" maxOccurs="unbounded"/>
        </xs:sequence>
      </xs:extension>
    </xs:complexContent>
  </xs:complexType>

  <xs:complexType name="tContextEntry">
    <xs:complexContent>
      <xs:extension base="dmn:tDMNElement">
        <xs:sequence>
          <xs:element name="variable"          type="dmn:tInformationItem"   minOccurs="0"/>
          <xs:element name="literalExpression" type="dmn:tLiteralExpression" minOccurs="0"/>
          <xs:element name="context"           type="dmn:tContext"           minOccurs="0"/>
        </xs:sequence>
      </xs:extension>
    </xs:complexContent>
  </xs:complexType>

  <xs:complexType name="tInvocation">
    <xs:complexContent>
      <xs:extension base="dmn:tExpression">
        <xs:sequence>
          <xs:element name="calledElement" type="dmn:tDMNElementReference" minOccurs="0"/>
          <xs:element name="binding"       type="dmn:tBinding"             minOccurs="0" maxOccurs="unbounded"/>
        </xs:sequence>
      </xs:extension>
    </xs:complexContent>
  </xs:complexType>

  <xs:complexType name="tBinding">
    <xs:complexContent>
      <xs:extension base="dmn:tDMNElement">
        <xs:sequence>
          <xs:element name="parameter"         type="dmn:tInformationItem"/>
          <xs:element name="literalExpression" type="dmn:tLiteralExpression" minOccurs="0"/>
        </xs:sequence>
      </xs:extension>
    </xs:complexContent>
  </xs:complexType>

  <xs:complexType name="tRelation">
    <xs:complexContent>
      <xs:extension base="dmn:tExpression">
        <xs:sequence>
          <xs:element name="column" type="dmn:tInformationItem" minOccurs="0" maxOccurs="unbounded"/>
          <xs:element name="row"    type="dmn:tList"            minOccurs="0" maxOccurs="unbounded"/>
        </xs:sequence>
      </xs:extension>
    </xs:complexContent>
  </xs:complexType>

  <xs:complexType name="tList">
    <xs:complexContent>
      <xs:extension base="dmn:tExpression">
        <xs:sequence>
          <xs:element name="element" type="dmn:tExpression" minOccurs="0" maxOccurs="unbounded"/>
        </xs:sequence>
      </xs:extension>
    </xs:complexContent>
  </xs:complexType>

  <xs:complexType name="tInformationItem">
    <xs:complexContent>
      <xs:extension base="dmn:tNamedElement">
        <xs:attribute name="typeRef" type="xs:QName"/>
      </xs:extension>
    </xs:complexContent>
  </xs:complexType>

  <xs:complexType name="tArtifact" abstract="true">
    <xs:complexContent><xs:extension base="dmn:tDMNElement"/></xs:complexContent>
  </xs:complexType>

  <xs:element name="textAnnotation" type="dmn:tTextAnnotation"/>
  <xs:complexType name="tTextAnnotation">
    <xs:complexContent>
      <xs:extension base="dmn:tArtifact">
        <xs:sequence>
          <xs:element name="text" type="xs:string" minOccurs="0"/>
        </xs:sequence>
        <xs:attribute name="textFormat" type="xs:string"/>
      </xs:extension>
    </xs:complexContent>
  </xs:complexType>

  <xs:element name="association" type="dmn:tAssociation"/>
  <xs:complexType name="tAssociation">
    <xs:complexContent>
      <xs:extension base="dmn:tArtifact">
        <xs:sequence>
          <xs:element name="sourceRef" type="dmn:tDMNElementReference"/>
          <xs:element name="targetRef" type="dmn:tDMNElementReference"/>
        </xs:sequence>
        <xs:attribute name="associationDirection" type="xs:string"/>
      </xs:extension>
    </xs:complexContent>
  </xs:complexType>

  <xs:complexType name="tImport">
    <xs:complexContent>
      <xs:extension base="dmn:tDMNElement">
        <xs:attribute name="namespace"   type="xs:anyURI" use="required"/>
        <xs:attribute name="locationURI" type="xs:anyURI"/>
        <xs:attribute name="importType"  type="xs:anyURI" use="required"/>
      </xs:extension>
    </xs:complexContent>
  </xs:complexType>

  <xs:complexType name="tItemDefinition">
    <xs:complexContent>
      <xs:extension base="dmn:tNamedElement">
        <xs:sequence>
          <xs:element name="typeRef"       type="xs:QName"            minOccurs="0"/>
          <xs:element name="allowedValues" type="dmn:tUnaryTests"     minOccurs="0"/>
          <xs:element name="itemComponent" type="dmn:tItemDefinition" minOccurs="0" maxOccurs="unbounded"/>
        </xs:sequence>
        <xs:attribute name="isCollection" type="xs:boolean" default="false"/>
        <xs:attribute name="typeLanguage" type="xs:anyURI"/>
      </xs:extension>
    </xs:complexContent>
  </xs:complexType>

  <xs:complexType name="tDMNElementReference">
    <xs:attribute name="href" type="xs:anyURI" use="required"/>
  </xs:complexType>

</xs:schema>`;

// ── Constants ─────────────────────────────────────────────────────────────────

const DMN_NS = 'https://www.omg.org/spec/DMN/20191111/MODEL/';
const CPRMV_NS = 'https://cprmv.open-regels.nl/0.3.0/';
const NS = { d: DMN_NS };

const VALID_HIT_POLICIES = new Set([
  'UNIQUE', 'FIRST', 'ANY', 'COLLECT', 'RULE ORDER', 'OUTPUT ORDER', 'PRIORITY',
]);

const VALID_TYPE_REFS = new Set([
  'string', 'boolean', 'integer', 'long', 'double', 'number', 'date',
  'Any', 'String', 'Boolean', 'Integer', 'Long', 'Double', 'Date', 'Number',
]);

const VALID_CPRMV_RULE_TYPES = new Set([
  'temporal-period', 'conditional', 'derivation', 'constraint',
  'decision-rule', 'default',
]);

const VALID_CPRMV_CONFIDENCE = new Set(['low', 'medium', 'high']);

const VALID_CPRMV_RULESET_TYPES = new Set([
  'decision-table', 'conditional-calculation', 'constraint-table', 'derivation-table',
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
  column?: number,
): ValidationIssue {
  return {
    severity, code, message,
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

// ── Layer 1: Base DMN XSD ─────────────────────────────────────────────────────

async function validateBaseLayer(xmlContent: string): Promise<{ layer: LayerResult; doc: XmlElement | null }> {
  const issues: ValidationIssue[] = [];

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const libxmljs = require('libxmljs2');

    const xsdDoc = libxmljs.parseXml(DMN13_XSD);
    const xmlDoc = libxmljs.parseXml(xmlContent, { nonet: true, recover: false });

    const valid = xmlDoc.validate(xsdDoc);
    if (!valid) {
      for (const err of xmlDoc.validationErrors as Array<{ message?: string; path?: string; line?: number; column?: number }>) {
        issues.push(iss(
          'error',
          'BASE-XSD',
          err.message?.trim() ?? 'XSD validation error',
          err.path ?? undefined,
          err.line ?? undefined,
          err.column ?? undefined,
        ));
      }
    }

    return { layer: { label: 'Base DMN', issues }, doc: xmlDoc };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);

    // libxmljs2 throws on malformed XML
    if (
      msg.includes('XMLSyntaxError') ||
      msg.includes('Failed to parse') ||
      msg.toLowerCase().includes('parse error')
    ) {
      return {
        layer: { label: 'Base DMN', issues: [iss('error', 'BASE-PARSE', `XML parsing failed: ${msg}`)] },
        doc: null,
      };
    }

    if (msg.includes("Cannot find module 'libxmljs2'")) {
      logger.error('[DMN Validation] libxmljs2 not installed');
      return {
        layer: {
          label: 'Base DMN',
          issues: [iss('error', 'BASE-DEPS', 'libxmljs2 is not installed. Run: npm install libxmljs2 inside packages/backend.')],
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
      issues.push(iss('error', 'BIZ-001',
        `hitPolicy "${hp}" is not valid. Allowed: ${[...VALID_HIT_POLICIES].join(', ')}.`,
        decision ? elLoc(decision) : undefined));
    }
  }

  // inputExpression typeRef should be present and known
  for (const ie of find(doc, '//d:inputExpression')) {
    const decision = get(ie, 'ancestor::d:decision');
    const loc = decision ? elLoc(decision) : undefined;
    const tr = ie.attr('typeRef')?.value();
    if (!tr) {
      issues.push(iss('warning', 'BIZ-002', '<inputExpression> is missing typeRef. Declare the type for interoperability.', loc));
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
      issues.push(iss('warning', 'BIZ-005', `Output typeRef "${tr}" is not a known DMN FEEL type.`, loc));
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
        issues.push(iss('error', 'BIZ-006',
          `Rule has ${inEntries} inputEntry element(s) but the table has ${inputCount} input column(s).`,
          `${dtLoc} > ${elLoc(rule)}`));
      }
      if (outEntries !== outputCount) {
        issues.push(iss('error', 'BIZ-007',
          `Rule has ${outEntries} outputEntry element(s) but the table has ${outputCount} output column(s).`,
          `${dtLoc} > ${elLoc(rule)}`));
      }
    }
  }

  return { label: 'Business Rules', issues };
}

// ── Layer 3: Execution Rules (CPRMV) ──────────────────────────────────────────

function validateExecutionLayer(doc: XmlElement, xmlContent: string): LayerResult {
  const issues: ValidationIssue[] = [];

  const cprmvDeclared = xmlContent.includes('cprmv.open-regels.nl');

  if (!cprmvDeclared) {
    issues.push(iss('info', 'EXEC-001',
      'CPRMV namespace not declared. RONL DMN+ attributes (cprmv:*) are optional but recommended for RONL publishing.'));
    return { label: 'Execution Rules', issues };
  }

  // Decision-level checks
  for (const d of find(doc, '//d:decision')) {
    const rst = cprmvAttr(d, 'rulesetType');
    if (rst !== null && !VALID_CPRMV_RULESET_TYPES.has(rst)) {
      issues.push(iss('error', 'EXEC-002',
        `cprmv:rulesetType "${rst}" is not valid. Allowed: ${[...VALID_CPRMV_RULESET_TYPES].join(', ')}.`,
        elLoc(d)));
    }

    const impl = cprmvAttr(d, 'implements');
    if (impl !== null && !BWB_ID_RE.test(impl)) {
      issues.push(iss('warning', 'EXEC-003',
        `cprmv:implements "${impl}" does not match BWB ID format (e.g. BWBR0002221).`,
        elLoc(d)));
    }
  }

  // Rule-level checks
  for (const rule of find(doc, '//d:rule')) {
    const ruleType = cprmvAttr(rule, 'ruleType');
    if (ruleType !== null && !VALID_CPRMV_RULE_TYPES.has(ruleType)) {
      issues.push(iss('error', 'EXEC-004',
        `cprmv:ruleType "${ruleType}" is not valid. Allowed: ${[...VALID_CPRMV_RULE_TYPES].join(', ')}.`,
        elLoc(rule)));
    }

    const conf = cprmvAttr(rule, 'confidence');
    if (conf !== null && !VALID_CPRMV_CONFIDENCE.has(conf)) {
      issues.push(iss('error', 'EXEC-005',
        `cprmv:confidence "${conf}" is not valid. Use: low, medium, or high.`,
        elLoc(rule)));
    }

    const validFrom = cprmvAttr(rule, 'validFrom');
    if (validFrom !== null && !ISO_DATE_RE.test(validFrom)) {
      issues.push(iss('error', 'EXEC-006',
        `cprmv:validFrom "${validFrom}" is not a valid ISO date (YYYY-MM-DD).`,
        elLoc(rule)));
    }

    const validUntil = cprmvAttr(rule, 'validUntil');
    if (validUntil !== null && !ISO_DATE_RE.test(validUntil)) {
      issues.push(iss('error', 'EXEC-007',
        `cprmv:validUntil "${validUntil}" is not a valid ISO date (YYYY-MM-DD).`,
        elLoc(rule)));
    }

    if (
      validFrom !== null && validUntil !== null &&
      ISO_DATE_RE.test(validFrom) && ISO_DATE_RE.test(validUntil) &&
      validFrom >= validUntil
    ) {
      issues.push(iss('error', 'EXEC-008',
        `cprmv:validFrom "${validFrom}" must be earlier than cprmv:validUntil "${validUntil}".`,
        elLoc(rule)));
    }

    if (ruleType === 'temporal-period') {
      if (!validFrom) issues.push(iss('warning', 'EXEC-009', 'temporal-period rule is missing cprmv:validFrom.', elLoc(rule)));
      if (!validUntil) issues.push(iss('warning', 'EXEC-010', 'temporal-period rule is missing cprmv:validUntil.', elLoc(rule)));
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
        issues.push(iss('error', 'INT-001',
          `informationRequirement references inputData "#${targetId}" which does not exist.`, loc));
      } else {
        referencedInputData.add(targetId);
      }
    }

    if (reqDecision) {
      const href = reqDecision.attr('href')?.value() ?? '';
      const targetId = href.startsWith('#') ? href.slice(1) : href;
      if (!decisionIds.has(targetId)) {
        issues.push(iss('error', 'INT-002',
          `informationRequirement references decision "#${targetId}" which does not exist.`, loc));
      }
      const parentId = parent?.attr('id')?.value();
      if (parentId && parentId === targetId) {
        issues.push(iss('error', 'INT-003',
          'Decision requires itself — self-referential dependency detected.', elLoc(parent)));
      }
    }

    if (!reqInput && !reqDecision) {
      issues.push(iss('warning', 'INT-004',
        '<informationRequirement> has neither <requiredInput> nor <requiredDecision>.', loc));
    }
  }

  // Warn on orphaned inputData
  for (const [id, el] of inputDataIds) {
    if (!referencedInputData.has(id)) {
      issues.push(iss('warning', 'INT-005',
        `<inputData id="${id}"> is not referenced by any informationRequirement and will be inaccessible to decisions.`,
        elLoc(el)));
    }
  }

  // <variable> name should match parent <inputData> name
  for (const inputData of find(doc, '//d:inputData')) {
    const idName = inputData.attr('name')?.value();
    const variable = get(inputData, 'd:variable');
    if (variable) {
      const varName = variable.attr('name')?.value();
      if (varName && idName && varName !== idName) {
        issues.push(iss('warning', 'INT-006',
          `<inputData name="${idName}"> contains <variable name="${varName}"> — names should match for RONL publishing.`,
          elLoc(inputData)));
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
        issues.push(iss('warning', 'CON-001',
          `cprmv:${attr} is present but empty on decision.`, elLoc(d)));
      }
    }
  }

  // Empty cprmv:description on inputData
  for (const id_ of find(doc, '//d:inputData')) {
    const desc = cprmvAttr(id_, 'description');
    if (desc !== null && desc.trim() === '') {
      issues.push(iss('warning', 'CON-002',
        'cprmv:description is present but empty on inputData.', elLoc(id_)));
    }
  }

  // Empty cprmv:note on rules
  for (const rule of find(doc, '//d:rule')) {
    const note = cprmvAttr(rule, 'note');
    if (note !== null && note.trim() === '') {
      issues.push(iss('info', 'CON-003',
        'cprmv:note is present but empty. Add content or remove the attribute.', elLoc(rule)));
    }
  }

  // Variables missing typeRef
  for (const v of find(doc, '//d:variable')) {
    if (!v.attr('typeRef')?.value()) {
      const parent = get(v, '..');
      const name = v.attr('name')?.value() ?? '?';
      issues.push(iss('info', 'CON-004',
        `<variable name="${name}"> is missing typeRef. Specifying the type improves interoperability.`,
        parent ? elLoc(parent) : undefined));
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

  return buildResult(null, baseLayer, businessLayer, executionLayer, interactionLayer, contentLayer);
}

function buildResult(
  parseError: string | null,
  base: LayerResult,
  business: LayerResult = { label: 'Business Rules', issues: [] },
  execution: LayerResult = { label: 'Execution Rules', issues: [] },
  interaction: LayerResult = { label: 'Interaction Rules', issues: [] },
  content: LayerResult = { label: 'Content', issues: [] },
): DmnValidationResult {
  const layers = { base, business, execution, interaction, content };
  let errors = 0, warnings = 0, infos = 0;
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
