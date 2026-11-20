'use strict';

// Shared plumbing of the admin and front-end steps: addresses, the requests of
// a page and the ones the browser cut, waiting until a page of the admin (a
// Next.js app) is ready, the notifications, dialogs and menus, the select
// boxes, the fields found by their labels, the collections, the users registry
// and the session cache, the test-data client that makes and deletes test
// documents through the site's REST API as the data administrator of the users
// registry, and what the steps do after a scenario.
//
// This file registers no step.
//
// The admin is a Next.js app (the App Router). A page change draws the page
// from the server's answer to a request with the header `rsc: 1`; a change in
// a form asks the server for the form's state (a server function: a request
// with the header `next-action`); saving, publishing and the lists' data go
// through the REST API (/api/...). While a route change runs, the admin shows
// its progress bar (div.progress-bar, until it fades out); while it loads a
// part of a page it shows its loading overlay (div.loading-overlay--entering).
// A page is ready when the document has loaded, React has taken the page over
// (hydration: the root element carries React's fiber), no part of the page
// still waits for streamed content or shows its loading state, the progress
// bar and the loading overlay are gone, and no request of the app is running:
// all of that for 150 ms. This is the approach of the Next.js step pack,
// applied to the admin; this pack does not need that pack's steps.

const { friendly, smartSettle, gotoUrl } = require('webship-js/tests/step-definitions/webship');

// ---------------------------------------------------------------------------
// Budgets and text
// ---------------------------------------------------------------------------

/** The per-assertion wait budget: `minWaitTime.page` from cucumber.js, at least 15 seconds. */
function budget(world) {
  return Math.max((world && world.minWaitTime && world.minWaitTime.page) || 0, 15000);
}

