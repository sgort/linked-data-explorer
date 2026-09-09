// Regression test for an INT-007 false positive: "years"/"months" leaking
// through as unresolved-variable references from the "years and months
// duration(...)" built-in function's own name, distinct from the already-
// handled ".years"/".months" property-access case on its result.

import { validateDmnContent } from './dmn-validation.service';

function wrap(inputExpressionText: string) {
  return `<?xml version="1.0"?>
<dmn:definitions xmlns:dmn="https://www.omg.org/spec/DMN/20191111/MODEL/"
                  id="defs1" name="Test" namespace="http://example.com">
  <dmn:inputData id="in1" name="npGeboortedatum">
    <dmn:variable id="v1" name="npGeboortedatum" typeRef="date" />
  </dmn:inputData>
  <dmn:inputData id="in2" name="peildatum">
    <dmn:variable id="v2" name="peildatum" typeRef="date" />
  </dmn:inputData>
  <dmn:decision id="d1" name="d1">
    <dmn:informationRequirement id="ir1">
      <dmn:requiredInput href="#in1" />
    </dmn:informationRequirement>
    <dmn:informationRequirement id="ir2">
      <dmn:requiredInput href="#in2" />
    </dmn:informationRequirement>
    <dmn:decisionTable id="t1" hitPolicy="FIRST">
      <dmn:input id="input1">
        <dmn:inputExpression typeRef="number">
          <dmn:text>${inputExpressionText}</dmn:text>
        </dmn:inputExpression>
      </dmn:input>
      <dmn:output id="out1" typeRef="boolean" />
      <dmn:rule id="r1">
        <dmn:inputEntry id="ie1"><dmn:text>&gt;= 18</dmn:text></dmn:inputEntry>
        <dmn:outputEntry id="oe1"><dmn:text>true</dmn:text></dmn:outputEntry>
      </dmn:rule>
    </dmn:decisionTable>
  </dmn:decision>
</dmn:definitions>`;
}

function int007Messages(result: Awaited<ReturnType<typeof validateDmnContent>>) {
  return result.layers.interaction.issues.filter((i) => i.code === 'INT-007').map((i) => i.message);
}

describe('INT-007: "years and months duration(...)" built-in name is not flagged', () => {
  test('the leading "years"/"months" of the built-in name are not reported as unresolved variables', async () => {
    const xml = wrap('years and months duration(npGeboortedatum, peildatum)');
    const result = await validateDmnContent(xml);
    const messages = int007Messages(result);
    expect(messages.some((m) => m.includes('"years"'))).toBe(false);
    expect(messages.some((m) => m.includes('"months"'))).toBe(false);
  });

  test('the trailing .years property access on the duration result is still not flagged (pre-existing dot-check)', async () => {
    const xml = wrap('(years and months duration(npGeboortedatum, peildatum)).years');
    const result = await validateDmnContent(xml);
    const messages = int007Messages(result);
    expect(messages.some((m) => m.includes('"years"'))).toBe(false);
    expect(messages.some((m) => m.includes('"months"'))).toBe(false);
  });

  test('the real inputs the expression actually references are still resolved correctly', async () => {
    const xml = wrap('(years and months duration(npGeboortedatum, peildatum)).years');
    const result = await validateDmnContent(xml);
    const messages = int007Messages(result);
    expect(messages.some((m) => m.includes('npGeboortedatum'))).toBe(false);
    expect(messages.some((m) => m.includes('peildatum'))).toBe(false);
  });

  test('a genuinely unresolved variable is still flagged (sanity check the fix did not over-suppress)', async () => {
    const xml = wrap('someUndeclaredVariable');
    const result = await validateDmnContent(xml);
    const messages = int007Messages(result);
    expect(messages.some((m) => m.includes('"someUndeclaredVariable"'))).toBe(true);
  });
});
