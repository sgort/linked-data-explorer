// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';

import ServiceLinks, { serviceLinkName } from './ServiceLinks';

// dct:requires between public services (sgort/ttl-editor#223): display only.
const RECHT = 'https://regels.overheid.nl/services/recht-op-subsidie-thuisbatterij-flevoland';
const HOOGTE = 'https://regels.overheid.nl/services/hoogte-subsidie-thuisbatterij-flevoland';

describe('serviceLinkName', () => {
  test('prefers the DMN identifier', () => {
    expect(
      serviceLinkName({
        service: RECHT,
        title: 'recht subsidie thuisbatterij',
        dmnIdentifier: 'RechtOpSubsidieThuisbatterij',
      })
    ).toBe('RechtOpSubsidieThuisbatterij');
  });

  test('falls back to the service title', () => {
    expect(serviceLinkName({ service: RECHT, title: 'recht subsidie thuisbatterij' })).toBe(
      'recht subsidie thuisbatterij'
    );
  });

  test('falls back to the last path segment of the service URI', () => {
    expect(serviceLinkName({ service: RECHT })).toBe('recht-op-subsidie-thuisbatterij-flevoland');
  });

  test('ignores a trailing slash when taking the last segment', () => {
    expect(serviceLinkName({ service: 'https://example.org/services/elsewhere/' })).toBe(
      'elsewhere'
    );
  });

  test('falls back to the whole URI when it has no path segment', () => {
    expect(serviceLinkName({ service: 'urn:x' })).toBe('urn:x');
  });
});

describe('ServiceLinks', () => {
  test('renders both lines with the names joined', () => {
    render(
      <ServiceLinks
        requires={[
          { service: RECHT, dmnIdentifier: 'RechtOpSubsidieThuisbatterij' },
          { service: 'https://example.org/services/elsewhere' },
        ]}
        requiredBy={[{ service: HOOGTE, dmnIdentifier: 'BehaalbareHoogteSubsidie' }]}
      />
    );

    expect(screen.getByText('Requires:', { exact: false }).textContent).toBe(
      'Requires: RechtOpSubsidieThuisbatterij, elsewhere'
    );
    expect(screen.getByText('Required by:', { exact: false }).textContent).toBe(
      'Required by: BehaalbareHoogteSubsidie'
    );
  });

  test('shows the service URI as the tooltip of each name', () => {
    render(
      <ServiceLinks
        requires={[{ service: RECHT, dmnIdentifier: 'RechtOpSubsidieThuisbatterij' }]}
      />
    );

    expect(screen.getByText('RechtOpSubsidieThuisbatterij').getAttribute('title')).toBe(RECHT);
  });

  test('renders only the non-empty line', () => {
    render(<ServiceLinks requires={[]} requiredBy={[{ service: HOOGTE }]} />);

    expect(screen.queryByText('Requires:', { exact: false })).toBeNull();
    expect(screen.getByText('Required by:', { exact: false })).toBeTruthy();
  });

  test('renders nothing for empty or absent lists', () => {
    const { container: absent } = render(<ServiceLinks />);
    const { container: empty } = render(<ServiceLinks requires={[]} requiredBy={[]} />);

    expect(absent.innerHTML).toBe('');
    expect(empty.innerHTML).toBe('');
  });
});
