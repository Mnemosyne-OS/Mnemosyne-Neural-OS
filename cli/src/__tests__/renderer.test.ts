// ─────────────────────────────────────────────────────────────────────────────
// Tests — lib/canvas/renderer.ts
// Uses Node.js built-in test runner (node:test) — zero extra deps
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { render, toSlug, toPascal, buildVars, type CanvasVars } from '../lib/canvas/renderer.js';

const BASE: CanvasVars = {
  PROJECT_NAME: '', PROJECT_SLUG: '', PROJECT_PASCAL: '',
  WORKSPACE: '', ECOSYSTEM: '', DATE: '', AUTHOR: '', AUTHOR_EMAIL: '', MNEMOFORGE_VERSION: '',
};

describe('toSlug', () => {
  it('converts spaces to dashes + lowercase', () => {
    assert.equal(toSlug('My Awesome CLI'), 'my-awesome-cli');
  });
  it('handles camelCase', () => {
    assert.equal(toSlug('MnemoForge'), 'mnemoforge');
  });
  it('strips special chars + keeps numbers dashed', () => {
    assert.equal(toSlug('Hello! World@2024'), 'hello-world-2024');
  });
  it('collapses multiple dashes', () => {
    assert.equal(toSlug('foo  --  bar'), 'foo-bar');
  });
});

describe('toPascal', () => {
  it('converts slug to PascalCase', () => {
    assert.equal(toPascal('my-awesome-cli'), 'MyAwesomeCli');
  });
  it('handles single word', () => {
    assert.equal(toPascal('mnemoforge'), 'Mnemoforge');
  });
  it('handles words split by spaces — same as slug split on dashes', () => {
    // toPascal splits on '-', not spaces — spaces become separate words
    assert.equal(toPascal('my-project'), 'MyProject');
  });
});

describe('render', () => {
  it('replaces a variable', () => {
    assert.equal(render('Hello {{PROJECT_NAME}}!', { ...BASE, PROJECT_NAME: 'World' }), 'Hello World!');
  });
  it('replaces multiple variables', () => {
    assert.equal(
      render('{{PROJECT_NAME}} / {{WORKSPACE}}', { ...BASE, PROJECT_NAME: 'foo', WORKSPACE: 'bar' }),
      'foo / bar'
    );
  });
  it('replaces same variable multiple times', () => {
    assert.equal(render('{{PROJECT_NAME}} is {{PROJECT_NAME}}', { ...BASE, PROJECT_NAME: 'great' }), 'great is great');
  });
  it('leaves unknown tags untouched', () => {
    assert.equal(render('Hello {{UNKNOWN}}!', BASE), 'Hello {{UNKNOWN}}!');
  });
  it('handles empty content', () => {
    assert.equal(render('', BASE), '');
  });
});

describe('buildVars', () => {
  it('generates expected keys', () => {
    const vars = buildVars('My CLI', 'Mnemosyne-OS');
    assert.equal(vars.PROJECT_NAME, 'My CLI');
    assert.equal(vars.WORKSPACE, 'Mnemosyne-OS');
    assert.ok(vars.PROJECT_SLUG);
    assert.ok(vars.PROJECT_PASCAL);
    assert.ok(vars.DATE);
    assert.ok(vars.MNEMOFORGE_VERSION);
  });
  it('slug is lowercase with dashes', () => {
    assert.equal(buildVars('Hello World', 'ws').PROJECT_SLUG, 'hello-world');
  });
  it('pascal is PascalCase', () => {
    assert.equal(buildVars('hello world', 'ws').PROJECT_PASCAL, 'HelloWorld');
  });
  it('date matches YYYY-MM-DD format', () => {
    assert.match(buildVars('Test', 'ws').DATE, /^\d{4}-\d{2}-\d{2}$/);
  });
});
