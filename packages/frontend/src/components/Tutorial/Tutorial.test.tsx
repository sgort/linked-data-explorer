// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('../../tutorial.json', () => ({
  default: {
    title: 'Explorer Tutorials',
    subtitle: 'Learn the basics',
    tutorials: [
      {
        id: 'tut-1',
        title: 'Getting started',
        description: 'First steps',
        icon: '🚀',
        iconColor: 'blue',
        difficulty: 'Beginner',
        estimatedTime: '5 min',
        steps: [
          {
            number: 1,
            title: 'Open the app',
            description: 'Navigate to the dashboard',
            action: 'Click Start',
            details: ['Detail one', 'Detail two'],
            tip: 'Bookmark the page',
          },
        ],
      },
      {
        id: 'tut-2',
        title: 'Advanced usage',
        description: 'Deeper dive',
        icon: '⚙️',
        iconColor: 'unknown-color',
        difficulty: 'Unknown-Level',
        estimatedTime: '15 min',
        steps: [
          {
            number: 1,
            title: 'Configure',
            description: 'Set advanced options',
            action: 'Open settings',
            details: [],
            tip: '',
          },
        ],
      },
    ],
    glossary: [
      { term: 'BPMN', definition: 'Business Process Model and Notation' },
      { term: 'DMN', definition: 'Decision Model and Notation' },
    ],
  },
}));

import Tutorial from './Tutorial';

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

describe('Tutorial', () => {
  test('renders the title, subtitle, and every tutorial quick-link', () => {
    render(<Tutorial />);

    expect(screen.getByText('Explorer Tutorials')).toBeTruthy();
    expect(screen.getByText('Learn the basics')).toBeTruthy();

    const quickLinks = screen.getByText('Jump to Tutorial').closest('div')!;
    expect(within(quickLinks).getByText(/Getting started/)).toBeTruthy();
    expect(within(quickLinks).getByText(/Advanced usage/)).toBeTruthy();
  });

  test('the first tutorial is expanded by default; others start collapsed', () => {
    render(<Tutorial />);

    expect(screen.getByText('Open the app')).toBeTruthy();
    expect(screen.queryByText('Configure')).toBeNull();
  });

  test('clicking a collapsed tutorial header opens it and closes the previously open one', async () => {
    render(<Tutorial />);

    await userEvent.click(screen.getByText('Advanced usage'));

    expect(screen.getByText('Configure')).toBeTruthy();
    expect(screen.queryByText('Open the app')).toBeNull();
  });

  test('clicking the currently open tutorial header closes it', async () => {
    render(<Tutorial />);

    await userEvent.click(screen.getByText('Getting started'));

    expect(screen.queryByText('Open the app')).toBeNull();
  });

  test('a Quick Links button expands the corresponding tutorial', async () => {
    render(<Tutorial />);

    const quickLinks = screen.getByText('Jump to Tutorial').closest('div')!;
    await userEvent.click(within(quickLinks).getByText(/Advanced usage/));

    expect(screen.getByText('Configure')).toBeTruthy();
  });

  test('the Quick Links glossary button also opens the glossary', async () => {
    render(<Tutorial />);

    const quickLinks = screen.getByText('Jump to Tutorial').closest('div')!;
    await userEvent.click(within(quickLinks).getByText('📖 Glossary'));

    expect(screen.getByText('BPMN')).toBeTruthy();
  });

  test('unknown difficulty/color values fall back to the default styling without crashing', async () => {
    render(<Tutorial />);
    await userEvent.click(screen.getByText('Advanced usage'));

    expect(screen.getByText('Unknown-Level')).toBeTruthy();
  });

  test('a step with no details/tip renders without those sections', async () => {
    render(<Tutorial />);
    await userEvent.click(screen.getByText('Advanced usage'));

    expect(screen.queryByText('Details')).toBeNull();
  });

  test('the glossary is collapsed by default and toggles open to show every term', async () => {
    render(<Tutorial />);

    expect(screen.getByText(/2 terms/)).toBeTruthy();
    expect(screen.queryByText('BPMN')).toBeNull();

    const glossaryHeading = screen.getByRole('heading', { name: 'Glossary', level: 2 });
    await userEvent.click(glossaryHeading.closest('button')!);

    expect(screen.getByText('BPMN')).toBeTruthy();
    expect(screen.getByText('DMN')).toBeTruthy();
  });
});
