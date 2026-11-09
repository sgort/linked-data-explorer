// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import type { AuthState } from '../../services/auth';

const state = vi.hoisted(() => ({
  current: { ready: true, signedIn: false, isAuthor: false } as AuthState,
}));
const auth = vi.hoisted(() => ({ signIn: vi.fn(), signOut: vi.fn() }));
vi.mock('../../services/auth', () => ({
  ...auth,
  getAuthState: () => state.current,
  subscribe: () => () => undefined,
}));

import SignInMenu from './SignInMenu';

describe('SignInMenu', () => {
  beforeEach(() => {
    state.current = { ready: true, signedIn: false, isAuthor: false };
    auth.signIn.mockReset();
    auth.signOut.mockReset();
  });

  test('signed out, "Sign in" opens the two routes', () => {
    render(<SignInMenu />);
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByRole('menuitem', { name: 'Flevoland-account' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Medewerker' })).toBeInTheDocument();
  });

  test('each entry signs in through its own route', () => {
    render(<SignInMenu />);
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Flevoland-account' }));
    expect(auth.signIn).toHaveBeenCalledWith('flevoland');

    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Medewerker' }));
    expect(auth.signIn).toHaveBeenCalledWith('medewerker');
  });

  test('signed in, it shows the name and "Sign out"', () => {
    state.current = { ready: true, signedIn: true, isAuthor: true, name: 'Steven G' };
    render(<SignInMenu />);
    expect(screen.getByText('Steven G')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(auth.signOut).toHaveBeenCalled();
  });
});
