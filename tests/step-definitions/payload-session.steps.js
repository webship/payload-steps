'use strict';

// The session: logging in by a handle of the users registry (the session of an
// account is taken over from earlier in the run when the site still takes it)
// or through the login form, a refused login, a visitor, logging out, who is
// signed in, the first-user screen, and an account the admin refuses.
//
// The admin logs in with an email address. It locks an account for ten
// minutes after five wrong passwords in a row: a refused login is best tested
// with an address no account has.

const { Given, When, Then } = require('@cucumber/cucumber');
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
  eventually,
  failure,
  personClick,
  resolveUser,
  emailOf,
  signedInAccount,
  onLoginPage,
  submitLogin,
  logInAs,
  keepSession,
  forgetSession,
  LOGIN_HINT,
} = require('./payload-helpers');

/**
 * Log in to the admin as an account of the users registry, by its handle. An
 * account that logged in earlier in the run takes its session over when the
 * site still takes it; else the login form is filled in, and the session is
 * kept for the next scenarios.
 *
 * Example #1: Given I am a logged in user with the "editor" user
 * Example #2: Given I am a logged in user with the "administrator" user
 * Example #3: And I am a logged in user with the "editor" user
 * Example #4: Given I am a logged in user with the "administrator" user
 * Example #5: When I am a logged in user with the "editor" user
 */
Given(/^I am a logged in user with the "([^"]*)" user$/, async function (handle) {
  await logInAs(this, handle);
  if (await onLoginPage(this)) await open(this, adminUrl(this));
});

/**
 * Be a visitor: no session of the site in the browser, on the admin's login
 * page (the admin sends a visitor there).
 *
 * Example #1: Given I am not logged in
 * Example #2: And I am not logged in
 * Example #3: Given I am not logged in
 * Example #4: When I am not logged in
 * Example #5: Given I am not logged in
 */
Given(/^I am not logged in$/, async function () {
  await this.context.clearCookies();
  await open(this, adminUrl(this, 'login'));
});

/**
 * Log in through the admin's login form with the email address and password
 * of an account of the users registry, and keep its session for the next
 * scenarios.
 *
 * Example #1: When I log in as "editor" with the login form
 * Example #2: When I log in as "administrator" with the login form
 * Example #3: And I log in as "editor" with the login form
 * Example #4: When I log in as "administrator" with the login form
 * Example #5: Given I log in as "editor" with the login form
 */
When(/^I log in as "([^"]*)" with the login form$/, async function (handle) {
  const user = resolveUser(this, handle);
  const outcome = await submitLogin(this, user.email, user.password);
  if (!outcome.account || !same(outcome.account.email, user.email)) {
    throw failure(this, `The login form did not log "${handle}" (${user.email}) in: ${outcome.errors.join('; ') || 'another account is signed in'}.`, LOGIN_HINT);
  }
  await keepSession(this, user.email);
});

/**
 * Fill in and send the login form with an email address and a password as
 * they are (for the refusals; an address of the users registry may be named
 * by its handle).
 *
 * Example #1: When I log in with the email "nobody@example.com" and the password "Wrong-password-1"
 * Example #2: When I log in with the email "editor@example.com" and the password "Not-the-password-1"
 * Example #3: And I log in with the email "nobody@example.com" and the password "Wrong-password-1"
 * Example #4: When I log in with the email "demo-author@example.com" and the password "password"
 * Example #5: When I log in with the email "nobody@example.org" and the password "Wrong-password-2"
 */
When(/^I log in with the email "([^"]*)" and the password "([^"]*)"$/, async function (email, password) {
  this.__payloadLogin = await submitLogin(this, emailOf(this, email), password);
});

/**
 * The last login was refused, with a message the admin shows (its
 * notification), and nobody is signed in.
 *
 * Example #1: Then the login should be refused with "The email or password provided is incorrect."
 * Example #2: Then the login should be refused with "incorrect"
 * Example #3: And the login should be refused with "The email or password provided is incorrect."
 * Example #4: Then the login should be refused with "The email or password provided is incorrect"
 * Example #5: Then the login should be refused with "email or password"
 */
Then(/^the login should be refused with "([^"]*)"$/, async function (message) {
  const outcome = this.__payloadLogin;
  if (!outcome) throw friendly({ message: 'No login was sent in this scenario.', hint: 'Send one first: "When I log in with the email ... and the password ...".' });
  if (outcome.account) {
    throw friendly({ message: `The login was not refused: the site signed ${outcome.account.email} in.`, hint: 'The email address and the password belong to an account of the site.' });
  }
  if (!outcome.errors.some((e) => mentions(e, message))) {
    throw failure(this, `The login was refused, but not with "${message}": the admin said ${listed(outcome.errors)}.`, 'The admin says why in a notification at the bottom of the page.');
  }
});

/**
 * Log out through the admin's navigation ("Log out"), and forget the kept
 * session of the account (the site ends it).
 *
 * Example #1: When I log out
 * Example #2: And I log out
 * Example #3: Then I log out
 * Example #4: When I log out
 * Example #5: Given I log out
 */
