'use strict';

// The list of a collection in the admin: its count, rows, columns and cells,
// the search, sorting, the filters, the columns shown, the pages and their
// size, selecting rows, and what the selection offers: editing the selected
// documents together, publishing, unpublishing and deleting them, each with
// its confirmation.
//
// The admin keeps a list's sort, page size and columns per account (its
// preferences): "Given I am on the ... list" opens the list with its defaults,
// and a scenario that sorts it, changes its page size or its columns gives the
// account's list its defaults back after it. The list changes through the
// router: a search, a filter, a sort, a page change the address, and the page
// is ready once the router's request has answered and the page shows it.

const { Given, When, Then } = require('@cucumber/cucumber');
const { friendly } = require('webship-js/tests/step-definitions/webship');
const {
  budget,
  clean,
  same,
  mentions,
  listed,
  count,
  inWords,
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
  waitForDialog,
  answerDialog,
  chooseInSelect,
  selectOptions,
  setField,
  collectionSlug,
  deleteAfter,
  resetListAfter,
  resetListPreferences,
} = require('./payload-helpers');

// ---------------------------------------------------------------------------
// Reading the list
// ---------------------------------------------------------------------------

/** The slug of the list the page shows ('' when it shows none). */
function listSlug(world) {
  const m = adminRoute(world).match(/^\/collections\/([^/?#]+)\/?$/);
  return m ? decodeURIComponent(m[1]) : '';
}

/** The list the page shows, or a failure. */
async function requireList(world) {
  await ready(world);
  const list = world.page.locator('.collection-list').first();
  if (!(await list.count()) || !listSlug(world)) {
    throw failure(world, `The page is not the list of a collection (${shortUrl(world.page.url())}).`, 'Open one first: "Given I am on the "Posts" list".');
  }
  return list;
}

/** The headings of the list's columns, in order (the selection column left out). */
async function columnHeadings(world) {
  return world.page.locator('.collection-list table thead th').evaluateAll((ths) => ths.map((th) => {
    const label = th.querySelector('.sort-column__label, span, div');
    return (th.id === 'heading-_select' ? '' : (label ? label.textContent : th.textContent) || '').trim();
  })).catch(() => []);
}

/** The index of a column by its heading, or a failure that names the columns. */
async function columnIndex(world, heading) {
  const headings = await columnHeadings(world);
  const index = headings.findIndex((h) => same(h, heading));
  if (index < 0) {
    throw failure(world, `The list has no column "${heading}". Its columns: ${listed(headings.filter(Boolean))}.`, 'A column is named by its heading; one the list does not show is shown with "When I show the "..." column".');
  }
  return index;
}

/** The rows of the list as their cells' texts. */
async function rowTexts(world) {
  return world.page.locator('.collection-list table tbody tr').evaluateAll((trs) => trs.map((tr) => [...tr.children].map((td) => td.textContent.trim())));
}

/** The title of each row: the text of the first link of its cells (or its second cell). */
async function rowTitles(world) {
  return world.page.locator('.collection-list table tbody tr').evaluateAll((trs) => trs.map((tr) => {
    const link = tr.querySelector('td a[href], td button.default-cell__first-cell, td .default-cell__first-cell');
    const text = link ? link.textContent : (tr.children[1] || tr.children[0] || { textContent: '' }).textContent;
    return text.replace(/\s+/g, ' ').trim();
  }));
}

/** The row of a document by its title (or a text of one of its cells), or a failure. */
async function rowOf(world, title) {
  const rows = world.page.locator('.collection-list table tbody tr');
  const titles = await rowTitles(world);
  let index = titles.findIndex((t) => same(t, title));
  if (index < 0) {
    const texts = await rowTexts(world);
    index = texts.findIndex((cells) => cells.some((c) => same(c, title)));
  }
  if (index < 0) {
    throw failure(world, `The list shows no "${title}". It shows ${listed(titles)}.`, 'A row is found by the title of its document; it may be on another page, or the search, a filter or the status may hide it.');
  }
  return rows.nth(index);
}

/** The text under the list ("1-10 of 17"): { from, to, total } or null when the list is empty. */
async function pageInfo(world) {
  const text = clean(await world.page.locator('.collection-list .page-controls').first().innerText({ timeout: 500 }).catch(() => ''));
  const m = text.match(/(\d+)\s*-\s*(\d+)\s+of\s+(\d+)/i);
  return m ? { from: +m[1], to: +m[2], total: +m[3], text } : null;
}

/** How many documents the list counts (its "of N"; 0 for "No Results."). */
async function listCount(world) {
  const info = await pageInfo(world);
  if (info) return info.total;
  const empty = await world.page.locator('.collection-list__no-results, .no-results').count().catch(() => 0);
  return empty ? 0 : -1;
}

/** The page size of the list (its "Per Page: N"). */
async function pageSize(world) {
  const text = clean(await world.page.locator('.collection-list .per-page').first().innerText({ timeout: 500 }).catch(() => ''));
  const m = text.match(/(\d+)/);
  if (m) return +m[1];
  const fromUrl = new URL(world.page.url()).searchParams.get('limit');
  return fromUrl ? +fromUrl : 10;
}

/** Wait until the address of the page satisfies a check about its query (the router committed the change). */
async function waitForQuery(world, check, what) {
  await eventually(world, () => new URL(world.page.url()).searchParams, (q) => check(q), () => ({
    message: `The list did not change for ${what} (${shortUrl(world.page.url())}).`,
    hint: 'The list changes through its address once the router has the answer: look at the screenshot of the failure.',
  }));
  await ready(world);
}

// ---------------------------------------------------------------------------
// Opening and counting
// ---------------------------------------------------------------------------

/**
 * Open the list of a collection, named as the admin's navigation shows it,
 * with its defaults: the account's kept sort, page size and columns of that
 * list are dropped first.
 *
 * Example #1: Given I am on the "Posts" list
 * Example #2: Given I am on the "Pages" list
 * Example #3: And I am on the "Media" list
 * Example #4: Given I am on the "Categories" list
 * Example #5: When I am on the "Users" list
 */
Given(/^I am on the "([^"]*)" list$/, async function (name) {
  if (!/^\/(collections|globals|account)?/.test(adminRoute(this)) || !(await this.page.locator('a[id^="nav-"]').count().catch(() => 0))) {
    await open(this, adminUrl(this));
  }
  const slug = await collectionSlug(this, name);
  await resetListPreferences(this, slug);
  await open(this, adminUrl(this, `collections/${slug}`));
  if (!listSlug(this) || !(await this.page.locator('.collection-list').count())) {
    const heading = clean(await this.page.locator('h1').first().innerText({ timeout: 500 }).catch(() => ''));
    throw failure(this, `"${name}" opened no list (${shortUrl(this.page.url())}${heading ? `: "${heading}"` : ''}).`, 'A collection is named as the navigation of the admin shows it ("Posts", "Media"); a collection the account may not read answers "Nothing found".');
  }
});

