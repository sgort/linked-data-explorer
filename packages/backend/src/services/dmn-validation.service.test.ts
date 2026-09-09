jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

import {
  DmnValidationResult,
  dmnValidationService,
  validateDmnContent,
} from './dmn-validation.service';

type LayerKey = keyof DmnValidationResult['layers'];

/** Wrap a document body in a well-formed <definitions> root. */
function doc(body: string, opts: { cprmv?: boolean; attrs?: string } = {}): string {
  const cprmv = opts.cprmv === false ? '' : ' xmlns:cprmv="https://cprmv.open-regels.nl/0.3.0/"';
  return `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="https://www.omg.org/spec/DMN/20191111/MODEL/"${cprmv}
             id="defs_1" name="Test" namespace="https://regels.overheid.nl"${opts.attrs ?? ''}>
${body}
</definitions>`;
}

async function codes(xml: string, layer: LayerKey): Promise<string[]> {
  const result = await validateDmnContent(xml);
  return result.layers[layer].issues.map((i) => i.code);
}

/** A single-input, single-output decision table wrapped in a decision. */
function decision(
  opts: {
    id?: string;
    attrs?: string;
    variable?: string;
    requirements?: string;
    table?: string;
  } = {}
) {
  const id = opts.id ?? 'Zorgtoeslag';
  return `  <decision id="${id}" name="${id}"${opts.attrs ?? ''}>
    ${opts.variable ?? '<variable id="var_out" name="recht" typeRef="boolean" />'}
    ${opts.requirements ?? ''}
    ${
      opts.table ??
      `<decisionTable id="dt_1" hitPolicy="UNIQUE">
      <input id="in_1" label="bsn">
        <inputExpression id="ie_1" typeRef="string"><text>bsn</text></inputExpression>
      </input>
      <output id="out_1" label="recht" name="recht" typeRef="boolean" />
      <rule id="rule_1">
        <inputEntry id="ien_1"><text>"123"</text></inputEntry>
        <outputEntry id="oen_1"><text>true</text></outputEntry>
      </rule>
    </decisionTable>`
    }
  </decision>`;
}

const INPUT_DATA = `  <inputData id="InputData_1" name="bsn">
    <variable id="var_bsn" name="bsn" typeRef="string" />
  </inputData>`;

const IR_INPUT = `<informationRequirement id="ir_1"><requiredInput href="#InputData_1" /></informationRequirement>`;

/** A DMN that passes every layer cleanly. */
const CLEAN = doc(`${INPUT_DATA}\n${decision({ requirements: IR_INPUT })}`);

describe('a well-formed RONL DMN', () => {
  test('passes every layer with no issues', async () => {
    const result = await validateDmnContent(CLEAN);

    expect(result.valid).toBe(true);
    expect(result.parseError).toBeNull();
    expect(result.summary).toEqual({ errors: 0, warnings: 0, infos: 0 });
  });

  test('reports the five layers under their display labels', async () => {
    const result = await validateDmnContent(CLEAN);

    expect(Object.values(result.layers).map((l) => l.label)).toEqual([
      'Base DMN',
      'Business Rules',
      'Execution Rules',
      'Interaction Rules',
      'Content',
    ]);
  });
});

