import { describe, expect, test } from 'vitest';

import { freshProcessId, isValidProcessId, renameProcessId } from './processIdentity';

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL">
  <bpmn:collaboration id="Collaboration_1">
    <bpmn:participant id="Participant_1" name="Process_1 lane" processRef="Process_1" />
  </bpmn:collaboration>
  <bpmn:process id="Process_1" isExecutable="true">
    <bpmn:documentation>Copy of Process_1</bpmn:documentation>
    <bpmn:startEvent id="Process_1_start" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Collaboration_1" />
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

describe('renameProcessId (#171)', () => {
  test('renames the process element and its participant reference', () => {
    const out = renameProcessId(XML, 'Process_1', 'Process_2');
    expect(out).toContain('<bpmn:process id="Process_2"');
    expect(out).toContain('processRef="Process_2"');
  });

  test('leaves the same string elsewhere alone: names, texts, other ids', () => {
    const out = renameProcessId(XML, 'Process_1', 'Process_2');
    expect(out).toContain('name="Process_1 lane"');
    expect(out).toContain('Copy of Process_1');
    expect(out).toContain('id="Process_1_start"');
  });

  test('renames the diagram plane when it points at the process itself', () => {
    const plain = `<bpmn:process id="P" /><bpmndi:BPMNPlane id="Plane" bpmnElement="P" />`;
    expect(renameProcessId(plain, 'P', 'Q')).toBe(
      `<bpmn:process id="Q" /><bpmndi:BPMNPlane id="Plane" bpmnElement="Q" />`
    );
  });

  test('refuses an id that is not an XML name', () => {
    expect(() => renameProcessId(XML, 'Process_1', '1 bad id')).toThrow('not a valid process id');
  });
});

describe('isValidProcessId', () => {
  test.each(['Process_1', 'AwbShellProcess', '_x', 'a.b-c'])('accepts %s', (id) => {
    expect(isValidProcessId(id)).toBe(true);
  });
  test.each(['', '1abc', 'with space', 'a:b'])('rejects %j', (id) => {
    expect(isValidProcessId(id)).toBe(false);
  });
});

test('freshProcessId appends the timestamp', () => {
  expect(freshProcessId('Process_1', 123)).toBe('Process_1_123');
});
