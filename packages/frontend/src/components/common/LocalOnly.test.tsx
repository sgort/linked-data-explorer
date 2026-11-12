// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import type { AuthState } from '../../services/auth';

const state = vi.hoisted(() => ({
  current: { ready: true, signedIn: false, isAuthor: false } as AuthState,
}));
vi.mock('../../services/auth', () => ({
  getAuthState: () => state.current,
  subscribe: () => () => undefined,
}));

import { LocalOnlyBadge, LocalSaveNotice } from './LocalOnly';

describe('LocalOnlyBadge', () => {
  test('says the item is only in this browser', () => {
    render(<LocalOnlyBadge />);
    expect(screen.getByText('only in this browser')).toBeInTheDocument();
  });
});

describe('LocalSaveNotice (#163)', () => {
  beforeEach(() => {
    state.current = { ready: true, signedIn: false, isAuthor: false };
  });

  test('signed out: saves stay here until you sign in', () => {
    render(<LocalSaveNotice />);
    expect(
      screen.getByText('Saved in this browser. Sign in to save it to the shared library.')
    ).toBeInTheDocument();
  });

  test('signed in without lde-author: saves stay here, permission needed', () => {
    state.current = { ready: true, signedIn: true, isAuthor: false, name: 'Viewer' };
    render(<LocalSaveNotice />);
    expect(
      screen.getByText(
        'Saved in this browser. You need permission to save it to the shared library.'
      )
    ).toBeInTheDocument();
  });

  test('an author sees no notice', () => {
    state.current = { ready: true, signedIn: true, isAuthor: true, name: 'Author' };
    const { container } = render(<LocalSaveNotice />);
    expect(container).toBeEmptyDOMElement();
  });
});