describe('layer 1 — base DMN', () => {
  test('reports a parse failure with its line number and stops there', async () => {
    const result = await validateDmnContent('<definitions>');

    expect(result.valid).toBe(false);
    expect(result.parseError).toContain('XML is not well-formed');
    expect(result.layers.base.issues[0]).toMatchObject({
      severity: 'error',
      code: 'BASE-PARSE',
      line: 1,
    });
    expect(result.layers.business.issues).toEqual([]);
    expect(result.layers.content.issues).toEqual([]);
  });

  test('rejects a root element that is not <definitions>', async () => {
    const result = await validateDmnContent('<?xml version="1.0"?><model />');

    expect(result.layers.base.issues).toEqual([
      expect.objectContaining({
        code: 'BASE-ROOT',
        message: 'Root element must be <definitions> but found <model>.',
      }),
    ]);
    // Layers 2-5 cannot run without a document.
    expect(result.layers.business.issues).toEqual([]);
  });

  test('rejects an unrecognised DMN namespace', async () => {
    const issues = await codes('<definitions xmlns="http://wrong/ns" />', 'base');

    expect(issues).toContain('BASE-NS');
  });

  test.each([
    ['DMN 1.3', 'https://www.omg.org/spec/DMN/20191111/MODEL/'],
    ['DMN 1.2', 'http://www.omg.org/spec/DMN/20180521/MODEL/'],
    ['DMN 1.1', 'http://www.omg.org/spec/DMN/20151101/dmn.xsd'],
    ['Camunda legacy', 'https://www.camunda.org/schema/1.0/dmn'],
  ])('accepts the %s namespace', async (_label, ns) => {
    const issues = await codes(`<definitions xmlns="${ns}" name="x" namespace="y" />`, 'base');

    expect(issues).not.toContain('BASE-NS');
  });

  test('warns when <definitions> has no name', async () => {
    const issues = await codes(
      '<definitions xmlns="https://www.omg.org/spec/DMN/20191111/MODEL/" namespace="y" />',
      'base'
    );

    expect(issues).toContain('BASE-NAME');
  });

  test('warns when <definitions> has a blank name', async () => {
    const issues = await codes(
      '<definitions xmlns="https://www.omg.org/spec/DMN/20191111/MODEL/" name="  " namespace="y" />',
      'base'
    );

    expect(issues).toContain('BASE-NAME');
  });

  test('warns when <definitions> has no namespace attribute', async () => {
    const issues = await codes(
      '<definitions xmlns="https://www.omg.org/spec/DMN/20191111/MODEL/" name="x" />',
      'base'
    );

    expect(issues).toContain('BASE-NSATTR');
  });

  test('warns when the model contains no decision at all', async () => {
    const issues = await codes(doc(INPUT_DATA), 'base');

    expect(issues).toContain('BASE-EMPTY');
  });

  test('finds decisions regardless of the DMN namespace version', async () => {
    const issues = await codes(
      `<definitions xmlns="http://www.omg.org/spec/DMN/20180521/MODEL/" name="x" namespace="y">
         <decision id="d" name="d" />
       </definitions>`,
      'base'
    );

    expect(issues).not.toContain('BASE-EMPTY');
  });
});

