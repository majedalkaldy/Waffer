import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

test('client announces readiness on first load and renders the selected language immediately', async () => {
  const source = fs.readFileSync(new URL('../app-module.js', import.meta.url), 'utf8');
  const context = {};
  for (const match of source.matchAll(/import\s+[\s\S]*?from\s+'([^']+)';/g)) {
    Object.assign(context, await import(new URL('..' + match[1], import.meta.url)));
  }
  const elements = new Map();
  const listeners = new Map();
  function element(id) {
    if (!elements.has(id)) elements.set(id, {
      value: id === 'localeSelect' ? 'ar-SA' : '',
      files: [], disabled: false,
      options: id === 'localeSelect' ? [{ value: 'ar-SA' }, { value: 'en-SA' }] : [],
      classList: { contains: () => true },
      addEventListener: (type, fn) => listeners.set(id + ':' + type, fn)
    });
    return elements.get(id);
  }
  const events = [];
  const renderedLanguages = [];
  const window = {
    dispatchEvent: event => events.push(event.type),
    wafferRenderFieldTestDashboard: () => renderedLanguages.push(window.wafferLocale)
  };
  vm.runInNewContext(source.replace(/import\s+[\s\S]*?from\s+'[^']+';/g, ''), {
    ...context, window,
    document: { documentElement: {}, getElementById: element, querySelector: element },
    localStorage: { getItem: () => null, setItem() {} },
    CustomEvent: class { constructor(type) { this.type = type; } },
    updateFormHint() {}
  });
  assert.deepEqual(events, ['wafferClientModulesReady']);
  assert.equal(renderedLanguages.at(-1), 'ar-SA');
  element('localeSelect').value = 'en-SA';
  listeners.get('localeSelect:change')();
  assert.equal(renderedLanguages.at(-1), 'en-SA');
  assert.equal(events.length, 1);
});
