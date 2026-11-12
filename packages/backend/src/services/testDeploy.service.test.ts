import type { Request } from 'express';

jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('./operaton.service', () => ({
  operatonService: {
    findDecisionTenants: jest.fn(),
    listDeployments: jest.fn(),
    deleteDeployment: jest.fn(),
  },
}));
const configMock = {
  testDeploy: { enabled: true, tenantId: 'TestOnly', ttlHours: 48, maxPerHour: 10 },
};
jest.mock('../utils/config', () => ({ __esModule: true, config: configMock }));

import { operatonService } from './operaton.service';
import {
  clientAddress,
  extractDecisionKeys,
  findBlockingKey,
  pruneRateSlots,
  resetRateSlots,
  sweepTestDeployments,
  takeRateSlot,
  trackedAddresses,
} from './testDeploy.service';

const op = operatonService as unknown as Record<string, jest.Mock>;

beforeEach(() => {
  Object.values(op).forEach((m) => m.mockReset());
  resetRateSlots();
});

describe('extractDecisionKeys', () => {
  test('reads the id of a single decision', () => {
    expect(extractDecisionKeys('<definitions><decision id="a"/></definitions>')).toEqual(['a']);
  });

  test('reads every decision of a namespaced DRD, in document order', () => {
    const xml = `<?xml version="1.0"?>
      <dmn:definitions xmlns:dmn="https://www.omg.org/spec/DMN/20191111/MODEL/" id="d">
        <dmn:decision id="a" name="A"/>
        <dmn:inputData id="i"/>
        <dmn:decision id="b" name="B"/>
      </dmn:definitions>`;
    expect(extractDecisionKeys(xml)).toEqual(['a', 'b']);
  });

  test('a model without decisions gives no keys', () => {
    expect(extractDecisionKeys('<definitions id="d"><inputData id="i"/></definitions>')).toEqual(
      []
    );
  });
});

describe('findBlockingKey', () => {
  test('a key nobody has deployed does not block', async () => {
    op.findDecisionTenants.mockResolvedValue([]);
    await expect(findBlockingKey(['k'])).resolves.toBeNull();
  });

  test('a key that exists only under TestOnly does not block (a new version is added)', async () => {
    op.findDecisionTenants.mockResolvedValue(['TestOnly', 'TestOnly']);
    await expect(findBlockingKey(['k'])).resolves.toBeNull();
  });

  test('an untenanted key blocks', async () => {
    op.findDecisionTenants.mockResolvedValue([null]);
    await expect(findBlockingKey(['k'])).resolves.toBe('k');
  });

  test('a key under another tenant blocks, even beside a TestOnly copy', async () => {
    op.findDecisionTenants.mockImplementation(async (key: string) =>
      key === 'b' ? ['TestOnly', 'Flevoland'] : []
    );
    await expect(findBlockingKey(['a', 'b'])).resolves.toBe('b');
  });
});

describe('clientAddress', () => {
  const req = (headers: Record<string, string>, remote = '10.1.1.1') =>
    ({ headers, socket: { remoteAddress: remote } }) as unknown as Request;

  test("takes the X-Forwarded-For entry Azure's front end added, the last, and drops its port", () => {
    expect(clientAddress(req({ 'x-forwarded-for': '198.51.100.9, 203.0.113.7:51234' }))).toBe(
      '203.0.113.7'
    );
  });

  test('a forged first entry does not change the address (final review I-1)', () => {
    const a = clientAddress(req({ 'x-forwarded-for': '192.0.2.1, 203.0.113.7:51234' }));
    const b = clientAddress(req({ 'x-forwarded-for': '192.0.2.99, 203.0.113.7:40000' }));
    expect(a).toBe('203.0.113.7');
    expect(b).toBe(a);
  });

  test('a single entry is the client', () => {
    expect(clientAddress(req({ 'x-forwarded-for': '203.0.113.7:51234' }))).toBe('203.0.113.7');
  });

  test('keeps an IPv6 address intact and drops its port', () => {
    expect(clientAddress(req({ 'x-forwarded-for': '[2001:db8::1]:443' }))).toBe('2001:db8::1');
  });

  test('a bare IPv6 address is not mistaken for one with a port', () => {
    expect(clientAddress(req({ 'x-forwarded-for': '2001:db8::1' }))).toBe('2001:db8::1');
  });

  test('without the header it uses the socket address', () => {
    expect(clientAddress(req({}))).toBe('10.1.1.1');
  });
});

describe('takeRateSlot', () => {
  test('allows 10 test deploys an hour per address, then refuses', () => {
    const t0 = new Date('2026-11-09T10:00:00Z');
    for (let i = 0; i < 10; i++) expect(takeRateSlot('a', t0)).toBe(true);
    expect(takeRateSlot('a', t0)).toBe(false);
    expect(takeRateSlot('b', t0)).toBe(true);
  });

  test('forgets addresses with no slot left in the last hour (final review I-1)', () => {
    const t0 = new Date('2026-11-09T10:00:00Z');
    takeRateSlot('old', t0);
    takeRateSlot('recent', new Date('2026-11-09T10:50:00Z'));
    pruneRateSlots(new Date('2026-11-09T11:10:00Z'));
    expect(trackedAddresses()).toEqual(['recent']);
  });

  test('frees the slots after an hour', () => {
    const t0 = new Date('2026-11-09T10:00:00Z');
    for (let i = 0; i < 10; i++) takeRateSlot('a', t0);
    expect(takeRateSlot('a', new Date('2026-11-09T11:01:00Z'))).toBe(true);
  });
});

describe('sweepTestDeployments', () => {
  test('deletes every TestOnly deployment older than 48 hours and counts them', async () => {
    op.listDeployments.mockResolvedValue([
      { id: 'd1', deploymentTime: 'x' },
      { id: 'd2', deploymentTime: 'y' },
    ]);
    op.deleteDeployment.mockResolvedValue(undefined);
    const now = new Date('2026-11-09T12:00:00Z');

    await expect(sweepTestDeployments(now)).resolves.toBe(2);

    expect(op.listDeployments).toHaveBeenCalledWith({
      tenantId: 'TestOnly',
      before: new Date('2026-11-07T12:00:00Z'),
    });
    expect(op.deleteDeployment.mock.calls.map((c) => c[0])).toEqual(['d1', 'd2']);
  });

  test('one failed delete does not stop the others', async () => {
    op.listDeployments.mockResolvedValue([
      { id: 'd1', deploymentTime: 'x' },
      { id: 'd2', deploymentTime: 'y' },
    ]);
    op.deleteDeployment.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(undefined);

    await expect(sweepTestDeployments(new Date())).resolves.toBe(1);
  });
});