/** White space collapsed and trimmed; the invisible marks some texts carry removed. */
function clean(text) {
  return String(text === null || text === undefined ? '' : text).replace(/[­​-‏‪-‮⁠﻿]/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * A text as a comparison sees it: cleaned, in lower case, the typographic
 * quotes and dashes the same as the plain ones, and the mark of a required
 * field ("Title*", "Title *") or a closing colon dropped.
 */
function normal(text) {
  return clean(text)
    .replace(/[“”„"]/g, '"').replace(/[‘’‚']/g, "'").replace(/["']/g, "'")
    .replace(/[–—]/g, '-')
    .replace(/\s*\*\s*(\(required\))?$/i, '').replace(/\s*:$/, '')
    .toLowerCase();
}

/** Whether a text contains another, as `normal` reads them. */
function mentions(text, part) {
  return normal(text).includes(normal(part));
}

/** Whether two texts are the same, as `normal` reads them. */
function same(a, b) {
  return normal(a) === normal(b);
}

/** A list for an error message: `"a", "b", "c"` or `(none)`. */
function listed(values) {
  const items = [...new Set((values || []).map(clean).filter(Boolean))];
  return items.length ? items.map((item) => `"${item}"`).join(', ') : '(none)';
}

/** The quoted strings of a list in a step: `"a", "b" and "c"` -> ['a', 'b', 'c']. */
function quotedList(text) {
  return [...String(text).matchAll(/"([^"]*)"/g)].map((m) => m[1]);
}

/** A number of a step: `2`, or a word from zero to twenty. */
function count(text) {
  const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];
  const t = String(text).trim().toLowerCase();
  return /^\d+$/.test(t) ? parseInt(t, 10) : words.indexOf(t);
}

/** "a", "b" and "c" for a message. */
function inWords(values) {
  const items = (values || []).map((v) => `"${v}"`);
  if (items.length < 2) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

// ---------------------------------------------------------------------------
// Addresses
// ---------------------------------------------------------------------------

/** The site root without a trailing slash. */
function siteRoot(world) {
  return String(world.launchUrl || (world.parameters && world.parameters.launchUrl) || '').replace(/\/+$/, '');
}

function pathParameter(world, name, fallback) {
  const value = String((world.parameters && world.parameters[name]) || fallback).trim();
  return '/' + value.replace(/^\/+|\/+$/g, '');
}

/** The path of the admin (`worldParameters.adminPath`, /admin by default). */
function adminPath(world) {
  return pathParameter(world, 'adminPath', '/admin');
}

/** The path of the REST API (`worldParameters.apiPath`, /api by default). */
function apiPath(world) {
  return pathParameter(world, 'apiPath', '/api');
}

/** An address under the admin: `adminUrl(world, 'collections/posts')`. */
function adminUrl(world, rel = '') {
  const tail = String(rel).replace(/^\/+/, '');
  return siteRoot(world) + adminPath(world) + (tail ? '/' + tail : '');
}

/** An address of the site from a path (absolute addresses stay as they are). */
function absolute(world, href) {
  if (/^https?:\/\//.test(href)) return href;
  return siteRoot(world) + (String(href).startsWith('/') ? '' : '/') + href;
}

/** The path of the page's address without the admin's path: '/collections/posts/12'. */
function adminRoute(world) {
  try {
    const p = new URL(world.page.url()).pathname;
    return p.startsWith(adminPath(world)) ? p.slice(adminPath(world).length) || '/' : p;
  } catch {
    return '';
  }
}

/** A short address for a message: the path and query of an address of the site. */
function shortUrl(url) {
  return String(url || '').replace(/^https?:\/\/[^/]+/, '').slice(0, 100);
}

// ---------------------------------------------------------------------------
// The requests of a page
// ---------------------------------------------------------------------------

/**
 * The kind of a request the page sends in the background (fetch or XHR):
 *   'prefetch'    the router fetching a page ahead of a click (next-router-prefetch);
 *   'action'      a server function: the form state, a save of a form (next-action);
 *   'navigation'  the router fetching the payload of a page (rsc: 1, or _rsc=);
 *   'api'         the REST API of the site;
 *   'background'  any other request of the app;
 * or null for what is not a background request.
 */
function kindOf(request) {
  const type = request.resourceType();
  if (type !== 'fetch' && type !== 'xhr') return null;
  const h = request.headers();
  const url = request.url();
  if (h['next-router-prefetch'] || h.purpose === 'prefetch') return 'prefetch';
  if (h['next-action']) return 'action';
  if (h.rsc === '1' || /[?&]_rsc=/.test(url)) return 'navigation';
  if (/\/api\//.test(url)) return 'api';
  return 'background';
}

const TRACKED = new WeakMap();

/**
 * The requests of a page, kept from the moment it opens: those still running
 * (with their kind), how many of each kind started, the answers of the API
 * (newest last), the main documents and the failures. Attached to every page
 * (onNewPage in payload-data.steps.js).
 */
function requests(page) {
  let state = TRACKED.get(page);
  if (!state) {
    state = { pending: new Map(), started: { prefetch: 0, action: 0, navigation: 0, api: 0, background: 0 }, answers: [], documents: [], failures: [] };
    TRACKED.set(page, state);
    page.on('request', (request) => {
      const kind = kindOf(request);
      if (!kind) return;
      state.pending.set(request, kind);
      state.started[kind] += 1;
    });
    page.on('response', (response) => {
      const request = response.request();
      if (request.resourceType() === 'document' && request.frame() === page.mainFrame()) {
        state.documents.push({ url: response.url(), status: response.status(), at: Date.now() });
        if (state.documents.length > 30) state.documents.shift();
        return;
      }
      const kind = kindOf(request);
      if (!kind || kind === 'prefetch') return;
      state.answers.push({ url: response.url(), kind, method: request.method(), status: response.status(), at: Date.now() });
      if (state.answers.length > 200) state.answers.shift();
    });
    page.on('requestfinished', (request) => { state.pending.delete(request); });
    page.on('requestfailed', (request) => {
      state.pending.delete(request);
      const failure = request.failure();
      state.failures.push({ url: request.url(), method: request.method(), error: (failure && failure.errorText) || 'failed', at: Date.now() });
      if (state.failures.length > 30) state.failures.shift();
    });
    // A new document drops the requests of the page it replaces.
    page.on('framenavigated', (frame) => {
      if (frame !== page.mainFrame()) return;
      for (const [request, kind] of state.pending) {
        if (kind !== 'api') state.pending.delete(request);
      }
    });
  }
  return state;
}

/** The requests still running that a page waits for (all but prefetches). */
function runningRequests(page) {
  const state = requests(page);
  return [...state.pending.entries()].filter(([, kind]) => kind !== 'prefetch').map(([request, kind]) => ({ url: request.url(), kind }));
}

/** The status of the last main document the page loaded, or 0. */
function lastDocumentStatus(page) {
  const docs = requests(page).documents;
  return docs.length ? docs[docs.length - 1].status : 0;
}

/** The answers of the API since a moment: [{url, kind, method, status, at}]. */
function answersSince(page, since) {
  return requests(page).answers.filter((a) => a.at >= since);
}

// ---------------------------------------------------------------------------
// A request the browser cut
// ---------------------------------------------------------------------------

/** The hint of a failure where the browser cut a request. */
const CUT_HINT = 'Nothing is wrong with the scenario: the browser cuts the requests in flight when the network of the machine changes (a container starting or stopping on it). Run the scenario again. On a shared machine, run the suite in the project\'s container (cmd-tools-testing.sh <project> --run in the Webship Workspace), where the network of the host does not reach.';

/**
 * A sentence for a failure when the browser shows its own error page
 * (chrome-error://) instead of the site's answer, or when a request of the
 * site failed with a network error since `since`; '' otherwise.
 */
function cutRequest(world, since = 0) {
  const url = String((world.page && world.page.url()) || '');
  if (/^chrome-error:/.test(url)) return `the browser shows its own error page (${url}): the request was cut before the site answered`;
  const state = world.page ? TRACKED.get(world.page) : null;
  const cut = state && state.failures.filter((f) => f.at >= since && Date.now() - f.at < 120000
    && /ERR_NETWORK_CHANGED|ERR_NETWORK_IO_SUSPENDED|ERR_INTERNET_DISCONNECTED|ERR_CONNECTION_RESET|ERR_NAME_NOT_RESOLVED|ERR_ADDRESS_UNREACHABLE/.test(f.error));
  if (cut && cut.length) {
    const f = cut[cut.length - 1];
    return `the browser lost the request ${f.method} ${shortUrl(f.url)} (${f.error}): it was cut before the site answered`;
  }
  return '';
}

/** A failure, or the one that says a request was cut when the browser cut one. */
function failure(world, message, hint, since = 0) {
  const cut = cutRequest(world, since);
  if (cut) return friendly({ message: `${message} But ${cut}.`, hint: CUT_HINT });
  return friendly({ message, hint });
}

// ---------------------------------------------------------------------------
// When is a page ready
// ---------------------------------------------------------------------------

/**
 * What the page still has to do, as the page says it: '' when it is ready.
 * See the head of this file.
 */
async function pendingWork(world) {
  let busy;
  try {
    busy = await world.page.evaluate(() => {
      const out = [];
      if (document.readyState !== 'complete') out.push('the document is still loading');
      const reactKey = (node, prefix) => !!node && Object.keys(node).some((k) => k.startsWith(prefix));
      const next = window.next;
      if (next && next.appDir) {
        if (!reactKey(document.documentElement, '__reactFiber$')) out.push('the page is not hydrated yet');
      } else if (Array.isArray(self.__next_f)) {
        out.push('the app has not started yet');
      }
      // Parts the server streamed that still wait for their content.
      const walker = document.createNodeIterator(document.body || document.documentElement, NodeFilter.SHOW_COMMENT);
      let node;
      let waiting = 0;
      while ((node = walker.nextNode())) {
        if (node.data === '$?' || node.data === '$~') waiting += 1;
      }
      if (waiting) out.push(`${waiting} streamed part(s) of the page still waiting for their content`);
      // Suspense boundaries of React's current tree: one showing its fallback, one not hydrated yet.
      const start = [document.documentElement, document.body].find((el) => reactKey(el, '__reactFiber$'));
      if (start) {
        const key = Object.keys(start).find((k) => k.startsWith('__reactFiber$'));
        let fiber = start[key];
        while (fiber && fiber.return) fiber = fiber.return;
        if (fiber && fiber.stateNode && fiber.stateNode.current) fiber = fiber.stateNode.current;
        let fallbacks = 0;
        let dehydrated = 0;
        const stack = fiber ? [fiber] : [];
        let visited = 0;
        while (stack.length && visited < 60000) {
          const f = stack.pop();
          visited += 1;
          if (f.tag === 22 && f.memoizedState !== null) {
            if (f.sibling) stack.push(f.sibling);
            continue;
          }
          if (f.tag === 13 && f.memoizedState !== null) {
            if (f.memoizedState.dehydrated) dehydrated += 1;
            else fallbacks += 1;
          }
          if (f.sibling) stack.push(f.sibling);
          if (f.child) stack.push(f.child);
        }
        if (fallbacks) out.push(`${fallbacks} part(s) of the page showing their loading state`);
        if (dehydrated) out.push(`${dehydrated} part(s) of the page not hydrated yet`);
      }
      // The admin's own signals: its progress bar during a route change, its loading overlay.
      if (document.querySelector('.progress-bar:not(.progress-bar--fade-out)')) out.push('the admin shows its progress bar (a page change is going on)');
      if (document.querySelector('.loading-overlay--entering')) out.push('the admin shows its loading overlay');
      return out;
    });
  } catch (err) {
    return /Execution context was destroyed|navigation|Target closed|has been closed/i.test(String(err && err.message)) ? 'a new page is loading' : '';
  }
  const running = runningRequests(world.page);
  if (running.length) busy.push(`${running.length} request(s) running: ${running.slice(0, 3).map((r) => `${r.kind} ${shortUrl(r.url)}`).join(', ')}`);
  return busy.join('; ');
}

/**
 * Wait until the page is ready and stays so for 150 ms. Returns '' when it
 * is, else what it was still doing when the time ran out; `strict` makes
 * that a failure.
 */
async function ready(world, { timeout, strict = false } = {}) {
  const page = world.page;
  const limit = timeout || budget(world) * 2;
  const deadline = Date.now() + limit;
  requests(page);
  let busy = '';
  let quietSince = 0;
  for (;;) {
    busy = await pendingWork(world);
    if (!busy) {
      if (!quietSince) quietSince = Date.now();
      if (Date.now() - quietSince >= 150) return '';
    } else {
      quietSince = 0;
    }
    if (Date.now() > deadline) break;
    await page.waitForTimeout(40);
  }
  if (strict) {
    throw failure(world, `The page did not get ready within ${Math.round(limit / 1000)} seconds (${shortUrl(page.url())}): ${busy}.`, 'A page is ready when it is loaded and hydrated, no part of it shows a loading state, and no request of the site is running. A request that never ends is a fault of the site: look at its log (ddev logs) and the browser console.');
  }
  return busy;
}

/**
 * Run an action that may make the page work (a click, a key, a fill), and
 * wait for that work to finish: for a request, a commit of the router or a
 * new document to start (a moment at most), then for the page to be ready.
 */
async function afterAction(world, fn, { startWindow = 1000 } = {}) {
  const page = world.page;
  const state = requests(page);
  const total = () => Object.entries(state.started).reduce((n, [k, v]) => (k === 'prefetch' ? n : n + v), 0);
  const before = total();
  const url = page.url();
  const docs = state.documents.length;
  const result = await fn();
  const startBy = Date.now() + startWindow;
  while (Date.now() < startBy) {
    if (total() !== before || page.url() !== url || state.documents.length !== docs) break;
    await page.waitForTimeout(25);
  }
  await page.waitForLoadState('domcontentloaded', { timeout: budget(world) }).catch(() => {});
  await ready(world);
  return result;
}

/** Open an address of the site and wait for the page to be ready. A cut request is tried again once. */
async function open(world, url) {
  const page = world.page;
  requests(page);
  const target = absolute(world, url);
  const go = () => gotoUrl(page, target);
  try {
    await go();
  } catch (err) {
    if (/ERR_NETWORK_CHANGED|chrome-error:\/\/chromewebdata|ERR_ABORTED|ERR_NAME_NOT_RESOLVED/.test(String(err && err.message))) {
      await page.waitForTimeout(500);
      await go().catch(() => {});
    } else {
      throw friendly({ message: `Could not open ${target}.`, cause: err, hint: 'Check launchUrl in cucumber.js and that the site is running (ddev describe).' });
    }
  }
  if (/^chrome-error:/.test(page.url())) {
    await page.waitForTimeout(500);
    await go().catch(() => {});
  }
  await page.waitForLoadState('load', { timeout: budget(world) }).catch(() => {});
  await ready(world);
}

// ---------------------------------------------------------------------------
// Elements: hydrated, brought into view, clicked the way a person does
// ---------------------------------------------------------------------------

/**
 * Is the element in the hands of the app yet (does it carry React's
 * properties)? An element no React tree owns counts as ready.
 */
async function hydrated(locator) {
  return locator.evaluate((el) => {
    const owned = (node) => !!node && Object.keys(node).some((k) => k.startsWith('__reactProps$') || k.startsWith('__reactFiber$'));
    if (owned(el)) return true;
    for (let node = el.parentElement; node; node = node.parentElement) {
      if (owned(node)) return false;
    }
    return !(window.next && window.next.appDir);
  }).catch(() => false);
}

/** Wait until the element is visible and hydrated; fail saying which it is not. */
async function waitUsable(world, locator, label) {
  const limit = budget(world);
  try {
    await locator.waitFor({ state: 'visible', timeout: limit });
  } catch {
    throw failure(world, `Expected to see ${label}, but it did not appear within ${Math.round(limit / 1000)} seconds (${shortUrl(world.page.url())}).`, 'Look at the screenshot of the failure: a dialog, another tab of the form or a closed row may hide it.');
  }
  const deadline = Date.now() + limit;
  while (!(await hydrated(locator))) {
    if (Date.now() > deadline) {
      throw failure(world, `${label[0].toUpperCase()}${label.slice(1)} is on the page, but the page has not taken it over within ${Math.round(limit / 1000)} seconds (it has no React properties): a click now would be lost.`, 'The page did not finish hydrating: look at the browser console for an error.');
    }
    await world.page.waitForTimeout(40);
  }
}

/**
 * Click an element the way a person does: visible and hydrated, brought to
 * the middle of the window (a sticky header never covers it), then clicked;
 * then wait for the work the click starts.
 */
async function personClick(world, locator, label, options = {}) {
  await waitUsable(world, locator, label);
  await locator.evaluate((el) => el.scrollIntoView({ block: 'center', inline: 'nearest' })).catch(() => {});
  return afterAction(world, () => locator.click({ timeout: budget(world), ...options }), options);
}

/** The visible ones of a locator's matches, as locators. */
async function visibleOf(locator) {
  const out = [];
  const n = await locator.count().catch(() => 0);
  for (let i = 0; i < n; i += 1) {
    if (await locator.nth(i).isVisible().catch(() => false)) out.push(locator.nth(i));
  }
  return out;
}

/** The first visible match of a locator, or null. */
async function firstVisible(locator) {
  const all = await visibleOf(locator);
  return all[0] || null;
}

/** Poll a reading until it satisfies a check, or fail with what `explain` says of the last reading. */
async function eventually(world, read, check, explain, timeout) {
  const deadline = Date.now() + (timeout || budget(world));
  let value;
  for (;;) {
    value = await read();
    if (check(value)) return value;
    if (Date.now() > deadline) {
      const e = await explain(value);
      throw failure(world, e.message, e.hint);
    }
    await world.page.waitForTimeout(120);
  }
}

// ---------------------------------------------------------------------------
// Notifications (the admin's toasts)
// ---------------------------------------------------------------------------

/**
 * Remember every notification the admin shows on this page: a toast lives
 * about four seconds and is often gone when a step looks. A MutationObserver
 * in the page reports each one with the time it came.
 */
async function watchToasts(world) {
  const page = world.page;
  world.__payloadToasts = world.__payloadToasts || [];
  if (page.__payloadToastWatch) return;
  page.__payloadToastWatch = true;
  await page.exposeBinding('__webshipPayloadToast', (source, type, text) => {
    const t = clean(text);
    if (t && !world.__payloadToasts.some((x) => x.text === t && Date.now() - x.at < 1500)) world.__payloadToasts.push({ text: t, type: String(type || ''), at: Date.now() });
  }).catch(() => {});
  const install = () => {
    if (window.__webshipPayloadToastObserver) return;
    const seen = new WeakMap();
    const report = () => {
      document.querySelectorAll('[data-sonner-toast]').forEach((li) => {
        // innerText keeps the lines of a toast apart ("... invalid (2):", "Title", "Slug").
        const t = (li.innerText || li.textContent || '').trim();
        if (!t || seen.get(li) === t) return;
        seen.set(li, t);
        if (window.__webshipPayloadToast) window.__webshipPayloadToast(li.getAttribute('data-type') || '', t);
      });
    };
    // The document itself is observed: an init script runs before the page has its <html> element.
    window.__webshipPayloadToastObserver = new MutationObserver(report);
    window.__webshipPayloadToastObserver.observe(document, { childList: true, subtree: true, characterData: true });
    report();
  };
  await page.addInitScript(install).catch(() => {});
  await page.evaluate(install).catch(() => {});
}

/** The notifications seen since a moment (all of this scenario by default). */
function toastsSince(world, since = 0) {
  return (world.__payloadToasts || []).filter((t) => t.at >= since);
}

/** Wait for a notification that contains `text`, seen since `since`; returns it or null. */
async function waitForToast(world, text, since = 0, timeout) {
  const deadline = Date.now() + (timeout || budget(world));
  for (;;) {
    const hit = toastsSince(world, since).find((t) => mentions(t.text, text));
    if (hit) return hit;
    if (Date.now() > deadline) return null;
    await world.page.waitForTimeout(100);
  }
}

// ---------------------------------------------------------------------------
// Dialogs, drawers and menus
// ---------------------------------------------------------------------------

/**
 * The open dialogs and drawers of the admin (native <dialog open>), the
 * newest last: [{ locator, id, heading }].
 */
async function openDialogs(page) {
  const all = page.locator('dialog[open]');
  const n = await all.count().catch(() => 0);
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const d = all.nth(i);
    if (!(await d.isVisible().catch(() => false))) continue;
    const id = (await d.getAttribute('id').catch(() => '')) || '';
    const heading = clean(await d.locator('h1, h2, h3').first().innerText({ timeout: 500 }).catch(() => ''));
    out.push({ locator: d, id, heading });
  }
  return out;
}

/** The newest open dialog whose heading mentions `name` (any when no name), or null. */
async function openDialog(page, name) {
  const dialogs = await openDialogs(page);
  for (let i = dialogs.length - 1; i >= 0; i -= 1) {
    if (!name || mentions(dialogs[i].heading, name)) return dialogs[i];
  }
  return null;
}

/** Wait for a dialog whose heading mentions `name`; fail with the dialogs that are open. */
async function waitForDialog(world, name, timeout) {
  return eventually(world, () => openDialog(world.page, name), (d) => !!d, async () => ({
    message: `No dialog "${name}" opened. Open: ${listed((await openDialogs(world.page)).map((d) => d.heading || d.id))}.`,
    hint: 'The admin asks in a dialog before it publishes, unpublishes, deletes or restores; look at the screenshot of the failure.',
  }), timeout || 8000);
}

/** Click a button of the newest open dialog (Confirm by default) and wait for the work it starts. */
async function answerDialog(world, dialog, button = 'Confirm') {
  const target = dialog.locator.getByRole('button', { name: button, exact: true });
  if (!(await target.count())) {
    const names = await dialog.locator.getByRole('button').allInnerTexts().catch(() => []);
    throw failure(world, `The dialog "${dialog.heading || dialog.id}" has no button "${button}". It has ${listed(names)}.`, 'The confirmation dialogs of the admin answer with "Confirm" or "Cancel".');
  }
  await personClick(world, target.first(), `the button "${button}" of the dialog "${dialog.heading || dialog.id}"`);
}

/** The buttons and links of the open popup menu (the admin portals it to the end of the page). */
function popupItems(page) {
  return page.locator('.popup__content').locator('button, a');
}

/**
 * Open a popup menu with its trigger and click one of its items by its text.
 * Fails with the items the menu offers.
 */
async function chooseFromMenu(world, trigger, item, what) {
  const page = world.page;
  await personClick(world, trigger, what);
  const items = popupItems(page);
  const chosen = await eventually(world, async () => {
    const visible = await visibleOf(items);
    for (const candidate of visible) {
      if (same(await candidate.innerText().catch(() => ''), item)) return candidate;
    }
    return null;
  }, (c) => !!c, async () => {
    const names = [];
    for (const candidate of await visibleOf(items)) names.push(await candidate.innerText().catch(() => ''));
    return { message: `${what[0].toUpperCase()}${what.slice(1)} offers no "${item}". It offers ${listed(names)}.`, hint: 'The menus of the admin show only what the account may do now: an entry that was never published has no "Unpublish".' };
  }, 5000);
  await personClick(world, chosen, `"${item}" in ${what}`);
}

// ---------------------------------------------------------------------------
// Select boxes (react-select: the select, relationship and filter fields)
// ---------------------------------------------------------------------------

/** The options a select box shows once opened, as texts. */
async function selectOptions(container) {
  return (await container.locator('.rs__option').allInnerTexts().catch(() => [])).map(clean);
}

/**
 * Choose an option of a select box: open it, type the text when it searches
 * (a relationship asks the server), then click the option whose text is the
 * one asked for (or contains it). Fails with the options it offers.
 */
async function chooseInSelect(world, container, text, what, { type = true } = {}) {
  const page = world.page;
  const control = container.locator('.rs__control').first();
  await personClick(world, control, what);
  const input = container.locator('input.rs__input').first();
  if (type && (await input.count()) && !(await input.isDisabled().catch(() => true))) {
    await afterAction(world, () => input.fill(text));
  }
  const option = await eventually(world, async () => {
    const options = container.locator('.rs__option');
    const n = await options.count().catch(() => 0);
    let contains = null;
    for (let i = 0; i < n; i += 1) {
      const t = await options.nth(i).innerText().catch(() => '');
      if (same(t, text)) return options.nth(i);
      if (!contains && mentions(t, text)) contains = options.nth(i);
    }
    return contains;
  }, (o) => !!o, async () => {
    // The search may have narrowed the options to none: show what it offers unsearched.
    if (type && (await input.count())) await input.fill('').catch(() => {});
    await page.waitForTimeout(400);
    return { message: `${what[0].toUpperCase()}${what.slice(1)} offers no option "${text}". It offers ${listed(await selectOptions(container))}.`, hint: 'An option is chosen by the text the list shows; a relationship searches the documents it may point to by their title.' };
  }, 8000);
  await personClick(world, option, `the option "${text}" of ${what}`);
  // A select with several values stays open: close its menu (only its menu: Escape on a drawer closes the drawer).
  if (await container.locator('.rs__menu').first().isVisible().catch(() => false)) {
    await container.locator('input.rs__input').first().press('Escape').catch(() => {});
  }
  await ready(world);
}

/** The values a select box holds: its single value, or each of its chosen values. */
async function selectValues(container) {
  return container.evaluate((el) => {
    const single = el.querySelector('.rs__single-value');
    if (single) return [single.textContent.trim()];
    const multi = [...el.querySelectorAll('.rs__multi-value')];
    // The label's own text: a relationship's label also holds its "Edit" button and tooltips.
    const pick = (m) => ['.relationship--multi-value-label__text', '.rs__multi-value__label', '.multi-value-label__text'].map((sel) => m.querySelector(sel)).find(Boolean);
    return multi.map((m) => (pick(m) || m).textContent.trim());
  }).catch(() => []);
}

// ---------------------------------------------------------------------------
// Fields, found by their labels
// ---------------------------------------------------------------------------

/**
 * Where the fields a step works on are: the newest open drawer (a document,
 * a bulk edit, the blocks), else the page.
 */
async function fieldScope(world) {
  const dialogs = await openDialogs(world.page);
  for (let i = dialogs.length - 1; i >= 0; i -= 1) {
    if ((await dialogs[i].locator.locator('.field-type').count().catch(() => 0)) > 0) return dialogs[i].locator;
  }
  return world.page.locator('body');
}

/**
 * The field of the form with a label, as a person reads it ("Title", the "*"
 * of a required field left out): the wrapper (div.field-type) of the visible
 * label, or of the input the label names. `within` narrows the search (a row
 * of an array, a block).
 */
async function findField(world, label, within) {
  const scope = within || (await fieldScope(world));
  const labels = scope.locator('label.field-label, span.field-label, .field-label, legend');
  const n = await labels.count().catch(() => 0);
  const found = [];
  for (let i = 0; i < n; i += 1) {
    const l = labels.nth(i);
    if (!(await l.isVisible().catch(() => false))) continue;
    const text = await l.innerText().catch(() => '');
    if (!same(text, label)) continue;
    const field = l.locator('xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " field-type ")][1]');
    if (await field.count()) found.push(field.first());
  }
  if (found.length) return found[0];
  return null;
}

/** The labels of the visible fields of the form, for a message. */
async function fieldLabels(world, within) {
  const scope = within || (await fieldScope(world));
  const texts = [];
  for (const l of await visibleOf(scope.locator('.field-label, legend'))) texts.push(clean((await l.innerText().catch(() => '')).replace(/\*\s*$/, '')));
  return [...new Set(texts.filter(Boolean))];
}

/** The field with a label, or a failure that names the fields there are. */
async function requireField(world, label, within, where = '') {
  const field = await eventually(world, () => findField(world, label, within), (f) => !!f, async () => ({
    message: `There is no field "${label}"${where} (${shortUrl(world.page.url())}). The fields shown: ${listed(await fieldLabels(world, within))}.`,
    hint: 'A field is named by its label as the form shows it. A field in another tab of the form is shown once its tab is open ("When I open the "SEO" tab"); a field in a closed row once the row is expanded.',
  }), 6000);
  return field;
}

/** What kind of field a wrapper is: text, textarea, select, relationship, upload, checkbox, radio, date, rich text, code, other. */
async function fieldKind(field) {
  const cls = ` ${(await field.getAttribute('class').catch(() => '')) || ''} `;
  if (/ rich-text-lexical | richtext /.test(cls)) return 'richtext';
  if (/ relationship /.test(cls)) return 'relationship';
  if (/ upload /.test(cls)) return 'upload';
  if (/ radio-group /.test(cls)) return 'radio';
  if (/ checkbox /.test(cls)) return 'checkbox';
  if (/ select /.test(cls)) return 'select';
  if (/ date-time-field | date /.test(cls)) return 'date';
  if (/ code-field | code /.test(cls)) return 'code';
  if (/ textarea /.test(cls)) return 'textarea';
  if (await field.locator('input[type="text"], input[type="email"], input[type="number"], input[type="password"], input:not([type]), textarea').count()) return 'text';
  return 'other';
}

/** The input of a text-like field. */
function textInput(field) {
  return field.locator('input[type="text"], input[type="email"], input[type="number"], input[type="password"], input:not([type]), textarea').first();
}

/** The rich-text editor of a field (or the first one of the scope). */
function richTextEditor(scopeOrField) {
  return scopeOrField.locator('[data-lexical-editor="true"]').first();
}

/** Whether a value of a step means "on" (a checkbox). */
function isOn(value) {
  return /^(on|yes|true|checked|1)$/i.test(String(value).trim());
}

/**
 * Write the text of a rich-text editor: select what it holds, then type the
 * text (a line break of the step, "\n", is a new paragraph).
 */
async function writeRichText(world, editor, text, what) {
  await waitUsable(world, editor, what);
  await editor.click();
  await world.page.keyboard.press('ControlOrMeta+A');
  await world.page.keyboard.press('Backspace');
  const lines = String(text).split(/\\n|\n/);
  for (let i = 0; i < lines.length; i += 1) {
    if (i) await world.page.keyboard.press('Enter');
    await world.page.keyboard.type(lines[i]);
  }
  await afterAction(world, async () => {}, { startWindow: 1500 });
}

/**
 * Set a field by its label to a value, the way the form takes it: a text
 * is typed, a select or a relationship chooses its option, a checkbox is
 * checked for "on" and unchecked for "off", a radio group chooses the option
 * with that label, a date is typed and confirmed, a rich text is written,
 * an upload chooses an existing file of its collection.
 */
async function setField(world, label, value, within) {
  const field = await requireField(world, label, within);
  const kind = await fieldKind(field);
  const what = `the field "${label}"`;
  switch (kind) {
    case 'richtext':
      return writeRichText(world, richTextEditor(field), value, what);
    case 'select':
    case 'relationship':
      return chooseInSelect(world, field, value, what, { type: kind === 'relationship' || (await field.locator('input.rs__input').count()) > 0 });
    case 'upload':
      return chooseExistingFile(world, field, value, label);
    case 'checkbox': {
      const box = field.locator('input[type="checkbox"]').first();
      await waitUsable(world, box, what);
      if ((await box.isChecked()) !== isOn(value)) await afterAction(world, () => box.setChecked(isOn(value), { force: true }));
      return;
    }
    case 'radio': {
      const option = field.getByLabel(value, { exact: true });
      if (!(await option.count())) {
        const names = await field.locator('label').allInnerTexts().catch(() => []);
        throw failure(world, `The radio buttons "${label}" have no option "${value}". They have ${listed(names)}.`, 'An option is chosen by its label as the form shows it.');
      }
      await afterAction(world, () => option.first().check({ force: true }));
      return;
    }
    case 'date': {
      const input = field.locator('input').first();
      await waitUsable(world, input, what);
      await afterAction(world, async () => {
        await input.fill(String(value));
        await input.press('Enter');
      });
      return;
    }
    case 'text':
    case 'textarea': {
      const input = textInput(field);
      await waitUsable(world, input, what);
      if (await input.isDisabled().catch(() => false)) {
        throw failure(world, `The field "${label}" cannot be changed now: it is locked or read only.`, label.toLowerCase() === 'slug' ? 'The slug follows the title until it is unlocked: "When I unlock the slug".' : 'The account may not change this field, or the form keeps it locked.');
      }
      await afterAction(world, () => input.fill(String(value)), { startWindow: 1500 });
      return;
    }
    default:
      throw failure(world, `The field "${label}" is of a kind these steps cannot fill in (${kind}).`, 'Text, number, email, text area, select, relationship, checkbox, radio, date, rich text and upload fields are supported.');
  }
}

/** The value a field shows, as text (several values joined with ", "). */
async function fieldValue(world, field) {
  const kind = await fieldKind(field);
  switch (kind) {
    case 'richtext':
      return clean(await richTextEditor(field).innerText().catch(() => ''));
    case 'select':
    case 'relationship':
      return (await selectValues(field)).join(', ');
    case 'upload':
      return (await uploadedFiles(field)).join(', ');
    case 'checkbox':
      return (await field.locator('input[type="checkbox"]').first().isChecked().catch(() => false)) ? 'on' : 'off';
    case 'radio': {
      const checked = field.locator('input[type="radio"]:checked');
      if (!(await checked.count())) return '';
      const id = await checked.first().getAttribute('id');
      return clean(id ? await field.locator(`label[for="${id}"]`).first().innerText().catch(() => '') : '');
    }
    default:
      return clean(await textInput(field).inputValue().catch(() => ''));
  }
}

/** The error a field shows (its tooltip of class field-error), or ''. */
async function fieldError(field) {
  const hasError = / error /.test(` ${(await field.getAttribute('class').catch(() => '')) || ''} `);
  const text = clean(await field.locator('.field-error').first().textContent({ timeout: 300 }).catch(() => ''));
  return hasError || text ? text || '(an error, with no message)' : '';
}

// ---------------------------------------------------------------------------
// Upload fields
// ---------------------------------------------------------------------------

/** The files an upload field holds, by their file names. */
async function uploadedFiles(field) {
  return (await field.locator('.upload-relationship-details__filename').allInnerTexts().catch(() => [])).map(clean).filter(Boolean);
}

/**
 * Choose a file of the media for an upload field: "Choose from existing"
 * opens a drawer that lists the files of its collection; the file is found
 * by its name (searched in the drawer) and clicked.
 */
async function chooseExistingFile(world, field, fileName, label) {
  const page = world.page;
  const button = field.getByRole('button', { name: 'Choose from existing' });
  if (!(await button.count())) {
    throw failure(world, `The upload field "${label}" offers no "Choose from existing": it holds ${listed(await uploadedFiles(field))}.`, 'Remove the file it holds first ("When I remove the file from the ... upload").');
  }
  await personClick(world, button.first(), `"Choose from existing" of the field "${label}"`);
  const drawer = await eventually(world, async () => {
    const dialogs = await openDialogs(page);
    const d = dialogs.reverse().find((x) => /^list-drawer/.test(x.id));
    return d || null;
  }, (d) => !!d, () => ({ message: `"Choose from existing" of the field "${label}" opened no list of files.`, hint: 'The drawer lists the documents of the upload\'s collection.' }), 8000);
  const search = drawer.locator.locator('input.search-filter__input, input[placeholder^="Search"]').first();
  if (await search.count()) await afterAction(world, () => search.fill(fileName), { startWindow: 1500 });
  const pick = await eventually(world, async () => {
    const cells = drawer.locator.locator('tbody tr td:first-child button, tbody tr td:first-child a');
    const n = await cells.count().catch(() => 0);
    for (let i = 0; i < n; i += 1) {
      if (mentions(await cells.nth(i).innerText().catch(() => ''), fileName)) return cells.nth(i);
    }
    return null;
  }, (c) => !!c, async () => ({
    message: `The list of files of the field "${label}" has no "${fileName}". It lists ${listed(await drawer.locator.locator('tbody tr td:first-child').allInnerTexts().catch(() => []))}.`,
    hint: 'A file is found by its file name in the media collection.',
  }), 8000);
  await personClick(world, pick, `the file "${fileName}"`);
  await eventually(world, () => uploadedFiles(field), (files) => files.some((f) => mentions(f, fileName)), async (files) => ({
    message: `The field "${label}" does not hold "${fileName}" after it was chosen: it holds ${listed(files)}.`,
    hint: 'The drawer closes and the field shows the file once it is chosen.',
  }), 8000);
}

// ---------------------------------------------------------------------------
// Collections
// ---------------------------------------------------------------------------

/** The slug a collection's label stands for, from the navigation when the page shows it, else derived. */
async function collectionSlug(world, name) {
  const page = world.page;
  if (page) {
    const links = page.locator('a.nav__link[id^="nav-"], a[id^="nav-"]');
    const n = await links.count().catch(() => 0);
    for (let i = 0; i < n; i += 1) {
      const text = await links.nth(i).innerText().catch(() => '');
      if (same(text, name)) {
        const href = (await links.nth(i).getAttribute('href').catch(() => '')) || '';
        const m = href.match(/\/collections\/([^/?#]+)/);
        if (m) return decodeURIComponent(m[1]);
      }
    }
    const current = page.locator('.nav__link--active, span.nav__link');
    if (await current.count().catch(() => 0)) {
      const text = await current.first().innerText().catch(() => '');
      const m = adminRoute(world).match(/^\/collections\/([^/?#]+)/);
      if (same(text, name) && m) return decodeURIComponent(m[1]);
    }
  }
  const known = (world.parameters && world.parameters.collections) || {};
  for (const [label, slug] of Object.entries(known)) {
    if (same(label, name)) return slug;
  }
  return String(name).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/** The field a collection uses as the title of its documents in the admin. */
function titleField(world, slug) {
  const known = Object.assign({ users: 'name', media: 'filename', 'form-submissions': 'id', redirects: 'from', search: 'title' }, (world.parameters && world.parameters.titleFields) || {});
  return known[slug] || 'title';
}

// ---------------------------------------------------------------------------
// The users registry and the session cache
// ---------------------------------------------------------------------------

/** The account a handle of the users registry stands for: { handle, email, password }. */
function resolveUser(world, handle) {
  const users = (world.parameters && world.parameters.users) || {};
  const entry = users[handle];
  if (!entry) {
    throw friendly({
      message: `The user "${handle}" is not in the users registry. Known users: ${Object.keys(users).join(', ') || '(none)'}.`,
      hint: `Add it to worldParameters.users in cucumber.js: users: { ${handle}: { email: '${handle}@example.com', password: process.env.${String(handle).toUpperCase().replace(/[^A-Z0-9]/g, '_')}_PASSWORD } }. The account itself is made by the build of the site, never by a feature.`,
    });
  }
  const email = entry.email || entry.username;
  if (!email || !entry.password) {
    throw friendly({
      message: `The user "${handle}" has no ${email ? 'password' : 'email address'} in the users registry.`,
      hint: `Set worldParameters.users.${handle}.email and .password in cucumber.js (the admin logs in with the email address).`,
    });
  }
  return { handle, email: String(email), password: String(entry.password) };
}

/** A handle of the users registry stands for its email address; anything else is an email address. */
function emailOf(world, who) {
  const users = (world.parameters && world.parameters.users) || {};
  return users[who] ? resolveUser(world, who).email : who;
}

// The sessions of the accounts that logged in during this run, by site and
// account: the site's session cookie (payload-token) after a login through the
// form. Nothing else of the browser is carried over (not the draft mode of a
// preview).
const SESSIONS = new Map();

function sessionKey(world, email) {
  return `${siteRoot(world)}|${String(email).toLowerCase()}`;
}

function reuseSessions(world) {
  return !(world.parameters && world.parameters.reuseSessions === false);
}

/** The name of the site's session cookie (`worldParameters.sessionCookie`, payload-token by default). */
function sessionCookieName(world) {
  return (world.parameters && world.parameters.sessionCookie) || 'payload-token';
}

/**
 * The account the site says is signed in, asked with the page's own session
 * (GET <api>/users/me, the call the admin makes): { email, name, roles } or null.
 */
async function signedInAccount(world) {
  const page = world.page;
  const url = siteRoot(world) + apiPath(world) + '/' + ((world.parameters && world.parameters.usersCollection) || 'users') + '/me';
  const answer = await page.request.get(url, { failOnStatusCode: false, timeout: budget(world) }).catch(() => null);
  if (!answer || !answer.ok()) return null;
  const json = await answer.json().catch(() => null);
  const u = json && json.user;
  return u ? { email: u.email, name: u.name || '', roles: Array.isArray(u.roles) ? u.roles : [] } : null;
}

/** Keep the session of the account the browser is signed in as, for later scenarios. */
async function keepSession(world, email) {
  if (!reuseSessions(world)) return;
  const name = sessionCookieName(world);
  const cookies = (await world.context.cookies(siteRoot(world)).catch(() => [])).filter((c) => c.name === name);
  if (cookies.length) SESSIONS.set(sessionKey(world, email), cookies);
}

/** Forget the kept session of an account (after a logout, or when the site no longer takes it). */
function forgetSession(world, email) {
  if (email) SESSIONS.delete(sessionKey(world, email));
  else for (const key of [...SESSIONS.keys()]) if (key.startsWith(`${siteRoot(world)}|`)) SESSIONS.delete(key);
}

/** Take a kept session over: true when the site signs the account in with it. */
async function restoreSession(world, user) {
  const kept = SESSIONS.get(sessionKey(world, user.email));
  if (!kept) return false;
  await world.context.clearCookies({ name: sessionCookieName(world) }).catch(() => world.context.clearCookies());
  await world.context.addCookies(kept).catch(() => {});
  const account = await signedInAccount(world);
  if (account && same(account.email, user.email)) return true;
  forgetSession(world, user.email);
  await world.context.clearCookies({ name: sessionCookieName(world) }).catch(() => {});
  return false;
}

/** Whether the page is the admin's login page (its form with an email and a password). */
async function onLoginPage(world) {
  return /^\/login\b/.test(adminRoute(world)) || ((await world.page.locator('form input[name="email"]').count().catch(() => 0)) > 0
    && (await world.page.locator('form input[type="password"]').count().catch(() => 0)) > 0 && !/\/account\b/.test(adminRoute(world)));
}

const LOGIN_HINT = 'The admin login page has the fields "Email" and "Password" and the button "Login". Check launchUrl and adminPath in cucumber.js, and the account\'s email address and password in worldParameters.users.';

/**
 * Fill in and send the admin login form, then read its outcome: the account
 * the site then signs in, or the notification of the refusal. The form is
 * filled in only once the page is ready (a click on a form the router is
 * replacing is lost); when the click sent no login request, it is sent again
 * once.
 *
 * @returns {Promise<{account: (object|null), errors: string[], status: number}>}
 */
async function submitLogin(world, email, password) {
  const page = world.page;
  if (!(await onLoginPage(world))) await open(world, adminUrl(world, 'login'));
  await ready(world);
  const emailField = page.locator('form input[name="email"]').first();
  const passwordField = page.locator('form input[type="password"]').first();
  const button = page.locator('form button[type="submit"]').first();
  await waitUsable(world, emailField, 'the "Email" field of the login form');
  await waitUsable(world, button, 'the "Login" button');
  const since = Date.now();
  const isLogin = (r) => r.request().method() === 'POST' && /\/users\/login(\?|$)/.test(r.url());
  let response = null;
  for (let attempt = 0; attempt < 2 && !response; attempt += 1) {
    await emailField.fill(email);
    await passwordField.fill(password);
    const answered = page.waitForResponse(isLogin, { timeout: attempt ? budget(world) : 4000 }).catch(() => null);
    await button.click();
    response = await answered;
    if (!response) await ready(world, { timeout: 4000 });
  }
  if (!response) {
    const cut = cutRequest(world, since);
    return { account: null, errors: [cut || 'the login form sent no login request (the button did nothing)'], status: 0 };
  }
  const status = response.status();
  if (status === 200) {
    // The admin then goes to the dashboard (or the page it was asked for).
    await page.waitForURL((u) => !/\/login(\?|$)/.test(u.pathname), { timeout: budget(world) }).catch(() => {});
    await ready(world);
    const account = await signedInAccount(world);
    return { account, errors: account ? [] : ['the site signed no account in after the login'], status };
  }
  const toast = await waitForToast(world, '', since, 5000);
  await ready(world);
  return { account: null, errors: toast ? [toast.text] : [`the site answered the login with ${status}`], status };
}

/**
 * Log in to the admin as an account of the users registry: its kept session
 * when it has one the site still takes, else the login form.
 */
async function logInAs(world, handle) {
  const user = resolveUser(world, handle);
  requests(world.page);
  if (reuseSessions(world) && (await restoreSession(world, user))) return user;
  await world.context.clearCookies({ name: sessionCookieName(world) }).catch(() => {});
  await open(world, adminUrl(world, 'login'));
  const outcome = await submitLogin(world, user.email, user.password);
  if (!outcome.account || !same(outcome.account.email, user.email)) {
    throw failure(world, `Could not log in as "${handle}" (${user.email}): ${outcome.errors.join('; ') || 'another account is signed in'}.`, LOGIN_HINT);
  }
  await keepSession(world, user.email);
  return user;
}

// ---------------------------------------------------------------------------
// The test-data client: the REST API as the data administrator
// ---------------------------------------------------------------------------

const CLIENTS = new Map();

/** The handle of the account the test-data steps work as (`worldParameters.dataAdmin`). */
function dataAdminHandle(world) {
  return (world.parameters && world.parameters.dataAdmin) || 'administrator';
}

/**
 * A client of the site's REST API, logged in as the data administrator in a
 * session of its own (the browser's session is never touched). One per site
 * and run.
 */
async function dataClient(world) {
  const admin = resolveUser(world, dataAdminHandle(world));
  const key = `${siteRoot(world)}|${admin.email}`;
  if (CLIENTS.has(key)) return CLIENTS.get(key);
  const { request } = require('playwright');
  const context = await request.newContext({ ignoreHTTPSErrors: true, baseURL: siteRoot(world) });
  const retrying = async (fn) => {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await fn();
      } catch (err) {
        const passing = /ERR_NETWORK_CHANGED|ECONNRESET|ECONNREFUSED|socket hang up|ETIMEDOUT|EPIPE|EAI_AGAIN/i.test(String(err && err.message));
        if (passing && attempt < 4) {
          await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
          continue;
        }
        if (passing) throw friendly({ message: `The test-data steps could not reach the site: ${String(err.message).split('\n')[0]}.`, cause: err, hint: CUT_HINT });
        throw err;
      }
    }
  };
  let token = null;
  const api = apiPath(world);
  const call = async (method, url, { data, multipart, allow = [] } = {}) => {
    const options = { method, failOnStatusCode: false, headers: token ? { Authorization: `JWT ${token}` } : {} };
    if (data !== undefined) options.data = data;
    if (multipart) options.multipart = multipart;
    const target = url.startsWith('/') ? api + url : url;
    const response = await retrying(() => context.fetch(target, options));
    const text = await response.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = null; }
    if (!response.ok() && !allow.includes(response.status())) {
      const detail = json && json.errors ? json.errors.map((e) => e.message + (e.data && e.data.errors ? ` (${e.data.errors.map((x) => `${x.path}: ${x.message}`).join('; ')})` : '')).join('; ') : text.slice(0, 200);
      throw friendly({ message: `The test-data steps got ${response.status()} from ${method} ${target}: ${detail}.`, hint: `The test-data steps work as worldParameters.dataAdmin ("${dataAdminHandle(world)}"): an administrator of the users registry, with its email address and password.` });
    }
    return { status: response.status(), json, headers: response.headers() };
  };
  const users = (world.parameters && world.parameters.usersCollection) || 'users';
  const answer = await call('POST', `/${users}/login`, { data: { email: admin.email, password: admin.password }, allow: [400, 401, 403, 423] });
  token = answer.json && answer.json.token;
  if (!token) {
    const why = (answer.json && answer.json.errors && answer.json.errors.map((e) => e.message).join('; ')) || `HTTP ${answer.status}`;
    throw friendly({
      message: `The test-data steps could not log in as "${dataAdminHandle(world)}" (${admin.email}): ${why}.`,
      hint: 'worldParameters.dataAdmin names the account the test documents are made and deleted with: an administrator of the users registry, with its email address and password.',
    });
  }
  const client = { call, context, admin };
  CLIENTS.set(key, client);
  return client;
}

/** Close the test-data clients at the end of the run. */
async function closeClients() {
  for (const client of CLIENTS.values()) await client.context.dispose().catch(() => {});
  CLIENTS.clear();
}

/** A rich-text value of one paragraph per line ("\n" in a step starts another). */
function richTextValue(text) {
  return {
    root: {
      type: 'root', format: '', indent: 0, version: 1, direction: 'ltr',
      children: String(text).split(/\\n|\n/).map((line) => ({
        type: 'paragraph', format: '', indent: 0, version: 1, direction: 'ltr', textFormat: 0, textStyle: '',
        children: [{ type: 'text', text: line, format: 0, detail: 0, mode: 'normal', style: '', version: 1 }],
      })),
    },
  };
}

/** The documents of a collection whose title field equals a text (drafts included). */
async function findDocuments(world, slug, title) {
  const client = await dataClient(world);
  const field = titleField(world, slug);
  const query = `where[${field}][equals]=${encodeURIComponent(title)}&limit=100&depth=0&draft=true`;
  const { json } = await client.call('GET', `/${slug}?${query}`, { allow: [400, 403, 404] });
  return (json && json.docs) || [];
}

/**
 * Delete a document (its versions go with it); a document already gone is no
 * failure. A document the scenario's page still holds open (the admin locks a
 * document while an account edits it) is deleted all the same.
 */
async function deleteDocument(world, slug, id) {
  const client = await dataClient(world);
  await client.call('DELETE', `/${slug}/${encodeURIComponent(id)}?overrideLock=true`, { allow: [404] });
}

/** Delete every document of a collection with a title (what an earlier, stopped run left). */
async function deleteDocumentsTitled(world, slug, title) {
  for (const doc of await findDocuments(world, slug, title)) await deleteDocument(world, slug, doc.id);
}

// ---------------------------------------------------------------------------
// After the scenario
// ---------------------------------------------------------------------------

function cleansUp(world) {
  return !(world.parameters && world.parameters.adminCleanUp === false);
}

/** Do something after the scenario, whatever happens in it (in the reverse order of the calls). */
function afterScenario(world, label, fn) {
  if (!world.__payloadCleanUp) world.__payloadCleanUp = [];
  if (world.__payloadCleanUp.some((item) => item.label === label)) return;
  world.__payloadCleanUp.push({ label, fn });
}

/** Delete a document after the scenario. */
function deleteAfter(world, slug, id) {
  if (!cleansUp(world) || !slug || id === undefined || id === null || id === '') return;
  afterScenario(world, `document:${slug}:${id}`, async () => { await deleteDocument(world, slug, id); });
}

/**
 * Give the account's list of a collection its defaults back after the
 * scenario: the admin keeps a list's sort, page size and columns per account
 * (its preferences), so the next scenario would open the list as this one
 * left it.
 */
function resetListAfter(world, slug) {
  afterScenario(world, `list:${slug}`, async () => { await resetListPreferences(world, slug); });
}

/** Delete the account's preferences of a collection's list (its sort, page size, columns), with the page's session. */
async function resetListPreferences(world, slug) {
  const url = `${siteRoot(world)}${apiPath(world)}/payload-preferences/collection-${encodeURIComponent(slug)}`;
  await world.page.request.delete(url, { failOnStatusCode: false, timeout: budget(world) }).catch(() => {});
}

module.exports = {
  budget,
  clean,
  normal,
  mentions,
  same,
  listed,
  quotedList,
  count,
  inWords,
  siteRoot,
  adminPath,
  apiPath,
  adminUrl,
  absolute,
  adminRoute,
  shortUrl,
  requests,
  runningRequests,
  lastDocumentStatus,
  answersSince,
  CUT_HINT,
  cutRequest,
  failure,
  pendingWork,
  ready,
  afterAction,
  open,
  hydrated,
  waitUsable,
  personClick,
  visibleOf,
  firstVisible,
  eventually,
  smartSettle,
  watchToasts,
  toastsSince,
  waitForToast,
  openDialogs,
  openDialog,
  waitForDialog,
  answerDialog,
  popupItems,
  chooseFromMenu,
  selectOptions,
  chooseInSelect,
  selectValues,
  fieldScope,
  findField,
  fieldLabels,
  requireField,
  fieldKind,
  textInput,
  richTextEditor,
  writeRichText,
  isOn,
  setField,
  fieldValue,
  fieldError,
  uploadedFiles,
  chooseExistingFile,
  collectionSlug,
  titleField,
  resolveUser,
  emailOf,
  signedInAccount,
  keepSession,
  forgetSession,
  restoreSession,
  onLoginPage,
  LOGIN_HINT,
  submitLogin,
  logInAs,
  dataAdminHandle,
  dataClient,
  closeClients,
  richTextValue,
  findDocuments,
  deleteDocument,
  deleteDocumentsTitled,
  cleansUp,
  afterScenario,
  deleteAfter,
  resetListAfter,
  resetListPreferences,
};
