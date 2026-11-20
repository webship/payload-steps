'use strict';

// The admin around the forms: its navigation and its dashboard, what an
// account may not open or make, the account page (its own account, a role it
// may not change), and a file chosen for an upload collection.

const path = require('path');
const fs = require('fs');
const { When, Then } = require('@cucumber/cucumber');
const { friendly } = require('webship-js/tests/step-definitions/webship');
const {
  budget,
  clean,
  same,
  listed,
  adminUrl,
  adminRoute,
  shortUrl,
  open,
  ready,
  afterAction,
  visibleOf,
  eventually,
  failure,
  lastDocumentStatus,
  requireField,
  collectionSlug,
  signedInAccount,
  dataClient,
  afterScenario,
} = require('./payload-helpers');

/** The texts of the navigation's links and current item (the page it is on shows as text). */
async function navigationItems(world) {
  return world.page.locator('nav').first().evaluate((nav) => [...nav.querySelectorAll('a.nav__link, a[id^="nav-"], span.nav__link, .nav__link')].map((e) => e.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean)).catch(() => []);
}

/**
 * The admin's navigation lists (or does not list) a collection or a global,
 * by its name: an account sees only what it may read.
 *
 * Example #1: Then the navigation should list "Users"
 * Example #2: Then the navigation should not list "Redirects"
 * Example #3: And the navigation should list "Redirects"
 * Example #4: Then the navigation should list "Header"
 * Example #5: Then the navigation should not list "Search Results"
 */
Then(/^the navigation should (not )?list "([^"]*)"$/, async function (not, name) {
  if (!(await this.page.locator('nav a[id^="nav-"]').count().catch(() => 0))) await open(this, adminUrl(this));
  await ready(this);
  await eventually(this, () => navigationItems(this), (items) => items.some((i) => same(i, name)) === !not, (items) => ({
    message: `The navigation ${not ? 'lists' : 'does not list'} "${name}". It lists ${listed(items)}.`,
    hint: 'The navigation lists the collections and globals the account may read; the roles of the accounts decide it.',
  }));
});

/** The cards of the dashboard: [{ name, links }]. */
async function dashboardCards(world) {
  return world.page.locator('.dashboard .card, .dashboard [class*="card"], .collections__card, li .card').evaluateAll((cards) => cards.map((c) => ({
    name: ((c.querySelector('h3, .card__title') || {}).textContent || '').replace(/\s+/g, ' ').trim(),
    links: [...c.querySelectorAll('a')].map((a) => (a.getAttribute('aria-label') || a.textContent || '').replace(/\s+/g, ' ').trim()),
  })).filter((c) => c.name)).catch(() => []);
}

/**
 * The dashboard has (or has not) a card for a collection or a global, by its
 * name.
 *
 * Example #1: Then the dashboard should list "Posts"
 * Example #2: Then the dashboard should not list "Redirects"
 * Example #3: And the dashboard should list "Header"
 * Example #4: Then the dashboard should list "Redirects"
 * Example #5: Then the dashboard should list "Form Submissions"
 */
Then(/^the dashboard should (not )?list "([^"]*)"$/, async function (not, name) {
  if (adminRoute(this) !== '/') await open(this, adminUrl(this));
  await ready(this);
  await eventually(this, () => dashboardCards(this), (cards) => cards.some((c) => same(c.name, name)) === !not, (cards) => ({
    message: `The dashboard ${not ? 'has' : 'has no'} card "${name}". Its cards: ${listed(cards.map((c) => c.name))}.`,
    hint: 'The dashboard shows a card for each collection and global the account may read.',
  }));
});

