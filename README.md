<p align="center"><img src="https://raw.githubusercontent.com/webship/payload-steps/2.0.x/assets/logo.svg" alt="Payload logo" width="96"></p>

# payload-steps

[![Test](https://github.com/webship/payload-steps/actions/workflows/test.yml/badge.svg)](https://github.com/webship/payload-steps/actions/workflows/test.yml)

Cucumber step definitions for testing a Payload app, its admin and the website
of its official website template, with
[webship-js](https://webship.co/docs/webship-js/2.0.x), a BDD browser automation
harness built on Playwright and Cucumber-js.

`@webship-js/payload-steps` covers what the admin of every Payload 3 app shows,
whatever its collections, and the front end the website template ships:

- **the session**: the admin login by a handle of the users registry (the
  session of an account is taken over from earlier in the run) or through the
  form, its refusal, logging out, who is signed in, the first-user screen that
  is gone once the app has its accounts, and an account the admin refuses;
- **the access**: what the navigation and the dashboard list for an account,
  an address it may not open, a collection it may not add to, its own account
  page and a field it may not change;
- **a collection's list**: its count, rows, columns and cells, the search,
  sorting both ways, the filters (a field, an operator and a value) and their
  removal, the columns shown, the pages and their size, selecting rows, and
  what the selection offers: editing the selected documents together (as
  drafts or published), publishing, unpublishing and deleting them;
- **the edit view**: every kind of field by its label (a text, a select, a
  relationship, an upload chosen from the media, a checkbox, radio buttons, a
  date, the rich-text editor), the tabs of a form, the slug and its lock,
  publishing, saving, the status, the notifications, the errors of a field,
  deleting, duplicating, and leaving a form with changes;
- **blocks and arrays**: adding a block or a row, what the rows are, moving,
  duplicating and removing a row, expanding and collapsing one or all of them,
  and the fields of a row;
- **drafts and versions**: autosave, the "Changed" state, unpublishing,
  reverting to the published version, the versions of a document, what a
  version changed, and restoring one (published or as a draft);
- **the live preview** beside the form, and the preview link;
- **uploads**: a file chosen for a new document of an upload collection, and
  its details;
- **the website**: its navigation, the list of posts and its pages, a post, the
  site search, a form of the form builder (its errors and its confirmation),
  and the page for an address the site does not have;
- **test documents**: a scenario makes the documents it needs through the
  site's REST API, and the steps delete them after it, with every document,
  file and form submission it makes on screen.

No step phrase names the platform: a scenario reads `When I set "Categories" to
"Design"` and `Then the status of the document should be "Changed"`.

CI builds a real app with [DDEV](https://ddev.com) on the runner (made with the
official installer, `create-payload-app`, from the official website template
of the current release, on PostgreSQL 17, with the template's own seed and the
accounts of [Test users](#test-users)), and runs the whole suite against it
twice on every push and pull request, then the assertions that must fail; see
[`.github/workflows/test.yml`](.github/workflows/test.yml).

## From nothing to a green run

What the machine needs: Docker, [DDEV](https://ddev.com), git, and Node.js 20 or
later with npm. Node.js 24, the app and PostgreSQL run in DDEV's containers.

**1. The app.** The pack's own build script (the one CI runs) makes the app in a
generic DDEV project (DDEV has no project type for Payload): Node.js 24 in the
web image, the app made with `npx create-payload-app` from the official website
template of the release, PostgreSQL 17, roles for its accounts (the template's
have none: see [A test site](#a-test-site)), the schema from a migration, the
two accounts of [Test users](#test-users), the template's own seed and twelve
more posts, then built for production and served by the web container. It
takes about five minutes the first time.

```bash
git clone https://github.com/webship/payload-steps.git
SITE_DIR="$PWD/payload-site" payload-steps/.github/scripts/build-ddev-site.sh
```

The app answers at `https://payloadsteps.ddev.site`, its admin at `/admin`. Its
accounts are `administrator` and `editor` (the admin logs in with their email
addresses, `<handle>@example.com`), each with the password `dD.123123ddd` (step
3 names them).

In the [Webship Workspace](https://github.com/webship/workspace), its Payload
plugin builds the same app instead, in a sites folder of the workspace (`dev/`
here, the one `--with-needs` adds to a new workspace; `test/`, `sandboxes/` and
`demos/` work the same):

```bash
bash core/scripts/plugins.sh --require payload --with-needs
bash core/scripts/plugins.sh --activate payload --with-needs
bash core/scripts/plugins.sh --install payload
bash dev/cmd-payload-project.sh plsite --install --add-users --sample-content
```

That app answers at `https://plsite.ddev.site`. `--sample-content` adds the
template's own seed and the same twelve posts (the features of this pack need
them). Its accounts are the plugin's, the same two with the workspace's shared
password `dD.123123ddd`: `administrator` and `editor`. The workspace's own
account is an administrator too; the suite does not use it. The plugin's README
says how to manage the accounts with its CLI tool (`cmd-tools-payload-cli.sh
plsite --add-users`): the dashboard's Users menu does not know a Payload app.

**2. A test project.**

```bash
mkdir payload-tests && cd payload-tests
npm init -y
npm install --save-dev webship-js @webship-js/payload-steps
npx init-webship-js
```

`npx init-webship-js` writes `cucumber.js`, `playwright.config.ts`, the `tests/`
folders with a first feature and the `npm test` scripts, and installs Chromium.
npm usually runs it already when it installs webship-js; a second run changes
nothing. Its first feature opens the site's home page: it passes, and can stay.

**3. `cucumber.js`.** Replace the file with the wiring of the pack: the step
files of webship-js and of the pack, the tags that keep the assertions that must
fail out of a normal run, the address of the app, and the accounts (the JSON of
[Test users](#test-users)). The first lines are the starter's own: a feature
named on the command line runs alone (step 5).

```javascript
// A feature file or a scenario (file:line) named on the command line runs alone:
// cucumber-js 12 would add it to the paths below, so `paths` is left empty then.
const OPTIONS_WITH_A_VALUE = new Set([
  '-c', '--config', '-f', '--format', '--format-options', '--i18n-keywords',
  '-i', '--import', '-l', '--loader', '--language', '--name', '--order',
  '-p', '--profile', '--parallel', '--plugin', '--plugin-options',
  '-r', '--require', '--require-module', '--retry', '--retry-tag-filter',
  '--shard', '-t', '--tags', '--world-parameters',
]);

function commandLinePaths() {
  if (!/cucumber(-js|\.js)?$/.test(String(process.argv[1] || ''))) return [];
  const args = process.argv.slice(2);
  const paths = [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i].startsWith('-')) {
      if (OPTIONS_WITH_A_VALUE.has(args[i])) i += 1;
    } else {
      paths.push(args[i]);
    }
  }
  return paths;
}

module.exports = {
  default: {
    requireModule: ['tsx/cjs'],
    require: [
      'node_modules/webship-js/tests/step-definitions/**/*.js',
      'node_modules/@webship-js/payload-steps/tests/step-definitions/**/*.js',
      'tests/step-definitions/**/*.js',
    ],
    paths: commandLinePaths().length ? [] : ['tests/features/**/*.feature'],
    // Work in progress and the assertions that must fail stay out of a normal run.
    tags: 'not @wip and not @must-fail',
    format: ['@cucumber/pretty-formatter', 'json:tests/reports/cucumber_report.json'],
    worldParameters: {
      launchUrl: process.env.LAUNCH_URL || 'https://payloadsteps.ddev.site',
      // Where the admin and the REST API are, and the account the test-document steps work as (an administrator of `users`).
      adminPath: '/admin',
      apiPath: '/api',
      dataAdmin: 'administrator',
      // No error of the app: a request the browser lost when the network of the machine changed.
      javascript: { mode: 'warn', levels: ['error'], ignore: 'net::ERR_NETWORK_CHANGED', beforeScenario: false, afterScenario: true },
      minWaitTime: { page: 3000, before_scenario: 0, after_scenario: 0, before_step: 0, after_step: 0 },
      users: {
        administrator: { email: 'administrator@example.com', password: 'dD.123123ddd' },
        editor: { email: 'editor@example.com', password: 'dD.123123ddd' },
        // The website template's seed makes the author of its posts with no role: the admin refuses it.
        'demo-author': { email: 'demo-author@example.com', password: 'password' },
      },
    },
  },
};
```

On an app from the Webship Workspace (step 1) the accounts are the same; its
address goes in `LAUNCH_URL` (step 5).

**4. A first feature**, `tests/features/first-run.feature`:

```gherkin
Feature: First run
  Scenario: The editor logs in to the admin
    Given I am not logged in
    When I log in as "editor" with the login form
    Then I should be logged in as "editor"

  Scenario: The editor finds posts in the list
    Given I am a logged in user with the "editor" user
    And I am on the "Posts" list
    When I search the list for "harbour"
    Then the list should count 2 documents
```

The second scenario reads the sample posts that both ways of step 1 make.

**5. Run it.** Set `LAUNCH_URL` to the address of the app:
`https://payloadsteps.ddev.site` for the build script's app,
`https://plsite.ddev.site` for the Workspace's.

```bash
LAUNCH_URL=https://payloadsteps.ddev.site npm test
```

A green first run prints every step, then the summary (the scenarios above and
the starter's, passed) and the HTML report it wrote:

```
3 scenarios (3 passed)
9 steps (9 passed)
```

One feature runs alone when the command line names it (a scenario too, with
its line):

```bash
LAUNCH_URL=https://payloadsteps.ddev.site npx cucumber-js tests/features/first-run.feature
```

From there, copy the features of [`tests/features/`](tests/features/) (they
also ship in the package, under
`node_modules/@webship-js/payload-steps/tests/features/`, with the file they
upload in `tests/assets/`: copy that folder too). Together they use every step of
the pack. Each makes its own test documents and deletes them after it. They run
as they are on the app of either way of step 1.

### What the suite tests

The features of this repository run every step of the pack against the test
app, twice in a row in CI on every change, then the assertions that must fail:
a visitor sent to the login page, the first-user screen gone, each account
logging in through the form, a refused login, a session taken over, logging out,
the template seed's author refused by the admin; what the editor and the
administrator may see, open and add; the account page, its name changed, a role
it may not change, passwords that do not match and a form left without saving;
the list of posts with its count, rows and pages, a search that finds two and
one that finds none, sorting both ways, a filter by status and one by a
relationship and a text, the columns shown and hidden, 25 posts per page; a
post made with a rich text, an image and a category and published, a
relationship value and an image taken out, the slug unlocked and set, a
publication refused without a title, a post deleted and one duplicated; blocks
added, moved, collapsed and removed in a page, the rows of an array inside a
block, the header's links changed and left without saving; a published post
changed, compared with its published version and restored, a change reverted, a
post unpublished and published again, posts edited, published, unpublished and
deleted together from the list; the live preview following the form; an image
uploaded and deleted, the media list; and the website: its navigation, the
posts and their pages, a post, the search, a post published that shows at once,
the contact form refused and sent, and a missing page.

Every document, file and form submission a scenario makes is deleted after it,
and an account's list and name are put back: the suite leaves the app as it
found it.

Not tested: the admin's other languages (a few steps read the admin's English
words: "Publish changes", "Choose from existing", "Leave anyway"), a password
reset (the app sends its mail to its log: it has no mail service), scheduled
publishing (it needs the jobs runner), the admin's folders ("Browse by Folder"),
localized fields (the website template has none), the GraphQL and REST APIs
(webship-js's own API steps cover them), drag and drop with the mouse (the steps
move rows with their menus), and a field of the `collapsible` type (the template
has none: the steps open and close the rows of blocks and arrays, which use the
same collapsible part of the admin).

## Requirements

- Node.js 20 or later
- A webship-js 2.0 test project (webship-js 2.0.16 or later)
- A Payload 3 app (3.94 or later) with accounts for the suite (an administrator
  among them, for the test-document steps); the website template for the steps
  of the website

## Install

```bash
npm install --save-dev @webship-js/payload-steps
```

## How the steps find things and wait

- **By what a person reads.** A collection by its name in the admin's
  navigation ("Posts"), a document by its title in the list, a field by its
  label as the form shows it (the "*" of a required field left out), a column
  by its heading, a tab, a block and a row by their names, a dialog by its
  heading ("Confirm publish"), a menu item by its text. The admin's stable
  hooks are the fallback: the ids of the fields (`field-<name>`), the rows
  (`<field>-row-<n>`), the form's buttons (`action-save`), the live preview's
  toggle (`live-preview-toggler`).
- **The admin is a Next.js app: the same waits as the Next.js step pack.** A
  page change draws the page from the server's answer to a request with the
  header `rsc: 1`; a change in a form asks the server for the form's state (a
  request with the header `next-action`); saving, publishing and the lists' data
  go through the REST API. A page is ready when the document has loaded, React
  has taken the page over (the root element carries React's fiber), no part of
  the page still waits for streamed content or shows its loading state, the
  admin's own progress bar (`.progress-bar`, during a route change) and loading
  overlay (`.loading-overlay--entering`) are gone, and no request of the app is
  running, all of that for 150 ms. A click waits for its element to carry
  React's properties: a click on a form the router is still replacing is lost.
  This pack does not depend on the Next.js pack: it needs none of its steps.
- **Then what the admin shows of the outcome.** A search, a filter, a sort or a
  page commit the list's address; a save or a publication its notification
  ("Updated successfully."), which the steps remember as it comes (it lives four
  seconds); autosave its request and "Last saved"; a moved row the new order of
  the rows.
- **The admin's long timers.** The admin keeps timers that fire many minutes
  later (it renews its session before the token expires). webship-js's settle
  after a step counts every pending timer as work in progress, so on this admin
  it would wait out its whole budget after each step. The pack takes timers
  longer than five seconds out of that count, on every page of a scenario.
- **What the admin keeps per account.** A list's sort, page size and columns
  are kept per account on the server: `Given I am on the "Posts" list` opens a
  list with its defaults, and a scenario that changed them gives them back after
  it.
- **A cut request says so.** When the browser lost a request of the site (a
  network change on the machine, another container starting), the step says the
  request was cut before the site answered, with a hint to run the scenario
  again (or to run the suite in the project's container), instead of blaming
  the scenario. A login whose click sent nothing is sent once more.
- **Failures say what was found.** `The list counts 18 documents, not 17.`,
  `The field "Categories" does not hold "Design". It holds "News".`, with a hint
  on where to look.

## Accounts

The suite never creates or deletes an account. Accounts are configuration: list
the ones the app has in `worldParameters.users`, by a handle the scenarios use,
each with its `email` (the admin logs in with it) and `password`.
`worldParameters.dataAdmin` names the handle of an administrator: the
test-document steps make and delete the test documents as that account, through
the site's REST API, in a session of their own (the browser's session is never
touched).

An account that logged in once keeps its session for the rest of the run
(`reuseSessions: false` turns it off); a logout ends it. Only the site's session
cookie is carried over, never the draft mode a preview turns on.

The admin locks an account for ten minutes after five wrong passwords in a row:
test a refused login with an address no account has.

## Test users

The accounts this repository's suite logs in as, exactly as `cucumber.js` lists
them in `worldParameters.users` (the default values; the `<HANDLE>_EMAIL` and
`<HANDLE>_PASSWORD` variables replace them). The build script creates the first
two; the Workspace's Payload plugin creates the same two. The template's seed
makes the third.

```json
{
  "administrator": { "email": "administrator@example.com", "password": "dD.123123ddd" },
  "editor": { "email": "editor@example.com", "password": "dD.123123ddd" },
  "demo-author": { "email": "demo-author@example.com", "password": "password" }
}
```

`administrator` has the role Administrator (every collection, the accounts and
the redirects; the first account of the app) and `editor` the role Editor (the
pages, posts, media, categories, forms, the header and the footer; its own
account only, and never its roles; no redirects). Their names in the admin are
"Administrator Webship" and "Editor Webship". `demo-author` is the author of the
template's sample posts ("Demo Author"), which the template's seed makes with the
password `password` and the build leaves without a role: the admin refuses it.
They are placeholder credentials of a throwaway test app, not of any real one.

## A test site

[`.github/scripts/build-ddev-site.sh`](.github/scripts/build-ddev-site.sh)
builds the app the suite of this repository runs against, in a generic DDEV
project with PostgreSQL 17:

- Node.js 24 in the web image (baked in, so the server has it before the
  container's daemons start); Payload 3 supports Node.js 22, 24 and 26;
- the app made with the official installer, `npx create-payload-app@<PAYLOAD_VERSION>`
  (`latest` by default), from the official website template at the tag of that
  release, with npm, the container's database (`db` / `db` / `db`), no
  coding-agent skill and no git repository: no cloud account of any kind;
- the address of the app (`NEXT_PUBLIC_SERVER_URL`) and a secret of its own for
  the preview and the scheduled jobs in `app/.env`, where the installer leaves
  placeholders;
- **the roles of the accounts**, which the template's accounts do not have:
  `app/src/webship-test-site.ts`, a plugin at the end of the app's configuration,
  adds a `roles` field to the accounts (Administrator, Editor; only an
  administrator may change it, and the first account of the app is an
  administrator) and the access that reads it: an account with a role may use
  the admin, an account without one is refused; an administrator makes, changes
  and deletes every account, an editor reads and changes its own only; the
  redirects are the administrators'; everything else stays as the template has
  it (open to every account). Telemetry is off. Nothing else of the template
  changes;
- the schema from a migration (`payload migrate:create`, then `payload
  migrate`): the server runs in production, where the schema is never pushed;
- the accounts, the template's own seed (what its dashboard's "Seed your
  database" makes: the home and contact pages, the contact form, 3 posts, 6
  categories, 4 images, the header and footer links, the demo author) and 12
  more posts and 2 drafts, through the app's Local API (`payload run`) before
  the production build, so the pages the front end renders ahead show them;
- the app built for production (`next build`) and served by the web container as
  a daemon (`next start`), the router sending the project's address to its port.

[`site/payload-site.mjs`](site/payload-site.mjs) writes all of it: the same
script the Webship Workspace's Payload plugin runs. Run again with
`ACCOUNTS_ONLY=1` and the same `SITE_DIR`, the build script gives the accounts
back their name, password and roles and unlocks them; with `SEED_ONLY=1`, the
seed and the sample posts (then it builds the front end again).

## Steps

109 steps in 8 files, every one with five examples in its JSDoc (`npm run test:examples` checks them).

| File | Steps | Covers |
| --- | --- | --- |
| `payload-session.steps.js` | 11 | The session: logging in by a handle or through the form, a refused login, a visitor, logging out, who is signed in, the login page, the first-user screen, an account the admin refuses. |
| `payload-admin.steps.js` | 8 | The navigation and the dashboard, an address an account may not open, a collection it may not add to, the account page, a read-only field, a file to upload and its details. |
| `payload-list.steps.js` | 27 | A collection's list: its count, rows, columns, cells, the search, sorting, the filters, the columns shown, the pages and their size, the selection and what it offers, opening and making a document. |
| `payload-edit.steps.js` | 26 | The edit view: making and opening a document and a global, every kind of field, the tabs, the rich text, the relationship and upload values, the slug, saving, publishing, unpublishing, reverting, the status, autosave, the notifications, the errors, deleting, duplicating, leaving with changes. |
| `payload-blocks.steps.js` | 11 | Blocks and arrays: adding, the rows, moving, duplicating, removing, expanding and collapsing, the fields of a row. |
| `payload-versions.steps.js` | 9 | The versions of a document, what a version changed, restoring one; the live preview and the preview link. |
| `payload-front.steps.js` | 12 | The website: its navigation, the posts and their pages, a post, the site search, a form, a missing page. |
| `payload-data.steps.js` | 5 | Test documents made through the REST API and deleted after the scenario; a document that must or must not be there. |
| `payload-helpers.js` | | Shared plumbing: the addresses, the requests of a page and the cut ones, the page-ready wait, the notifications, the dialogs and menus, the select boxes, the fields by their labels, the collections, the users registry and the session cache, the test-data client, the clean-up. It registers no step. |

Text, links, buttons, the status code of a page and the accessibility checks are webship-js's own steps (`I should see "..."`, `I press "Change Password"`, `I am on "/posts"`, `the page should have a main landmark`); this pack adds what the admin and the template decide.

### `payload-session.steps.js` (11)

- `Given I am a logged in user with the "editor" user`
- `Given I am not logged in`
- `When I log in as "editor" with the login form`
- `When I log in with the email "nobody@example.com" and the password "Wrong-password-1"`
- `Then the login should be refused with "The email or password provided is incorrect."`
- `When I log out`
- `Then I should be logged in`
- `Then I should not be logged in`
- `Then I should be on the admin login page`
- `Then the admin should not ask for its first user`
- `Then the admin should refuse this account`

### `payload-admin.steps.js` (8)

- `Then the navigation should list "Users"`
- `Then the dashboard should list "Posts"`
- `Then I should not be allowed to open "/admin/collections/redirects"`
- `Then I should not be able to create a document in "Users"`
- `When I go to my account`
- `Then the "Roles" field should be read only`
- `When I choose the file "test-lighthouse.png" to upload`
- `Then the file details should show "320x200"`

### `payload-list.steps.js` (27)

- `Given I am on the "Posts" list`
- `Then the list should count 17 documents`
- `Then the list should show "Morning light over the harbour"`
- `Then the list should show the documents:`
- `Then the list should have 10 rows`
- `Then the "Morning light over the harbour" row should show "morning-light-over-the-harbour" in the "Slug" column`
- `Then the first row of the list should be "A draft about the new library"`
- `Then the list should be empty`
- `When I search the list for "harbour"`
- `When I clear the search of the list`
- `When I sort the list by "Title"`
- `When I filter the list where "Status" "equals" "Draft"`
- `Then the list should be filtered where "Status" "equals" "Draft"`
- `When I remove the filters of the list`
- `When I show the "Status" column`
- `Then the list should have the column "Status"`
- `When I go to page 2 of the list`
- `Then the list should be on page 2`
- `When I show 25 documents per page`
- `When I select "Bulk test post one" in the list`
- `When I select all documents on the page`
- `Then the selection should read "2 selected"`
- `When I publish the selected documents`
- `When I edit the selected documents, setting "Categories" to "News"`
- `When I save the edit of the selected documents as drafts`
- `When I open "Morning light over the harbour" from the list`
- `When I create a new document from the list`

### `payload-edit.steps.js` (26)

- `When I create a new document in "Posts"`
- `When I open the document "Data step post" in "Posts"`
- `When I open the "Header" global`
- `When I set "Title" to "Editor test post"`
- `When I set these fields:`
- `Then "Title" should be set to "Editor test post"`
- `When I open the "Meta" tab`
- `When I write "A paragraph typed in the editor." in the rich text editor`
- `Then the rich text editor should contain "A paragraph typed in the editor."`
- `Then the "Categories" field should hold "Design"`
- `When I remove "Design" from the "Categories" field`
- `When I unlock the slug`
- `Then the "Title" field should show the error "This field is required."`
- `When I publish the document`
- `When I save the document`
- `When I unpublish the document`
- `When I revert the document to its published version`
- `Then the status of the document should be "Draft"`
- `Then the document should be saved automatically`
- `Then I should not be able to publish the document`
- `Then I should see the notification "Updated successfully."`
- `When I delete the document`
- `When I duplicate the document`
- `When I go to "Posts" in the navigation`
- `Then the admin should ask to leave without saving`
- `When I leave without saving`

### `payload-blocks.steps.js` (11)

- `When I add the "Content" block to "Layout"`
- `When I add a row to "Nav Items"`
- `Then "Layout" should have 2 rows`
- `Then the rows of "Layout" should be "Content" and "Call to Action"`
- `When I move row 1 of "Layout" down`
- `When I remove row 2 of "Layout"`
- `When I expand row 1 of "Nav Items"`
- `Then row 1 of "Nav Items" should be expanded`
- `When I collapse all rows of "Layout"`
- `When I set "Label" to "News" in row 3 of "Nav Items"`
- `Then "Label" should be set to "News" in row 3 of "Nav Items"`

### `payload-versions.steps.js` (9)

- `When I open the versions of the document`
- `Then the document should have 3 versions`
- `Then a version should be marked "Currently Published"`
- `When I open the version marked "Currently Published"`
- `Then the version should change "Title" from "Version test post" to "Version test post, changed"`
- `When I restore this version`
- `When I open the live preview`
- `Then the live preview should show "Preview test post"`
- `Then the preview link should open "/posts/preview-test-post"`

### `payload-front.steps.js` (12)

- `Then the site navigation should list "Posts", "Contact" and "Search"`
- `Then the page should show posts 1 to 12 of 15`
- `Then the page should list the post "Morning light over the harbour"`
- `When I go to the next page of posts`
- `Then the title of the post should be "Digital Horizons: A Glimpse into Tomorrow"`
- `When I search the site for "harbour"`
- `Then the search should find "Morning light over the harbour"`
- `When I fill in the form with:`
- `When I send the form`
- `Then the form should confirm "The contact form has been submitted successfully."`
- `Then the "Email" field of the form should show "This field is required"`
- `Then I should see the page for an address the site does not have`

### `payload-data.steps.js` (5)

- `Given there is a document "Data step post" in "Posts"`
- `Given there is a published document "Published test post" in "Posts"`
- `Given there is a document "Table test post" in "Posts" with:`
- `Given there is no document "Editor test post" in "Posts"`
- `Then there should be a document "Editor test post" in "Posts"`

## Phrases shared with other packs

The session phrases are the ones every platform pack has, so a feature reads
the same on every system (one cucumber.js profile per system; the platform packs
are not meant to be loaded together). Loaded beside each of the 31 published
packs, these phrases of this pack also match one of theirs:

| Phrase of this pack | Also in |
| --- | --- |
| `I am a logged in user with the "…" user` | codeigniter, django, django-cms, drupal-core, joomla, laravel, mediawiki, moodle, nextjs, odoo, strapi, symfony, typo3, wordpress |
| `I should be logged in` | backdrop-cms, codeigniter, django, django-cms, drupal-core, laravel, mediawiki, moodle, nextjs, odoo, strapi, symfony, typo3, wordpress |
| `I log out`, `I should not be logged in` | codeigniter, django, django-cms, drupal-core, laravel, mediawiki, moodle, nextjs, odoo, strapi, symfony, typo3, wordpress |
| `I search the site for "…"` | backdrop-cms, ghost, hubspot-cms, jira, joomla, squarespace, typo3, wordpress |
| `I am not logged in` | django, django-cms, drupal-core, joomla, odoo, strapi, typo3, wordpress |
| `I log in as "…" with the login form` | codeigniter, django, laravel, mediawiki, moodle, nextjs, strapi, symfony |
| `I should see the notification "…"` | craft-cms, ghost, laravel, odoo, prestashop, strapi, typo3 |
| `I sort the list by "…"` | django, ghost, prestashop, strapi |
| `the list should be on page 2` | django, ghost, strapi, symfony |
| `I log in with the email "…" and the password "…"` | codeigniter, laravel, nextjs, strapi |
| `I should not be allowed to open "…"` | django, django-cms, strapi |
| `the list should have 10 rows` | django, prestashop, strapi |
| `the first row of the list should be "…"` | django, ghost, strapi |
| `I search the list for "…"`, `I should be on the admin login page` | django, joomla, strapi |
| `I go to page 2 of the list` | django, strapi, symfony |
| `the login should be refused with "…"` | django, mediawiki, strapi |
| `I set "…" to "…"`, `I set these fields:`, `"…" should be set to "…"`, `I am on the "…" list`, `the list should show "…"`, `the "…" row should show "…" in the "…" column`, `I select "…" in the list`, `the selection should read "…"`, `I open "…" from the list` | django, strapi |
| `I open the "…" tab` | joomla, odoo |
| `the rich text editor should contain "…"` | django-cms, joomla |
| `I remove "…" from the "…" field` | craft-cms, odoo |
| `the navigation should list "…"` | webflow |
| `the "…" field should hold "…"` | craft-cms |
| `the "…" field should show the error "…"`, `the list should be empty`, `I clear the search of the list`, `I filter the list where "…" "…" "…"`, `I show the "…" column`, `the list should have the column "…"` | strapi |
| `the search should find "…"` | docusaurus |
| `the list should count 17 documents` | django |

The Strapi and Django admin packs share the most: the three test an admin, with a
list, a form and a session, and say it the same way. None matches a webship-js
step, and none matches a phrase of the component pack (Bootstrap) or of the Diffy
pack, which can be loaded beside this one. This pack needs none of the Next.js
pack's steps (the admin is a Next.js app: it shares that pack's way of waiting,
not its phrases), and it does not depend on it.

## Testing this package

```bash
npm ci
npm run test:examples    # every step's JSDoc examples match it and nothing else; every feature step resolves
npm run test:paths       # a feature named on the command line runs alone
npx cucumber-js --dry-run
SITE_DIR="$PWD/../payload-site" .github/scripts/build-ddev-site.sh
npx cucumber-js          # the whole suite
npm run test:must-fail   # the assertions that must fail, each with its message and a hint
```

## How the steps were written

Every step was written from a round of manual testing of a real local app in
the browser first: each screen it touches was opened as the account the step
works as, its roles, labels and messages noted, and the signal it gives while it
loads or saves found (its route change, its form state, its REST call, its
notification). The failures of the first runs went back to the browser before
the step changed.

## License

MIT, see [LICENSE](LICENSE).

## Logo

The Payload logo in this README comes from Simple Icons 16.37.0 (CC0-1.0), filled
with the colour the set lists for the brand. The Payload name and logo are
trademarks of their owner; this pack is not affiliated with or endorsed by them.
