// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import type { AuthState } from '../../services/auth';

const state = vi.hoisted(() => ({
  current: { ready: true, signedIn: false, isAuthor: false } as AuthState,
}));
vi.mock('../../services/auth', () => ({
  getAuthState: () => state.current,
  subscribe: () => () => undefined,
}));

import LockedAction from './LockedAction';

describe('LockedAction', () => {
  beforeEach(() => {
    state.current = { ready: true, signedIn: false, isAuthor: false };
  });

  test('signed out: disabled, with a lock and "Sign in to deploy"', () => {
    const onClick = vi.fn();
    render(
      <LockedAction verb="deploy" onClick={onClick}>
        Deploy
      </LockedAction>
    );
    const button = screen.getByRole('button', { name: /Deploy/ });
    expect(button).toBeDisabled();
    expect(screen.getByText('Sign in to deploy')).toBeInTheDocument();
    expect(button.querySelector('svg')).not.toBeNull();
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  test('signed in without the role: "You need permission to deploy"', () => {
    state.current = { ready: true, signedIn: true, isAuthor: false, name: 'X' };
    render(<LockedAction verb="deploy">Deploy</LockedAction>);
    expect(screen.getByRole('button', { name: /Deploy/ })).toBeDisabled();
    expect(screen.getByText('You need permission to deploy')).toBeInTheDocument();
  });

  test('an author gets the normal, working button and no hint', () => {
    state.current = { ready: true, signedIn: true, isAuthor: true, name: 'X' };
    const onClick = vi.fn();
    render(
      <LockedAction verb="deploy" onClick={onClick}>
        Deploy
      </LockedAction>
    );
    const button = screen.getByRole('button', { name: 'Deploy' });
    expect(button).toBeEnabled();
    expect(screen.queryByText(/Sign in to|You need permission/)).toBeNull();
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalled();
  });

  test("an author's button still honours its own disabled", () => {
    state.current = { ready: true, signedIn: true, isAuthor: true };
    render(
      <LockedAction verb="deploy" disabled>
        Deploy
      </LockedAction>
    );
    expect(screen.getByRole('button', { name: 'Deploy' })).toBeDisabled();
  });
});
