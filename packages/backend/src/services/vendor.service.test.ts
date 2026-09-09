import axios from 'axios';

// logger.ts self-executes real winston transports (Console + File) and a
// mkdirSync('logs') side effect on import — mocked so this test never
// touches the filesystem or a real logging pipeline.
jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('axios');
jest.mock('./sparql.service', () => ({
  sparqlService: { executeSparqlQuery: jest.fn() },
}));

import { sparqlService } from './sparql.service';
import { vendorService } from './vendor.service';

const mockExecuteSparqlQuery = sparqlService.executeSparqlQuery as jest.Mock;
const mockAxiosGet = axios.get as jest.Mock;

function binding(overrides: Record<string, { value: string }> = {}) {
  return {
    vendorService: { value: 'https://example.com/vendor/1' },
    basedOn: { value: 'https://example.com/dmn/aow' },
    ...overrides,
  };
}

beforeEach(() => {
  mockExecuteSparqlQuery.mockReset();
  mockAxiosGet.mockReset();
});

describe('getAllVendorServices', () => {
  test('maps SPARQL bindings into vendor service records', async () => {
    mockExecuteSparqlQuery.mockResolvedValue({
      results: {
        bindings: [
          binding({
            basedOnIdentifier: { value: 'AOW-DMN' },
            providerName: { value: 'Blueriq' },
            serviceUrl: { value: 'https://blueriq.example.com' },
          }),
        ],
      },
    });

    const result = await vendorService.getAllVendorServices('https://api.example.com/sparql');

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: 'https://example.com/vendor/1',
      basedOn: 'https://example.com/dmn/aow',
      basedOnIdentifier: 'AOW-DMN',
      provider: expect.objectContaining({ name: 'Blueriq' }),
      serviceUrl: 'https://blueriq.example.com',
    });
  });

  test('returns [] when the query has no bindings', async () => {
    mockExecuteSparqlQuery.mockResolvedValue({ results: { bindings: [] } });
    expect(await vendorService.getAllVendorServices()).toEqual([]);
  });

  test('returns [] when the response has no results field at all', async () => {
    mockExecuteSparqlQuery.mockResolvedValue({});
    expect(await vendorService.getAllVendorServices()).toEqual([]);
  });

  test('defaults the provider name to "Unknown Vendor" when missing', async () => {
    mockExecuteSparqlQuery.mockResolvedValue({ results: { bindings: [binding()] } });
    const [result] = await vendorService.getAllVendorServices();
    expect(result.provider.name).toBe('Unknown Vendor');
  });

  test('deduplicates bindings that share the same vendorService id', async () => {
    mockExecuteSparqlQuery.mockResolvedValue({
      results: {
        bindings: [binding(), binding({ basedOn: { value: 'https://example.com/dmn/other' } })],
      },
    });
    const result = await vendorService.getAllVendorServices();
    expect(result).toHaveLength(1);
    // First binding's data wins; the second is a no-op since the id already exists.
    expect(result[0].basedOn).toBe('https://example.com/dmn/aow');
  });

  test('logs and rethrows when the SPARQL query fails', async () => {
    mockExecuteSparqlQuery.mockRejectedValue(new Error('endpoint unreachable'));
    await expect(vendorService.getAllVendorServices()).rejects.toThrow('endpoint unreachable');
  });

  describe('vendor logo resolution', () => {
    test('a complete TriplyDB versioned URL is used as-is, no HTTP call made', async () => {
      const completeUrl = 'https://api.open-regels.triply.cc/datasets/acc/ds/assets/logo.png/v1abc';
      mockExecuteSparqlQuery.mockResolvedValue({
        results: { bindings: [binding({ providerLogo: { value: completeUrl } })] },
      });

      const [result] = await vendorService.getAllVendorServices();

      expect(result.provider.logoUrl).toBe(completeUrl);
      expect(mockAxiosGet).not.toHaveBeenCalled();
    });

    test('an external (non-TriplyDB) URL is returned as-is, no HTTP call made', async () => {
      mockExecuteSparqlQuery.mockResolvedValue({
        results: {
          bindings: [
            binding({ providerLogo: { value: 'https://vendor-cdn.example.com/logo.png' } }),
          ],
        },
      });

      const [result] = await vendorService.getAllVendorServices();

      expect(result.provider.logoUrl).toBe('https://vendor-cdn.example.com/logo.png');
      expect(mockAxiosGet).not.toHaveBeenCalled();
    });

    test('an incomplete TriplyDB URL is resolved via the assets API', async () => {
      mockAxiosGet.mockResolvedValue({
        data: [
          {
            assetName: 'logo.png',
            identifier: 'asset-1',
            versions: [
              { id: 'v2', url: 'https://api.open-regels.triply.cc/.../logo.png/v2', fileSize: 100 },
            ],
          },
        ],
      });
      mockExecuteSparqlQuery.mockResolvedValue({
        results: {
          bindings: [
            binding({
              providerLogo: {
                value: 'https://open-regels.triply.cc/acc/mydataset/assets/logo.png',
              },
            }),
          ],
        },
      });

      const [result] = await vendorService.getAllVendorServices(
        'https://api.open-regels.triply.cc/datasets/acc/mydataset/sparql'
      );

      expect(mockAxiosGet).toHaveBeenCalledWith(
        'https://api.open-regels.triply.cc/datasets/acc/mydataset/assets',
        expect.objectContaining({ timeout: 5000 })
      );
      expect(result.provider.logoUrl).toBe('https://api.open-regels.triply.cc/.../logo.png/v2');
    });

    test('returns undefined when no filename can be extracted (trailing slash)', async () => {
      mockExecuteSparqlQuery.mockResolvedValue({
        results: { bindings: [binding({ providerLogo: { value: 'https://example.com/' } })] },
      });

      const [result] = await vendorService.getAllVendorServices();

      expect(result.provider.logoUrl).toBeUndefined();
      expect(mockAxiosGet).not.toHaveBeenCalled();
    });

    test('returns undefined when the endpoint has no resolvable account/dataset', async () => {
      mockExecuteSparqlQuery.mockResolvedValue({
        results: {
          bindings: [
            binding({
              providerLogo: {
                value: 'https://open-regels.triply.cc/acc/mydataset/assets/logo.png',
              },
            }),
          ],
        },
      });

      const [result] = await vendorService.getAllVendorServices('not-a-valid-endpoint');

      expect(result.provider.logoUrl).toBeUndefined();
      expect(mockAxiosGet).not.toHaveBeenCalled();
    });

    test('returns undefined when no asset matches the filename', async () => {
      mockAxiosGet.mockResolvedValue({
        data: [{ assetName: 'other.png', identifier: 'x', versions: [] }],
      });
      mockExecuteSparqlQuery.mockResolvedValue({
        results: {
          bindings: [
            binding({
              providerLogo: {
                value: 'https://open-regels.triply.cc/acc/mydataset/assets/logo.png',
              },
            }),
          ],
        },
      });

      const [result] = await vendorService.getAllVendorServices(
        'https://api.open-regels.triply.cc/datasets/acc/mydataset/sparql'
      );

      expect(result.provider.logoUrl).toBeUndefined();
    });

    test('returns undefined (not a throw) when the assets API call fails', async () => {
      mockAxiosGet.mockRejectedValue(new Error('network error'));
      mockExecuteSparqlQuery.mockResolvedValue({
        results: {
          bindings: [
            binding({
              providerLogo: {
                value: 'https://open-regels.triply.cc/acc/mydataset/assets/logo.png',
              },
            }),
          ],
        },
      });

      const result = await vendorService.getAllVendorServices(
        'https://api.open-regels.triply.cc/datasets/acc/mydataset/sparql'
      );

      expect(result[0].provider.logoUrl).toBeUndefined();
    });
  });
});

