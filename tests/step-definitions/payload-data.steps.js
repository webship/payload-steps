'use strict';

// Test data: a scenario makes the documents it needs, and the steps delete
// them after it, whatever happens in it. A document is made through the site's
// REST API as the data administrator of the users registry, in a session of
// its own (the scenario's browser session is never touched). What a scenario
// makes on screen is deleted after it too: the steps watch the site's answers
// (a document made by the admin, a file uploaded, a form sent on the front
// end, a document duplicated), and the steps that open a new document note it.
//
// No step makes or deletes an account: accounts are configuration.

const { Given, Then, After, AfterAll } = require('@cucumber/cucumber');
const { friendly, onNewPage } = require('webship-js/tests/step-definitions/webship');
const {
  listed,
  same,
  apiPath,
  requests,
  watchToasts,
  dataClient,
  closeClients,
  richTextValue,
  findDocuments,
  deleteDocumentsTitled,
  titleField,
  collectionSlug,
  deleteAfter,
  cleansUp,
} = require('./payload-helpers');

// ---------------------------------------------------------------------------
// Every page of a scenario
// ---------------------------------------------------------------------------

/**
 * The admin keeps timers that fire many minutes later (it renews its session
 * before the token expires, and it warns before a session ends): webship-js's
 * settle counts every pending timer as work in progress, so it would wait out
 * its whole budget after each step. Timers longer than five seconds are taken
 * out of that count here: a timer that fires minutes later is no work the page
 * is doing now. The count of webship-js's own probe stays right whichever init
 * script runs first.
 */
function ignoreLongTimers() {
  if (window.__webshipLongTimersIgnored || typeof window.setTimeout !== 'function') return;
  window.__webshipLongTimersIgnored = true;
  const previousSet = window.setTimeout;
  const previousClear = window.clearTimeout;
  const long = new Set();
  const counted = () => typeof window.__webshipPendingTimers === 'number';
  window.setTimeout = function (callback, delay, ...args) {
    if (!(Number(delay) > 5000) || !counted()) return previousSet.call(this, callback, delay, ...args);
    let id;
    const fire = function () {
      if (long.delete(id) && counted()) window.__webshipPendingTimers += 1;
      return typeof callback === 'function' ? callback.apply(this, args) : undefined;
    };
    id = previousSet.call(this, fire, delay);
    long.add(id);
    window.__webshipPendingTimers -= 1;
    return id;
  };
  window.clearTimeout = function (id) {
    if (long.delete(id) && counted()) window.__webshipPendingTimers += 1;
    return previousClear.call(this, id);
  };
}

// Collections whose documents a scenario never makes, and the admin's own records.
const NOT_TEST_DATA = new Set(['users', 'payload-preferences', 'payload-locked-documents', 'payload-migrations', 'payload-jobs', 'payload-query-presets', 'payload-folders']);