/**
 * How many documents the list counts, with its search and filters (the "of N"
 * under the list; "No Results." counts 0).
 *
 * Example #1: Then the list should count 17 documents
 * Example #2: Then the list should count 2 documents
 * Example #3: And the list should count 1 document
 * Example #4: Then the list should count 0 documents
 * Example #5: Then the list should count 15 documents
 */
Then(/^the list should count (\d+) documents?$/, async function (expected) {
  await requireList(this);
  await eventually(this, () => listCount(this), (n) => n === +expected, async (n) => ({
    message: n < 0 ? 'The list shows no count.' : `The list counts ${n} documents, not ${expected}.`,
    hint: 'The count is the "of N" under the list, with the search and the filters applied.',
  }));
});

/**
 * A document is (or is not) a row of the list's current page, by its title.
 *
 * Example #1: Then the list should show "Morning light over the harbour"
 * Example #2: Then the list should not show "A draft about the new library"
 * Example #3: And the list should show "Bulk test post one"
 * Example #4: Then the list should not show "Bulk test post one"
 * Example #5: Then the list should show "Editor Webship"
 */
Then(/^the list should (not )?show "([^"]*)"$/, async function (not, title) {
  await requireList(this);
  await eventually(this, () => rowTitles(this), (titles) => titles.some((t) => same(t, title)) === !not, (titles) => ({
    message: not ? `The list still shows "${title}".` : `The list does not show "${title}". It shows ${listed(titles)}.`,
    hint: 'Only the current page of the list counts; the search, a filter and the page size change what it shows.',
  }));
});

/**
 * The titles of the list's rows, in order, as a table with one title a row.
 *
 * Example #1: Then the list should show the documents:
 * Example #2: Then the list should show the documents:
 * Example #3: And the list should show the documents:
 * Example #4: Then the list should show the documents:
 * Example #5: Then the list should show the documents:
 */
Then(/^the list should show the documents:$/, async function (table) {
  await requireList(this);
  const wanted = table.raw().map((r) => clean(r[0])).filter(Boolean);
  await eventually(this, () => rowTitles(this), (titles) => titles.length === wanted.length && titles.every((t, i) => same(t, wanted[i])), (titles) => ({
    message: `The list shows ${listed(titles)}, not ${listed(wanted)}.`,
    hint: 'The rows are compared in order; sort the list first when the order matters.',
  }));
});

/**
 * How many rows the current page of the list has.
 *
 * Example #1: Then the list should have 10 rows
 * Example #2: Then the list should have 2 rows
 * Example #3: And the list should have 7 rows
 * Example #4: Then the list should have 1 row
 * Example #5: Then the list should have 17 rows
 */
