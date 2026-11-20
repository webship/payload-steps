'use strict';

// The edit view of a document (and of a global): making and opening one, every
// kind of field by its label, the tabs of a form, the slug, publishing,
// unpublishing, saving, the status, autosave, the notifications, the errors of
// a field, deleting and duplicating, and leaving a form with changes.
//
// A collection with drafts and autosave (the website template's pages and
// posts) makes a new document as soon as its form opens, and saves every
// change as a draft by itself: the form has "Publish changes" and no "Save".
// A collection without drafts (media, the accounts) and a global have "Save".

const { When, Then } = require('@cucumber/cucumber');
const { friendly } = require('webship-js/tests/step-definitions/webship');
const {
  budget,
  clean,
  same,
  mentions,
  listed,
  adminUrl,
  adminRoute,
  shortUrl,
  open,
  ready,
  afterAction,
  personClick,
  visibleOf,
  eventually,
  failure,
  waitForToast,
  toastsSince,
  waitForDialog,
  answerDialog,
  chooseFromMenu,
  fieldScope,
  requireField,
  fieldKind,
  setField,
  fieldValue,
  fieldError,
  uploadedFiles,
  richTextEditor,
  writeRichText,
  answersSince,
  collectionSlug,
  findDocuments,
  titleField,
  deleteAfter,
} = require('./payload-helpers');

// ---------------------------------------------------------------------------
// The document the page shows
// ---------------------------------------------------------------------------

/** { kind: 'collection'|'global'|'account', slug, id } of the edit view the page shows, or null. */
function currentDocument(world) {
  const route = adminRoute(world);
  let m = route.match(/^\/collections\/([^/]+)\/([^/]+)$/);
  if (m) return { kind: 'collection', slug: decodeURIComponent(m[1]), id: decodeURIComponent(m[2]) };
  m = route.match(/^\/globals\/([^/]+)$/);
  if (m) return { kind: 'global', slug: decodeURIComponent(m[1]), id: null };
  if (/^\/account$/.test(route)) return { kind: 'account', slug: 'users', id: null };
  return null;
}

/** The edit view the page shows, ready, or a failure. */
async function requireDocument(world) {
  await ready(world);
  const doc = currentDocument(world);
  if (!doc || !(await world.page.locator('.doc-controls, form.collection-edit__form, .collection-edit, .global-edit, .account').count())) {
    throw failure(world, `The page is not the form of a document (${shortUrl(world.page.url())}).`, 'Open one first: "When I open the document "..." in "Posts"" or "When I create a new document in "Posts"".');
  }
  return doc;
}

/** The status the document shows ("Draft", "Published", "Changed"), or ''. */
async function documentStatus(world) {
  return clean(await world.page.locator('.doc-controls .status__value').first().textContent({ timeout: 500 }).catch(() => ''));
}

/** The save button of the form (#action-save: "Publish changes", "Publish" or "Save"). */
function saveButton(world) {
  return world.page.locator('#action-save').first();
}

/** The main heading of the form (the document's title, or its id until it has one). */
async function documentHeading(world) {
  return clean(await world.page.locator('.doc-header__title, h1').first().innerText({ timeout: 500 }).catch(() => ''));
}

// ---------------------------------------------------------------------------
// Making and opening documents
// ---------------------------------------------------------------------------

/**
 * Open the form of a new document of a collection, named as the navigation
 * shows it. A collection with autosave makes the document at once (a draft);
 * the steps delete it after the scenario.
 *
 * Example #1: When I create a new document in "Posts"
 * Example #2: When I create a new document in "Pages"
 * Example #3: And I create a new document in "Media"
 * Example #4: When I create a new document in "Categories"
 * Example #5: When I create a new document in "Posts"
 */
When(/^I create a new document in "([^"]*)"$/, async function (name) {
  if (!(await this.page.locator('a[id^="nav-"]').count().catch(() => 0))) await open(this, adminUrl(this));
  const slug = await collectionSlug(this, name);
  await open(this, adminUrl(this, `collections/${slug}/create`));
  const route = adminRoute(this);
  const m = route.match(new RegExp(`^/collections/${slug}/([^/]+)$`));
  if (!m) {
    const heading = await documentHeading(this);
    throw failure(this, `"${name}" opened no form for a new document (${shortUrl(this.page.url())}${heading ? `: "${heading}"` : ''}).`, 'An account that may not make documents of a collection is refused ("You are not allowed to access this page.").');
  }
  if (m[1] !== 'create') deleteAfter(this, slug, decodeURIComponent(m[1]));
  if (await this.page.locator('.unauthorized').count()) {
    throw failure(this, `The admin refuses a new document in "${name}": "${clean(await this.page.locator('.unauthorized').first().innerText())}".`, 'The account may not make documents of this collection.');
  }
});

