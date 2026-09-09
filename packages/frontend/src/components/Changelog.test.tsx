// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
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
        // Deliberately malformed: an unrecognised scope, an unrecognised
        // commit type and an unrecognised status all reach the renderer
        // because changelog.json is untyped JSON cast at the boundary.
        format: 'commits',
        version: '2026.06.9',
        status: 'Withdrawn',
        date: '3 jun 2026',
        scope: 'kernel',
        commits: [{ sha: 'aaa0000', author: 'Nobody', type: 'perf', subject: 'A lone commit' }],
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
      {
        version: '0.9.0',
        status: 'Archived',
        statusColor: 'chartreuse',
        borderColor: 'chartreuse',
        date: '1 dec 2025',
        sections: [
          {
            icon: '📦',
            iconColor: 'chartreuse',
            title: 'Preview',
            items: ['Preview item'],
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

    const card = screen.getByText('v1.0.0').closest('.rounded-lg.border-2') as HTMLElement;
    expect(within(card).queryByText('Full-stack')).toBeNull();
    expect(screen.getByText('Initial release')).toBeTruthy();
    expect(screen.getByText('First item')).toBeTruthy();
    expect(screen.getByText('Second item')).toBeTruthy();
  });

  test('falls back to the full-stack badge for an unrecognised scope', async () => {
    render(<Changelog />);
    await userEvent.click(screen.getByText('v2026.06.9'));

    expect(screen.getByText('Full-stack')).toBeTruthy();
  });

  test('falls back to the generic commit icon for an unrecognised commit type', async () => {
    render(<Changelog />);
    await userEvent.click(screen.getByText('v2026.06.9'));

    const heading = screen.getByText('A lone commit');
    expect(heading.className).toContain('text-gray-700');
    expect(heading.parentElement?.previousElementSibling?.textContent).toBe('📄');
  });

  test('uses the singular noun for a version with exactly one commit', () => {
    render(<Changelog />);
    expect(screen.getByText(/· 1 commit$/)).toBeTruthy();
  });

  test('falls back to grey styling for an unrecognised commits-format status', () => {
    render(<Changelog />);

    const badge = screen.getByText('Withdrawn');
    expect(badge.className).toContain('bg-gray-100');
    const card = badge.closest('.rounded-lg.border-2') as HTMLElement;
    expect(card.className).toContain('border-gray-200');
  });

  test('falls back to grey styling for an unrecognised legacy colour key', () => {
    render(<Changelog />);

    const badge = screen.getByText('Archived');
    expect(badge.className).toContain('bg-gray-100');
    const card = badge.closest('.rounded-lg.border-2') as HTMLElement;
    expect(card.className).toContain('border-gray-200');
  });

  test('falls back to grey for an unrecognised legacy section icon colour', async () => {
    render(<Changelog />);
    await userEvent.click(screen.getByText('v0.9.0'));

    const icon = screen.getByText('📦');
    expect(icon.className).toContain('text-gray-600');
  });
});