Then(/^the list should have (\d+) rows?$/, async function (expected) {
  await requireList(this);
  await eventually(this, () => rowTitles(this), (titles) => titles.length === +expected, (titles) => ({
    message: `The list has ${titles.length} rows on this page, not ${expected}.`,
    hint: 'A page holds as many rows as its page size ("Per Page"); the last page holds the rest.',
  }));
});

/**
 * The text a document's row shows in a column, by the column's heading.
 *
 * Example #1: Then the "Morning light over the harbour" row should show "morning-light-over-the-harbour" in the "Slug" column
 * Example #2: Then the "Editor Webship" row should show "editor@example.com" in the "Email" column
 * Example #3: And the "Editor Webship" row should show "Editor" in the "Roles" column
 * Example #4: Then the "Bulk test post one" row should show "Published" in the "Status" column
 * Example #5: Then the "Bulk test post two" row should show "Draft" in the "Status" column
 */
Then(/^the "([^"]*)" row should show "([^"]*)" in the "([^"]*)" column$/, async function (title, expected, heading) {
  await requireList(this);
  const index = await columnIndex(this, heading);
  await eventually(this, async () => {
    const row = await rowOf(this, title);
    return clean(await row.locator('td').nth(index).innerText().catch(() => ''));
  }, (text) => same(text, expected) || mentions(text, expected), (text) => ({
    message: `The "${title}" row shows "${text}" in the "${heading}" column, not "${expected}".`,
    hint: 'A cell shows the field as the list renders it: a date as a date, a status by its name.',
  }));
});

/**
 * The first row of the list's current page, by its title.
 *
 * Example #1: Then the first row of the list should be "A draft about the new library"
 * Example #2: Then the first row of the list should be "The market on a rainy Saturday"
 * Example #3: And the first row of the list should be "Bulk test post one"
 * Example #4: Then the first row of the list should be "A field guide to city gardens"
 * Example #5: Then the first row of the list should be "Administrator Webship"
 */
Then(/^the first row of the list should be "([^"]*)"$/, async function (title) {
  await requireList(this);
  await eventually(this, () => rowTitles(this), (titles) => titles.length > 0 && same(titles[0], title), (titles) => ({
    message: `The first row of the list is "${titles[0] || '(none)'}", not "${title}".`,
    hint: 'The order follows the sort of the list (the newest change first unless sorted).',
  }));
});

/**
 * The list is empty: it says "No Results." (none exist, or none match the
 * search and the filters).
 *
 * Example #1: Then the list should be empty
 * Example #2: And the list should be empty
 * Example #3: Then the list should be empty
 * Example #4: And the list should be empty
 * Example #5: Then the list should be empty
 */
Then(/^the list should be empty$/, async function () {
  await requireList(this);
  await eventually(this, () => listCount(this), (n) => n === 0, async () => ({
    message: `The list is not empty: it shows ${listed(await rowTitles(this))}.`,
    hint: 'An empty list says "No Results."; the search and the filters narrow what the list shows.',
  }));
});

// ---------------------------------------------------------------------------
// Search, sort, filters, columns, pages
// ---------------------------------------------------------------------------

/**
 * Search the list (its search box searches the field the collection is
 * titled by), and wait for the list to show the outcome.
 *
 * Example #1: When I search the list for "harbour"
 * Example #2: When I search the list for "Bulk test"
 * Example #3: And I search the list for "river"
 * Example #4: When I search the list for "no such document anywhere"
 * Example #5: When I search the list for "Editor"
 */
When(/^I search the list for "([^"]*)"$/, async function (text) {
  await requireList(this);
  const box = this.page.locator('#search-filter-input, input.search-filter__input').first();
  await personClick(this, box, 'the search box of the list');
  await afterAction(this, () => box.fill(text), { startWindow: 2000 });
  await waitForQuery(this, (q) => same(q.get('search') || '', text), `the search "${text}"`);
});

/**
 * Empty the search box of the list, and wait for the whole list.
 *
 * Example #1: When I clear the search of the list
 * Example #2: And I clear the search of the list
 * Example #3: When I clear the search of the list
 * Example #4: Then I clear the search of the list
 * Example #5: When I clear the search of the list
 */
When(/^I clear the search of the list$/, async function () {
  await requireList(this);
  const box = this.page.locator('#search-filter-input, input.search-filter__input').first();
  await afterAction(this, () => box.fill(''), { startWindow: 2000 });
  await waitForQuery(this, (q) => !q.get('search'), 'the empty search');
});

/**
 * Sort the list by a column, by its heading (ascending, unless descending is
 * asked), and keep the account's list as it was after the scenario.
 *
 * Example #1: When I sort the list by "Title"
 * Example #2: When I sort the list by "Title" in descending order
 * Example #3: And I sort the list by "Slug"
 * Example #4: When I sort the list by "Updated At" in ascending order
 * Example #5: When I sort the list by "Name"
 */