describe('getVendorServicesForDmn', () => {
  test('matches by basedOnIdentifier', async () => {
    mockExecuteSparqlQuery.mockResolvedValue({
      results: { bindings: [binding({ basedOnIdentifier: { value: 'AOW-DMN' } })] },
    });
    const result = await vendorService.getVendorServicesForDmn('AOW-DMN');
    expect(result).toHaveLength(1);
  });

  test('matches by exact basedOn URI', async () => {
    mockExecuteSparqlQuery.mockResolvedValue({ results: { bindings: [binding()] } });
    const result = await vendorService.getVendorServicesForDmn('https://example.com/dmn/aow');
    expect(result).toHaveLength(1);
  });

  test('matches basedOn ending with /{dmnId}/dmn', async () => {
    mockExecuteSparqlQuery.mockResolvedValue({
      results: {
        bindings: [binding({ basedOn: { value: 'https://example.com/dmns/aow-2026/dmn' } })],
      },
    });
    const result = await vendorService.getVendorServicesForDmn('aow-2026');
    expect(result).toHaveLength(1);
  });

  test('returns [] when nothing matches', async () => {
    mockExecuteSparqlQuery.mockResolvedValue({ results: { bindings: [binding()] } });
    const result = await vendorService.getVendorServicesForDmn('no-such-dmn');
    expect(result).toEqual([]);
  });

  test('logs and rethrows on failure', async () => {
    mockExecuteSparqlQuery.mockRejectedValue(new Error('sparql down'));
    await expect(vendorService.getVendorServicesForDmn('AOW-DMN')).rejects.toThrow('sparql down');
  });
});