/**
 * Open the form of a document of a collection, by its title (the field the
 * collection is titled by: a post's title, an account's name, a file's name).
 *
 * Example #1: When I open the document "Data step post" in "Posts"
 * Example #2: When I open the document "Home" in "Pages"
 * Example #3: And I open the document "Version test post" in "Posts"
 * Example #4: When I open the document "image-post1.webp" in "Media"
 * Example #5: When I open the document "News" in "Categories"
 */
When(/^I open the document "([^"]*)" in "([^"]*)"$/, async function (title, name) {
  if (!(await this.page.locator('a[id^="nav-"]').count().catch(() => 0))) await open(this, adminUrl(this));
  const slug = await collectionSlug(this, name);
  const found = await findDocuments(this, slug, title);
  if (!found.length) {
    throw friendly({ message: `"${name}" has no document "${title}".`, hint: `A document is found by its ${titleField(this, slug)}; make a test document first ("Given there is a document "${title}" in "${name}"").` });
  }
  await open(this, adminUrl(this, `collections/${slug}/${found[0].id}`));
  await requireDocument(this);
});

/**
 * Open the form of a global, named as the navigation shows it.
 *
 * Example #1: When I open the "Header" global
 * Example #2: When I open the "Footer" global
 * Example #3: And I open the "Header" global
 * Example #4: When I open the "Footer" global
 * Example #5: Given I open the "Header" global
 */
When(/^I open the "([^"]*)" global$/, async function (name) {
  if (!(await this.page.locator('a[href*="/globals/"]').count().catch(() => 0))) await open(this, adminUrl(this));
  const links = this.page.locator('a[href*="/globals/"]');
  let slug = '';
  for (const link of await visibleOf(links)) {
    if (same(await link.innerText().catch(() => ''), name)) {
      slug = ((await link.getAttribute('href')) || '').split('/globals/')[1] || '';
      break;
    }
  }
  if (!slug) slug = String(name).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
  await open(this, adminUrl(this, `globals/${slug.replace(/[?#].*$/, '')}`));
  await requireDocument(this);
});

// ---------------------------------------------------------------------------
// Fields
// ---------------------------------------------------------------------------

/**
 * Set a field of the form by its label: a text is typed, a select or a
 * relationship chooses its option (a relationship with several values adds
 * it), a checkbox takes "on" or "off", radio buttons choose by label, a date
 * is typed, a rich text is written, an upload chooses an existing file. The
 * fields of an open drawer come first.
 *
 * Example #1: When I set "Title" to "Editor test post"
 * Example #2: When I set "Categories" to "Design"
 * Example #3: And I set "Hero Image" to "image-post2.webp"
 * Example #4: When I set "Name" to "Editor Webship Two"
 * Example #5: When I set "Alt" to "A white lighthouse at sea"
 */