When(/^I sort the list by "([^"]*)"(?: in (ascending|descending) order)?$/, async function (heading, direction) {
  await requireList(this);
  const slug = listSlug(this);
  resetListAfter(this, slug);
  await columnIndex(this, heading);
  const label = `Sort by ${heading} ${direction === 'descending' ? 'Descending' : 'Ascending'}`;
  const button = this.page.locator('.collection-list thead').getByRole('button', { name: label, exact: false });
  if (!(await button.count())) {
    throw failure(this, `The "${heading}" column cannot be sorted (no button "${label}").`, 'A column of a field the collection cannot sort by has no sort buttons.');
  }
  await personClick(this, button.first(), `the button "${label}"`);
  await waitForQuery(this, (q) => /^-?/.test(q.get('sort') || '') && !!q.get('sort') && (direction === 'descending') === (q.get('sort') || '').startsWith('-'), `the sort by "${heading}"`);
});

/** The where builder of the list, opened. */
async function whereBuilder(world) {
  const toggle = world.page.locator('#toggle-list-filters').first();
  if ((await toggle.getAttribute('aria-expanded').catch(() => 'false')) !== 'true') {
    await personClick(world, toggle, 'the "Filters" button of the list');
  }
  const builder = world.page.locator('.where-builder').first();
  await eventually(world, () => builder.isVisible().catch(() => false), (v) => v, () => ({ message: 'The "Filters" button opened no filters.', hint: 'The filters of the list open under its search box.' }), 5000);
  return builder;
}

/** The conditions of the where builder as { field, operator, value } texts. */
async function conditions(world) {
  return world.page.locator('.where-builder .condition').evaluateAll((els) => els.map((c) => {
    const text = (sel) => {
      const el = c.querySelector(sel);
      if (!el) return '';
      const single = el.querySelector('.rs__single-value');
      if (single) return single.textContent.trim();
      const multi = [...el.querySelectorAll('.rs__multi-value')].map((m) => m.textContent.trim());
      if (multi.length) return multi.join(', ');
      const input = el.querySelector('input:not(.rs__input)');
      return input ? input.value : '';
    };
    return { field: text('.condition__field'), operator: text('.condition__operator'), value: text('.condition__value') };
  })).catch(() => []);
}

/**
 * Add a condition to the list's filters: a field, an operator and a value,
 * each as the filter shows it ("Status" "equals" "Draft", "Title" "contains"
 * "river"); a second condition joins the first one with "and". The list
 * changes once the condition is complete.
 *
 * Example #1: When I filter the list where "Status" "equals" "Draft"
 * Example #2: When I filter the list where "Title" "contains" "river"
 * Example #3: And I filter the list where "Categories" "is in" "News"
 * Example #4: When I filter the list where "Slug" "equals" "notes-from-a-quiet-river"
 * Example #5: When I filter the list where "Title" "contains" "harbour"
 */
When(/^I filter the list where "([^"]*)" "([^"]*)" "([^"]*)"$/, async function (field, operator, value) {
  await requireList(this);
  const builder = await whereBuilder(this);
  const before = (await conditions(this)).length;
  const add = before
    ? builder.locator('.condition').last().locator('.condition__actions-add')
    : builder.locator('button').filter({ hasText: /^Add Filter$/ });
  await personClick(this, add.first(), before ? 'the "+" of the last condition' : 'the button "Add Filter"');
  const condition = builder.locator('.condition').nth(before);
  await eventually(this, () => condition.isVisible().catch(() => false), (v) => v, () => ({ message: 'No new condition appeared in the filters.', hint: 'The filters add a condition with "Add Filter", then with the "+" of the last one.' }), 5000);
  await chooseInSelect(this, condition.locator('.condition__field'), field, 'the field of the condition');
  await chooseInSelect(this, condition.locator('.condition__operator'), operator, 'the operator of the condition');
  const valueSelect = condition.locator('.condition__value .rs__control');
  if (await valueSelect.count()) {
    await chooseInSelect(this, condition.locator('.condition__value'), value, 'the value of the condition');
  } else {
    const input = condition.locator('.condition__value input').first();
    await personClick(this, input, 'the value of the condition');
    await afterAction(this, () => input.fill(value), { startWindow: 2000 });
  }
  await waitForQuery(this, (q) => [...q.keys()].some((k) => k.startsWith('where')), `the filter "${field} ${operator} ${value}"`);
});

/**
 * The list's filters hold a condition, as it shows it.
 *
 * Example #1: Then the list should be filtered where "Status" "equals" "Draft"
 * Example #2: Then the list should be filtered where "Title" "contains" "river"
 * Example #3: And the list should be filtered where "Categories" "is in" "News"
 * Example #4: Then the list should be filtered where "Title" "contains" "harbour"
 * Example #5: Then the list should be filtered where "Slug" "equals" "notes-from-a-quiet-river"
 */
