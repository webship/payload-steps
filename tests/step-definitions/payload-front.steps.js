'use strict';

// The front end of the website template (a Next.js app): the site's
// navigation, the list of posts with its range and pages, a post, the site
// search, a form of the form builder (its fields, its errors, its
// confirmation), and the page the site shows for an address it does not have.
// A form sent on a scenario's behalf makes a form submission: the steps delete
// it after the scenario.

const { When, Then } = require('@cucumber/cucumber');
const { friendly } = require('webship-js/tests/step-definitions/webship');
const {
  budget,
  clean,
  same,
  mentions,
  listed,
  inWords,
  quotedList,
  shortUrl,
  ready,
  afterAction,
  personClick,
  visibleOf,
  eventually,
  failure,
  lastDocumentStatus,
  answersSince,
} = require('./payload-helpers');

/** The titles of the post cards the page shows (each card's heading). */
async function cardTitles(world) {
  return world.page.locator('article').evaluateAll((cards) => cards.map((a) => {
    const h = a.querySelector('h3, h2');
    return h ? h.textContent.replace(/\s+/g, ' ').trim() : '';
  }).filter(Boolean)).catch(() => []);
}

/**
 * The site's header navigation lists links, by their text, in order.
 *
 * Example #1: Then the site navigation should list "Posts", "Contact" and "Search"
 * Example #2: Then the site navigation should list "Posts" and "Contact"
 * Example #3: And the site navigation should list "Posts", "Contact" and "Search"
 * Example #4: Then the site navigation should list "Posts", "Contact", "News" and "Search"
 * Example #5: Then the site navigation should list "Search"
 */
Then(/^the site navigation should list ((?:"[^"]*"(?:, | and )?)+)$/, async function (list) {
  await ready(this);
  const wanted = quotedList(list);
  const read = () => this.page.locator('header nav a').allInnerTexts().then((t) => t.map(clean).filter(Boolean)).catch(() => []);
  await eventually(this, read, (links) => links.length === wanted.length && links.every((l, i) => same(l, wanted[i])), (links) => ({
    message: `The site navigation lists ${listed(links)}, not ${inWords(wanted)}.`,
    hint: 'The header of the site lists the links of its "Header" global, in their order.',
  }));
});

/**
 * The range of posts the page shows, from its "Showing 1 - 12 of 15 Posts"
 * (the total too, when the step names it). The website template renders its
 * list of posts ahead and renews it at most every ten minutes: a post just
 * published or deleted may count there a while later.
 *
 * Example #1: Then the page should show posts 1 to 12 of 15
 * Example #2: Then the page should show posts 13 to 15 of 15
 * Example #3: And the page should show posts 1 to 12
 * Example #4: Then the page should show posts 1 to 2 of 2
 * Example #5: Then the page should show posts 1 to 12
 */
Then(/^the page should show posts (\d+) to (\d+)(?: of (\d+))?$/, async function (from, to, total) {
  await ready(this);
  const whole = total !== undefined && total !== null;
  await eventually(this, async () => {
    const text = clean(await this.page.locator('body').innerText().catch(() => ''));
    const m = text.match(/Showing\s+(\d+)\s*-\s*(\d+)\s+of\s+(\d+)/i);
    return m ? { from: +m[1], to: +m[2], total: +m[3] } : null;
  }, (r) => r && r.from === +from && r.to === +to && (!whole || r.total === +total), (r) => ({
    message: r ? `The page shows posts ${r.from} to ${r.to} of ${r.total}, not ${from} to ${to}${whole ? ` of ${total}` : ''}.` : `The page shows no range of posts (${shortUrl(this.page.url())}).`,
    hint: 'The list of posts says "Showing <from> - <to> of <total> Posts" above its cards; the template renews the list at most every ten minutes.',
  }));
});

