/* global localStorage, document */
// Apply the saved theme before first paint to avoid a flash.
// A file, not an inline script, so the Content-Security-Policy can forbid inline scripts.
try {
  var t = localStorage.getItem('ml-theme');
  if (t) document.documentElement.dataset.theme = t;
} catch {
  // Storage blocked: the default theme is fine.
}