Then(/^the list should be filtered where "([^"]*)" "([^"]*)" "([^"]*)"$/, async function (field, operator, value) {
  await requireList(this);
  await whereBuilder(this);
  await eventually(this, () => conditions(this), (list) => list.some((c) => same(c.field, field) && same(c.operator, operator) && mentions(c.value, value)), (list) => ({
    message: `The list is not filtered where "${field}" "${operator}" "${value}". Its conditions: ${listed(list.map((c) => `${c.field} ${c.operator} ${c.value}`))}.`,
    hint: 'A condition reads as the filters show it: the field, the operator and the value.',
  }));
});

/**
 * Remove every condition of the list's filters, and wait for the whole list.
 *
 * Example #1: When I remove the filters of the list
 * Example #2: And I remove the filters of the list
 * Example #3: When I remove the filters of the list
 * Example #4: Then I remove the filters of the list
 * Example #5: When I remove the filters of the list
 */
When(/^I remove the filters of the list$/, async function () {
  await requireList(this);
  const builder = await whereBuilder(this);
  for (let i = 0; i < 20; i += 1) {
    const remove = builder.locator('.condition__actions-remove');
    if (!(await remove.count())) break;
    await personClick(this, remove.first(), 'the "x" of a condition');
  }
  await waitForQuery(this, (q) => ![...q.keys()].some((k) => k.startsWith('where')), 'no filter');
});

/** The pills of the list's columns panel, opened: [{ locator, text, selected }]. */
async function columnPills(world) {
  const toggle = world.page.locator('#toggle-list-columns').first();
  if ((await toggle.getAttribute('aria-expanded').catch(() => 'false')) !== 'true') {
    await personClick(world, toggle, 'the "Columns" button of the list');
  }
  const pills = world.page.locator('.pill-selector__pill');
  await eventually(world, () => pills.count(), (n) => n > 0, () => ({ message: 'The "Columns" button opened no columns.', hint: 'The columns of the list open under its search box.' }), 5000);
  const out = [];
  const n = await pills.count();
  for (let i = 0; i < n; i += 1) {
    const p = pills.nth(i);
    out.push({ locator: p, text: clean(await p.innerText().catch(() => '')), selected: /pill-selector__pill--selected/.test((await p.getAttribute('class')) || '') });
  }
  return out;
}

/**
 * Show or hide a column of the list (from its "Columns" panel), by its
 * heading, and keep the account's list as it was after the scenario.
 *
 * Example #1: When I show the "Status" column
 * Example #2: When I hide the "Slug" column
 * Example #3: And I show the "Published At" column
 * Example #4: When I hide the "Status" column
 * Example #5: When I show the "Slug" column
 */
When(/^I (show|hide) the "([^"]*)" column$/, async function (action, heading) {
  await requireList(this);
  resetListAfter(this, listSlug(this));
  const pills = await columnPills(this);
  const pill = pills.find((p) => same(p.text, heading));
  if (!pill) throw failure(this, `The list has no column "${heading}" to ${action}. Its columns: ${listed(pills.map((p) => p.text))}.`, 'The "Columns" panel lists every field the list can show.');
  if (pill.selected !== (action === 'show')) await personClick(this, pill.locator, `the column "${heading}" of the "Columns" panel`);
  await eventually(this, () => columnHeadings(this), (h) => h.some((x) => same(x, heading)) === (action === 'show'), (h) => ({
    message: `The list ${action === 'show' ? 'does not show' : 'still shows'} the column "${heading}". Its columns: ${listed(h.filter(Boolean))}.`,
    hint: 'A column follows its pill in the "Columns" panel.',
  }));
});

/**
 * The list shows (or does not show) a column, by its heading.
 *
 * Example #1: Then the list should have the column "Status"
 * Example #2: Then the list should not have the column "Slug"
 * Example #3: And the list should have the column "Roles"
 * Example #4: Then the list should have the column "Title"
 * Example #5: Then the list should not have the column "Status"
 */
Then(/^the list should (not )?have the column "([^"]*)"$/, async function (not, heading) {
  await requireList(this);
  await eventually(this, () => columnHeadings(this), (h) => h.some((x) => same(x, heading)) === !not, (h) => ({
    message: `The list ${not ? 'has' : 'has no'} column "${heading}". Its columns: ${listed(h.filter(Boolean))}.`,
    hint: 'The columns of a list are the collection\'s default ones until the account changes them ("Columns").',
  }));
});

