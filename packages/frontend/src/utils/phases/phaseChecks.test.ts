// @vitest-environment jsdom
import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, test } from 'vitest';

import { checkPhases } from './phaseChecks';

const proc = (attrs: string, body: string) => `<?xml version="1.0"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:ronl="http://ronl.nl/schema/1.0">
  <bpmn:process id="P" ${attrs}>${body}</bpmn:process>
</bpmn:definitions>`;

const codes = (xml: string) => checkPhases(xml).map((f) => `${f.severity}:${f.code}`);

describe('checkPhases', () => {
  test('a process without phases has no findings', () => {
    expect(checkPhases(proc('', '<bpmn:startEvent id="S"/>'))).toEqual([]);
  });

  test('a fully marked declared process has no findings', () => {
    expect(
      checkPhases(
        proc(
          'ronl:phases="a:Alpha;b:Beta"',
          `<bpmn:startEvent id="S" ronl:phase="a"/><bpmn:userTask id="T" ronl:phase="b"/>
           <bpmn:sequenceFlow id="F" sourceRef="S" targetRef="T"/>`
        )
      )
    ).toEqual([]);
  });

  test('error: declared phases and an Awb marker in one process', () => {
    expect(
      codes(
        proc(
          'ronl:phases="a:Alpha"',
          '<bpmn:startEvent id="S" ronl:phase="a"/><bpmn:userTask id="T" ronl:awbPhase="2"/>'
        )
      )
    ).toContain('error:MIXED_SCHEMES');
  });

  test('warning: phases declared but no node marked', () => {
    expect(codes(proc('ronl:phases="a:Alpha"', '<bpmn:startEvent id="S"/>'))).toEqual([
      'warning:NO_MARKERS',
    ]);
  });

  test('warning: a marker naming a code the process did not declare', () => {
    const findings = checkPhases(
      proc(
        'ronl:phases="a:Alpha"',
        '<bpmn:startEvent id="S" ronl:phase="a"/><bpmn:userTask id="T" ronl:phase="zz"/><bpmn:sequenceFlow id="F" sourceRef="S" targetRef="T"/>'
      )
    );
    expect(findings).toEqual([
      expect.objectContaining({
        severity: 'warning',
        code: 'UNKNOWN_CODE',
        message: expect.stringContaining('T (zz)'),
      }),
    ]);
  });

  test('warning: an Awb marker that is not an Awb code', () => {
    expect(
      codes(
        proc(
          '',
          '<bpmn:startEvent id="S" ronl:awbPhase="1"/><bpmn:userTask id="T" ronl:awbPhase="9"/><bpmn:sequenceFlow id="F" sourceRef="S" targetRef="T"/>'
        )
      )
    ).toEqual(['warning:UNKNOWN_CODE']);
  });

  test('warning: phase markers left behind after the process lost its phases', () => {
    expect(codes(proc('', '<bpmn:startEvent id="S" ronl:phase="a"/>'))).toEqual([
      'warning:UNKNOWN_CODE',
    ]);
  });

  test('warning: a declared phase no node falls into after inheritance', () => {
    const findings = checkPhases(
      proc(
        'ronl:phases="a:Alpha;b:Beta;c:Gamma"',
        `<bpmn:startEvent id="S" ronl:phase="a"/><bpmn:userTask id="T" ronl:phase="c"/>
        <bpmn:sequenceFlow id="F" sourceRef="S" targetRef="T"/>`
      )
    );
    expect(findings).toEqual([
      expect.objectContaining({
        code: 'EMPTY_PHASE',
        message: expect.stringContaining('Fase 2 (Beta)'),
      }),
    ]);
  });

  test('warning: skipped entries in ronl:phases', () => {
    expect(
      codes(proc('ronl:phases="a:Alpha;b;a:Again"', '<bpmn:startEvent id="S" ronl:phase="a"/>'))
    ).toEqual(['warning:SKIPPED_ENTRIES']);
  });

  test('warning: a marker on a node kind RBA does not count', () => {
    expect(
      codes(
        proc(
          '',
          '<bpmn:startEvent id="S" ronl:awbPhase="1"/><bpmn:boundaryEvent id="B" ronl:awbPhase="3"/>'
        )
      )
    ).toEqual(['warning:IGNORED_NODE_KIND']);
  });

  test('the shipped examples deploy clean', () => {
    const dir = join(__dirname, '../../../public/examples/flevoland');
    for (const file of [
      'besluitvorming-gedelegeerd/GedelegeerdBesluitProcess.bpmn',
      'HR-capacity/ManagementCapacityClaimProcess.bpmn',
      'AwbShellProcess.bpmn',
    ]) {
      expect(checkPhases(readFileSync(join(dir, file), 'utf8'))).toEqual([]);
    }
  });
});