/** What the page says of a refusal: the admin's "not allowed", its "Nothing found", or the list's "could not be found"; '' when it shows none. */
async function refusal(world) {
  const page = world.page;
  const texts = [];
  for (const sel of ['.unauthorized', '.not-found', '.banner--type-error']) {
    for (const el of await visibleOf(page.locator(sel))) texts.push(clean(await el.innerText().catch(() => '')));
  }
  const text = texts.join(' ');
  if (/not allowed to access|does not have access|Unauthorized/i.test(text)) return text;
  if (/Nothing found|could not be found|nothing to correspond/i.test(text)) return text;
  const status = lastDocumentStatus(page);
  if (status === 403 || status === 404) return `the page answered ${status}`;
  return '';
}

/**
 * Opening an address of the admin is refused: the admin says the account is
 * not allowed ("You are not allowed to access this page."), finds nothing it
 * may show ("Nothing found", a 404), or sends it to the list with "could not
 * be found". The address is a path of the site.
 *
 * Example #1: Then I should not be allowed to open "/admin/collections/redirects"
 * Example #2: Then I should not be allowed to open "/admin/collections/users/create"
 * Example #3: And I should not be allowed to open "/admin/collections/users/1"
 * Example #4: Then I should not be allowed to open "/admin/collections/redirects/create"
 * Example #5: Then I should not be allowed to open "/admin/collections/users/create"
 */
Then(/^I should not be allowed to open "([^"]*)"$/, async function (address) {
  await open(this, address);
  const said = await eventually(this, () => refusal(this), (r) => !!r, async () => ({
    message: `"${address}" opened for this account (${shortUrl(this.page.url())}: "${clean(await this.page.locator('h1').first().innerText({ timeout: 500 }).catch(() => ''))}").`,
    hint: 'The account may open it: its roles allow it. The build of the site gives an editor no access to the accounts of others and to the redirects.',
  }), 8000);
  return said;
});

/**
 * An account may not make documents of a collection: its list offers no
 * "Create New", and the form of a new document refuses it.
 *
 * Example #1: Then I should not be able to create a document in "Users"
 * Example #2: Then I should not be able to create a document in "Redirects"
 * Example #3: And I should not be able to create a document in "Users"
 * Example #4: Then I should not be able to create a document in "Search Results"
 * Example #5: Then I should not be able to create a document in "Users"
 */
Then(/^I should not be able to create a document in "([^"]*)"$/, async function (name) {
  if (!(await this.page.locator('a[id^="nav-"]').count().catch(() => 0))) await open(this, adminUrl(this));
  const slug = await collectionSlug(this, name);
  await open(this, adminUrl(this, `collections/${slug}`));
  if (await this.page.locator('.collection-list a[href$="/create"]').count()) {
    throw failure(this, `The list of "${name}" offers "Create New" to this account.`, 'The account may make documents of this collection: its roles allow it.');
  }
  await open(this, adminUrl(this, `collections/${slug}/create`));
  const said = await refusal(this);
  if (!said) {
    throw failure(this, `The form of a new document of "${name}" opened for this account (${shortUrl(this.page.url())}).`, 'The account may make documents of this collection: its roles allow it.');
  }
});

/**
 * Open the account page of the account signed in. A change the scenario saves
 * there (its name) is put back after it.
 *
 * Example #1: When I go to my account
 * Example #2: And I go to my account
 * Example #3: When I go to my account
 * Example #4: Given I go to my account
 * Example #5: When I go to my account
 */
When(/^I go to my account$/, async function () {
  const before = await signedInAccount(this);
  if (!before) throw failure(this, 'Nobody is signed in: there is no account page.', 'Log in first: "Given I am a logged in user with the "editor" user".');
  await open(this, adminUrl(this, 'account'));
  if (!/^\/account/.test(adminRoute(this))) throw failure(this, `The account page did not open (${shortUrl(this.page.url())}).`, 'The account page is at /admin/account.');
  afterScenario(this, `account:${before.email}`, async () => {
    const client = await dataClient(this);
    const { json } = await client.call('GET', `/users?where[email][equals]=${encodeURIComponent(before.email)}&depth=0&limit=1`);
    const doc = json && json.docs && json.docs[0];
    if (doc && doc.name !== before.name) await client.call('PATCH', `/users/${doc.id}?depth=0`, { data: { name: before.name } });
  });
});