When(/^I set "([^"]*)" to "([^"]*)"$/, async function (label, value) {
  await ready(this);
  await setField(this, label, value);
});

/**
 * Set several fields of the form, a table of labels and values (with the
 * headings field and value).
 *
 * Example #1: When I set these fields:
 * Example #2: And I set these fields:
 * Example #3: When I set these fields:
 * Example #4: Then I set these fields:
 * Example #5: When I set these fields:
 */
When(/^I set these fields:$/, async function (table) {
  await ready(this);
  for (const row of table.hashes()) await setField(this, row.field, row.value);
});

/**
 * What a field of the form shows, by its label: a text's value, the option
 * of a select, the values of a relationship (", " between them), "on" or
 * "off" for a checkbox, the label of the chosen radio button, the file of an
 * upload, the text of a rich text.
 *
 * Example #1: Then "Title" should be set to "Editor test post"
 * Example #2: Then "Slug" should be set to "editor-test-post"
 * Example #3: And "Categories" should be set to "Design"
 * Example #4: Then "Hero Image" should be set to "image-post2.webp"
 * Example #5: Then "Name" should be set to "Editor Webship"
 */
Then(/^"([^"]*)" should be set to "([^"]*)"$/, async function (label, expected) {
  await ready(this);
  const field = await requireField(this, label);
  await eventually(this, () => fieldValue(this, field), (v) => same(v, expected), (v) => ({
    message: `"${label}" is set to "${v}", not "${expected}".`,
    hint: 'A field reads as the form shows it; a value that follows another field (a slug from the title) changes once that field is saved.',
  }));
});

/**
 * Open a tab of the form (its tabs field), by its name.
 *
 * Example #1: When I open the "Meta" tab
 * Example #2: When I open the "SEO" tab
 * Example #3: And I open the "Content" tab
 * Example #4: When I open the "Hero" tab
 * Example #5: When I open the "Content" tab
 */
When(/^I open the "([^"]*)" tab$/, async function (name) {
  await ready(this);
  const scope = await fieldScope(this);
  const tabs = scope.locator('.tabs-field__tab-button');
  let target = null;
  const names = [];
  for (const tab of await visibleOf(tabs)) {
    const text = clean(await tab.innerText().catch(() => ''));
    names.push(text);
    if (same(text, name)) target = target || tab;
  }
  if (!target) throw failure(this, `The form has no tab "${name}". Its tabs: ${listed(names)}.`, 'A tab is named as the form shows it.');
  if (!/tabs-field__tab-button--active/.test((await target.getAttribute('class')) || '')) await personClick(this, target, `the tab "${name}"`);
  await eventually(this, async () => /--active/.test((await target.getAttribute('class').catch(() => '')) || ''), (a) => a, () => ({ message: `The tab "${name}" did not open.`, hint: 'The open tab is the highlighted one.' }), 5000);
});

/**
 * Write a rich text: the text of the form's (first) rich-text editor, or of
 * the one with a label; "\n" starts a new paragraph.
 *
 * Example #1: When I write "A paragraph typed in the editor." in the rich text editor
 * Example #2: When I write "A first paragraph.\nA second paragraph." in the rich text editor
 * Example #3: And I write "A caption for the test." in the "Caption" rich text editor
 * Example #4: When I write "Changed body text." in the rich text editor
 * Example #5: When I write "A short summary." in the "Rich Text" rich text editor
 */
When(/^I write "([^"]*)" in the (?:"([^"]*)" )?rich text editor$/, async function (text, label) {
  await ready(this);
  const editor = label ? richTextEditor(await requireField(this, label)) : richTextEditor(await fieldScope(this));
  if (!(await editor.count())) throw failure(this, `The form shows no rich-text editor${label ? ` "${label}"` : ''}.`, 'A rich-text editor in another tab shows once its tab is open.');
  await writeRichText(this, editor, text, `the rich-text editor${label ? ` "${label}"` : ''}`);
});

/**
 * The text of a rich text (the form's first rich-text editor, or the one
 * with a label) contains a text.
 *
 * Example #1: Then the rich text editor should contain "A paragraph typed in the editor."
 * Example #2: Then the "Caption" rich text editor should contain "A caption for the test."
 * Example #3: And the rich text editor should contain "A second paragraph."
 * Example #4: Then the rich text editor should contain "Changed body text."
 * Example #5: Then the "Rich Text" rich text editor should contain "A short summary."
 */
