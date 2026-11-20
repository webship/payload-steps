'use strict';

// Versions and previews of a document: its list of versions (each with its
// status: "Draft", "Autosave", "Currently Published", "Current Draft"),
// opening one, what it changed compared with the version before, restoring it
// (published or as a draft); the live preview beside the form (the front end
// of the site in a frame, refreshed as the document changes) and the preview
// link.

const { When, Then } = require('@cucumber/cucumber');
const { friendly } = require('webship-js/tests/step-definitions/webship');
const {
  budget,
  clean,
  same,
  mentions,
  listed,
  adminRoute,
  shortUrl,
  ready,
  personClick,
  visibleOf,
  eventually,
  failure,
  waitForDialog,
  answerDialog,
  chooseFromMenu,
  waitForToast,
} = require('./payload-helpers');
const { requireDocument, currentDocument } = require('./payload-edit.steps');

/** Whether the page is the versions of a document. */
function onVersions(world) {
  return /^\/collections\/[^/]+\/[^/]+\/versions\/?$/.test(adminRoute(world)) || /^\/globals\/[^/]+\/versions\/?$/.test(adminRoute(world));
}

/** The rows of the versions list: [{ locator, date, id, status }]. */
async function versionRows(world) {
  const rows = world.page.locator('table tbody tr');
  const out = [];
  const n = await rows.count().catch(() => 0);
  for (let i = 0; i < n; i += 1) {
    const cells = (await rows.nth(i).locator('td').allInnerTexts().catch(() => [])).map(clean);
    out.push({ locator: rows.nth(i), date: cells[0] || '', id: cells[1] || '', status: cells[2] || '' });
  }
  return out;
}

/**
 * Open the versions of the document (its "Versions" tab).
 *
 * Example #1: When I open the versions of the document
 * Example #2: And I open the versions of the document
 * Example #3: When I open the versions of the document
 * Example #4: Then I open the versions of the document
 * Example #5: When I open the versions of the document
 */
When(/^I open the versions of the document$/, async function () {
  // From a version, back to the list of the versions.
  const version = adminRoute(this).match(/^(\/(?:collections\/[^/]+\/[^/]+|globals\/[^/]+)\/versions)\/[^/]+$/);
  if (version) {
    const back = this.page.locator(`a[href$="${version[1]}"], a.doc-tab[href$="/versions"]`).first();
    if (await back.count()) await personClick(this, back, 'the "Versions" tab');
    await eventually(this, () => onVersions(this), (v) => v, () => ({ message: `The versions did not open (${shortUrl(this.page.url())}).`, hint: 'The "Versions" tab lists the document\'s saves.' }));
    await ready(this);
    return;
  }
  await requireDocument(this);
  const tab = this.page.locator('a.doc-tab[href$="/versions"], .doc-tabs a[href$="/versions"]').first();
  if (!(await tab.count())) throw failure(this, 'The document has no "Versions" tab.', 'A collection or a global with versions has the tab beside "Edit".');
  await personClick(this, tab, 'the "Versions" tab');
  await eventually(this, () => onVersions(this), (v) => v, () => ({ message: `The "Versions" tab did not open the versions (${shortUrl(this.page.url())}).`, hint: 'The versions list the document\'s saves.' }));
  await ready(this);
});

/**
 * How many versions the document has (the rows of its versions; up to the
 * page size of that list).
 *
 * Example #1: Then the document should have 3 versions
 * Example #2: Then the document should have 1 version
 * Example #3: And the document should have 2 versions
 * Example #4: Then the document should have 4 versions
 * Example #5: Then the document should have 5 versions
 */
Then(/^the document should have (\d+) versions?$/, async function (expected) {
  if (!onVersions(this)) throw failure(this, `The page is not the versions of a document (${shortUrl(this.page.url())}).`, 'Open them first: "When I open the versions of the document".');
  await eventually(this, async () => {
    const text = clean(await this.page.locator('.page-controls').first().innerText({ timeout: 500 }).catch(() => ''));
    const m = text.match(/of\s+(\d+)/);
    return m ? +m[1] : (await versionRows(this)).length;
  }, (n) => n === +expected, async (n) => ({
    message: `The document has ${n} versions, not ${expected}: ${listed((await versionRows(this)).map((r) => `${r.date} ${r.status}`))}.`,
    hint: 'Every save makes a version: a draft, a publication, and each save of autosave.',
  }));
});

/**
 * One of the versions carries a status ("Currently Published", "Current
 * Draft", "Autosave", "Draft", "Published").
 *
 * Example #1: Then a version should be marked "Currently Published"
 * Example #2: Then a version should be marked "Current Draft"
 * Example #3: And a version should be marked "Autosave"
 * Example #4: Then a version should be marked "Draft"
 * Example #5: Then a version should be marked "Published"
 */