/**
 * A field of the form is read only for the account (its value shows, and it
 * takes no change), by its label.
 *
 * Example #1: Then the "Roles" field should be read only
 * Example #2: And the "Roles" field should be read only
 * Example #3: Then the "Slug" field should be read only
 * Example #4: Then the "Roles" field should be read only
 * Example #5: Then the "Slug" field should be read only
 */
Then(/^the "([^"]*)" field should be read only$/, async function (label) {
  await ready(this);
  const field = await requireField(this, label);
  const readOnly = await field.evaluate((el) => el.classList.contains('read-only') || [...el.querySelectorAll('input, textarea')].filter((i) => i.type !== 'hidden').every((i) => i.disabled || i.readOnly)).catch(() => false);
  if (!readOnly) throw friendly({ message: `The field "${label}" takes changes: it is not read only.`, hint: 'A field is read only when the account may not change it (its access), or while it is locked (a slug).' });
});

/** Where a file a step names is: the project's tests/assets/, the pack's own, or a path as given. */
function assetPath(world, name) {
  const candidates = [
    path.resolve(world.assetsFolder || path.join(process.cwd(), 'tests', 'assets'), name),
    path.resolve(__dirname, '..', 'assets', name),
    path.resolve(process.cwd(), name),
  ];
  return candidates.find((c) => fs.existsSync(c)) || null;
}

/**
 * Choose a file from the test's files for the form of a new document of an
 * upload collection (its "Select a file"): a file of the project's
 * tests/assets/, else of the pack's own.
 *
 * Example #1: When I choose the file "test-lighthouse.png" to upload
 * Example #2: And I choose the file "test-lighthouse.png" to upload
 * Example #3: When I choose the file "test-lighthouse.png" to upload
 * Example #4: Given I choose the file "test-lighthouse.png" to upload
 * Example #5: When I choose the file "test-lighthouse.png" to upload
 */
When(/^I choose the file "([^"]*)" to upload$/, async function (name) {
  await ready(this);
  const file = assetPath(this, name);
  if (!file) throw friendly({ message: `There is no file "${name}" in tests/assets/ (of the project or of the pack).`, hint: 'Put the file to upload into tests/assets/ of the test project.' });
  const input = this.page.locator('.file-field input[type="file"], input.file-field__hidden-input').first();
  if (!(await input.count())) throw failure(this, `The form has no file to choose (${shortUrl(this.page.url())}).`, 'The form of a new document of an upload collection ("Media") has "Select a file".');
  await afterAction(this, () => input.setInputFiles(file));
  await eventually(this, async () => clean(await this.page.locator('.file-field').first().innerText().catch(() => '')), (t) => !/^Select a file/.test(t) && t.length > 0, () => ({ message: `The form did not take the file "${name}".`, hint: 'The form shows the file once it is chosen.' }), 8000);
});

/**
 * The details of the file of an upload document show a text (its name, its
 * size, its dimensions, its type: "969 bytes - 320x200 - image/png").
 *
 * Example #1: Then the file details should show "320x200"
 * Example #2: Then the file details should show "image/png"
 * Example #3: And the file details should show "test-lighthouse.png"
 * Example #4: Then the file details should show "1920x1080"
 * Example #5: Then the file details should show "image/webp"
 */
Then(/^the file details should show "([^"]*)"$/, async function (text) {
  await ready(this);
  await eventually(this, async () => clean(await this.page.locator('.file-details').first().innerText({ timeout: 500 }).catch(() => '')), (t) => t.replace(/\s/g, '').toLowerCase().includes(String(text).replace(/\s/g, '').toLowerCase()), (t) => ({
    message: t ? `The file details show "${t}", not "${text}".` : 'The form shows no file details.',
    hint: 'The details show once the document of the file is saved.',
  }), budget(this));
});

module.exports = { navigationItems, refusal };