Then(/^the (?:"([^"]*)" )?rich text editor should contain "([^"]*)"$/, async function (label, text) {
  await ready(this);
  const editor = label ? richTextEditor(await requireField(this, label)) : richTextEditor(await fieldScope(this));
  await eventually(this, async () => clean(await editor.innerText().catch(() => '')), (t) => mentions(t, text), (t) => ({
    message: `The rich-text editor${label ? ` "${label}"` : ''} holds "${t.slice(0, 200)}", not "${text}".`,
    hint: 'The editor of another tab shows once its tab is open.',
  }));
});

/**
 * A relationship or select field with several values holds (or does not
 * hold) a value, by its text.
 *
 * Example #1: Then the "Categories" field should hold "Design"
 * Example #2: Then the "Categories" field should not hold "Design"
 * Example #3: And the "Related Posts" field should hold "Global Gaze: Beyond the Headlines"
 * Example #4: Then the "Authors" field should hold "Editor Webship"
 * Example #5: Then the "Hero Image" field should hold "image-post2.webp"
 */
Then(/^the "([^"]*)" field should (not )?hold "([^"]*)"$/, async function (label, not, value) {
  await ready(this);
  const field = await requireField(this, label);
  await eventually(this, async () => (await fieldValue(this, field)).split(/,\s*/).map(clean), (values) => values.some((v) => same(v, value)) === !not, (values) => ({
    message: `The field "${label}" ${not ? 'still holds' : 'does not hold'} "${value}". It holds ${listed(values)}.`,
    hint: 'A relationship holds its documents by their titles; an upload its file by its name.',
  }));
});

/**
 * Take a value out of a relationship or select field with several values
 * (its "Remove" button), or the file out of an upload field.
 *
 * Example #1: When I remove "Design" from the "Categories" field
 * Example #2: When I remove "image-post2.webp" from the "Hero Image" field
 * Example #3: And I remove "News" from the "Categories" field
 * Example #4: When I remove "Editor Webship" from the "Authors" field
 * Example #5: When I remove "Global Gaze: Beyond the Headlines" from the "Related Posts" field
 */
When(/^I remove "([^"]*)" from the "([^"]*)" field$/, async function (value, label) {
  await ready(this);
  const field = await requireField(this, label);
  const kind = await fieldKind(field);
  if (kind === 'upload') {
    const files = await uploadedFiles(field);
    if (!files.some((f) => same(f, value))) throw failure(this, `The field "${label}" does not hold "${value}": it holds ${listed(files)}.`, 'An upload holds its file by its name.');
    await personClick(this, field.locator('.upload-relationship-details__remove').first(), `the remove button of "${value}"`);
  } else {
    const values = field.locator('.rs__multi-value');
    let target = null;
    for (const v of await visibleOf(values)) {
      if (same(await v.locator('.relationship--multi-value-label__text, .rs__multi-value__label').first().innerText().catch(() => v.innerText()), value)) target = v;
    }
    if (!target) throw failure(this, `The field "${label}" does not hold "${value}". It holds ${listed(await fieldValue(this, field).then((t) => t.split(/,\s*/)))}.`, 'A value is named by its text in the field.');
    await personClick(this, target.locator('.rs__multi-value__remove, button[aria-label="Remove"]').first(), `the "Remove" button of "${value}"`);
  }
  await eventually(this, async () => (await fieldValue(this, field)).split(/,\s*/).map(clean), (values) => !values.some((v) => same(v, value)), () => ({
    message: `The field "${label}" still holds "${value}" after its remove button.`,
    hint: 'Look at the screenshot of the failure.',
  }), 5000);
});

/**
 * Unlock the slug field, which follows the title until it is unlocked.
 *
 * Example #1: When I unlock the slug
 * Example #2: And I unlock the slug
 * Example #3: When I unlock the slug
 * Example #4: Then I unlock the slug
 * Example #5: When I unlock the slug
 */
When(/^I unlock the slug$/, async function () {
  await ready(this);
  const field = await requireField(this, 'Slug');
  const button = field.getByRole('button', { name: 'Unlock', exact: true });
  if (!(await button.count())) throw failure(this, 'The slug has no "Unlock" button: it is unlocked already, or the form has another slug field.', 'An unlocked slug shows "Lock".');
  await personClick(this, button.first(), 'the "Unlock" button of the slug');
  const input = field.locator('input').first();
  await eventually(this, () => input.isDisabled().catch(() => true), (d) => !d, () => ({ message: 'The slug stayed locked after "Unlock".', hint: 'Look at the screenshot of the failure.' }), 5000);
});

/**
 * The error a field of the form shows (after a save or a publication the
 * form refused), by its label.
 *
 * Example #1: Then the "Title" field should show the error "This field is required."
 * Example #2: Then the "Confirm Password" field should show the error "Passwords do not match."
 * Example #3: And the "Title" field should show the error "This field is required."
 * Example #4: Then the "Email" field should show the error "This field is required."
 * Example #5: Then the "Layout" field should show the error "This field is required."
 */
Then(/^the "([^"]*)" field should show the error "([^"]*)"$/, async function (label, message) {
  await ready(this);
  const field = await requireField(this, label);
  await eventually(this, () => fieldError(field), (e) => mentions(e, message), (e) => ({
    message: e ? `The field "${label}" shows the error "${e}", not "${message}".` : `The field "${label}" shows no error.`,
    hint: 'A field shows its error once a save or a publication was refused for it.',
  }));
});

// ---------------------------------------------------------------------------
// Saving, publishing, the status
// ---------------------------------------------------------------------------

/** Wait for an answer of the API to a change of the document (a save, a publication) since a moment. */
async function waitForSave(world, since, what) {
  const doc = currentDocument(world);
  await eventually(world, () => answersSince(world.page, since).filter((a) => a.kind === 'api' && /^(PATCH|POST)$/.test(a.method) && !/autosave=true/.test(a.url) && (!doc || a.url.includes(`/${doc.kind === 'global' ? 'globals/' : ''}${doc.slug}`) || a.url.includes('/users/'))), (list) => list.length > 0, () => ({
    message: `${what[0].toUpperCase()}${what.slice(1)} sent nothing to the site.`,
    hint: 'A form the site refuses keeps its errors on screen: look at the screenshot of the failure, and at its notification.',
  }));
  await ready(world);
}

/**
 * Publish the document ("Publish changes", or "Publish"), then wait for the
 * site's answer and the notification ("Updated successfully." or the
 * refusal).
 *
 * Example #1: When I publish the document
 * Example #2: And I publish the document
 * Example #3: When I publish the document
 * Example #4: Then I publish the document
 * Example #5: When I publish the document
 */
When(/^I publish the document$/, async function () {
  await requireDocument(this);
  const button = saveButton(this);
  const label = clean(await button.innerText().catch(() => ''));
  if (!/publish/i.test(label)) throw failure(this, `The form has no "Publish changes" button (its save button reads "${label || '(none)'}").`, 'A collection without drafts saves with "Save" ("When I save the document").');
  if (await button.isDisabled().catch(() => false)) throw failure(this, 'The "Publish changes" button is disabled: the form has no change to publish.', 'Change a field first, or the document is published as it is already.');
  const since = Date.now();
  await personClick(this, button, 'the "Publish changes" button');
  const toast = await waitForToast(this, '', since);
  if (toast && toast.type === 'loading') await waitForToast(this, 'successfully', since, budget(this)).then((t) => t || waitForToast(this, '', toast.at + 1, 2000));
  await ready(this);
  this.__payloadLastSave = since;
});

/**
 * Save the form ("Save": a collection without drafts, an account, a global),
 * then wait for the site's answer and the notification.
 *
 * Example #1: When I save the document
 * Example #2: And I save the document
 * Example #3: When I save the document
 * Example #4: Then I save the document
 * Example #5: When I save the document
 */
When(/^I save the document$/, async function () {
  await requireDocument(this);
  const button = saveButton(this);
  const label = clean(await button.innerText().catch(() => ''));
  if (!/^save$/i.test(label)) throw failure(this, `The form has no "Save" button (its save button reads "${label || '(none)'}").`, 'A collection with drafts and autosave saves every change by itself and publishes with "Publish changes" ("When I publish the document").');
  if (await button.isDisabled().catch(() => false)) throw failure(this, 'The "Save" button is disabled: the form has no change to save.', 'Change a field first.');
  const since = Date.now();
  await personClick(this, button, 'the "Save" button');
  const toast = await waitForToast(this, '', since);
  if (toast && toast.type === 'loading') await waitForToast(this, 'successfully', since, budget(this));
  await ready(this);
  this.__payloadLastSave = since;
});

/**
 * Unpublish the document: "Unpublish" in the form's menu, then "Confirm".
 *
 * Example #1: When I unpublish the document
 * Example #2: And I unpublish the document
 * Example #3: When I unpublish the document
 * Example #4: Then I unpublish the document
 * Example #5: When I unpublish the document
 */
When(/^I unpublish the document$/, async function () {
  await requireDocument(this);
  await chooseFromMenu(this, this.page.locator('.doc-controls__popup .popup-button').first(), 'Unpublish', 'the menu of the document');
  const dialog = await waitForDialog(this, 'Confirm unpublish');
  const since = Date.now();
  await answerDialog(this, dialog, 'Confirm');
  if (!(await waitForToast(this, 'Unpublished', since))) throw failure(this, 'The admin did not say the document was unpublished.', 'It says "Unpublished successfully."; look at the screenshot of the failure.', since);
  await ready(this);
});

/**
 * Give the document its published version back ("Revert to published",
 * beside the status "Changed"), confirming when the admin asks.
 *
 * Example #1: When I revert the document to its published version
 * Example #2: And I revert the document to its published version
 * Example #3: When I revert the document to its published version
 * Example #4: Then I revert the document to its published version
 * Example #5: When I revert the document to its published version
 */
When(/^I revert the document to its published version$/, async function () {
  await requireDocument(this);
  const button = this.page.locator('#action-revert-to-published').first();
  if (!(await button.count())) throw failure(this, `The document offers no "Revert to published" (its status is "${await documentStatus(this)}").`, 'A published document that was changed since ("Changed") offers it.');
  const since = Date.now();
  await personClick(this, button, 'the "Revert to published" button');
  const dialog = await waitForDialog(this, '', 3000).catch(() => null);
  if (dialog) await answerDialog(this, dialog, 'Confirm');
  await eventually(this, () => documentStatus(this), (s) => same(s, 'Published'), (s) => ({ message: `The document is "${s}" after "Revert to published", not "Published".`, hint: 'Look at the screenshot of the failure.' }), budget(this));
  this.__payloadLastSave = since;
});

/**
 * The status of the document as the form shows it: "Draft", "Published" or
 * "Changed" (published, with a newer draft).
 *
 * Example #1: Then the status of the document should be "Draft"
 * Example #2: Then the status of the document should be "Published"
 * Example #3: And the status of the document should be "Changed"
 * Example #4: Then the status of the document should be "Published"
 * Example #5: Then the status of the document should be "Draft"
 */
Then(/^the status of the document should be "([^"]*)"$/, async function (expected) {
  await requireDocument(this);
  await eventually(this, () => documentStatus(this), (s) => same(s, expected), (s) => ({
    message: `The status of the document is "${s || '(none)'}", not "${expected}".`,
    hint: 'The status is beside the form\'s buttons: a change after a publication makes it "Changed" once autosave has saved it.',
  }));
});

