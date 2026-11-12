/**
 * The message to show when the backend refuses a state-changing call for want
 * of a sign-in (#163): 401 asks to sign in, 403 says the role lde-author is
 * missing. Any other status is not a sign-in problem (null).
 */
export function authProblemMessage(status: number | undefined, verb: string): string | null {
  if (status === 401) return `Sign in to ${verb}`;
  if (status === 403) return `You need permission to ${verb}`;
  return null;
}