/**
 * Go to a page of the list with its page buttons.
 *
 * Example #1: When I go to page 2 of the list
 * Example #2: And I go to page 1 of the list
 * Example #3: When I go to page 2 of the list
 * Example #4: When I go to page 3 of the list
 * Example #5: When I go to page 1 of the list
 */
When(/^I go to page (\d+) of the list$/, async function (number) {
  await requireList(this);
  const button = this.page.locator('.collection-list .paginator__page').filter({ hasText: new RegExp(`^${number}$`) });
  if (!(await button.count())) {
    const pages = await this.page.locator('.collection-list .paginator__page').allInnerTexts().catch(() => []);
    throw failure(this, `The list has no button for page ${number}. Its page buttons: ${listed(pages)}.`, 'A list with one page has no page buttons; the page size changes how many pages there are.');
  }
  await personClick(this, button.first(), `the button of page ${number}`);
  await waitForQuery(this, (q) => (q.get('page') || '1') === String(number), `page ${number}`);
});

/**
 * The page of the list it shows (its current page button), and how many
 * pages it has (its count divided by its page size).
 *
 * Example #1: Then the list should be on page 2
 * Example #2: Then the list should have 2 pages
 * Example #3: And the list should be on page 1
 * Example #4: Then the list should have 1 page
 * Example #5: Then the list should have 3 pages
 */
Then(/^the list should (be on page|have) (\d+)( pages?)?$/, async function (what, number, pages) {
  await requireList(this);
  if (what === 'be on page' && !pages) {
    await eventually(this, async () => {
      const current = await this.page.locator('.collection-list .paginator__page--is-current').first().innerText({ timeout: 500 }).catch(() => '');
      return clean(current) || ((await pageInfo(this)) ? '1' : '');
    }, (p) => p === String(number), (p) => ({
      message: `The list is on page ${p || '(none)'}, not ${number}.`,
      hint: 'The current page is the highlighted page button under the list.',
    }));
    return;
  }
  if (what === 'have' && pages) {
    await eventually(this, async () => {
      const total = await listCount(this);
      const size = await pageSize(this);
      return total <= 0 ? (total === 0 ? 0 : -1) : Math.ceil(total / size);
    }, (n) => n === +number, async (n) => ({
      message: `The list has ${n < 0 ? 'no count, so no' : n} page(s), not ${number} (it counts ${await listCount(this)} at ${await pageSize(this)} per page).`,
      hint: 'The pages are the count of the list divided by its page size ("Per Page").',
    }));
    return;
  }
  throw friendly({ message: `"the list should ${what} ${number}${pages || ''}" reads neither a page nor a number of pages.`, hint: 'Write "the list should be on page 2" or "the list should have 2 pages".' });
});

/**
 * Change how many documents a page of the list shows ("Per Page"), and keep
 * the account's list as it was after the scenario.
 *
 * Example #1: When I show 25 documents per page
 * Example #2: When I show 5 documents per page
 * Example #3: And I show 10 documents per page
 * Example #4: When I show 50 documents per page
 * Example #5: When I show 100 documents per page
 */
When(/^I show (\d+) documents per page$/, async function (size) {
  await requireList(this);
  resetListAfter(this, listSlug(this));
  const trigger = this.page.locator('.collection-list .per-page button').first();
  await personClick(this, trigger, 'the "Per Page" button of the list');
  const option = await eventually(this, async () => {
    for (const b of await visibleOf(this.page.locator('.per-page__button'))) {
      if (clean(await b.innerText().catch(() => '')) === String(size)) return b;
    }
    return null;
  }, (b) => !!b, async () => ({
    message: `"Per Page" offers no ${size}. It offers ${listed(await this.page.locator('.per-page__button').allInnerTexts().catch(() => []))}.`,
    hint: 'The page sizes are the ones the collection allows (5, 10, 25, 50 and 100 by default).',
  }), 5000);
  await personClick(this, option, `"${size}" per page`);
  await waitForQuery(this, (q) => q.get('limit') === String(size), `${size} per page`);
});

// ---------------------------------------------------------------------------
// Selection and what it offers
// ---------------------------------------------------------------------------

/** The text of the list's selection ("2 selected"), or ''. */
async function selectionText(world) {
  const text = clean(await world.page.locator('.list-selection').first().innerText({ timeout: 500 }).catch(() => ''));
  const m = text.match(/(All \d+|\d+)\s+selected/i);
  return m ? `${m[1]} selected` : '';
}

/**
 * Select a document's row in the list (its check box), by its title.
 *
 * Example #1: When I select "Bulk test post one" in the list
 * Example #2: And I select "Bulk test post two" in the list
 * Example #3: When I select "Morning light over the harbour" in the list
 * Example #4: When I select "Bulk test post one" in the list
 * Example #5: And I select "Data step post" in the list
 */