describe('layer 2 — business rules', () => {
  test('rejects an unknown hit policy', async () => {
    const xml = doc(decision({ table: '<decisionTable id="dt_1" hitPolicy="SOMETIMES" />' }));

    expect(await codes(xml, 'business')).toContain('BIZ-001');
  });

  test.each(['UNIQUE', 'FIRST', 'ANY', 'COLLECT', 'RULE ORDER', 'OUTPUT ORDER', 'PRIORITY'])(
    'accepts the %s hit policy',
    async (hp) => {
      const xml = doc(decision({ table: `<decisionTable id="dt_1" hitPolicy="${hp}" />` }));

      expect(await codes(xml, 'business')).not.toContain('BIZ-001');
    }
  );

  test('warns when an inputExpression has no typeRef', async () => {
    const xml = doc(
      decision({
        table: `<decisionTable id="dt_1" hitPolicy="UNIQUE">
          <input id="in_1"><inputExpression id="ie_1"><text>bsn</text></inputExpression></input>
        </decisionTable>`,
      })
    );

    expect(await codes(xml, 'business')).toContain('BIZ-002');
  });

  test('warns when an inputExpression typeRef is not a FEEL type', async () => {
    const xml = doc(
      decision({
        table: `<decisionTable id="dt_1" hitPolicy="UNIQUE">
          <input id="in_1"><inputExpression id="ie_1" typeRef="bsnType"><text>bsn</text></inputExpression></input>
        </decisionTable>`,
      })
    );

    expect(await codes(xml, 'business')).toContain('BIZ-003');
  });

  test('warns when an output column has no typeRef', async () => {
    const xml = doc(
      decision({
        table: `<decisionTable id="dt_1" hitPolicy="UNIQUE">
          <output id="out_1" name="recht" />
        </decisionTable>`,
      })
    );

    expect(await codes(xml, 'business')).toContain('BIZ-004');
  });

  test('warns when an output typeRef is not a FEEL type', async () => {
    const xml = doc(
      decision({
        table: `<decisionTable id="dt_1" hitPolicy="UNIQUE">
          <output id="out_1" name="recht" typeRef="jaNee" />
        </decisionTable>`,
      })
    );

    expect(await codes(xml, 'business')).toContain('BIZ-005');
  });

  test('rejects a rule whose input entry count does not match the columns', async () => {
    const xml = doc(
      decision({
        table: `<decisionTable id="dt_1" hitPolicy="UNIQUE">
          <input id="in_1"><inputExpression id="ie_1" typeRef="string"><text>bsn</text></inputExpression></input>
          <input id="in_2"><inputExpression id="ie_2" typeRef="string"><text>bsn</text></inputExpression></input>
          <output id="out_1" name="recht" typeRef="boolean" />
          <rule id="rule_1">
            <inputEntry id="ien_1"><text>"1"</text></inputEntry>
            <outputEntry id="oen_1"><text>true</text></outputEntry>
          </rule>
        </decisionTable>`,
      })
    );

    expect(await codes(xml, 'business')).toContain('BIZ-006');
  });

  test('rejects a rule whose output entry count does not match the columns', async () => {
    const xml = doc(
      decision({
        table: `<decisionTable id="dt_1" hitPolicy="UNIQUE">
          <input id="in_1"><inputExpression id="ie_1" typeRef="string"><text>bsn</text></inputExpression></input>
          <output id="out_1" name="recht" typeRef="boolean" />
          <output id="out_2" name="bedrag" typeRef="double" />
          <rule id="rule_1">
            <inputEntry id="ien_1"><text>"1"</text></inputEntry>
            <outputEntry id="oen_1"><text>true</text></outputEntry>
          </rule>
        </decisionTable>`,
      })
    );

    expect(await codes(xml, 'business')).toContain('BIZ-007');
  });

  test('rejects byte-identical rule rows in a UNIQUE table', async () => {
    const xml = doc(
      decision({
        table: `<decisionTable id="dt_1" hitPolicy="UNIQUE">
          <input id="in_1"><inputExpression id="ie_1" typeRef="string"><text>bsn</text></inputExpression></input>
          <output id="out_1" name="recht" typeRef="boolean" />
          <rule id="rule_1"><inputEntry id="ien_1"><text>"1"</text></inputEntry><outputEntry id="oen_1"><text>true</text></outputEntry></rule>
          <rule id="rule_2"><inputEntry id="ien_2"><text>"1"</text></inputEntry><outputEntry id="oen_2"><text>false</text></outputEntry></rule>
        </decisionTable>`,
      })
    );

    const issues = (await validateDmnContent(xml)).layers.business.issues;
    const duplicate = issues.find((i) => i.code === 'BIZ-008');
    expect(duplicate?.message).toContain('rule "rule_2"');
    expect(duplicate?.message).toContain('rule "rule_1"');
  });

  test('does not flag duplicate rows outside overlap-sensitive hit policies', async () => {
    const xml = doc(
      decision({
        table: `<decisionTable id="dt_1" hitPolicy="COLLECT">
          <input id="in_1"><inputExpression id="ie_1" typeRef="string"><text>bsn</text></inputExpression></input>
          <output id="out_1" name="recht" typeRef="boolean" />
          <rule id="rule_1"><inputEntry id="ien_1"><text>"1"</text></inputEntry><outputEntry id="oen_1"><text>true</text></outputEntry></rule>
          <rule id="rule_2"><inputEntry id="ien_2"><text>"1"</text></inputEntry><outputEntry id="oen_2"><text>false</text></outputEntry></rule>
        </decisionTable>`,
      })
    );

    expect(await codes(xml, 'business')).not.toContain('BIZ-008');
  });

  test('warns about a catch-all rule sitting alongside specific rules', async () => {
    const xml = doc(
      decision({
        table: `<decisionTable id="dt_1" hitPolicy="UNIQUE">
          <input id="in_1"><inputExpression id="ie_1" typeRef="string"><text>bsn</text></inputExpression></input>
          <output id="out_1" name="recht" typeRef="boolean" />
          <rule id="rule_1"><inputEntry id="ien_1"><text>"1"</text></inputEntry><outputEntry id="oen_1"><text>true</text></outputEntry></rule>
          <rule id="rule_2"><inputEntry id="ien_2"><text>-</text></inputEntry><outputEntry id="oen_2"><text>false</text></outputEntry></rule>
        </decisionTable>`,
      })
    );

    const issues = (await validateDmnContent(xml)).layers.business.issues;
    expect(issues.find((i) => i.code === 'BIZ-009')?.message).toContain('rule_2');
  });

  test('does not warn when every rule is a catch-all', async () => {
    const xml = doc(
      decision({
        table: `<decisionTable id="dt_1" hitPolicy="UNIQUE">
          <input id="in_1"><inputExpression id="ie_1" typeRef="string"><text>bsn</text></inputExpression></input>
          <output id="out_1" name="recht" typeRef="boolean" />
          <rule id="rule_1"><inputEntry id="ien_1"><text>-</text></inputEntry><outputEntry id="oen_1"><text>true</text></outputEntry></rule>
        </decisionTable>`,
      })
    );

    expect(await codes(xml, 'business')).not.toContain('BIZ-009');
  });

  test('treats UNIQUE as the default hit policy when none is declared', async () => {
    const xml = doc(
      decision({
        table: `<decisionTable id="dt_1">
          <input id="in_1"><inputExpression id="ie_1" typeRef="string"><text>bsn</text></inputExpression></input>
          <output id="out_1" name="recht" typeRef="boolean" />
          <rule id="rule_1"><inputEntry id="ien_1"><text>"1"</text></inputEntry><outputEntry id="oen_1"><text>true</text></outputEntry></rule>
          <rule id="rule_2"><inputEntry id="ien_2"><text>"1"</text></inputEntry><outputEntry id="oen_2"><text>false</text></outputEntry></rule>
        </decisionTable>`,
      })
    );

    expect(await codes(xml, 'business')).toContain('BIZ-008');
  });

  test.each([
    ['input', 'BIZ-010'],
    ['output', 'BIZ-011'],
    ['rule', 'BIZ-012'],
    ['inputEntry', 'BIZ-013'],
    ['outputEntry', 'BIZ-014'],
  ])('rejects a <%s> with no id, which Operaton refuses at deploy', async (tag, code) => {
    const table = `<decisionTable id="dt_1" hitPolicy="UNIQUE">
      <input${tag === 'input' ? '' : ' id="in_1"'}>
        <inputExpression id="ie_1" typeRef="string"><text>bsn</text></inputExpression>
      </input>
      <output${tag === 'output' ? '' : ' id="out_1"'} name="recht" typeRef="boolean" />
      <rule${tag === 'rule' ? '' : ' id="rule_1"'}>
        <inputEntry${tag === 'inputEntry' ? '' : ' id="ien_1"'}><text>"1"</text></inputEntry>
        <outputEntry${tag === 'outputEntry' ? '' : ' id="oen_1"'}><text>true</text></outputEntry>
      </rule>
    </decisionTable>`;

    const issues = await codes(doc(decision({ table })), 'business');

    expect(issues).toContain(code);
  });
});

