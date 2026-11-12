/* global window */
// The sign-in or sign-out popup lands here when Keycloak is done (#163). Tell
// the app's tabs, which then pick up the session with a silent check, and
// close. The authorization code in the URL is not used.
try {
  new window.BroadcastChannel('lde-auth').postMessage('done');
} catch {
  // No BroadcastChannel: the app notices the popup closing instead.
}
window.close();
