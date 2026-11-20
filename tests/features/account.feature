@account
Feature: The account page
  As an editor of the site
  I want to keep my own account up to date
  So that my name is right and my roles stay as the administrator set them

  Scenario: The editor's roles are read only on its account page
    Given I am a logged in user with the "editor" user
    When I go to my account
    Then "Email" should be set to "editor@example.com"
    And "Name" should be set to "Editor Webship"
    And the "Roles" field should be read only

  Scenario: The editor changes its name
    Given I am a logged in user with the "editor" user
    When I go to my account
    And I set "Name" to "Editor Webship Two"
    And I save the document
    Then I should see the notification "Updated successfully."
    And "Name" should be set to "Editor Webship Two"

  Scenario: Passwords that do not match are refused, and the change is left without saving
    Given I am a logged in user with the "editor" user
    When I go to my account
    And I press "Change Password"
    And I set "New Password" to "Another-password-1"
    And I set "Confirm Password" to "Different-password-2"
    And I save the document
    Then the "Confirm Password" field should show the error "Passwords do not match."
    And I should see the notification "Please correct invalid fields."
    When I go to "Posts" in the navigation
    Then the admin should ask to leave without saving
    When I leave without saving
    Then the list should count 17 documents
