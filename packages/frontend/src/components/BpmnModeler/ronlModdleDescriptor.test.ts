import { BpmnModdle } from 'bpmn-moddle';
import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, test } from 'vitest';

import ronlModdleDescriptor from './ronlModdleDescriptor.json';

// An attribute the descriptor does not register still round-trips, parked in
// $attrs as an unknown attribute, so a missing registration fails silently:
// the Modeler cannot read or set it as a property. These tests read each
// userTask attribute as a typed property, which only a registration provides.
const parseUserTask = async (attrs: string) => {
  const moddle = new BpmnModdle({ ronl: ronlModdleDescriptor });
  const xml = `<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:ronl="http://ronl.nl/schema/1.0" id="d" targetNamespace="t">
  <bpmn:process id="p"><bpmn:userTask id="t1" ${attrs} /></bpmn:process>
</bpmn:definitions>`;
  const { rootElement } = await moddle.fromXML(xml);
  return rootElement.rootElements[0].flowElements[0];
};

describe('ronlModdleDescriptor', () => {
  test('registers documentRef on a userTask', async () => {
    const task = await parseUserTask('ronl:documentRef="a,b"');
    expect(task.get('ronl:documentRef')).toBe('a,b');
    expect(task.$attrs['ronl:documentRef']).toBeUndefined();
  });

  test('registers signatureRef on a userTask', async () => {
    const task = await parseUserTask('ronl:signatureRef="besluit-gb-besluit"');
    expect(task.get('ronl:signatureRef')).toBe('besluit-gb-besluit');
    expect(task.$attrs['ronl:signatureRef']).toBeUndefined();
  });
});

const EXAMPLES = join(__dirname, '../../../public/examples/flevoland');

const parseProcess = async (processAttrs: string, body = '') => {
  const moddle = new BpmnModdle({ ronl: ronlModdleDescriptor });
  const xml = `<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:ronl="http://ronl.nl/schema/1.0" id="d" targetNamespace="t">
  <bpmn:process id="p" ${processAttrs}>${body}</bpmn:process>
</bpmn:definitions>`;
  const { rootElement } = await moddle.fromXML(xml);
  return rootElement.rootElements[0];
};

describe('ronlModdleDescriptor — phases (#242)', () => {
  test('registers phases and phaseLabel on a process', async () => {
    const process = await parseProcess('ronl:phases="a:Alpha;b:Beta" ronl:phaseLabel="Stap"');
    expect(process.get('ronl:phases')).toBe('a:Alpha;b:Beta');
    expect(process.get('ronl:phaseLabel')).toBe('Stap');
    expect(process.$attrs['ronl:phases']).toBeUndefined();
  });

  test.each([
    ['bpmn:startEvent'],
    ['bpmn:exclusiveGateway'],
    ['bpmn:serviceTask'],
    ['bpmn:callActivity'],
    ['bpmn:intermediateCatchEvent'],
  ])('registers phase and awbPhase on a %s', async (tag) => {
    const process = await parseProcess('', `<${tag} id="n" ronl:phase="a" ronl:awbPhase="4+5" />`);
    const node = process.flowElements[0];
    expect(node.get('ronl:phase')).toBe('a');
    expect(node.get('ronl:awbPhase')).toBe('4+5');
    expect(node.$attrs['ronl:phase']).toBeUndefined();
  });

  // The issue's acceptance criterion: opening and re-saving an example keeps
  // its phase attributes. Compared per element and value, not byte for byte
  // (bpmn-moddle reformats the rest of the file).
  test.each([
    'besluitvorming-gedelegeerd/GedelegeerdBesluitProcess.bpmn',
    'HR-capacity/ManagementCapacityClaimProcess.bpmn',
    'AwbShellProcess.bpmn',
  ])('round-trips every phase attribute of %s', async (file) => {
    const original = readFileSync(join(EXAMPLES, file), 'utf8');
    const moddle = new BpmnModdle({ ronl: ronlModdleDescriptor });
    const { rootElement } = await moddle.fromXML(original);
    const { xml: saved } = await moddle.toXML(rootElement, { format: true });

    const attrs = (xml: string) =>
      [...xml.matchAll(/<[\w:]+\s[^>]*?\bid="([^"]+)"[^>]*>/g)]
        .flatMap(([tag, id]) =>
          [...tag.matchAll(/\bronl:(phases|phaseLabel|phase|awbPhase)="([^"]*)"/g)].map(
            ([, name, value]) => `${id}|${name}|${value}`
          )
        )
        .sort();

    expect(attrs(original).length).toBeGreaterThan(0);
    expect(attrs(saved)).toEqual(attrs(original));
  });
});
