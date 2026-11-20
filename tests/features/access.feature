@access
Feature: What each account may do
  As the owner of the site
  I want the editor to manage the content and the administrator the accounts and the redirects
  So that an editor cannot change who may log in or where the site sends its visitors

  Scenario: The editor manages the content, not the accounts or the redirects
    Given I am a logged in user with the "editor" user
    Then the navigation should list "Posts"
    And the navigation should list "Users"
    And the navigation should not list "Redirects"
    And the dashboard should list "Posts"
    And the dashboard should not list "Redirects"
    And I should not be able to create a document in "Users"

  # The browser logs the refused pages (404): no error of the site.
  @js-off
  Scenario: The editor may not open the redirects or another account
    Given I am a logged in user with the "editor" user
    Then I should not be allowed to open "/admin/collections/redirects"
    And I should not be allowed to open "/admin/collections/users/create"
    And I should not be allowed to open "/admin/collections/users/1"

  Scenario: The editor sees its own account only
    Given I am a logged in user with the "editor" user
    And I am on the "Users" list
    Then the list should count 1 document
    And the list should show "Editor Webship"
    And the "Editor Webship" row should show "Editor" in the "Roles" column

  Scenario: The administrator manages the accounts and the redirects
    Given I am a logged in user with the "administrator" user
    Then the navigation should list "Redirects"
    And the dashboard should list "Redirects"
    When I am on the "Users" list
    Then the "Editor Webship" row should show "Editor" in the "Roles" column
    And the "Administrator Webship" row should show "Administrator" in the "Roles" column