/**
 * Autosave saved the last change of the document: its draft request answered,
 * and the form says when ("Last saved ...").
 *
 * Example #1: Then the document should be saved automatically
 * Example #2: And the document should be saved automatically
 * Example #3: Then the document should be saved automatically
 * Example #4: And the document should be saved automatically
 * Example #5: Then the document should be saved automatically
 */
Then(/^the document should be saved automatically$/, async function () {
  const doc = await requireDocument(this);
  await eventually(this, async () => ({
    saved: answersSince(this.page, 0).some((a) => a.method === 'PATCH' && /autosave=true/.test(a.url) && a.url.includes(`/${doc.slug}/`) && a.status < 300),
    text: clean(await this.page.locator('.doc-controls .autosave').first().innerText({ timeout: 300 }).catch(() => '')),
  }), (s) => s.saved && /saved/i.test(s.text), (s) => ({
    message: s.saved ? `Autosave answered, but the form says "${s.text || '(nothing)'}".` : 'Autosave saved nothing in this scenario.',
    hint: 'A collection with autosave saves a change as a draft by itself, a moment after it; one without autosave has a "Save" button instead.',
  }));
});

/**
 * The document cannot be published now: its "Publish changes" button is
 * disabled or missing.
 *
 * Example #1: Then I should not be able to publish the document
 * Example #2: And I should not be able to publish the document
 * Example #3: Then I should not be able to publish the document
 * Example #4: And I should not be able to publish the document
 * Example #5: Then I should not be able to publish the document
 */
