@must-fail
Feature: Assertions that must fail: the session, the access and the list
  Every scenario here asserts what the test site does not do. tests/check-must-fail.js runs them and
  checks that each fails at its last step with the message its description announces, and a hint.
  They only read: they leave the site as they found it.

  Scenario: Another account is signed in
    Fails with: "editor@example.com" is signed in, not "administrator"
    Given I am a logged in user with the "editor" user
    Then I should be logged in as "administrator"

  Scenario: A visitor is signed in
    Fails with: Nobody is signed in
    Given I am not logged in
    Then I should be logged in

  @js-off
  Scenario: A refused login said otherwise
    Fails with: The login was refused, but not with "Welcome back"
    Given I am not logged in
    When I log in with the email "nobody@example.com" and the password "Wrong-password-1"
    Then the login should be refused with "Welcome back"

  Scenario: An account with a role refused by the admin
    Fails with: The admin did not refuse the account
    Given I am a logged in user with the "editor" user
    Then the admin should refuse this account

  Scenario: The editor refused a list it may open
    Fails with: "/admin/collections/posts" opened for this account
    Given I am a logged in user with the "editor" user
    Then I should not be allowed to open "/admin/collections/posts"

  Scenario: The editor's navigation without the posts
    Fails with: The navigation lists "Posts"
    Given I am a logged in user with the "editor" user
    Then the navigation should not list "Posts"

  Scenario: The list counts another number
    Fails with: The list counts 17 documents, not 18.
    Given I am a logged in user with the "editor" user
    And I am on the "Posts" list
    Then the list should count 18 documents

  Scenario: The list shows a post it does not have
    Fails with: The list does not show "A post that does not exist"
    Given I am a logged in user with the "editor" user
    And I am on the "Posts" list
    Then the list should show "A post that does not exist"

  Scenario: The list has a column it does not have
    Fails with: The list has no column "Colour"
    Given I am a logged in user with the "editor" user
    And I am on the "Posts" list
    Then the list should have the column "Colour"

  Scenario: Another first row
    Fails with: The first row of the list is "A draft about the new library", not "The market on a rainy Saturday".
    Given I am a logged in user with the "editor" user
    And I am on the "Posts" list
    When I sort the list by "Title"
    Then the first row of the list should be "The market on a rainy Saturday"

  Scenario: Another number of pages
    Fails with: The list has 2 page(s), not 3
    Given I am a logged in user with the "editor" user
    And I am on the "Posts" list
    Then the list should have 3 pages
