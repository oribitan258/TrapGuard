// Minimal host-page fixtures that reproduce each AI surface's upload SHAPE so the
// gate can be exercised offline. Served to the real host URLs via Playwright route
// fulfillment (see fixtures.ts), so the extension's content scripts inject exactly
// as they would on the live site.
//
// The inline <script> bodies are plain strings (run in the page, not typechecked)
// and expose window.__uploadStatus / window.__uploadError for the spec to poll.

const shell = (script: string): string => `<!doctype html>
<html lang="en"><head><meta charset="utf-8" /><title>TrapGuard E2E fixture</title></head>
<body>
  <input id="file" type="file" />
  <button id="send">send</button>
  <div id="status">idle</div>
  <script>${script}</script>
</body></html>`;

// Claude: same-origin multipart POST — the File rides in a FormData entry.
const claudeScript = `
document.getElementById('send').addEventListener('click', async () => {
  const file = document.getElementById('file').files[0];
  const form = new FormData();
  form.append('file', file, file.name);
  try {
    const res = await fetch('/api/upload', { method: 'POST', body: form });
    window.__uploadStatus = res.status;
    document.getElementById('status').textContent = 'ok:' + res.status;
  } catch (err) {
    window.__uploadError = (err && err.name) || String(err);
    document.getElementById('status').textContent = 'err:' + window.__uploadError;
  }
});
`;

// ChatGPT: two-step — POST JSON metadata (no file), then PUT the raw File to the
// returned presigned URL. The gate must catch the PUT by method + body shape.
const chatgptScript = `
document.getElementById('send').addEventListener('click', async () => {
  const file = document.getElementById('file').files[0];
  try {
    const meta = await fetch('/backend-api/files', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ file_name: file.name, file_size: file.size }),
    });
    const data = await meta.json();
    const put = await fetch(data.upload_url, {
      method: 'PUT',
      headers: { 'content-type': file.type || 'application/octet-stream' },
      body: file,
    });
    window.__uploadStatus = put.status;
    document.getElementById('status').textContent = 'ok:' + put.status;
  } catch (err) {
    window.__uploadError = (err && err.name) || String(err);
    document.getElementById('status').textContent = 'err:' + window.__uploadError;
  }
});
`;

export const CLAUDE_HTML = shell(claudeScript);
export const CHATGPT_HTML = shell(chatgptScript);