/**
 * The page lists (or does not list) a post card, by its title.
 *
 * Example #1: Then the page should list the post "Morning light over the harbour"
 * Example #2: Then the page should not list the post "A draft about the new library"
 * Example #3: And the page should list the post "Digital Horizons: A Glimpse into Tomorrow"
 * Example #4: Then the page should list the post "Front end test post"
 * Example #5: Then the page should not list the post "Front end test post"
 */
Then(/^the page should (not )?list the post "([^"]*)"$/, async function (not, title) {
  await ready(this);
  await eventually(this, () => cardTitles(this), (titles) => titles.some((t) => same(t, title)) === !not, (titles) => ({
    message: `The page ${not ? 'lists' : 'does not list'} the post "${title}". It lists ${listed(titles)}.`,
    hint: 'A post shows as a card with its title; a draft is not on the list of posts.',
  }));
});

/**
 * Go to the next or the previous page of the list of posts (its pagination).
 *
 * Example #1: When I go to the next page of posts
 * Example #2: When I go to the previous page of posts
 * Example #3: And I go to the next page of posts
 * Example #4: And I go to the previous page of posts
 * Example #5: When I go to the next page of posts
 */
When(/^I go to the (next|previous) page of posts$/, async function (which) {
  await ready(this);
  const button = this.page.locator(`nav[aria-label="pagination"] [aria-label="Go to ${which} page"]`).first();
  if (!(await button.count())) throw failure(this, `The page has no "${which === 'next' ? 'Next' : 'Previous'}" button of the posts (${shortUrl(this.page.url())}).`, 'The list of posts has its pagination under the cards when it has more than one page.');
  if (await button.isDisabled().catch(() => false)) throw failure(this, `The "${which === 'next' ? 'Next' : 'Previous'}" button of the posts is disabled: this is the ${which === 'next' ? 'last' : 'first'} page.`, 'Look at the range the page shows ("Showing ... of ...").');
  const url = this.page.url();
  await personClick(this, button, `the "${which === 'next' ? 'Next' : 'Previous'}" button of the posts`);
  await eventually(this, () => this.page.url(), (u) => u !== url, () => ({ message: `The "${which}" page of posts did not open.`, hint: 'The pagination goes to /posts/page/<n>.' }));
  await ready(this);
});

/**
 * The post the page shows: its title (the page's heading), or its author.
 *
 * Example #1: Then the title of the post should be "Digital Horizons: A Glimpse into Tomorrow"
 * Example #2: Then the author of the post should be "Demo Author"
 * Example #3: And the title of the post should be "Front end test post"
 * Example #4: Then the author of the post should be "Administrator Webship"
 * Example #5: Then the title of the post should be "Morning light over the harbour"
 */
Then(/^the (title|author) of the post should be "([^"]*)"$/, async function (what, expected) {
  await ready(this);
  const read = async () => {
    if (what === 'title') return clean(await this.page.locator('h1').first().innerText({ timeout: 500 }).catch(() => ''));
    return this.page.evaluate(() => {
      const labels = [...document.querySelectorAll('p, span, div')].filter((e) => e.childElementCount === 0 && /^Authors?$/i.test(e.textContent.trim()));
      for (const label of labels) {
        const next = label.nextElementSibling || (label.parentElement && label.parentElement.nextElementSibling);
        if (next) return next.textContent.replace(/\s+/g, ' ').trim();
      }
      return '';
    }).catch(() => '');
  };
  await eventually(this, read, (v) => same(v, expected) || (what === 'author' && mentions(v, expected)), (v) => ({
    message: `The ${what} of the post is "${v || '(none)'}", not "${expected}" (${shortUrl(this.page.url())}).`,
    hint: what === 'title' ? 'The title of a post is the heading of its page.' : 'The author of a post shows under "Author" beside its date.',
  }));
});

/**
 * Search the site with its search page's box: the address takes the query
 * (?q=...) and the page lists what it found.
 *
 * Example #1: When I search the site for "harbour"
 * Example #2: When I search the site for "lighthouse"
 * Example #3: And I search the site for "no such post anywhere"
 * Example #4: When I search the site for "river"
 * Example #5: When I search the site for "Digital"
 */
