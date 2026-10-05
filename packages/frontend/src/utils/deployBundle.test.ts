// @vitest-environment jsdom
import { describe, expect, test } from 'vitest';

import {
  collectBundleRefs,
  findProcessElement,
  findProcessId,
  resolveSubProcesses,
} from './deployBundle';

const bpmn = (processId: string, body = '') =>
  `<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:camunda="http://camunda.org/schema/1.0/bpmn" xmlns:ronl="http://ronl.nl/schema/1.0" id="d" targetNamespace="t">
  <bpmn:process id="${processId}">${body}</bpmn:process>
</bpmn:definitions>`;

describe('findProcessElement / findProcessId', () => {
  test('finds a prefixed bpmn:process, which a CSS type selector never matched', () => {
    const doc = new DOMParser().parseFromString(bpmn('Shell'), 'text/xml');
    expect(findProcessElement(doc)?.getAttribute('id')).toBe('Shell');
    expect(findProcessId(bpmn('Shell'))).toBe('Shell');
  });

  test('returns undefined for a model with no process', () => {
    expect(findProcessId('<not-bpmn/>')).toBeUndefined();
  });
});

describe('resolveSubProcesses', () => {
  const shell = bpmn(
    'Shell',
    '<bpmn:callActivity id="c1" calledElement="Sub" /><bpmn:callActivity id="c2" calledElement="Sub" /><bpmn:callActivity id="c3" calledElement="Missing" />'
  );

  test('bundles each called subprocess once, by its process id, under its key', () => {
    const sub = { xml: bpmn('Sub') };
    const subE2E = { xml: bpmn('SubE2E') };
    expect(resolveSubProcesses(shell, [subE2E, sub])).toEqual([
      { filename: 'Sub.bpmn', xml: sub.xml },
    ]);
  });

  test('skips a called element no stored process provides', () => {
    expect(resolveSubProcesses(shell, [])).toEqual([]);
  });
});

describe('collectBundleRefs', () => {
  test('gathers form and document refs across the shell and its subprocesses, once each', () => {
    const shell = bpmn(
      'Shell',
      '<bpmn:userTask id="t1" camunda:formRef="start" ronl:documentRef="a,b" /><bpmn:userTask id="t2" camunda:formRef="start" ronl:signatureRef="c" />'
    );
    const sub = bpmn(
      'Sub',
      '<bpmn:userTask id="t3" camunda:formRef="review" ronl:documentRef="b, d" />'
    );
    expect(collectBundleRefs(shell, [{ filename: 'Sub.bpmn', xml: sub }])).toEqual({
      formRefs: ['start', 'review'],
      documentRefs: ['a', 'b', 'c', 'd'],
    });
  });
});