When(/^I log out$/, async function () {
  const account = await signedInAccount(this);
  const link = this.page.locator('a.nav__log-out, a[href$="/logout"]').first();
  if (await link.isVisible().catch(() => false)) {
    await personClick(this, link, 'the "Log out" link of the navigation');
  } else {
    await open(this, adminUrl(this, 'logout'));
  }
  // A form with changes asks first: leave anyway.
  const leave = this.page.locator('dialog[open]').getByRole('button', { name: 'Leave anyway' });
  if (await leave.isVisible().catch(() => false)) await personClick(this, leave.first(), 'the button "Leave anyway"');
  await eventually(this, () => onLoginPage(this), (on) => on, () => ({
    message: `Logging out did not end on the login page (${shortUrl(this.page.url())}).`,
    hint: 'The admin logs out at /admin/logout and then shows its login page.',
  }));
  if (account) forgetSession(this, account.email);
});

/**
 * Someone is signed in, or a given account is (a handle of the users
 * registry, or an email address), as the site says it (the account of the
 * browser's session).
 *
 * Example #1: Then I should be logged in
 * Example #2: Then I should be logged in as "editor"
 * Example #3: And I should be logged in as "administrator"
 * Example #4: Then I should be logged in as "editor@example.com"
 * Example #5: And I should be logged in
 */
Then(/^I should be logged in(?: as "([^"]*)")?$/, async function (who) {
  const account = await eventually(this, () => signedInAccount(this), (a) => !!a, () => ({
    message: `Nobody is signed in (${shortUrl(this.page.url())}).`,
    hint: 'The login did not finish: look at the screenshot of the failure for the notification of a refusal.',
  }), 5000);
  if (who && !same(account.email, emailOf(this, who))) {
    throw friendly({ message: `"${account.email}" is signed in, not "${who}" (${emailOf(this, who)}).`, hint: 'A session taken over from another scenario belongs to its account: log out first.' });
  }
});

/**
 * Nobody is signed in: the site knows no account for the browser's session.
 *
 * Example #1: Then I should not be logged in
 * Example #2: And I should not be logged in
 * Example #3: Then I should not be logged in
 * Example #4: And I should not be logged in
 * Example #5: Then I should not be logged in
 */
Then(/^I should not be logged in$/, async function () {
  const account = await eventually(this, () => signedInAccount(this), (a) => !a, (a) => ({
    message: `"${a.email}" is still signed in.`,
    hint: 'Logging out ends the session; a session taken over from another scenario stays until then.',
  }), 5000);
  return account;
});

/**
 * The page is the admin's login page: its form with the "Email" and
 * "Password" fields and the "Login" button.
 *
 * Example #1: Then I should be on the admin login page
 * Example #2: And I should be on the admin login page
 * Example #3: Then I should be on the admin login page
 * Example #4: And I should be on the admin login page
 * Example #5: Then I should be on the admin login page
 */
Then(/^I should be on the admin login page$/, async function () {
  await ready(this);
  await eventually(this, async () => ({
    route: adminRoute(this),
    form: await onLoginPage(this),
    button: await this.page.getByRole('button', { name: 'Login', exact: true }).count().catch(() => 0),
  }), (s) => s.form && s.button > 0, (s) => ({
    message: `This is not the admin login page: ${shortUrl(this.page.url())}${s.form ? ' has the fields but no "Login" button' : ' has no login form'}.`,
    hint: 'The admin sends a visitor to its login page (/admin/login); a signed-in account goes to the dashboard.',
  }));
});

/**
 * The first-user screen of the admin is gone: the app has its accounts, so
 * its address sends a visitor to the login page (and an account to the
 * dashboard), with no form for a first user.
 *
 * Example #1: Then the admin should not ask for its first user
 * Example #2: And the admin should not ask for its first user
 * Example #3: Then the admin should not ask for its first user
 * Example #4: And the admin should not ask for its first user
 * Example #5: Then the admin should not ask for its first user
 */
Then(/^the admin should not ask for its first user$/, async function () {
  await open(this, adminUrl(this, 'create-first-user'));
  const state = await eventually(this, async () => ({
    route: adminRoute(this),
    confirm: await this.page.locator('input[name="confirm-password"]').count().catch(() => 0),
  }), (s) => !/^\/create-first-user/.test(s.route) && !s.confirm, (s) => ({
    message: `The admin still asks for its first user (${shortUrl(this.page.url())}${s.confirm ? ': the form with "Confirm Password" is shown' : ''}).`,
    hint: 'The admin asks for its first user until the app has an account: build the site with its accounts (--install in the Webship Workspace, or the pack\'s build script).',
  }));
  return state;
});

/**
 * The account signed in may not use the admin: the admin shows its refusal
 * ("Unauthorized, this user does not have access to the admin panel.") at
 * /admin/unauthorized. An account without a role is refused so.
 *
 * Example #1: Then the admin should refuse this account
 * Example #2: And the admin should refuse this account
 * Example #3: Then the admin should refuse this account
 * Example #4: And the admin should refuse this account
 * Example #5: Then the admin should refuse this account
 */
Then(/^the admin should refuse this account$/, async function () {
  if (!/^\/unauthorized/.test(adminRoute(this))) await open(this, adminUrl(this));
  await eventually(this, async () => ({
    route: adminRoute(this),
    text: clean(await this.page.locator('.unauthorized').first().innerText({ timeout: 500 }).catch(() => '')),
  }), (s) => /^\/unauthorized/.test(s.route) && /does not have access to the admin/i.test(s.text), (s) => ({
    message: `The admin did not refuse the account: ${shortUrl(this.page.url())} ${s.text ? `says "${s.text}"` : 'shows no refusal'}.`,
    hint: 'The admin sends an account that may not use it to /admin/unauthorized ("this user does not have access to the admin panel").',
  }), budget(this));
});
