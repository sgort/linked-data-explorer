import fs from 'fs';
import path from 'path';
import { XMLParser } from 'fast-xml-parser';

/**
 * The "Besluitvorming onder gedelegeerde bevoegdheid" bundle is hand-written
 * BPMN, DMN, form and document files that reference each other by id and by
 * variable name. Nothing else checks those references before a deploy fails
 * on Operaton or a gateway finds no variable at runtime, so this test does.
 */
const REPO_ROOT = path.join(__dirname, '..', '..', '..');
const BUNDLE = path.join(
  REPO_ROOT,
  'packages',
  'frontend',
  'public',
  'examples',
  'flevoland',
  'besluitvorming-gedelegeerd'
);
const readBundle = (name: string) => fs.readFileSync(path.join(BUNDLE, name), 'utf8');
const formIds = () =>
  fs
    .readdirSync(BUNDLE)
    .filter((f) => f.endsWith('.form'))
    .map((f) => f.replace(/\.form$/, ''));

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
  isArray: (name) => ['input', 'rule', 'inputEntry'].includes(name),
});

describe('GedelegeerdBesluitRoute (DMN)', () => {
  const doc = parser.parse(readBundle('gedelegeerd-besluit-route.dmn'));
  const decision = doc.definitions.decision;
  const table = decision.decisionTable;
  const inputs = table.input.map((i: { inputExpression: { text: string } }) =>
    String(i.inputExpression.text).trim()
  );
  const rules = table.rule.map(
    (r: { inputEntry: Array<{ text: string }>; outputEntry: { text: string } }) => ({
      when: r.inputEntry.map((e) => String(e.text).trim()),
      then: String(r.outputEntry.text).trim(),
    })
  );

  it('is the decision the process calls, with hit policy FIRST', () => {
    expect(decision['@_id']).toBe('GedelegeerdBesluitRoute');
    expect(table['@_hitPolicy']).toBe('FIRST');
    expect(table.output['@_name']).toBe('route');
  });

  it('reads exactly the five inputs the forms produce, in order', () => {
    expect(inputs).toEqual([
      'voorwaardenVervuld',
      'binnenMandaat',
      'politiekGevoelig',
      'overwegingenDuidelijk',
      'financieleGevolgen',
    ]);
  });

  it("implements the diagram's beslisregels in order, escalation first", () => {
    expect(rules).toEqual([
      { when: ['false', '-', '-', '-', '-'], then: '"escaleren"' },
      { when: ['-', 'false', '-', '-', '-'], then: '"escaleren"' },
      { when: ['-', '-', 'true', '-', '-'], then: '"escaleren"' },
      { when: ['-', '-', '-', 'false', '-'], then: '"memorandum"' },
      // Strictly greater: exactly € 50.000 needs no memorandum.
      { when: ['-', '-', '-', '-', '> 50000'], then: '"memorandum"' },
      { when: ['-', '-', '-', '-', '-'], then: '"ondertekenen"' },
    ]);
  });
});

type FormComponent = {
  key?: string;
  type: string;
  defaultValue?: unknown;
  values?: Array<{ value: string }>;
  validate?: { required?: boolean };
  readonly?: boolean;
};
const form = (id: string) =>
  JSON.parse(readBundle(`${id}.form`)) as { id: string; components: FormComponent[] };
const field = (formId: string, key: string) => {
  const c = form(formId).components.find((x) => x.key === key);
  if (!c) throw new Error(`${formId} has no field ${key}`);
  return c;
};

const FORMS = [
  'besluit-gb-sjabloon-kiezen',
  'besluit-gb-sjabloon-invullen',
  'besluit-gb-advies-toetsing',
  'besluit-gb-voorwaarden',
  'besluit-gb-memorandum',
  'besluit-gb-akkoord',
  'besluit-gb-indienen',
  'besluit-gb-ondertekenen',
  'besluit-gb-escalatie',
  'besluit-gb-besluit-nemen',
  'besluit-gb-registreren',
  'besluit-gb-archiveren',
];

