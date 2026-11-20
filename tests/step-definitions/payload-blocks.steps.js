'use strict';

// The rows of a blocks field and of an array field: adding a block or a row,
// what the rows are, moving, duplicating and removing a row (its menu: "Move
// Up", "Move Down", "Duplicate", "Remove"), expanding and collapsing a row and
// all of them, and the fields of a row. A row is named by its place (row 1 is
// the first); a field by its label, as the form shows it.

const { When, Then } = require('@cucumber/cucumber');
const {
  clean,
  same,
  listed,
  inWords,
  quotedList,
  ready,
  personClick,
  visibleOf,
  eventually,
  failure,
  waitForDialog,
  chooseFromMenu,
  requireField,
  setField,
  fieldValue,
} = require('./payload-helpers');

/** The blocks or array field with a heading, opened as the form shows it, or a failure. */
async function rowsField(world, label) {
  await ready(world);
  const field = await requireField(world, label);
  const cls = (await field.getAttribute('class')) || '';
  if (!/\b(blocks-field|array-field)\b/.test(cls)) {
    throw failure(world, `The field "${label}" holds no rows: it is not a blocks field or an array.`, 'Rows belong to a blocks field ("Layout") or an array ("Nav Items", "Links", "Columns").');
  }
  return field;
}

/** The rows of a blocks or array field, in order (its own rows, not those of a field inside a row). */
async function rowsOf(field) {
  const id = (await field.getAttribute('id')) || '';
  const prefix = id.replace(/^field-/, '').split('__').join('-') + '-row-';
  return field.locator(`[id^="${prefix}"]`).evaluateAll((els, p) => els.filter((e) => new RegExp(`^${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\d+$`).test(e.id)).map((e) => e.id), prefix)
    .then((ids) => ids.map((rowId) => field.locator(`[id="${rowId}"]`)));
}

/** What a row reads as: a block by its type (and its name when it has one), an array row by its label. */
async function rowName(row) {
  return row.evaluate((el) => {
    const pill = el.querySelector('.blocks-field__block-pill');
    const name = el.querySelector('.section-title__input');
    if (pill) return (pill.textContent || '').trim() + (name && name.value ? ` (${name.value})` : '');
    const label = el.querySelector('.row-label, .array-field__row-header');
    return label ? label.textContent.trim() : '';
  }).catch(() => '');
}

/**
 * What identifies each row of a field whatever its place: the id the form keeps
 * for the row (a hidden input), else its name without the number an array's
 * label carries ("Nav item 2: Search" is "Search" at any place).
 */
async function rowKeys(field) {
  const out = [];
  for (const row of await rowsOf(field)) {
    const id = await row.evaluate((el) => {
      const own = [...el.querySelectorAll('input[type="hidden"]')].find((i) => /\.\d+\.id$/.test(i.name || ''));
      return own ? own.value : '';
    }).catch(() => '');
    out.push(id || clean(await rowName(row)).replace(/^[^:]*\d+:\s*/, ''));
  }
  return out;
}

/** The names of a field's rows. */
async function rowNames(field) {
  const out = [];
  for (const row of await rowsOf(field)) out.push(clean(await rowName(row)));
  return out;
}

/** A row of a field by its place (1 is the first), or a failure. */
async function rowAt(world, field, label, place) {
  const rows = await rowsOf(field);
  if (place < 1 || place > rows.length) {
    throw failure(world, `"${label}" has no row ${place}: it has ${rows.length} row(s) (${listed(await rowNames(field))}).`, 'Rows are counted from 1, as the form numbers them.');
  }
  return rows[place - 1];
}

/** Whether a row is collapsed. */
async function isCollapsed(row) {
  return row.locator('.collapsible').first().evaluate((el) => el.classList.contains('collapsible--collapsed')).catch(() => false);
}

/** Expand (or collapse) a row with its toggle, when it is not so already. */
async function setCollapsed(world, row, collapsed, what) {
  if ((await isCollapsed(row)) === collapsed) return;
  await personClick(world, row.locator('.collapsible__toggle').first(), `the toggle of ${what}`);
  await eventually(world, () => isCollapsed(row), (c) => c === collapsed, () => ({ message: `${what[0].toUpperCase()}${what.slice(1)} did not ${collapsed ? 'collapse' : 'expand'}.`, hint: 'A row opens and closes with its toggle.' }), 5000);
}

