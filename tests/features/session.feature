@session
Feature: The admin's session
  As an editor of the site
  I want to log in to the admin and out of it
  So that only the accounts of the site can change it

  @critical
  Scenario: A visitor is sent to the login page
    Given I am not logged in
    Then I should be on the admin login page
    And I should not be logged in

  Scenario: The first-user screen is gone once the app has its accounts
    Given I am not logged in
    Then the admin should not ask for its first user
    And I should be on the admin login page

  Scenario Outline: The <account> logs in through the form
    Given I am not logged in
    When I log in as "<account>" with the login form
    Then I should be logged in as "<account>"
    And the navigation should list "Posts"

    Examples:
      | account       |
      | administrator |
      | editor        |

  # The browser logs the refused login request (401): no error of the site.
  @js-off
  Scenario: A wrong password is refused
    Given I am not logged in
    When I log in with the email "nobody@example.com" and the password "Wrong-password-1"
    Then the login should be refused with "The email or password provided is incorrect."
    And I should not be logged in

  Scenario: A session is taken over from an earlier scenario
    Given I am a logged in user with the "editor" user
    Then I should be logged in as "editor"

  Scenario: Logging out ends the session
    Given I am a logged in user with the "editor" user
    When I log out
    Then I should be on the admin login page
    And I should not be logged in
    And I should see the notification "You have been logged out successfully."

  # The template's seed makes its posts' author with no role: the build's roles keep it out of the admin.
  Scenario: An account without a role is refused by the admin
    Given I am not logged in
    When I log in as "demo-author" with the login form
    Then the admin should refuse this account
    When I log out
    Then I should not be logged in