describe('besluitvorming forms', () => {
  it('has exactly the twelve forms, each named after its own id', () => {
    expect(formIds().sort()).toEqual([...FORMS].sort());
    for (const id of FORMS) expect(form(id).id).toBe(id);
  });

  it('produces every DMN input, writable where it is produced', () => {
    expect(field('besluit-gb-sjabloon-invullen', 'financieleGevolgen').type).toBe('number');
    // The DMN compares it with > 50000; an amount never typed in must not reach it as null.
    expect(field('besluit-gb-sjabloon-invullen', 'financieleGevolgen').defaultValue).toBe(0);
    for (const [formId, key, def] of [
      ['besluit-gb-advies-toetsing', 'binnenMandaat', true],
      ['besluit-gb-advies-toetsing', 'politiekGevoelig', false],
      ['besluit-gb-voorwaarden', 'voorwaardenVervuld', false],
      ['besluit-gb-voorwaarden', 'overwegingenDuidelijk', true],
    ] as const) {
      const c = field(formId, key);
      expect(c.type).toBe('checkbox');
      expect(c.defaultValue).toBe(def);
      expect(c.readonly).toBeFalsy();
    }
  });

  it('gives each gateway radio exactly the string values its conditions test', () => {
    const values = (formId: string, key: string) =>
      (field(formId, key).values ?? []).map((v) => v.value);
    expect(values('besluit-gb-akkoord', 'juridischAkkoord')).toEqual(['akkoord', 'niet-akkoord']);
    expect(values('besluit-gb-ondertekenen', 'approvalStatus')).toEqual(['approved', 'rejected']);
    expect(field('besluit-gb-akkoord', 'juridischAkkoord').validate?.required).toBe(true);
    expect(field('besluit-gb-ondertekenen', 'approvalStatus').validate?.required).toBe(true);
  });

  it('collects every value the besluit document binds before it is signed', () => {
    for (const [formId, key] of [
      ['besluit-gb-sjabloon-kiezen', 'besluitType'],
      ['besluit-gb-sjabloon-invullen', 'onderwerp'],
      ['besluit-gb-sjabloon-invullen', 'motivering'],
      ['besluit-gb-sjabloon-invullen', 'voorgesteldBesluit'],
      ['besluit-gb-indienen', 'ondertekenaar'],
    ] as const) {
      const c = field(formId, key);
      expect(c.readonly).toBeFalsy();
      expect(c.validate?.required).toBe(true);
    }
  });
});