/**
 * Add a block to a blocks field: its "Add ..." button opens the blocks to
 * choose from, and the block is chosen by its name. The new block is the
 * last row.
 *
 * Example #1: When I add the "Content" block to "Layout"
 * Example #2: When I add the "Call to Action" block to "Layout"
 * Example #3: And I add the "Media Block" block to "Layout"
 * Example #4: When I add the "Archive" block to "Layout"
 * Example #5: When I add the "Form Block" block to "Layout"
 */
When(/^I add the "([^"]*)" block to "([^"]*)"$/, async function (block, label) {
  const field = await rowsField(this, label);
  const before = (await rowsOf(field)).length;
  const add = field.locator('.blocks-field__drawer-toggler, button').filter({ hasText: /^Add\b/ }).last();
  if (!(await add.count())) throw failure(this, `The blocks field "${label}" has no "Add" button (it may be full, or read only).`, 'A blocks field adds a block with its "Add ..." button under its rows.');
  await personClick(this, add, `the "Add" button of "${label}"`);
  const drawer = await waitForDialog(this, 'Add');
  const choices = drawer.locator.locator('button.block-card, .blocks-drawer__block button, li button');
  let target = null;
  const names = [];
  for (const c of await visibleOf(choices)) {
    const text = clean(await c.innerText().catch(() => ''));
    if (!text || /^close$/i.test(text)) continue;
    names.push(text);
    if (!target && same(text, block)) target = c;
  }
  if (!target) throw failure(this, `The blocks of "${label}" have no "${block}". They are ${listed(names)}.`, 'A block is chosen by its name in the drawer the "Add" button opens.');
  await personClick(this, target, `the block "${block}"`);
  await eventually(this, async () => (await rowsOf(field)).length, (n) => n === before + 1, async (n) => ({ message: `"${label}" has ${n} rows after adding "${block}", not ${before + 1}.`, hint: 'The drawer closes and the block becomes the last row.' }), 8000);
});

/**
 * Add a row to an array field (its "Add ..." button). The new row is the
 * last one.
 *
 * Example #1: When I add a row to "Nav Items"
 * Example #2: When I add a row to "Links"
 * Example #3: And I add a row to "Columns"
 * Example #4: When I add a row to "Nav Items"
 * Example #5: When I add a row to "Links"
 */
When(/^I add a row to "([^"]*)"$/, async function (label) {
  const field = await rowsField(this, label);
  const before = (await rowsOf(field)).length;
  const add = field.locator('button.array-field__add-row').last();
  if (!(await add.count())) throw failure(this, `The array "${label}" has no "Add" button (it may hold as many rows as it can).`, 'An array adds a row with its "Add ..." button under its rows.');
  await personClick(this, add, `the "Add" button of "${label}"`);
  await eventually(this, async () => (await rowsOf(field)).length, (n) => n === before + 1, async (n) => ({ message: `"${label}" has ${n} rows after "Add", not ${before + 1}.`, hint: 'The new row is the last one.' }), 8000);
});

/**
 * How many rows a blocks or array field has.
 *
 * Example #1: Then "Layout" should have 2 rows
 * Example #2: Then "Nav Items" should have 3 rows
 * Example #3: And "Columns" should have 1 row
 * Example #4: Then "Layout" should have 0 rows
 * Example #5: Then "Links" should have 1 row
 */
Then(/^"([^"]*)" should have (\d+) rows?$/, async function (label, expected) {
  const field = await rowsField(this, label);
  await eventually(this, async () => (await rowsOf(field)).length, (n) => n === +expected, async (n) => ({
    message: `"${label}" has ${n} rows, not ${expected} (${listed(await rowNames(field))}).`,
    hint: 'Each block or array row counts once.',
  }));
});

/**
 * The rows of a blocks or array field, in order: a block by its name, an
 * array row by its label.
 *
 * Example #1: Then the rows of "Layout" should be "Content" and "Call to Action"
 * Example #2: Then the rows of "Nav Items" should be "Nav item 1: Posts" and "Nav item 2: Contact"
 * Example #3: And the rows of "Layout" should be "Call to Action", "Content" and "Media Block"
 * Example #4: Then the rows of "Columns" should be "Column 01"
 * Example #5: Then the rows of "Layout" should be "Content"
 */
