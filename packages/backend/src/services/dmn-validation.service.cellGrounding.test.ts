// Tests for Layer 3 (Execution) cell-level grounding checks -- EXEC-011,
// EXEC-012, EXEC-013 -- added alongside ttl-editor's
// cprmv-cell-level-linking-prototype.md implementation. Also covers the
// CPRMV_NAMESPACES fix: this validator previously recognized only the legacy
// 0.3.0 namespace, so a DMN using the current 0.4.1 namespace (what
// ttlGenerator.js in ttl-editor actually emits) would have its entire
// Execution layer silently short-circuit with just an EXEC-001 info.

import { validateDmnContent } from './dmn-validation.service';

const wrap041 = (rulesXml: string) => `<?xml version="1.0"?>
<dmn:definitions xmlns:dmn="https://www.omg.org/spec/DMN/20191111/MODEL/"
                  xmlns:cprmv="https://standaarden.open-regels.nl/standards/cprmv/0.4.1#"
                  xmlns:dct="http://purl.org/dc/terms/"
                  id="defs1" name="Test" namespace="http://example.com">
  <dmn:decision id="d1" name="d1">
    <dmn:decisionTable id="t1" hitPolicy="FIRST">
      <dmn:input id="in1"><dmn:inputExpression typeRef="boolean"><dmn:text>x</dmn:text></dmn:inputExpression></dmn:input>
      <dmn:output id="out1" typeRef="boolean" />
      ${rulesXml}
    </dmn:decisionTable>
  </dmn:decision>
</dmn:definitions>`;

function findIssues(result: Awaited<ReturnType<typeof validateDmnContent>>, code: string) {
  return result.layers.execution.issues.filter((i) => i.code === code);
}

describe('CPRMV namespace recognition (0.3.0 legacy + 0.4.1 current)', () => {
  test('a 0.4.1-namespaced DMN is recognized as declaring CPRMV (no longer stuck on EXEC-001)', async () => {
    const xml = wrap041(`
      <dmn:rule id="r1">
        <dmn:inputEntry id="ie1"><dmn:text>true</dmn:text></dmn:inputEntry>
        <dmn:outputEntry id="oe1"><dmn:text>true</dmn:text></dmn:outputEntry>
      </dmn:rule>`);
    const result = await validateDmnContent(xml);
    expect(findIssues(result, 'EXEC-001')).toHaveLength(0);
  });

  test('a 0.3.0-namespaced DMN (legacy) is still recognized (backward compatible)', async () => {
    const xml = `<?xml version="1.0"?>
      <dmn:definitions xmlns:dmn="https://www.omg.org/spec/DMN/20191111/MODEL/"
                        xmlns:cprmv="https://cprmv.open-regels.nl/0.3.0/"
                        id="defs1" name="Test" namespace="http://example.com">
        <dmn:decision id="d1" name="d1">
          <dmn:decisionTable id="t1" hitPolicy="FIRST">
            <dmn:rule id="r1" cprmv:confidence="high">
              <dmn:inputEntry id="ie1"><dmn:text>true</dmn:text></dmn:inputEntry>
              <dmn:outputEntry id="oe1"><dmn:text>true</dmn:text></dmn:outputEntry>
            </dmn:rule>
          </dmn:decisionTable>
        </dmn:decision>
      </dmn:definitions>`;
    const result = await validateDmnContent(xml);
    expect(findIssues(result, 'EXEC-001')).toHaveLength(0);
  });
});

describe('EXEC-011: dct:source format on grounded cells', () => {
  test('a well-formed UUID passes', async () => {
    const xml = wrap041(`
      <dmn:rule id="r1">
        <dmn:inputEntry id="ie1" dct:source="61d1181d-a7e6-4da1-a121-89ca30fcb7b0">
          <dmn:text>true</dmn:text>
        </dmn:inputEntry>
        <dmn:outputEntry id="oe1"><dmn:text>true</dmn:text></dmn:outputEntry>
      </dmn:rule>`);
    const result = await validateDmnContent(xml);
    expect(findIssues(result, 'EXEC-011')).toHaveLength(0);
  });

  test('an already-resolved pna-web.com URL passes', async () => {
    const xml = wrap041(`
      <dmn:rule id="r1">
        <dmn:inputEntry id="ie1" dct:source="https://hva.pna-web.com/hva/?type=APT&amp;id=61d1181d">
          <dmn:text>true</dmn:text>
        </dmn:inputEntry>
        <dmn:outputEntry id="oe1"><dmn:text>true</dmn:text></dmn:outputEntry>
      </dmn:rule>`);
    const result = await validateDmnContent(xml);
    expect(findIssues(result, 'EXEC-011')).toHaveLength(0);
  });

  test('a malformed dct:source is flagged', async () => {
    const xml = wrap041(`
      <dmn:rule id="r1">
        <dmn:inputEntry id="ie1" dct:source="not-a-uuid-or-url">
          <dmn:text>true</dmn:text>
        </dmn:inputEntry>
        <dmn:outputEntry id="oe1"><dmn:text>true</dmn:text></dmn:outputEntry>
      </dmn:rule>`);
    const result = await validateDmnContent(xml);
    const issues = findIssues(result, 'EXEC-011');
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('warning');
    expect(issues[0].message).toContain('not-a-uuid-or-url');
  });
});