describe('GedelegeerdBesluitProcess (BPMN)', () => {
  const bpmnParser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    removeNSPrefix: true,
    isArray: (name) =>
      ['lane', 'flowNodeRef', 'userTask', 'sequenceFlow', 'exclusiveGateway'].includes(name),
  });
  const xml = readBundle('GedelegeerdBesluitProcess.bpmn');
  const process = bpmnParser.parse(xml).definitions.process;
  const userTasks: Array<Record<string, string>> = process.userTask;
  const lanes: Array<{ '@_id': string; '@_name': string; flowNodeRef: string[] }> =
    process.laneSet.lane;
  const laneOf = (nodeId: string) => lanes.find((l) => l.flowNodeRef.includes(nodeId))?.['@_id'];

  it('is the flevoland, Dutch process the seeds and RBA expect', () => {
    expect(process['@_id']).toBe('GedelegeerdBesluitProcess');
    expect(process['@_name']).toBe('Besluitvorming onder gedelegeerde bevoegdheid');
    expect(process['@_organization']).toBe('flevoland');
    expect(process['@_language']).toBe('nl');
    expect(process['@_isExecutable']).toBe('true');
  });

  it("draws the six lanes in the diagram's order", () => {
    expect(lanes.map((l) => [l['@_id'], l['@_name']])).toEqual([
      ['Lane_Indiener', 'Aanvrager / Indiener'],
      ['Lane_Juridisch', 'Juridische Zaken / Compliance'],
      ['Lane_Systeem', 'Systeem'],
      ['Lane_Bestuursautoriteit', 'Bevoegde bestuursautoriteit'],
      ['Lane_Ondertekenaar', 'Gemachtigde ondertekenaar'],
      ['Lane_Registratie', 'Registratie & Beheer'],
    ]);
  });

  it("gives every user task a deployed form and its own lane's role", () => {
    const ROLE: Record<string, string> = {
      Lane_Indiener: 'besluit-indiener',
      Lane_Juridisch: 'besluit-jurist',
      Lane_Bestuursautoriteit: 'besluit-bestuursautoriteit',
      Lane_Ondertekenaar: 'besluit-ondertekenaar',
      Lane_Registratie: 'besluit-registratie',
    };
    expect(userTasks).toHaveLength(12);
    for (const t of userTasks) {
      expect(formIds()).toContain(t['@_formRef']);
      expect(t['@_formRefBinding']).toBe('deployment');
      // A task outside every lane maps to undefined and fails here.
      expect(t['@_candidateGroups']).toBe(ROLE[laneOf(t['@_id']) ?? '']);
    }
  });

  it('calls the shared DMN untenanted, and signs the besluit document', () => {
    const rule = process.businessRuleTask;
    expect(rule['@_decisionRef']).toBe('GedelegeerdBesluitRoute');
    expect(rule['@_decisionRefTenantId']).toBe('${null}');
    expect(rule['@_resultVariable']).toBe('besluitRoute');
    expect(rule['@_mapDecisionResult']).toBe('singleEntry');
    const task = (id: string) => {
      const found = userTasks.find((t) => t['@_id'] === id);
      if (!found) throw new Error(`no user task ${id}`);
      return found;
    };
    expect(task('Task_Onderteken')['@_signatureRef']).toBe('besluit-gb-besluit');
    expect(task('Task_NeemBesluit')['@_documentRef']).toBe('besluit-gb-besluit');
  });

  it('declares six phases and marks the node that starts each one', () => {
    expect(process['@_phaseLabel']).toBe('Fase');
    expect(process['@_phases']).toBe(
      'voorbereiding:Voorbereiding;toetsing:Advies en toetsing;memorandum:Memorandum;' +
        'ondertekening:Ondertekening;escalatie:Escalatie;registratie:Registratie en archivering'
    );
    const markers = [...xml.matchAll(/id="([^"]+)"[^>]*ronl:phase="([^"]+)"/g)].map((m) => [
      m[1],
      m[2],
    ]);
    expect(markers).toEqual([
      ['StartEvent_Besluit', 'voorbereiding'],
      ['Task_AdviesToetsing', 'toetsing'],
      ['Task_Memorandum', 'memorandum'],
      ['Task_DienIn', 'ondertekening'],
      ['Task_Escaleren', 'escalatie'],
      ['Task_Registreer', 'registratie'],
    ]);
  });

  it('tests in its gateways only values the DMN and forms produce', () => {
    const conditions = process.sequenceFlow
      .filter((f: { conditionExpression?: unknown }) => f.conditionExpression)
      .map((f: { conditionExpression: { '#text': string } }) => f.conditionExpression['#text']);
    expect(conditions.sort()).toEqual(
      [
        '${besluitRoute == "escaleren"}',
        '${besluitRoute != "escaleren"}',
        '${besluitRoute == "memorandum"}',
        '${besluitRoute == "ondertekenen"}',
        '${juridischAkkoord == "akkoord"}',
        '${juridischAkkoord == "niet-akkoord"}',
        '${approvalStatus == "approved"}',
        '${approvalStatus == "rejected"}',
      ].sort()
    );
  });

  it("keeps the schema's element order: laneSet, flow elements, no artifacts", () => {
    const body = xml.slice(xml.indexOf('<bpmn:process'), xml.indexOf('</bpmn:process>'));
    expect(body.indexOf('<bpmn:laneSet')).toBeLessThan(body.indexOf('<bpmn:startEvent'));
    expect(body).not.toMatch(/<bpmn:(textAnnotation|association)\b/);
  });
});

describe('besluit-gb-besluit (document)', () => {
  const doc = JSON.parse(readBundle('besluit-gb-besluit.document'));

  it('is the document the BPMN signs and attaches', () => {
    expect(doc.id).toBe('besluit-gb-besluit');
    expect(doc.processKey).toBe('GedelegeerdBesluitProcess');
  });

  it('binds only variables the forms set before Onderteken', () => {
    expect(doc.bindings.map((b: { variableKey: string }) => b.variableKey).sort()).toEqual(
      [
        'besluitType',
        'financieleGevolgen',
        'motivering',
        'ondertekenaar',
        'onderwerp',
        'voorgesteldBesluit',
      ].sort()
    );
  });
});