Then(/^I should not be able to publish the document$/, async function () {
  await requireDocument(this);
  const button = saveButton(this);
  const label = clean(await button.innerText().catch(() => ''));
  if (/publish/i.test(label) && !(await button.isDisabled().catch(() => true))) {
    throw friendly({ message: 'The "Publish changes" button is enabled: the document can be published.', hint: 'The button is disabled while the form has nothing to publish.' });
  }
});

/**
 * A notification the admin showed during the scenario (it keeps each for a
 * few seconds: the steps remember them all), by its text or a part of it.
 *
 * Example #1: Then I should see the notification "Updated successfully."
 * Example #2: Then I should see the notification "Unpublished successfully."
 * Example #3: And I should see the notification "Deleted 2 Posts successfully."
 * Example #4: Then I should see the notification "Media successfully created."
 * Example #5: Then I should see the notification "Please correct invalid fields."
 */
Then(/^I should see the notification "([^"]*)"$/, async function (text) {
  const toast = await waitForToast(this, text, 0);
  if (!toast) {
    throw failure(this, `The admin showed no notification "${text}". It showed ${listed(toastsSince(this, 0).map((t) => t.text))}.`, 'A notification shows at the bottom of the page for a few seconds after a save, a publication or a refusal.');
  }
});

/**
 * Delete the document: "Delete" in the form's menu, then "Confirm"; the admin
 * then shows the list of the collection.
 *
 * Example #1: When I delete the document
 * Example #2: And I delete the document
 * Example #3: When I delete the document
 * Example #4: Then I delete the document
 * Example #5: When I delete the document
 */