Then(/^a version should be marked "([^"]*)"$/, async function (status) {
  if (!onVersions(this)) throw failure(this, `The page is not the versions of a document (${shortUrl(this.page.url())}).`, 'Open them first: "When I open the versions of the document".');
  await eventually(this, () => versionRows(this), (rows) => rows.some((r) => mentions(r.status, status)), (rows) => ({
    message: `No version is marked "${status}". The versions: ${listed(rows.map((r) => `${r.date}: ${r.status}`))}.`,
    hint: 'A version is marked by its status in the last column of the versions.',
  }));
});

/**
 * Open a version: the first one marked with a status, or one by its place in
 * the list (1 is the newest).
 *
 * Example #1: When I open the version marked "Currently Published"
 * Example #2: When I open version 2 of the document
 * Example #3: And I open the version marked "Current Draft"
 * Example #4: When I open version 1 of the document
 * Example #5: When I open the version marked "Draft"
 */
When(/^I open (?:the version marked "([^"]*)"|version (\d+) of the document)$/, async function (status, place) {
  if (!onVersions(this)) throw failure(this, `The page is not the versions of a document (${shortUrl(this.page.url())}).`, 'Open them first: "When I open the versions of the document".');
  const rows = await versionRows(this);
  const row = status ? rows.find((r) => mentions(r.status, status)) : rows[+place - 1];
  if (!row) {
    throw failure(this, status ? `No version is marked "${status}".` : `There is no version ${place}.`, `The versions: ${listed(rows.map((r) => `${r.date}: ${r.status}`))}.`);
  }
  await personClick(this, row.locator.locator('a').first(), `the version of ${row.date}`);
  await eventually(this, () => adminRoute(this), (r) => /\/versions\/[^/]+$/.test(r), () => ({ message: `The version did not open (${shortUrl(this.page.url())}).`, hint: 'A version opens with the date in its row.' }));
  await ready(this);
});

/** The rows of the comparison of a version: [{ field, before, after }]. */
async function differences(world) {
  return world.page.evaluate(() => {
    const out = [];
    const rows = document.querySelectorAll('.field-diff, [class*="field-diff-container"], .render-field-diffs__field, [class*="diff__field"]');
    rows.forEach((row) => {
      const label = row.querySelector('.field-diff-label, [class*="diff-label"], label, .field-label');
      const values = [...row.querySelectorAll('p, .html-diff__diff-old, .html-diff__diff-new, [class*="diff-old"], [class*="diff-new"]')].map((p) => p.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean);
      if (label) out.push({ field: label.textContent.replace(/\s+/g, ' ').trim(), values, text: row.textContent.replace(/\s+/g, ' ').trim() });
    });
    if (!out.length) {
      // Fallback: the page text of the comparison.
      const main = document.querySelector('main') || document.body;
      out.push({ field: '', values: [], text: main.textContent.replace(/\s+/g, ' ').trim() });
    }
    return out;
  }).catch(() => []);
}

/**
 * The version opened changed a field compared with the version before it: the
 * field by its label, with its value before and after.
 *
 * Example #1: Then the version should change "Title" from "Version test post" to "Version test post, changed"
 * Example #2: Then the version should change "Status" from "Draft" to "Published"
 * Example #3: And the version should change "Title" from "Version test post, changed" to "Version test post"
 * Example #4: Then the version should change "Slug" from "old-slug" to "new-slug"
 * Example #5: Then the version should change "Status" from "Published" to "Draft"
 */
Then(/^the version should change "([^"]*)" from "([^"]*)" to "([^"]*)"$/, async function (field, before, after) {
  if (!/\/versions\/[^/]+$/.test(adminRoute(this))) throw failure(this, `The page is not a version of a document (${shortUrl(this.page.url())}).`, 'Open one first: "When I open the version marked "..."".');
  await ready(this);
  await eventually(this, () => differences(this), (rows) => rows.some((r) => (same(r.field, field) || !r.field) && mentions(r.text, before) && mentions(r.text, after) && (!r.field || r.text.indexOf(before) <= r.text.lastIndexOf(after))), (rows) => ({
    message: `The version does not show "${field}" changed from "${before}" to "${after}". It shows ${listed(rows.map((r) => r.field ? `${r.field}: ${r.values.join(' -> ')}` : r.text.slice(0, 300)))}.`,
    hint: 'The comparison lists each field the version changed ("Modified only"), with its value before and after.',
  }));
});

/**
 * Restore the version opened ("Restore this version"), or restore it as a
 * draft (its menu: "Restore as draft"), confirming; the admin then shows the
 * document's form.
 *
 * Example #1: When I restore this version
 * Example #2: When I restore this version as a draft
 * Example #3: And I restore this version
 * Example #4: When I restore this version as a draft
 * Example #5: Then I restore this version
 */
