// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';

vi.mock('../changelog.json', () => ({
  default: {
    versions: [
      {
        format: 'commits',
        version: '2026.07.0',
        status: 'Upcoming',
        date: '22 jul 2026',
        scope: 'frontend',
        commits: [
          {
            sha: 'abc1234',
            author: 'Someone',
            type: 'test',
            subject: 'A new commit',
            details: ['First paragraph.', 'Second paragraph.'],
          },
          {
            sha: 'def5678',
            author: 'Someone Else',
            type: 'fix',
            subject: 'A fix with no details',
          },
        ],
      },
      {
        version: '1.0.0',
        status: 'Released',
        statusColor: 'green',
        borderColor: 'green',
        date: '1 jan 2026',
        sections: [
          {
            icon: '🎉',
            iconColor: 'green',
            title: 'Initial release',
            items: ['First item', 'Second item'],
          },
        ],
      },
    ],
  },
}));

import Changelog from './Changelog';

describe('Changelog', () => {
  test('renders the header and the about-project footer links', () => {
    render(<Changelog />);
    expect(screen.getByText('Changelog')).toBeTruthy();
    expect(screen.getByText('📦 GitLab Repository')).toBeTruthy();
    expect(screen.getByText('🌐 Live Demo (ACC)')).toBeTruthy();
    expect(screen.getByText('🚀 Production Site')).toBeTruthy();
  });

  test('the first (most recent) version starts expanded; others start collapsed', () => {
    render(<Changelog />);
    expect(screen.getByText('A new commit')).toBeTruthy();
    expect(screen.queryByText('First item')).toBeNull();
  });

  test('toggling a version header expands and collapses its content', async () => {
    render(<Changelog />);

    await userEvent.click(screen.getByText('v1.0.0'));
    expect(screen.getByText('First item')).toBeTruthy();

    await userEvent.click(screen.getByText('v1.0.0'));
    expect(screen.queryByText('First item')).toBeNull();
  });

  test('a "commits"-format version renders its scope badge, commit count, and each commit', () => {
    render(<Changelog />);

    expect(screen.getByText('Frontend')).toBeTruthy();
    expect(screen.getByText(/2 commits/)).toBeTruthy();
    expect(screen.getByText('A new commit')).toBeTruthy();
    expect(screen.getByText('abc1234 — Someone')).toBeTruthy();
    expect(screen.getByText('First paragraph.')).toBeTruthy();
    expect(screen.getByText('A fix with no details')).toBeTruthy();
  });

  test('a legacy "sections"-format version renders no scope badge and its sections/items once expanded', async () => {
    render(<Changelog />);
    await userEvent.click(screen.getByText('v1.0.0'));

    expect(screen.queryByText('Full-stack')).toBeNull();
    expect(screen.getByText('Initial release')).toBeTruthy();
    expect(screen.getByText('First item')).toBeTruthy();
    expect(screen.getByText('Second item')).toBeTruthy();
  });
});