Then(/^the rows of "([^"]*)" should be ((?:"[^"]*"(?:, | and )?)+)$/, async function (label, list) {
  const field = await rowsField(this, label);
  const wanted = quotedList(list);
  await eventually(this, () => rowNames(field), (names) => names.length === wanted.length && names.every((n, i) => same(n.replace(/\s*\(.*\)$/, ''), wanted[i]) || same(n, wanted[i])), (names) => ({
    message: `The rows of "${label}" are ${listed(names)}, not ${inWords(wanted)}.`,
    hint: 'A block reads as its name, an array row as its label; the order is the form\'s.',
  }));
});

/**
 * Move a row of a blocks or array field one place up or down (its menu:
 * "Move Up", "Move Down").
 *
 * Example #1: When I move row 1 of "Layout" down
 * Example #2: When I move row 2 of "Layout" up
 * Example #3: And I move row 2 of "Nav Items" up
 * Example #4: When I move row 1 of "Nav Items" down
 * Example #5: When I move row 3 of "Layout" up
 */
When(/^I move row (\d+) of "([^"]*)" (up|down)$/, async function (place, label, direction) {
  const field = await rowsField(this, label);
  const row = await rowAt(this, field, label, +place);
  const keys = await rowKeys(field);
  await chooseFromMenu(this, row.locator('.array-actions__button').first(), direction === 'up' ? 'Move Up' : 'Move Down', `the menu of row ${place} of "${label}"`);
  const target = direction === 'up' ? +place - 2 : +place;
  await eventually(this, () => rowKeys(field), (now) => now[target] === keys[+place - 1], async () => ({
    message: `Row ${place} of "${label}" did not move ${direction}: the rows are ${listed(await rowNames(field))}.`,
    hint: 'The first row cannot move up, nor the last one down.',
  }), 8000);
});

/**
 * Duplicate or remove a row of a blocks or array field (its menu).
 *
 * Example #1: When I remove row 2 of "Layout"
 * Example #2: When I duplicate row 1 of "Layout"
 * Example #3: And I remove row 3 of "Nav Items"
 * Example #4: When I duplicate row 1 of "Nav Items"
 * Example #5: When I remove row 1 of "Columns"
 */
When(/^I (remove|duplicate) row (\d+) of "([^"]*)"$/, async function (action, place, label) {
  const field = await rowsField(this, label);
  const row = await rowAt(this, field, label, +place);
  const before = (await rowsOf(field)).length;
  await chooseFromMenu(this, row.locator('.array-actions__button').first(), action === 'remove' ? 'Remove' : 'Duplicate', `the menu of row ${place} of "${label}"`);
  const expected = action === 'remove' ? before - 1 : before + 1;
  await eventually(this, async () => (await rowsOf(field)).length, (n) => n === expected, async (n) => ({
    message: `"${label}" has ${n} rows after "${action === 'remove' ? 'Remove' : 'Duplicate'}" of row ${place}, not ${expected}.`,
    hint: 'Look at the screenshot of the failure.',
  }), 8000);
});

/**
 * Expand or collapse a row of a blocks or array field (its toggle).
 *
 * Example #1: When I expand row 1 of "Nav Items"
 * Example #2: When I collapse row 1 of "Nav Items"
 * Example #3: And I expand row 2 of "Layout"
 * Example #4: When I collapse row 2 of "Layout"
 * Example #5: When I expand row 1 of "Columns"
 */
When(/^I (expand|collapse) row (\d+) of "([^"]*)"$/, async function (action, place, label) {
  const field = await rowsField(this, label);
  const row = await rowAt(this, field, label, +place);
  await setCollapsed(this, row, action === 'collapse', `row ${place} of "${label}"`);
});

/**
 * A row of a blocks or array field is expanded or collapsed.
 *
 * Example #1: Then row 1 of "Nav Items" should be expanded
 * Example #2: Then row 1 of "Nav Items" should be collapsed
 * Example #3: And row 2 of "Layout" should be collapsed
 * Example #4: Then row 2 of "Layout" should be expanded
 * Example #5: Then row 1 of "Columns" should be collapsed
 */