describe('layer 3 — execution rules (CPRMV)', () => {
  test('notes that CPRMV attributes are absent, and skips the rest of the layer', async () => {
    const xml = doc(`${INPUT_DATA}\n${decision({ requirements: IR_INPUT })}`, { cprmv: false });

    expect(await codes(xml, 'execution')).toEqual(['EXEC-001']);
  });

  test('says nothing when the CPRMV namespace is declared and the values are valid', async () => {
    expect(await codes(CLEAN, 'execution')).toEqual([]);
  });

  test('a fully dated temporal-period rule raises nothing', async () => {
    const xml = doc(
      decision({
        table: `<decisionTable id="dt_1"><rule id="r1" cprmv:ruleType="temporal-period" cprmv:validFrom="2026-01-01" cprmv:validUntil="2026-06-01" /></decisionTable>`,
      })
    );

    expect(await codes(xml, 'execution')).toEqual([]);
  });
});

/**
 * These all depend on cprmvAttr() resolving a CPRMV-namespaced attribute.
 * They are grouped together because they shared a single root cause: an
 * `el.attr({ name, ns })` fast path that libxmljs2 0.37 does not implement as a
 * namespaced lookup, which left every rule below permanently inert. Keep them
 * together so a regression in that helper shows up as one obvious cluster
 * rather than a dozen scattered failures.
 */