When(/^I delete the document$/, async function () {
  await requireDocument(this);
  await chooseFromMenu(this, this.page.locator('.doc-controls__popup .popup-button').first(), 'Delete', 'the menu of the document');
  const dialog = await waitForDialog(this, 'Confirm deletion');
  const since = Date.now();
  await answerDialog(this, dialog, 'Confirm');
  if (!(await waitForToast(this, 'deleted', since))) throw failure(this, 'The admin did not say the document was deleted.', 'It says "... successfully deleted."; look at the screenshot of the failure.', since);
  await eventually(this, () => adminRoute(this), (r) => /^\/collections\/[^/]+\/?$/.test(r), () => ({ message: `The admin did not go back to the list after the deletion (${shortUrl(this.page.url())}).`, hint: 'After a deletion the admin shows the list of the collection.' }));
  await ready(this);
});

/**
 * Duplicate the document: "Duplicate" in the form's menu; the admin opens the
 * copy (deleted after the scenario).
 *
 * Example #1: When I duplicate the document
 * Example #2: And I duplicate the document
 * Example #3: When I duplicate the document
 * Example #4: Then I duplicate the document
 * Example #5: When I duplicate the document
 */
When(/^I duplicate the document$/, async function () {
  const before = await requireDocument(this);
  await chooseFromMenu(this, this.page.locator('.doc-controls__popup .popup-button').first(), 'Duplicate', 'the menu of the document');
  const after = await eventually(this, () => currentDocument(this), (d) => d && d.id && d.id !== before.id, () => ({ message: 'The admin opened no copy of the document.', hint: 'A copy opens in its own form; look at the screenshot of the failure.' }));
  deleteAfter(this, after.slug, after.id);
  await ready(this);
});

// ---------------------------------------------------------------------------
// Leaving a form with changes
// ---------------------------------------------------------------------------

/**
 * Follow a link of the admin's navigation (a collection or a global), by its
 * text. A form with changes asks first: the dialog stays for the next step.
 *
 * Example #1: When I go to "Posts" in the navigation
 * Example #2: When I go to "Header" in the navigation
 * Example #3: And I go to "Media" in the navigation
 * Example #4: When I go to "Pages" in the navigation
 * Example #5: When I go to "Users" in the navigation
 */
When(/^I go to "([^"]*)" in the navigation$/, async function (name) {
  await ready(this);
  const links = this.page.locator('nav a[id^="nav-"], nav a.nav__link');
  let target = null;
  const names = [];
  for (const link of await visibleOf(links)) {
    const text = clean(await link.innerText().catch(() => ''));
    names.push(text);
    if (!target && same(text, name)) target = link;
  }
  if (!target) {
    throw failure(this, `The navigation has no link "${name}". It has ${listed(names)}.`, 'The navigation lists what the account may open; the page it is on shows as text, not as a link.');
  }
  await personClick(this, target, `the link "${name}" of the navigation`);
});

/**
 * The admin asks before leaving a form with changes ("Leave without saving").
 *
 * Example #1: Then the admin should ask to leave without saving
 * Example #2: And the admin should ask to leave without saving
 * Example #3: Then the admin should ask to leave without saving
 * Example #4: And the admin should ask to leave without saving
 * Example #5: Then the admin should ask to leave without saving
 */
Then(/^the admin should ask to leave without saving$/, async function () {
  await waitForDialog(this, 'Leave without saving');
});

/**
 * Answer the question to leave a form with changes: leave it ("Leave
 * anyway") or stay on it ("Stay on this page").
 *
 * Example #1: When I leave without saving
 * Example #2: When I stay on the page
 * Example #3: And I leave without saving
 * Example #4: And I stay on the page
 * Example #5: When I leave without saving
 */
When(/^I (leave without saving|stay on the page)$/, async function (answer) {
  const dialog = await waitForDialog(this, 'Leave without saving');
  await answerDialog(this, dialog, answer === 'leave without saving' ? 'Leave anyway' : 'Stay on this page');
  await ready(this);
});

module.exports = { currentDocument, requireDocument, documentStatus, documentHeading };