When(/^I select "([^"]*)" in the list$/, async function (title) {
  await requireList(this);
  const row = await rowOf(this, title);
  const box = row.locator('td').first().locator('input[type="checkbox"]').first();
  if (await box.isChecked().catch(() => false)) return;
  await personClick(this, box, `the check box of the "${title}" row`);
  await eventually(this, () => box.isChecked().catch(() => false), (c) => c, () => ({
    message: `The "${title}" row is not selected after a click on its check box.`,
    hint: 'The check box is the first cell of the row.',
  }), 5000);
});

/**
 * Select every row of the list's current page (the check box of its heading).
 *
 * Example #1: When I select all documents on the page
 * Example #2: And I select all documents on the page
 * Example #3: When I select all documents on the page
 * Example #4: Then I select all documents on the page
 * Example #5: When I select all documents on the page
 */
When(/^I select all documents on the page$/, async function () {
  await requireList(this);
  const box = this.page.locator('.collection-list thead input[type="checkbox"]').first();
  await personClick(this, box, 'the check box of the list\'s heading');
  await eventually(this, () => selectionText(this), (t) => !!t, () => ({ message: 'Selecting the whole page selected nothing.', hint: 'The check box of the heading selects every row of the page.' }), 5000);
});

/**
 * What the list's selection reads ("2 selected").
 *
 * Example #1: Then the selection should read "2 selected"
 * Example #2: Then the selection should read "1 selected"
 * Example #3: And the selection should read "2 selected"
 * Example #4: Then the selection should read "10 selected"
 * Example #5: Then the selection should read "3 selected"
 */
Then(/^the selection should read "([^"]*)"$/, async function (expected) {
  await requireList(this);
  await eventually(this, () => selectionText(this), (t) => same(t, expected), (t) => ({
    message: `The selection reads "${t || '(nothing selected)'}", not "${expected}".`,
    hint: 'The selection shows in the heading of the list once a row is selected.',
  }));
});

/** A button of the selection ("Edit", "Publish", "Unpublish", "Delete"), or a failure that names what it offers. */
async function selectionButton(world, name) {
  const buttons = world.page.locator('.list-selection__button, .list-selection button');
  for (const b of await visibleOf(buttons)) {
    const label = (await b.getAttribute('aria-label').catch(() => '')) || (await b.innerText().catch(() => ''));
    if (same(label, name)) return b;
  }
  const offered = [];
  for (const b of await visibleOf(buttons)) offered.push((await b.getAttribute('aria-label').catch(() => '')) || (await b.innerText().catch(() => '')));
  throw failure(world, `The selection offers no "${name}". It offers ${listed(offered)}.`, 'The selection offers what the account may do with the selected documents; select a row first.');
}

/**
 * Publish, unpublish or delete the selected documents: the selection's
 * button, then "Confirm" in the dialog it opens; then the notification the
 * admin shows ("Updated 2 Posts successfully.", "Deleted 2 Posts successfully.").
 *
 * Example #1: When I publish the selected documents
 * Example #2: When I unpublish the selected documents
 * Example #3: When I delete the selected documents
 * Example #4: And I publish the selected documents
 * Example #5: And I delete the selected documents
 */
When(/^I (publish|unpublish|delete) the selected documents$/, async function (action) {
  await requireList(this);
  const name = action[0].toUpperCase() + action.slice(1);
  const button = await selectionButton(this, name);
  await personClick(this, button, `the button "${name}" of the selection`);
  const dialog = await waitForDialog(this, { publish: 'Confirm publish', unpublish: 'Confirm unpublish', delete: 'Confirm deletion' }[action]);
  const since = Date.now();
  await answerDialog(this, dialog, 'Confirm');
  const toast = await waitForToast(this, action === 'delete' ? 'Deleted' : 'Updated', since);
  if (!toast) {
    throw failure(this, `The admin did not say the selected documents were ${action === 'delete' ? 'deleted' : `${action}ed`}.`, 'It says "Updated N ... successfully." or "Deleted N ... successfully." once it is done; look at the screenshot of the failure.', since);
  }
  if (/fail|error|unable|not/i.test(toast.text) && !/successfully/i.test(toast.text)) {
    throw failure(this, `The admin refused: "${toast.text}".`, 'The account may not do this to every selected document.');
  }
  await ready(this);
});

/**
 * Edit the selected documents together: the selection's "Edit" opens a
 * drawer, the field is chosen in its "Select fields to edit" and set to the
 * value (a relationship and a select take an option's text).
 *
 * Example #1: When I edit the selected documents, setting "Categories" to "News"
 * Example #2: When I edit the selected documents, setting "Published At" to "2026-01-15"
 * Example #3: And I edit the selected documents, setting "Categories" to "Design"
 * Example #4: When I edit the selected documents, setting "Authors" to "Editor Webship"
 * Example #5: When I edit the selected documents, setting "Categories" to "Finance"
 */