When(/^I restore this version( as a draft)?$/, async function (asDraft) {
  if (!/\/versions\/[^/]+$/.test(adminRoute(this))) throw failure(this, `The page is not a version of a document (${shortUrl(this.page.url())}).`, 'Open one first: "When I open the version marked "..."".');
  await ready(this);
  const since = Date.now();
  if (asDraft) {
    const trigger = this.page.locator('.restore-version .popup-button, .restore-version__chevron, button:has-text("Restore this version") + * button, .popup .popup-button').last();
    await chooseFromMenu(this, trigger, 'Restore as draft', 'the menu of "Restore this version"');
  } else {
    const button = this.page.getByRole('button', { name: 'Restore this version', exact: true }).first();
    if (!(await button.count())) throw failure(this, 'The version has no "Restore this version" button.', 'The current version cannot be restored; open an older one.');
    await personClick(this, button, 'the "Restore this version" button');
  }
  const dialog = await waitForDialog(this, 'Confirm Version Restoration');
  await answerDialog(this, dialog, 'Confirm');
  await eventually(this, () => currentDocument(this), (d) => !!d && !/\/versions/.test(adminRoute(this)), () => ({ message: `The admin did not go back to the document after the restoration (${shortUrl(this.page.url())}).`, hint: 'After a restoration the admin shows the document\'s form.' }), budget(this));
  await waitForToast(this, 'Restored', since, 5000);
  await ready(this);
});

// ---------------------------------------------------------------------------
// Live preview and the preview link
// ---------------------------------------------------------------------------

/** The frame of the live preview. */
function previewFrame(world) {
  return world.page.frameLocator('.live-preview-window iframe, iframe.iframe-loader__iframe').first();
}

/**
 * Open or close the live preview beside the form (its toggle), and wait for
 * the front end to load in its frame.
 *
 * Example #1: When I open the live preview
 * Example #2: When I close the live preview
 * Example #3: And I open the live preview
 * Example #4: And I close the live preview
 * Example #5: When I open the live preview
 */
When(/^I (open|close) the live preview$/, async function (action) {
  await requireDocument(this);
  const toggle = this.page.locator('#live-preview-toggler, button[aria-label="Live Preview"]').first();
  if (!(await toggle.count())) throw failure(this, 'The form has no live preview toggle.', 'A collection with live preview shows it beside the "Preview" link once the document has a slug.');
  const active = /live-preview-toggler--active/.test((await toggle.getAttribute('class')) || '');
  if (active !== (action === 'open')) await personClick(this, toggle, 'the "Live Preview" toggle');
  const window_ = this.page.locator('.live-preview-window--is-live-previewing');
  await eventually(this, async () => (await window_.count()) > 0, (open) => open === (action === 'open'), () => ({ message: `The live preview did not ${action}.`, hint: 'The toggle beside the "Preview" link opens and closes it.' }));
  if (action === 'open') {
    await eventually(this, () => previewFrame(this).locator('body').innerText({ timeout: 1000 }).catch(() => ''), (t) => clean(t).length > 0, () => ({ message: 'The live preview shows nothing.', hint: 'The frame loads the front end\'s page of the document in draft mode.' }), budget(this));
  }
});

/**
 * The page of the live preview shows a text (its heading or its content),
 * once the preview has caught up with the form's last change.
 *
 * Example #1: Then the live preview should show "Preview test post"
 * Example #2: Then the live preview should show "Preview test post, changed"
 * Example #3: And the live preview should show "A paragraph typed in the editor."
 * Example #4: Then the live preview should show "Exit preview mode"
 * Example #5: Then the live preview should show "Date Published"
 */
Then(/^the live preview should show "([^"]*)"$/, async function (text) {
  await requireDocument(this);
  if (!(await this.page.locator('.live-preview-window--is-live-previewing').count())) {
    throw failure(this, 'The live preview is not open.', 'Open it first: "When I open the live preview".');
  }
  await eventually(this, async () => clean(await previewFrame(this).locator('body').innerText({ timeout: 1000 }).catch(() => '')), (t) => mentions(t, text), (t) => ({
    message: `The live preview does not show "${text}". It shows "${t.slice(0, 300)}".`,
    hint: 'The preview catches up once autosave has saved the change; a document without a slug has no page to preview.',
  }), budget(this) * 2);
});

/**
 * The form's "Preview" link opens a page of the front end (its path; the
 * preview's secret and the draft mode are the site's).
 *
 * Example #1: Then the preview link should open "/posts/preview-test-post"
 * Example #2: Then the preview link should open "/contact"
 * Example #3: And the preview link should open "/posts/version-test-post"
 * Example #4: Then the preview link should open "/home"
 * Example #5: Then the preview link should open "/posts/data-step-post"
 */
Then(/^the preview link should open "([^"]*)"$/, async function (path) {
  await requireDocument(this);
  const link = this.page.locator('a#preview-button, a[aria-label="Preview"]').first();
  await eventually(this, async () => {
    const href = (await link.getAttribute('href').catch(() => '')) || '';
    try {
      const url = new URL(href, this.page.url());
      return url.searchParams.get('path') || url.pathname;
    } catch {
      return '';
    }
  }, (p) => p === path, (p) => ({
    message: p ? `The preview link opens "${p}", not "${path}".` : 'The form has no "Preview" link.',
    hint: 'The link follows the document\'s slug once it is saved.',
  }));
});

module.exports = { onVersions, versionRows, friendly };