describe('CPRMV attribute rules', () => {
  describe('decision-level (layer 3)', () => {
    test('rejects an unknown cprmv:rulesetType', async () => {
      const xml = doc(decision({ attrs: ' cprmv:rulesetType="lookup-table"' }));

      expect(await codes(xml, 'execution')).toContain('EXEC-002');
    });

    test.each([
      'decision-table',
      'conditional-calculation',
      'constraint-table',
      'derivation-table',
    ])('accepts the %s ruleset type', async (type) => {
      const xml = doc(decision({ attrs: ` cprmv:rulesetType="${type}"` }));

      expect(await codes(xml, 'execution')).not.toContain('EXEC-002');
    });

    test('warns when cprmv:implements is not a BWB id', async () => {
      const xml = doc(decision({ attrs: ' cprmv:implements="Participatiewet"' }));

      expect(await codes(xml, 'execution')).toContain('EXEC-003');
    });

    test('accepts a well-formed BWB id', async () => {
      const xml = doc(decision({ attrs: ' cprmv:implements="BWBR0015703"' }));

      expect(await codes(xml, 'execution')).not.toContain('EXEC-003');
    });
  });

  describe('rule-level (layer 3)', () => {
    /** A decision whose single rule carries the given cprmv attributes. */
    const ruleWith = (attrs: string) =>
      doc(
        decision({
          table: `<decisionTable id="dt_1"><rule id="r1"${attrs} /></decisionTable>`,
        })
      );

    test('rejects an unknown cprmv:ruleType', async () => {
      expect(await codes(ruleWith(' cprmv:ruleType="guesswork"'), 'execution')).toContain(
        'EXEC-004'
      );
    });

    test.each([
      'temporal-period',
      'conditional',
      'derivation',
      'constraint',
      'decision-rule',
      'default',
    ])('accepts the %s rule type', async (type) => {
      const issues = await codes(
        ruleWith(
          ` cprmv:ruleType="${type}" cprmv:validFrom="2026-01-01" cprmv:validUntil="2026-06-01"`
        ),
        'execution'
      );

      expect(issues).not.toContain('EXEC-004');
    });

    test('rejects an unknown cprmv:confidence', async () => {
      expect(await codes(ruleWith(' cprmv:confidence="certain"'), 'execution')).toContain(
        'EXEC-005'
      );
    });

    test.each(['low', 'medium', 'high'])('accepts a %s confidence', async (conf) => {
      expect(await codes(ruleWith(` cprmv:confidence="${conf}"`), 'execution')).not.toContain(
        'EXEC-005'
      );
    });

    test('rejects a malformed cprmv:validFrom', async () => {
      expect(await codes(ruleWith(' cprmv:validFrom="01-01-2026"'), 'execution')).toContain(
        'EXEC-006'
      );
    });

    test('rejects an impossible date that still looks ISO-shaped', async () => {
      expect(await codes(ruleWith(' cprmv:validFrom="2026-13-01"'), 'execution')).toContain(
        'EXEC-006'
      );
    });

    test('rejects a malformed cprmv:validUntil', async () => {
      expect(await codes(ruleWith(' cprmv:validUntil="2026/01/01"'), 'execution')).toContain(
        'EXEC-007'
      );
    });

    test('rejects a validity window that does not move forward in time', async () => {
      const issues = await codes(
        ruleWith(' cprmv:validFrom="2026-06-01" cprmv:validUntil="2026-01-01"'),
        'execution'
      );

      expect(issues).toContain('EXEC-008');
    });

    test('rejects a validity window whose ends are equal', async () => {
      const issues = await codes(
        ruleWith(' cprmv:validFrom="2026-01-01" cprmv:validUntil="2026-01-01"'),
        'execution'
      );

      expect(issues).toContain('EXEC-008');
    });

    test('accepts a validity window in the right order', async () => {
      const issues = await codes(
        ruleWith(' cprmv:validFrom="2026-01-01" cprmv:validUntil="2026-06-01"'),
        'execution'
      );

      expect(issues).not.toContain('EXEC-008');
    });

    test('warns when a temporal-period rule omits its validity dates', async () => {
      const issues = await codes(ruleWith(' cprmv:ruleType="temporal-period"'), 'execution');

      expect(issues).toContain('EXEC-009');
      expect(issues).toContain('EXEC-010');
    });

    test('warns about only the missing end of a half-dated temporal-period rule', async () => {
      const issues = await codes(
        ruleWith(' cprmv:ruleType="temporal-period" cprmv:validFrom="2026-01-01"'),
        'execution'
      );

      expect(issues).not.toContain('EXEC-009');
      expect(issues).toContain('EXEC-010');
    });
  });

  describe('content quality (layer 5)', () => {
    test('warns about an empty cprmv:title on a decision', async () => {
      const xml = doc(decision({ attrs: ' cprmv:title=""' }));

      expect(await codes(xml, 'content')).toContain('CON-001');
    });

    test('warns about a whitespace-only cprmv:description on a decision', async () => {
      const xml = doc(decision({ attrs: ' cprmv:description="   "' }));

      expect(await codes(xml, 'content')).toContain('CON-001');
    });

    test('accepts a populated cprmv:title', async () => {
      const xml = doc(decision({ attrs: ' cprmv:title="Zorgtoeslag"' }));

      expect(await codes(xml, 'content')).not.toContain('CON-001');
    });

    test('warns about an empty cprmv:description on inputData', async () => {
      const inputData = `  <inputData id="InputData_1" name="bsn" cprmv:description="">
    <variable id="v" name="bsn" typeRef="string" />
  </inputData>`;
      const xml = doc(`${inputData}\n${decision({ requirements: IR_INPUT })}`);

      expect(await codes(xml, 'content')).toContain('CON-002');
    });

    test('accepts a populated cprmv:description on inputData', async () => {
      const inputData = `  <inputData id="InputData_1" name="bsn" cprmv:description="Het BSN">
    <variable id="v" name="bsn" typeRef="string" />
  </inputData>`;
      const xml = doc(`${inputData}\n${decision({ requirements: IR_INPUT })}`);

      expect(await codes(xml, 'content')).not.toContain('CON-002');
    });

    test('notes an empty cprmv:note on a rule', async () => {
      const xml = doc(
        decision({
          table: `<decisionTable id="dt_1"><rule id="r1" cprmv:note="" /></decisionTable>`,
        })
      );

      expect(await codes(xml, 'content')).toContain('CON-003');
    });

    test('accepts a populated cprmv:note', async () => {
      const xml = doc(
        decision({
          table: `<decisionTable id="dt_1"><rule id="r1" cprmv:note="Toelichting" /></decisionTable>`,
        })
      );

      expect(await codes(xml, 'content')).not.toContain('CON-003');
    });
  });

  test('an attribute in another namespace is not mistaken for a CPRMV one', async () => {
    const xml = doc(
      decision({ attrs: ' xmlns:other="https://other.example/" other:rulesetType="lookup-table"' })
    );

    expect(await codes(xml, 'execution')).not.toContain('EXEC-002');
  });

  test('reading a CPRMV attribute does not mutate the element', async () => {
    // The old el.attr({ name, ns }) path silently added attributes literally
    // called "name" and "ns" to every element it inspected.
    const xml = doc(decision({ attrs: ' cprmv:rulesetType="decision-table"' }));

    const result = await validateDmnContent(xml);

    const locations = Object.values(result.layers).flatMap((l) =>
      l.issues.map((i) => i.location ?? '')
    );
    expect(locations.join(' ')).not.toContain('name="rulesetType"');
  });
});