When(/^I edit the selected documents, setting "([^"]*)" to "([^"]*)"$/, async function (field, value) {
  await requireList(this);
  const button = await selectionButton(this, 'Edit');
  await personClick(this, button, 'the button "Edit" of the selection');
  const drawer = await waitForDialog(this, 'Editing');
  await chooseInSelect(this, drawer.locator, field, 'the field list "Select fields to edit"', { type: false });
  await setField(this, field, value, drawer.locator);
  this.__payloadBulkDrawer = drawer;
});

/**
 * Send the edit of the selected documents: as drafts ("Save Draft"),
 * published ("Publish changes"), or saved ("Save", in a collection without
 * drafts); then the notification the admin shows.
 *
 * Example #1: When I save the edit of the selected documents as drafts
 * Example #2: When I publish the edit of the selected documents
 * Example #3: And I save the edit of the selected documents
 * Example #4: When I save the edit of the selected documents as drafts
 * Example #5: And I publish the edit of the selected documents
 */
When(/^I (save|publish) the edit of the selected documents( as drafts)?$/, async function (action, drafts) {
  const drawer = this.__payloadBulkDrawer;
  if (!drawer || !(await drawer.locator.isVisible().catch(() => false))) {
    throw failure(this, 'No edit of the selected documents is open.', 'Open it first: "When I edit the selected documents, setting ... to ...".');
  }
  const name = action === 'publish' ? 'Publish changes' : drafts ? 'Save Draft' : 'Save';
  const button = drawer.locator.getByRole('button', { name, exact: true });
  if (!(await button.count())) {
    const names = await drawer.locator.getByRole('button').allInnerTexts().catch(() => []);
    throw failure(this, `The edit of the selected documents has no "${name}". It has ${listed(names)}.`, 'A collection with drafts offers "Save Draft" and "Publish changes"; one without offers "Save".');
  }
  const since = Date.now();
  await personClick(this, button.first(), `the button "${name}"`);
  const toast = await waitForToast(this, 'Updated', since);
  if (!toast) throw failure(this, 'The admin did not say the selected documents were updated.', 'It says "Updated N ... successfully."; a field the documents may not take keeps the drawer open with its error.', since);
  await eventually(this, () => drawer.locator.isVisible().catch(() => false), (v) => !v, () => ({ message: 'The drawer of the edit stayed open.', hint: 'Look at the screenshot of the failure for the error of a field.' }), 8000);
  this.__payloadBulkDrawer = null;
  await ready(this);
});

// ---------------------------------------------------------------------------
// From the list to a document
// ---------------------------------------------------------------------------

/**
 * Open a document from the list (the link of its row), by its title.
 *
 * Example #1: When I open "Morning light over the harbour" from the list
 * Example #2: When I open "Editor Webship" from the list
 * Example #3: And I open "Bulk test post one" from the list
 * Example #4: When I open "Data step post" from the list
 * Example #5: When I open "Home" from the list
 */
When(/^I open "([^"]*)" from the list$/, async function (title) {
  await requireList(this);
  const row = await rowOf(this, title);
  const link = row.locator('td a[href]').first();
  if (!(await link.count())) throw failure(this, `The "${title}" row has no link to its document.`, 'The first column of a row links to its document.');
  await personClick(this, link, `the link of "${title}"`);
  await eventually(this, () => adminRoute(this), (r) => /^\/collections\/[^/]+\/[^/]+$/.test(r), () => ({ message: `"${title}" did not open (${shortUrl(this.page.url())}).`, hint: 'The link of a row opens its document.' }));
  await ready(this);
});

/**
 * Make a new document from the list ("Create New"). A collection with
 * autosave makes the document at once (a draft); the steps delete it after
 * the scenario.
 *
 * Example #1: When I create a new document from the list
 * Example #2: And I create a new document from the list
 * Example #3: When I create a new document from the list
 * Example #4: Then I create a new document from the list
 * Example #5: When I create a new document from the list
 */
When(/^I create a new document from the list$/, async function () {
  await requireList(this);
  const slug = listSlug(this);
  const link = this.page.locator('.collection-list a[href$="/create"]').first();
  if (!(await link.count())) {
    throw failure(this, `The list of "${slug}" offers no "Create New".`, 'An account that may not make documents of a collection gets no "Create New".');
  }
  await personClick(this, link, 'the link "Create New" of the list');
  const route = await eventually(this, () => adminRoute(this), (r) => new RegExp(`^/collections/${slug}/[^/]+$`).test(r), () => ({ message: `"Create New" opened no new document (${shortUrl(this.page.url())}).`, hint: 'The admin opens the form of a new document.' }));
  const id = route.split('/').pop();
  if (id !== 'create') deleteAfter(this, slug, id);
  await ready(this);
});

module.exports = { listSlug, rowTitles, pageInfo };
