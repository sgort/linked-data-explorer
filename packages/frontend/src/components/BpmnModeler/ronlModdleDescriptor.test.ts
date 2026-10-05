import { BpmnModdle } from 'bpmn-moddle';
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