describe('layer 4 — interaction rules', () => {
  test('rejects a requiredInput pointing at a non-existent inputData', async () => {
    const xml = doc(
      decision({
        requirements:
          '<informationRequirement id="ir_1"><requiredInput href="#Missing" /></informationRequirement>',
      })
    );

    expect(await codes(xml, 'interaction')).toContain('INT-001');
  });

  test('rejects a requiredDecision pointing at a non-existent decision', async () => {
    const xml = doc(
      decision({
        requirements:
          '<informationRequirement id="ir_1"><requiredDecision href="#Missing" /></informationRequirement>',
      })
    );

    expect(await codes(xml, 'interaction')).toContain('INT-002');
  });

  test('rejects a decision that requires itself', async () => {
    const xml = doc(
      decision({
        id: 'Zorgtoeslag',
        requirements:
          '<informationRequirement id="ir_1"><requiredDecision href="#Zorgtoeslag" /></informationRequirement>',
      })
    );

    expect(await codes(xml, 'interaction')).toContain('INT-003');
  });

  test('warns about an informationRequirement that requires nothing', async () => {
    const xml = doc(decision({ requirements: '<informationRequirement id="ir_1" />' }));

    expect(await codes(xml, 'interaction')).toContain('INT-004');
  });

  test('warns about inputData no decision can reach, in a wired DRD', async () => {
    const orphan = `  <inputData id="InputData_2" name="leeftijd">
    <variable id="var_leeftijd" name="leeftijd" typeRef="integer" />
  </inputData>`;
    const xml = doc(`${INPUT_DATA}\n${orphan}\n${decision({ requirements: IR_INPUT })}`);

    const issues = (await validateDmnContent(xml)).layers.interaction.issues;
    const orphaned = issues.find((i) => i.code === 'INT-005');
    expect(orphaned?.message).toContain('InputData_2');
  });

  test('leaves a standalone DMN alone — its inputData is the published contract', async () => {
    const xml = doc(`${INPUT_DATA}\n${decision()}`);

    expect(await codes(xml, 'interaction')).not.toContain('INT-005');
  });

  test('treats a multi-decision file as a DRD even without requirements', async () => {
    const xml = doc(
      `${INPUT_DATA}\n${decision({ id: 'A', table: '<decisionTable id="dt_a" />' })}\n` +
        `${decision({ id: 'B', variable: '<variable id="v_b" name="b" typeRef="string" />', table: '<decisionTable id="dt_b" />' })}`
    );

    expect(await codes(xml, 'interaction')).toContain('INT-005');
  });

  test('warns when an inputData and its variable disagree on the name', async () => {
    const mismatched = `  <inputData id="InputData_1" name="bsn">
    <variable id="var_bsn" name="burgerservicenummer" typeRef="string" />
  </inputData>`;
    const xml = doc(`${mismatched}\n${decision({ requirements: IR_INPUT })}`);

    expect(await codes(xml, 'interaction')).toContain('INT-006');
  });

  test('warns when an inputExpression references something nothing produces', async () => {
    const xml = doc(
      decision({
        table: `<decisionTable id="dt_1" hitPolicy="UNIQUE">
          <input id="in_1"><inputExpression id="ie_1" typeRef="string"><text>onbekend</text></inputExpression></input>
        </decisionTable>`,
      })
    );

    const issues = (await validateDmnContent(xml)).layers.interaction.issues;
    expect(issues.find((i) => i.code === 'INT-007')?.message).toContain('"onbekend"');
  });

  test('accepts a reference satisfied by a declared inputData', async () => {
    expect(await codes(CLEAN, 'interaction')).not.toContain('INT-007');
  });

  test('accepts a reference satisfied by an upstream decision output', async () => {
    const upstream = decision({
      id: 'Leeftijd',
      variable: '<variable id="v_up" name="leeftijd" typeRef="integer" />',
      table: '<decisionTable id="dt_up" />',
    });
    const downstream = decision({
      id: 'Recht',
      requirements:
        '<informationRequirement id="ir_2"><requiredDecision href="#Leeftijd" /></informationRequirement>',
      table: `<decisionTable id="dt_down" hitPolicy="UNIQUE">
        <input id="in_1"><inputExpression id="ie_1" typeRef="integer"><text>leeftijd</text></inputExpression></input>
      </decisionTable>`,
    });

    expect(await codes(doc(`${upstream}\n${downstream}`), 'interaction')).not.toContain('INT-007');
  });

  test('accepts a reference satisfied by an upstream decision table output column', async () => {
    const upstream = decision({
      id: 'Leeftijd',
      variable: '',
      table: `<decisionTable id="dt_up"><output id="o_up" name="leeftijd" typeRef="integer" /></decisionTable>`,
    });
    const downstream = decision({
      id: 'Recht',
      requirements:
        '<informationRequirement id="ir_2"><requiredDecision href="#Leeftijd" /></informationRequirement>',
      table: `<decisionTable id="dt_down" hitPolicy="UNIQUE">
        <input id="in_1"><inputExpression id="ie_1" typeRef="integer"><text>leeftijd</text></inputExpression></input>
      </decisionTable>`,
    });

    expect(await codes(doc(`${upstream}\n${downstream}`), 'interaction')).not.toContain('INT-007');
  });

  test('treats a bare multi-word FEEL name as one reference, not several words', async () => {
    const multiWord = `  <inputData id="InputData_1" name="woonachtig in de gemeente">
    <variable id="v" name="woonachtig in de gemeente" typeRef="boolean" />
  </inputData>`;
    const xml = doc(
      `${multiWord}\n${decision({
        requirements: IR_INPUT,
        table: `<decisionTable id="dt_1" hitPolicy="UNIQUE">
          <input id="in_1"><inputExpression id="ie_1" typeRef="boolean"><text>woonachtig in de gemeente</text></inputExpression></input>
        </decisionTable>`,
      })}`
    );

    expect(await codes(xml, 'interaction')).not.toContain('INT-007');
  });

  test('unwraps FEEL built-ins so only the inner reference is checked', async () => {
    const inputData = `  <inputData id="InputData_1" name="aanvraagDatum">
    <variable id="v" name="aanvraagDatum" typeRef="date" />
  </inputData>`;
    const xml = doc(
      `${inputData}\n${decision({
        requirements: IR_INPUT,
        table: `<decisionTable id="dt_1" hitPolicy="UNIQUE">
          <input id="in_1"><inputExpression id="ie_1" typeRef="date"><text>date and time(aanvraagDatum)</text></inputExpression></input>
        </decisionTable>`,
      })}`
    );

    expect(await codes(xml, 'interaction')).not.toContain('INT-007');
  });

  test('skips property-access segments after a dot', async () => {
    const inputData = `  <inputData id="InputData_1" name="dagVanAanvraag">
    <variable id="v" name="dagVanAanvraag" typeRef="date" />
  </inputData>`;
    const xml = doc(
      `${inputData}\n${decision({
        requirements: IR_INPUT,
        table: `<decisionTable id="dt_1" hitPolicy="UNIQUE">
          <input id="in_1"><inputExpression id="ie_1" typeRef="integer"><text>date(dagVanAanvraag).jaartal</text></inputExpression></input>
        </decisionTable>`,
      })}`
    );

    expect(await codes(xml, 'interaction')).not.toContain('INT-007');
  });

  test('reports every unresolved identifier in a compound expression', async () => {
    const xml = doc(
      decision({
        table: `<decisionTable id="dt_1" hitPolicy="UNIQUE">
          <input id="in_1"><inputExpression id="ie_1" typeRef="boolean"><text>inkomen &lt;= 1.1 * norm</text></inputExpression></input>
        </decisionTable>`,
      })
    );

    const messages = (await validateDmnContent(xml)).layers.interaction.issues
      .filter((i) => i.code === 'INT-007')
      .map((i) => i.message);

    expect(messages.some((m) => m.includes('"inkomen"'))).toBe(true);
    expect(messages.some((m) => m.includes('"norm"'))).toBe(true);
  });

  test('ignores string literals when looking for references', async () => {
    const inputData = `  <inputData id="InputData_1" name="naam">
    <variable id="v" name="naam" typeRef="string" />
  </inputData>`;
    const xml = doc(
      `${inputData}\n${decision({
        requirements: IR_INPUT,
        table: `<decisionTable id="dt_1" hitPolicy="UNIQUE">
          <input id="in_1"><inputExpression id="ie_1" typeRef="boolean"><text>naam = "Piet"</text></inputExpression></input>
        </decisionTable>`,
      })}`
    );

    expect(await codes(xml, 'interaction')).not.toContain('INT-007');
  });

  test('ignores an empty inputExpression', async () => {
    const xml = doc(
      decision({
        table: `<decisionTable id="dt_1" hitPolicy="UNIQUE">
          <input id="in_1"><inputExpression id="ie_1" typeRef="string"><text>   </text></inputExpression></input>
        </decisionTable>`,
      })
    );

    expect(await codes(xml, 'interaction')).not.toContain('INT-007');
  });
});

