import { isolate } from "./fixtures.js";

// Starts the real express app on an ephemeral port inside an isolated cwd.
// trust: object returned by the mocked trustManager.refreshTrustData.
export async function startServer(trust) {
  const env = isolate("keybox-server-");
  const { app } = await import("../src/server.js");
  const database = await import("../src/db.js");
  const { trustManager } = await import("../src/trust-manager.js");
  const db = database.initDb();
  const original = trustManager.refreshTrustData;
  const originalFetch = globalThis.fetch;
  const state = { trust, fetched: [], posted: [], urlBodies: {} };
  trustManager.refreshTrustData = async () => state.trust;
  // Only loopback reaches the network; everything else is served from urlBodies.
  globalThis.fetch = async (url, opts) => {
    if (String(url).startsWith(state.base)) return originalFetch(url, opts);
    state.fetched.push(String(url));
    if (opts?.method === "POST" && opts.body) state.posted.push({ url: String(url), body: JSON.parse(opts.body) });
    const body = state.urlBodies[url] ?? (opts?.method === "POST" ? "" : undefined);
    if (body === undefined) throw new Error(`unexpected network fetch ${url}`);
    return { ok: true, status: 200, text: async () => body, json: async () => ({ ok: true }) };
  };
  const server = await new Promise(resolve => { const s = app.listen(0, "127.0.0.1", () => resolve(s)); });
  state.base = `http://127.0.0.1:${server.address().port}`;
  return {
    ...state, state, db, database, trustManager,
    get base() { return state.base; },
    async close() {
      await new Promise(resolve => server.close(resolve));
      server.closeAllConnections?.();
      trustManager.refreshTrustData = original;
      globalThis.fetch = originalFetch;
      db.close();
      env.restore();
    }
  };
}

export const postJson = (base, path, body) => fetch(base + path, {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
});

export const postText = (base, path, text) => fetch(base + path, {
  method: "POST", headers: { "Content-Type": "text/plain" }, body: text
});

export function postFiles(base, path, files) {
  const form = new FormData();
  for (const [name, content] of files) form.append("files", new Blob([content]), name);
  return fetch(base + path, { method: "POST", body: form });
}