When(/^I search the site for "([^"]*)"$/, async function (text) {
  await ready(this);
  const box = this.page.locator('input#search, form input[type="search"], form input[placeholder="Search"]').first();
  if (!(await box.count())) throw failure(this, `The page has no search box (${shortUrl(this.page.url())}).`, 'The site\'s search page is /search.');
  await personClick(this, box, 'the search box');
  await afterAction(this, () => box.fill(text), { startWindow: 2000 });
  await eventually(this, () => new URL(this.page.url()).searchParams.get('q') || '', (q) => same(q, text), () => ({ message: `The search for "${text}" did not reach the address of the page (${shortUrl(this.page.url())}).`, hint: 'The search page puts the query in its address (?q=...).' }));
  await ready(this);
});

/**
 * What the site search found: a post by its title, or nothing ("No results
 * found.").
 *
 * Example #1: Then the search should find "Morning light over the harbour"
 * Example #2: Then the search should find nothing
 * Example #3: And the search should find "Recipes from the harbour kitchen"
 * Example #4: Then the search should find "The long walk to the lighthouse"
 * Example #5: And the search should find nothing
 */
Then(/^the search should find (?:"([^"]*)"|nothing)$/, async function (title) {
  await ready(this);
  if (title === undefined || title === null) {
    await eventually(this, async () => ({ none: /No results found/i.test(await this.page.locator('body').innerText().catch(() => '')), titles: await cardTitles(this) }), (s) => s.none && !s.titles.length, (s) => ({
      message: `The search found ${listed(s.titles)}.`,
      hint: 'A search that finds nothing says "No results found.".',
    }));
    return;
  }
  await eventually(this, () => cardTitles(this), (titles) => titles.some((t) => same(t, title)), (titles) => ({
    message: `The search did not find "${title}". It found ${listed(titles)}.`,
    hint: 'The search looks at the title, the slug and the description of the published posts.',
  }));
});

/** The form of the page (the form block), or a failure. */
async function pageForm(world) {
  await ready(world);
  const form = world.page.locator('form:has(button[type="submit"]):not([role="search"])').filter({ hasNot: world.page.locator('input#search') });
  const visible = await visibleOf(form);
  if (!visible.length) throw failure(world, `The page has no form (${shortUrl(world.page.url())}).`, 'A page shows a form of the form builder through its form block (the template\'s /contact).');
  return visible[0];
}

/** A field of the page's form by its label (the "*" and "(required)" left out), or a failure. */
async function formField(world, form, label) {
  const labels = form.locator('label');
  const n = await labels.count();
  const names = [];
  for (let i = 0; i < n; i += 1) {
    const l = labels.nth(i);
    const text = clean((await l.innerText().catch(() => '')).replace(/\(required\)/i, ''));
    names.push(text.replace(/\s*\*$/, ''));
    if (same(text, label)) {
      const id = await l.getAttribute('for');
      if (id) return { label: l, input: form.locator(`[id="${id}"]`).first() };
    }
  }
  throw failure(world, `The form has no field "${label}". Its fields: ${listed(names)}.`, 'A field of the form is named by its label.');
}

/**
 * Fill in the page's form: a table of labels and values (with the headings
 * field and value).
 *
 * Example #1: When I fill in the form with:
 * Example #2: And I fill in the form with:
 * Example #3: When I fill in the form with:
 * Example #4: Given I fill in the form with:
 * Example #5: When I fill in the form with:
 */
When(/^I fill in the form with:$/, async function (table) {
  const form = await pageForm(this);
  for (const row of table.hashes()) {
    const { input } = await formField(this, form, row.field);
    await personClick(this, input, `the field "${row.field}" of the form`);
    await afterAction(this, () => input.fill(row.value));
  }
});

/**
 * Send the page's form (its submit button). A form the site takes makes a
 * form submission, deleted after the scenario; a form with errors sends
 * nothing.
 *
 * Example #1: When I send the form
 * Example #2: And I send the form
 * Example #3: When I send the form
 * Example #4: Then I send the form
 * Example #5: When I send the form
 */