describe('layer 5 — content', () => {
  test('notes a variable with no typeRef', async () => {
    const xml = doc(decision({ variable: '<variable id="v" name="recht" />' }));

    const issues = (await validateDmnContent(xml)).layers.content.issues;
    expect(issues.find((i) => i.code === 'CON-004')?.message).toContain('"recht"');
  });

  test('notes an empty text annotation', async () => {
    const xml = doc(`${decision()}\n  <textAnnotation id="ta_1"><text>   </text></textAnnotation>`);

    expect(await codes(xml, 'content')).toContain('CON-005');
  });

  test('notes a text annotation with no text element at all', async () => {
    const xml = doc(`${decision()}\n  <textAnnotation id="ta_1" />`);

    expect(await codes(xml, 'content')).toContain('CON-005');
  });

  test('accepts a populated text annotation', async () => {
    const xml = doc(
      `${decision()}\n  <textAnnotation id="ta_1"><text>Toelichting</text></textAnnotation>`
    );

    expect(await codes(xml, 'content')).not.toContain('CON-005');
  });
});

describe('result summary', () => {
  test('counts issues by severity across every layer', async () => {
    const xml = doc(
      decision({
        attrs: ' cprmv:title=""',
        table: `<decisionTable id="dt_1" hitPolicy="SOMETIMES">
          <output id="out_1" name="recht" />
        </decisionTable>`,
      })
    );

    const result = await validateDmnContent(xml);

    expect(result.summary.errors).toBeGreaterThan(0);
    expect(result.summary.warnings).toBeGreaterThan(0);
    const counted = result.summary.errors + result.summary.warnings + result.summary.infos;
    const actual = Object.values(result.layers).reduce((n, l) => n + l.issues.length, 0);
    expect(counted).toBe(actual);
  });

  test('is invalid when any error is present', async () => {
    const xml = doc(decision({ table: '<decisionTable id="dt_1" hitPolicy="SOMETIMES" />' }));

    await expect(validateDmnContent(xml)).resolves.toMatchObject({ valid: false });
  });

  test('stays valid when only warnings and infos are present', async () => {
    const xml = doc(decision({ variable: '<variable id="v" name="recht" />' }));

    const result = await validateDmnContent(xml);

    expect(result.summary.errors).toBe(0);
    expect(result.valid).toBe(true);
  });
});

describe('service export', () => {
  test('exposes validateDmnContent as its only operation', () => {
    expect(dmnValidationService.validateDmnContent).toBe(validateDmnContent);
  });
});