/** Note what an answer of the site says the scenario made: a document, a file, a form submission. */
async function noteMade(world, response) {
  if (!cleansUp(world)) return;
  const request = response.request();
  const url = new URL(response.url());
  const api = apiPath(world);
  // The admin's create view of a collection with autosave makes the document at once and redirects to it.
  if (request.resourceType() === 'document' && [301, 302, 303, 307, 308].includes(response.status())) {
    const made = url.pathname.match(/\/collections\/([^/]+)\/create$/);
    const location = (response.headers().location || '').match(/\/collections\/([^/]+)\/([^/?#]+)/);
    if (made && location && location[1] === made[1] && location[2] !== 'create') deleteAfter(world, decodeURIComponent(made[1]), decodeURIComponent(location[2]));
    return;
  }
  if (request.method() !== 'POST' || ![200, 201].includes(response.status())) return;
  if (!url.pathname.startsWith(api + '/')) return;
  const parts = url.pathname.slice(api.length + 1).split('/');
  const slug = decodeURIComponent(parts[0] || '');
  if (!slug || NOT_TEST_DATA.has(slug)) return;
  const create = parts.length === 1;
  const duplicate = parts.length === 3 && parts[2] === 'duplicate';
  if (!create && !duplicate) return;
  if (create && request.headers()['x-payload-http-method-override']) return;
  const json = await response.json().catch(() => null);
  const id = json && json.doc && json.doc.id;
  if (id !== undefined && id !== null) deleteAfter(world, slug, id);
}

onNewPage(async (world, page) => {
  await page.addInitScript(ignoreLongTimers).catch(() => {});
  requests(page);
  page.on('response', (response) => { noteMade(world, response).catch(() => {}); });
  await watchToasts(world);
});

// ---------------------------------------------------------------------------
// Test documents
// ---------------------------------------------------------------------------

// The fields a test-document table may name that hold documents of another
// collection (found by their title), and the rich-text fields (written as
// paragraphs). Other fields take the table's text as it is.
const RELATIONS = { categories: 'categories', relatedPosts: 'posts', authors: 'users', heroImage: 'media', 'meta.image': 'media', parent: 'categories' };
const RICH_TEXT = new Set(['content', 'richText', 'caption', 'introContent', 'hero.richText']);

/** Put a value at a dotted path of an object ("meta.title"). */
function setPath(target, dotted, value) {
  const keys = dotted.split('.');
  let node = target;
  keys.slice(0, -1).forEach((k) => { node[k] = node[k] && typeof node[k] === 'object' ? node[k] : {}; node = node[k]; });
  node[keys[keys.length - 1]] = value;
}

/** The value of a test-document table cell as the REST API takes it. */
async function apiValue(world, field, value) {
  const relation = (world.parameters && world.parameters.relations && world.parameters.relations[field]) || RELATIONS[field];
  if (relation) {
    const ids = [];
    for (const title of String(value).split(/\s*,\s*/).filter(Boolean)) {
      const found = await findDocuments(world, relation, title);
      if (!found.length) throw friendly({ message: `The field "${field}" finds no document "${title}" in its collection (${relation}).`, hint: `Make it first, or name a document of "${relation}" by its ${titleField(world, relation)}.` });
      ids.push(found[0].id);
    }
    return ['heroImage', 'meta.image', 'parent'].includes(field) ? ids[0] : ids;
  }
  if (RICH_TEXT.has(field)) return richTextValue(value);
  if (/^(true|false)$/i.test(value)) return /^true$/i.test(value);
  return value;
}

/**
 * The fields a document needs to be published in the collections of the
 * website template, filled with plain values (a draft needs none of them).
 */
function requiredDefaults(slug, title) {
  if (slug === 'posts') return { content: richTextValue(`${title}: a test post.`) };
  if (slug === 'pages') {
    return {
      hero: { type: 'lowImpact', richText: richTextValue(title) },
      layout: [{ blockType: 'content', columns: [{ size: 'full', richText: richTextValue(`${title}: a test page.`) }] }],
    };
  }
  return {};
}

/**
 * Make a test document through the REST API and delete it after the scenario.
 * A document of the same title an earlier, stopped run left is deleted first.
 */
async function makeDocument(world, name, title, { published = false, table = null } = {}) {
  const slug = await collectionSlug(world, name);
  const client = await dataClient(world);
  await deleteDocumentsTitled(world, slug, title);
  const data = { [titleField(world, slug)]: title };
  Object.assign(data, requiredDefaults(slug, title));
  let status = published ? 'published' : 'draft';
  for (const row of table ? table.hashes() : []) {
    const field = String(row.field || '').trim();
    const value = String(row.value === undefined ? '' : row.value);
    if (!field) continue;
    if (field === 'status' || field === '_status') {
      status = /publish/i.test(value) ? 'published' : 'draft';
      continue;
    }
    setPath(data, field, await apiValue(world, field, value));
  }
  data._status = status;
  const { json } = await client.call('POST', `/${slug}?draft=${status === 'draft'}&depth=0`, { data, allow: [400] });
  const doc = json && json.doc;
  if (!doc || doc.id === undefined) {
    const errors = (json && json.errors) || [];
    const detail = errors.map((e) => `${e.message}${e.data && e.data.errors ? ` (${e.data.errors.map((x) => `${x.path}: ${x.message}`).join('; ')})` : ''}`).join('; ');
    throw friendly({ message: `The test document "${title}" could not be made in "${name}" (${slug}): ${detail || 'no document in the answer'}.`, hint: 'Name the collection as the admin\'s navigation shows it; a table names fields by their names in the collection (title, slug, content, categories, meta.description, status).' });
  }
  if (status === 'published' && doc._status === 'draft') {
    await client.call('PATCH', `/${slug}/${doc.id}?depth=0`, { data: { _status: 'published' } });
  }
  deleteAfter(world, slug, doc.id);
  return doc;
}

/**
 * Make a test document in a collection, by its title, and delete it after the
 * scenario. In a collection with drafts it is a draft.
 *
 * Example #1: Given there is a document "Data step post" in "Posts"
 * Example #2: Given there is a document "Bulk test post one" in "Posts"
 * Example #3: And there is a document "Bulk test post two" in "Posts"
 * Example #4: Given there is a document "Test category" in "Categories"
 * Example #5: Given there is a document "A test page" in "Pages"
 */
Given(/^there is a document "([^"]*)" in "([^"]*)"$/, async function (title, collection) {
  await makeDocument(this, collection, title);
});

/**
 * Make a published test document in a collection with drafts, and delete it
 * after the scenario.
 *
 * Example #1: Given there is a published document "Published test post" in "Posts"
 * Example #2: Given there is a published document "Version test post" in "Posts"
 * Example #3: And there is a published document "Front end test post" in "Posts"
 * Example #4: Given there is a published document "A published test page" in "Pages"
 * Example #5: Given there is a published document "Preview test post" in "Posts"
 */
Given(/^there is a published document "([^"]*)" in "([^"]*)"$/, async function (title, collection) {
  await makeDocument(this, collection, title, { published: true });
});

/**
 * Make a test document with fields of its collection (a table with the
 * columns field and value), and delete it after the scenario. A relationship
 * names its documents by their titles (comma separated); a rich text is
 * written as paragraphs; "status" is draft or published.
 *
 * Example #1: Given there is a document "Table test post" in "Posts" with:
 * Example #2: Given there is a document "Category test post" in "Posts" with:
 * Example #3: And there is a document "A second table post" in "Posts" with:
 * Example #4: Given there is a document "Search test post" in "Posts" with:
 * Example #5: Given there is a document "A test page with fields" in "Pages" with:
 */
Given(/^there is a document "([^"]*)" in "([^"]*)" with:$/, async function (title, collection, table) {
  await makeDocument(this, collection, title, { table });
});

/**
 * Make sure a collection has no document with a title (what an earlier,
 * stopped run left, before a scenario makes it on screen).
 *
 * Example #1: Given there is no document "Editor test post" in "Posts"
 * Example #2: Given there is no document "test-lighthouse.png" in "Media"
 * Example #3: And there is no document "Editor test page" in "Pages"
 * Example #4: Given there is no document "Explore test post" in "Posts"
 * Example #5: Given there is no document "Preview test post" in "Posts"
 */
Given(/^there is no document "([^"]*)" in "([^"]*)"$/, async function (title, collection) {
  await deleteDocumentsTitled(this, await collectionSlug(this, collection), title);
});

/**
 * Check through the REST API (as the data administrator) that a collection
 * has, or has not, a document with a title (drafts included).
 *
 * Example #1: Then there should be a document "Editor test post" in "Posts"
 * Example #2: Then there should be no document "Bulk test post one" in "Posts"
 * Example #3: And there should be a document "test-lighthouse.png" in "Media"
 * Example #4: Then there should be no document "test-lighthouse.png" in "Media"
 * Example #5: Then there should be a document "News" in "Categories"
 */
Then(/^there should be (a|no) document "([^"]*)" in "([^"]*)"$/, async function (which, title, collection) {
  const slug = await collectionSlug(this, collection);
  const deadline = Date.now() + 10000;
  let found = [];
  for (;;) {
    found = await findDocuments(this, slug, title);
    if ((which === 'a') === found.length > 0) return;
    if (Date.now() > deadline) break;
    await new Promise((r) => setTimeout(r, 300));
  }
  if (which === 'a') {
    throw friendly({ message: `"${collection}" has no document "${title}".`, hint: `The document is found by its ${titleField(this, slug)}; a save that did not finish leaves none: look at the screenshot of the failure.` });
  }
  throw friendly({ message: `"${collection}" still has ${found.length} document(s) "${title}" (id ${listed(found.map((d) => String(d.id)))}).`, hint: 'The deletion did not reach the site: look at the screenshot of the failure for a dialog that was not confirmed.' });
});

// ---------------------------------------------------------------------------
// After the scenario
// ---------------------------------------------------------------------------

After({ timeout: 180000 }, async function (scope) {
  const todo = (this.__payloadCleanUp || []).slice().reverse();
  this.__payloadCleanUp = [];
  if (!todo.length) return;
  const failed = [];
  for (const item of todo) {
    try {
      await item.fn();
    } catch (err) {
      failed.push(`${item.label}: ${String((err && err.message) || err).split('\n')[0]}`);
    }
  }
  if (failed.length) {
    const status = scope && scope.result && scope.result.status;
    process.stderr.write(`\n[payload-steps] The clean-up after "${scope && scope.pickle ? scope.pickle.name : 'the scenario'}" left: ${listed(failed)}${status ? ` (the scenario ${String(status).toLowerCase()})` : ''}\n`);
  }
});

AfterAll(async function () {
  await closeClients();
});

module.exports = { makeDocument, same };
