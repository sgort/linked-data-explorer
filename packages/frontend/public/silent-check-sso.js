/* global window */
// keycloak-js's silent check-sso loads this page in a hidden frame and reads
// the result of the check from its URL (#163).
window.parent.postMessage(window.location.href, window.location.origin);
