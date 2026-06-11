/**
 * TrapGuard upload-shape probe — Phase 1 DevTools spike instrument.
 *
 * WHY: the gate must intercept the real upload on chatgpt.com and claude.ai. The
 * agent cannot log into your accounts to observe the live network shapes, so run
 * this yourself: open the site, paste this whole file into the DevTools Console
 * (MAIN world), then attach a file in the chat and send it. It logs every
 * fetch/XHR that carries a File/Blob/FormData body — method, URL, body shape, and
 * the File's {name,type,size}. Copy the output back so we can lock the matcher.
 *
 * It only OBSERVES (no blocking); the real File bytes never leave your browser
 * via this probe. Reload the page to remove it.
 */
(() => {
  const tag = '%c[TG-probe]';
  const css = 'color:#e11d48;font-weight:bold';
  const seen = [];

  const describe = (v) => {
    if (v instanceof File) return { kind: 'File', name: v.name, type: v.type, size: v.size };
    if (v instanceof Blob) return { kind: 'Blob', type: v.type, size: v.size };
    if (v instanceof FormData) {
      const entries = [];
      for (const [k, val] of v.entries()) entries.push([k, describe(val)]);
      return { kind: 'FormData', entries };
    }
    if (v instanceof ArrayBuffer) return { kind: 'ArrayBuffer', byteLength: v.byteLength };
    if (typeof v === 'string') return { kind: 'string', preview: v.slice(0, 120), length: v.length };
    return { kind: typeof v };
  };

  const carriesFile = (shape) => {
    if (!shape) return false;
    if (shape.kind === 'File' || shape.kind === 'Blob') return true;
    if (shape.kind === 'FormData') return shape.entries.some(([, s]) => s.kind === 'File' || s.kind === 'Blob');
    return false;
  };

  const record = (transport, method, url, bodyShape) => {
    const entry = { transport, method, url, body: bodyShape, at: new Date().toISOString() };
    if (carriesFile(bodyShape)) {
      seen.push(entry);
      console.log(tag + ' UPLOAD-SHAPE', css, entry);
    }
  };

  // ── fetch ────────────────────────────────────────────────────────────────
  const origFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    try {
      const method = (init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
      const url = String(input instanceof Request ? input.url : input);
      record('fetch', method, url, describe(init?.body));
    } catch (e) {
      console.warn(tag + ' fetch probe error', css, e);
    }
    return origFetch(input, init);
  };

  // ── XHR ──────────────────────────────────────────────────────────────────
  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.__tgMethod = String(method).toUpperCase();
    this.__tgUrl = String(url);
    return origOpen.call(this, method, url, ...rest);
  };
  XMLHttpRequest.prototype.send = function (body) {
    try {
      record('xhr', this.__tgMethod || 'GET', this.__tgUrl || '', describe(body));
    } catch (e) {
      console.warn(tag + ' xhr probe error', css, e);
    }
    return origSend.call(this, body);
  };

  window.__tgProbe = { seen, dump: () => JSON.stringify(seen, null, 2) };
  console.log(
    tag + ' armed. Attach a file in the chat and send it, then run __tgProbe.dump()',
    css,
  );
})();
