import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { runInNewContext } from "node:vm";

// Exercise the actual entry point with Obsidian's boundaries stubbed; no runtime deployment.
const bundled = await build({
  entryPoints: [fileURLToPath(new URL('../src/main.ts', import.meta.url))],
  bundle: true, write: false, platform: 'node', format: 'cjs', external: ['obsidian'],
});
const code = bundled.outputFiles[0]!.text;

function harness(loadData = async () => ({ lintOnSave: true, lintOnFocus: true })) {
  const counts = { reads: 0, cachedReads: 0, inventories: 0, attempts: 0, writes: 0, saves: 0, timers: 0 };
  const handlers: Array<{ event: string; callback: Function }> = [];
  const commands: any[] = [];
  const disposers: Function[] = [];
  class TFile {
    path = 'Inbox/Explicit.md'; extension = 'md'; basename = 'Explicit'; name = 'Explicit.md';
    parent = { path: 'Inbox', children: [this] };
  }
  const file = new TFile();
  let body = '# lowercase\n';
  const on = (event: string, callback: Function) => { const ref = { event, callback }; handlers.push(ref); return ref; };
  const app = {
    workspace: { on, getActiveFile: () => file },
    vault: {
      on, getFileByPath: () => file,
      read: async () => { counts.reads++; return body; },
      cachedRead: async () => { counts.cachedReads++; return body; },
      getFiles: () => { counts.inventories++; return [file]; },
      getMarkdownFiles: () => { counts.inventories++; return [file]; },
      process: async (_file: unknown, fn: (s: string) => string) => {
        counts.attempts++; const next = fn(body); if (next !== body) counts.writes++; body = next;
      },
    },
    plugins: { getPlugin: () => null },
  };
  class Plugin {
    app = app; manifest = { id: 'tps-linter' };
    loadData = loadData;
    async saveData() { counts.saves++; }
    register(fn: Function) { disposers.push(fn); }
    addCommand(command: any) { commands.push(command); }
    addSettingTab() {}
    registerEvent(ref: any) { disposers.push(() => handlers.splice(handlers.indexOf(ref), 1)); }
    registerInterval() { counts.timers++; }
    registerDomEvent() { throw new Error('Unexpected automatic DOM listener'); }
  }
  const module = { exports: {} as any };
  runInNewContext(code, {
    module, exports: module.exports,
    require: () => ({ Plugin, TFile, PluginSettingTab: class {}, Notice: class {} }),
    console, setTimeout: () => { counts.timers++; }, setInterval: () => { counts.timers++; },
  });
  const plugin = new module.exports.default();
  return { plugin, counts, commands, handlers, body: () => body,
    unload() { plugin.onunload(); for (const dispose of disposers.reverse()) dispose(); },
    async emit(event: string) { for (const h of handlers.filter(h => h.event === event)) await h.callback(file); },
  };
}

test('legacy auto flags register no maintenance and event bursts perform zero work', async () => {
  const h = harness(); await h.plugin.onload();
  assert.deepEqual(h.handlers.map(h => h.event), ['file-menu']);
  assert.deepEqual(h.commands.map(c => c.id), ['check-current-note', 'clean-current-note']);
  for (let i = 0; i < 100; i++) {
    for (const event of ['file-open', 'active-leaf-change', 'editor-change', 'modify', 'create', 'rename', 'resolved']) await h.emit(event);
  }
  assert.deepEqual(h.counts, { reads: 0, cachedReads: 0, inventories: 0, attempts: 0, writes: 0, saves: 0, timers: 0 });
  assert.equal(h.body(), '# lowercase\n');
  h.unload(); assert.equal(h.handlers.length, 0);
});

test('explicit Check is read-only and Clean still changes the selected note', async () => {
  const h = harness(); await h.plugin.onload();
  await h.plugin.checkActiveNote('command', false);
  assert.equal(h.counts.reads, 1); assert.equal(h.counts.attempts, 0);
  await h.plugin.cleanActiveNote('command', false);
  assert.equal(h.body(), '# Lowercase\n');
  assert.equal(h.counts.attempts, 1); assert.equal(h.counts.writes, 1);
  assert.equal(h.counts.inventories, 0); h.unload();
});

test('unload during startup settings read registers no owners afterward', async () => {
  let resolve!: (value: any) => void;
  const pending = new Promise<any>(r => { resolve = r; });
  const h = harness(() => pending);
  const loading = h.plugin.onload(); h.unload(); resolve({ lintOnSave: true }); await loading;
  assert.equal(h.commands.length, 0); assert.equal(h.handlers.length, 0);
  assert.equal(h.counts.attempts, 0); assert.equal(h.counts.timers, 0);
});
