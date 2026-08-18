// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';

import StatusBadge from './StatusBadge';

describe('StatusBadge', () => {
  test('renders nothing when status is undefined', () => {
    const { container } = render(<StatusBadge status={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });

  test('renders EXAMPLE for example status', () => {
    render(<StatusBadge status="example" />);
    expect(screen.getByText('EXAMPLE')).toBeTruthy();
  });

  test('renders WIP for wip status by default', () => {
    render(<StatusBadge status="wip" />);
    expect(screen.getByText('WIP')).toBeTruthy();
  });

  test('renders a custom label for wip status when wipLabel is given', () => {
    render(<StatusBadge status="wip" wipLabel="DRAFT" />);
    expect(screen.getByText('DRAFT')).toBeTruthy();
    expect(screen.queryByText('WIP')).toBeNull();
  });

  test('renders DSO for dso status', () => {
    render(<StatusBadge status="dso" />);
    expect(screen.getByText('DSO')).toBeTruthy();
  });

  test('renders E2E for e2e status', () => {
    render(<StatusBadge status="e2e" />);
    expect(screen.getByText('E2E')).toBeTruthy();
  });
});
