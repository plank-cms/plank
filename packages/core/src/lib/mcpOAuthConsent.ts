import { createHash } from 'node:crypto'
import Handlebars from 'handlebars'

const styles = `
:root {
  color-scheme: light dark;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
  --background: light-dark(#f5f5f5, #0c0c0c);
  --panel: light-dark(#fff, #141414);
  --inset: light-dark(#f7f7f7, #1b1b1b);
  --text: light-dark(#191919, #fafafa);
  --muted: light-dark(#525252, #a8a8a8);
  --border: light-dark(#dedede, #303030);
  --primary: light-dark(#171717, #fafafa);
  --primary-hover: light-dark(#333, #dcdcdc);
  --on-primary: light-dark(#fff, #171717);
}
* { box-sizing: border-box; }
body {
  display: grid;
  place-items: center;
  min-block-size: 100vh;
  min-block-size: 100dvh;
  margin: 0;
  padding: 1rem;
  background: var(--background);
  color: var(--text);
}
main {
  width: min(100%, 28rem);
  padding: clamp(1.25rem, 5vw, 2rem);
  border: 1px solid var(--border);
  border-radius: 1rem;
  background: var(--panel);
}
.brand {
  margin: 0 0 1.5rem;
  color: var(--text);
  font-weight: 750;
  letter-spacing: -.04em;
}
h1 {
  margin: 0;
  font-size: clamp(1.5rem, 5vw, 1.875rem);
  letter-spacing: -.035em;
  line-height: 1.2;
}
p {
  margin: .625rem 0 0;
  color: var(--muted);
  line-height: 1.55;
  overflow-wrap: anywhere;
}
strong { color: var(--text); }
.access {
  margin-block: 1.375rem;
  padding: .875rem 1rem;
  border: 1px solid var(--border);
  border-radius: .625rem;
  background: var(--inset);
  font-size: .875rem;
}
form {
  display: flex;
  flex-wrap: wrap;
  justify-content: end;
  gap: .625rem;
}
button {
  min-height: 2.75rem;
  padding: .6rem 1rem;
  border: 1px solid var(--border);
  border-radius: .5rem;
  background: var(--panel);
  color: var(--text);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 150ms ease, transform 150ms ease;
}
button:not(:disabled):hover { background: var(--inset); }
button:disabled { cursor: not-allowed; opacity: .5; }
button:active { transform: scale(.97); }
button[value="authorize"] {
  border-color: transparent;
  background: var(--primary);
  color: var(--on-primary);
}
button[value="authorize"]:not(:disabled):hover { background: var(--primary-hover); }
a {
  color: var(--text);
  text-underline-offset: .2em;
}
a:hover { color: var(--muted); }
button:focus-visible, a:focus-visible {
  outline: 2px solid var(--text);
  outline-offset: 3px;
}
.sign-in {
  margin-block-start: 1.25rem;
  font-size: .8125rem;
}
@media (prefers-reduced-motion: reduce) {
  button { transition: none; }
  button:active { transform: none; }
}
`

export const mcpOAuthConsentStyleHash = createHash('sha256').update(styles).digest('base64')

export function renderMcpOAuthConsent(
  clientName: string,
  action: string,
  account?: { id: string; email: string },
  canAuthorize = true,
) {
  const session = account
    ? `Signed in as <strong>${Handlebars.escapeExpression(account.email)}</strong>.`
    : 'Sign in to Plank before authorizing this connection.'
  const accountField = account
    ? `<input type="hidden" name="account_id" value="${Handlebars.escapeExpression(account.id)}">`
    : ''
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Authorize Plank MCP</title>
  <style>${styles}</style>
</head>
<body>
  <main aria-labelledby="consent-title">
    <p class="brand">Plank</p>
    <h1 id="consent-title">Authorize access to Plank</h1>
    <p><strong>${Handlebars.escapeExpression(clientName)}</strong> is requesting access.</p>
    <p class="access">This connection can read content and work on drafts according to your Plank role.</p>
    <p>${session}</p>
    ${account && !canAuthorize ? '<p>This OAuth client is registered to a different Plank account.</p>' : ''}
    <form method="post" action="${Handlebars.escapeExpression(action)}">
      ${accountField}
      <button type="submit" name="decision" value="deny">Deny</button>
      <button type="submit" name="decision" value="authorize"${account && canAuthorize ? '' : ' disabled'}>Authorize</button>
    </form>
    <p class="sign-in">Need to sign in or switch accounts? <a href="/admin" target="_blank" rel="noopener noreferrer">Open the Plank admin</a>, then reload this page.</p>
  </main>
</body>
</html>`
}