When(/^I send the form$/, async function () {
  const form = await pageForm(this);
  const button = form.locator('button[type="submit"]').first();
  const since = Date.now();
  await personClick(this, button, 'the submit button of the form', { startWindow: 2000 });
  await eventually(this, async () => ({
    sent: answersSince(this.page, since).some((a) => a.method === 'POST' && /\/form-submissions/.test(a.url)),
    errors: await form.locator('.text-red-500, [class*="error"]').count().catch(() => 0),
  }), (s) => s.sent || s.errors > 0, () => ({ message: 'The form neither went to the site nor showed an error.', hint: 'Look at the screenshot of the failure.' }), budget(this));
  await ready(this);
});

/**
 * The page's form was sent and replaced by its confirmation message.
 *
 * Example #1: Then the form should confirm "The contact form has been submitted successfully."
 * Example #2: And the form should confirm "submitted successfully"
 * Example #3: Then the form should confirm "The contact form has been submitted successfully."
 * Example #4: Then the form should confirm "has been submitted"
 * Example #5: And the form should confirm "The contact form has been submitted successfully."
 */
Then(/^the form should confirm "([^"]*)"$/, async function (message) {
  await ready(this);
  await eventually(this, async () => clean(await this.page.locator('main, article, body').first().innerText().catch(() => '')), (t) => mentions(t, message), (t) => ({
    message: `The page does not confirm "${message}" (${shortUrl(this.page.url())}): ${t.slice(0, 200)}.`,
    hint: 'A form the site takes shows its confirmation message in its place; a form with errors stays.',
  }));
});

/**
 * A field of the page's form shows an error (the message the form writes
 * under it), by its label.
 *
 * Example #1: Then the "Email" field of the form should show "This field is required"
 * Example #2: Then the "Full Name" field of the form should show "This field is required"
 * Example #3: And the "Message" field of the form should show "This field is required"
 * Example #4: Then the "Email" field of the form should show "required"
 * Example #5: Then the "Full Name" field of the form should show "This field is required"
 */
Then(/^the "([^"]*)" field of the form should show "([^"]*)"$/, async function (label, message) {
  const form = await pageForm(this);
  const { input } = await formField(this, form, label);
  await eventually(this, () => input.evaluate((el) => {
    // The message follows the field in its own container (the form ties it to the field in no other way).
    let node = el.nextElementSibling;
    while (node) {
      if (node.textContent.trim()) return node.textContent.replace(/\s+/g, ' ').trim();
      node = node.nextElementSibling;
    }
    return '';
  }).catch(() => ''), (t) => mentions(t, message), (t) => ({
    message: t ? `The field "${label}" of the form shows "${t}", not "${message}".` : `The field "${label}" of the form shows no error.`,
    hint: 'The form writes the error of a field under it once it was sent without a value it needs.',
  }));
});

/**
 * The page is the site's page for an address it does not have: it answered
 * 404, with its heading "404" and "This page could not be found.".
 *
 * Example #1: Then I should see the page for an address the site does not have
 * Example #2: And I should see the page for an address the site does not have
 * Example #3: Then I should see the page for an address the site does not have
 * Example #4: And I should see the page for an address the site does not have
 * Example #5: Then I should see the page for an address the site does not have
 */
Then(/^I should see the page for an address the site does not have$/, async function () {
  await ready(this);
  const status = lastDocumentStatus(this.page);
  const text = clean(await this.page.locator('body').innerText().catch(() => ''));
  if (status !== 404) throw failure(this, `The page answered ${status || 'nothing'}, not 404 (${shortUrl(this.page.url())}).`, 'An address the site does not have answers 404.');
  if (!/This page could not be found/i.test(text)) throw friendly({ message: `The page answered 404 but does not say "This page could not be found.": ${text.slice(0, 200)}.`, hint: 'The site\'s own page for a missing address says it.' });
});