Then(/^row (\d+) of "([^"]*)" should be (expanded|collapsed)$/, async function (place, label, state) {
  const field = await rowsField(this, label);
  const row = await rowAt(this, field, label, +place);
  await eventually(this, () => isCollapsed(row), (c) => c === (state === 'collapsed'), (c) => ({
    message: `Row ${place} of "${label}" is ${c ? 'collapsed' : 'expanded'}, not ${state}.`,
    hint: 'A row opens and closes with its toggle; "Collapse All" and "Show All" act on every row.',
  }));
});

/**
 * Collapse every row of a blocks or array field ("Collapse All"), or expand
 * them all ("Show All").
 *
 * Example #1: When I collapse all rows of "Layout"
 * Example #2: When I expand all rows of "Layout"
 * Example #3: And I collapse all rows of "Nav Items"
 * Example #4: When I expand all rows of "Nav Items"
 * Example #5: When I collapse all rows of "Columns"
 */
When(/^I (collapse|expand) all rows of "([^"]*)"$/, async function (action, label) {
  const field = await rowsField(this, label);
  const name = action === 'collapse' ? 'Collapse All' : 'Show All';
  const button = field.locator('header button, .array-field__header-action, .blocks-field__header-action').filter({ hasText: new RegExp(`^${name}$`) }).first();
  if (!(await button.count())) throw failure(this, `"${label}" has no "${name}" button (it shows it once it has rows).`, 'The buttons are in the heading of the field.');
  await personClick(this, button, `the "${name}" button of "${label}"`);
  const rows = await rowsOf(field);
  for (const row of rows) {
    await eventually(this, () => isCollapsed(row), (c) => c === (action === 'collapse'), () => ({ message: `"${name}" left a row of "${label}" ${action === 'collapse' ? 'expanded' : 'collapsed'}.`, hint: 'Look at the screenshot of the failure.' }), 5000);
  }
});

/**
 * Set a field of a row of a blocks or array field, by its label (the row is
 * expanded first).
 *
 * Example #1: When I set "Label" to "News" in row 3 of "Nav Items"
 * Example #2: When I set "Custom URL" to "/search" in row 3 of "Nav Items"
 * Example #3: And I set "Size" to "Half" in row 1 of "Columns"
 * Example #4: When I set "Label" to "Search" in row 1 of "Links"
 * Example #5: When I set "Type" to "Custom URL" in row 3 of "Nav Items"
 */
When(/^I set "([^"]*)" to "([^"]*)" in row (\d+) of "([^"]*)"$/, async function (fieldLabel, value, place, label) {
  const field = await rowsField(this, label);
  const row = await rowAt(this, field, label, +place);
  await setCollapsed(this, row, false, `row ${place} of "${label}"`);
  await setField(this, fieldLabel, value, row);
});

/**
 * What a field of a row of a blocks or array field shows, by its label.
 *
 * Example #1: Then "Label" should be set to "News" in row 3 of "Nav Items"
 * Example #2: Then "Custom URL" should be set to "/search" in row 3 of "Nav Items"
 * Example #3: And "Label" should be set to "Posts" in row 1 of "Nav Items"
 * Example #4: Then "Size" should be set to "Half" in row 1 of "Columns"
 * Example #5: Then "Type" should be set to "Custom URL" in row 1 of "Nav Items"
 */
Then(/^"([^"]*)" should be set to "([^"]*)" in row (\d+) of "([^"]*)"$/, async function (fieldLabel, expected, place, label) {
  const field = await rowsField(this, label);
  const row = await rowAt(this, field, label, +place);
  await setCollapsed(this, row, false, `row ${place} of "${label}"`);
  const inner = await requireField(this, fieldLabel, row, ` in row ${place} of "${label}"`);
  await eventually(this, () => fieldValue(this, inner), (v) => same(v, expected), (v) => ({
    message: `"${fieldLabel}" is set to "${v}" in row ${place} of "${label}", not "${expected}".`,
    hint: 'A field of a row reads as the form shows it once the row is expanded.',
  }));
});