describe('EXEC-012: cprmv:isBasedOn format on grounded cells', () => {
  test('a JCI citation string passes', async () => {
    const xml = wrap041(`
      <dmn:rule id="r1">
        <dmn:inputEntry id="ie1" cprmv:isBasedOn="jci1.3:c:BWBR0015703&amp;hoofdstuk=4&amp;artikel=36">
          <dmn:text>true</dmn:text>
        </dmn:inputEntry>
        <dmn:outputEntry id="oe1"><dmn:text>true</dmn:text></dmn:outputEntry>
      </dmn:rule>`);
    const result = await validateDmnContent(xml);
    expect(findIssues(result, 'EXEC-012')).toHaveLength(0);
  });

  test('a plain citation URL passes', async () => {
    const xml = wrap041(`
      <dmn:rule id="r1">
        <dmn:inputEntry id="ie1" cprmv:isBasedOn="https://lokaleregelgeving.overheid.nl/CVDR645454/12">
          <dmn:text>true</dmn:text>
        </dmn:inputEntry>
        <dmn:outputEntry id="oe1"><dmn:text>true</dmn:text></dmn:outputEntry>
      </dmn:rule>`);
    const result = await validateDmnContent(xml);
    expect(findIssues(result, 'EXEC-012')).toHaveLength(0);
  });

  test('a value matching neither grammar is flagged', async () => {
    const xml = wrap041(`
      <dmn:rule id="r1">
        <dmn:inputEntry id="ie1" cprmv:isBasedOn="garbage-citation">
          <dmn:text>true</dmn:text>
        </dmn:inputEntry>
        <dmn:outputEntry id="oe1"><dmn:text>true</dmn:text></dmn:outputEntry>
      </dmn:rule>`);
    const result = await validateDmnContent(xml);
    const issues = findIssues(result, 'EXEC-012');
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('warning');
  });

  test('a numbered (compound-cell) grounding is checked and labeled', async () => {
    const xml = wrap041(`
      <dmn:rule id="r1">
        <dmn:inputEntry id="ie1"
                        dct:source1="concept-A"
                        cprmv:isBasedOn1="garbage-citation"
                        dct:source2="61d1181d-a7e6-4da1-a121-89ca30fcb7b0">
          <dmn:text>true</dmn:text>
        </dmn:inputEntry>
        <dmn:outputEntry id="oe1"><dmn:text>true</dmn:text></dmn:outputEntry>
      </dmn:rule>`);
    const result = await validateDmnContent(xml);
    const isBasedOnIssues = findIssues(result, 'EXEC-012');
    expect(isBasedOnIssues).toHaveLength(1);
    expect(isBasedOnIssues[0].message).toContain('(grounding 1)');
    // dct:source2 ("concept-A" bare non-UUID id under a numbered slot) is not
    // itself a UUID or pna-web URL either, so it's flagged too.
    const sourceIssues = findIssues(result, 'EXEC-011');
    expect(sourceIssues.length).toBeGreaterThanOrEqual(1);
  });
});

describe('EXEC-013: cprmv:extends format (previously never checked)', () => {
  test('a well-formed BWB-style citation passes', async () => {
    const xml = wrap041(`
      <dmn:rule id="r1" cprmv:extends="https://wetten.overheid.nl/BWBR0002221/Artikel_7a">
        <dmn:inputEntry id="ie1"><dmn:text>true</dmn:text></dmn:inputEntry>
        <dmn:outputEntry id="oe1"><dmn:text>true</dmn:text></dmn:outputEntry>
      </dmn:rule>`);
    const result = await validateDmnContent(xml);
    expect(findIssues(result, 'EXEC-013')).toHaveLength(0);
  });

  test('a malformed cprmv:extends is flagged', async () => {
    const xml = wrap041(`
      <dmn:rule id="r1" cprmv:extends="not a citation at all">
        <dmn:inputEntry id="ie1"><dmn:text>true</dmn:text></dmn:inputEntry>
        <dmn:outputEntry id="oe1"><dmn:text>true</dmn:text></dmn:outputEntry>
      </dmn:rule>`);
    const result = await validateDmnContent(xml);
    expect(findIssues(result, 'EXEC-013')).toHaveLength(1);
  });
});

describe('cells with no grounding attributes at all', () => {
  test('produce no EXEC-011/012 issues', async () => {
    const xml = wrap041(`
      <dmn:rule id="r1">
        <dmn:inputEntry id="ie1"><dmn:text>-</dmn:text></dmn:inputEntry>
        <dmn:outputEntry id="oe1"><dmn:text>true</dmn:text></dmn:outputEntry>
      </dmn:rule>`);
    const result = await validateDmnContent(xml);
    expect(findIssues(result, 'EXEC-011')).toHaveLength(0);
    expect(findIssues(result, 'EXEC-012')).toHaveLength(0);
  });
});
