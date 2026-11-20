@media
Feature: Uploads
  As an editor of the site
  I want to upload images with their alternative text
  So that the pages and posts can show them

  Scenario: An image uploaded with its alternative text, then deleted
    Given there is no document "test-lighthouse.png" in "Media"
    And I am a logged in user with the "editor" user
    When I create a new document in "Media"
    And I choose the file "test-lighthouse.png" to upload
    And I set "Alt" to "A white lighthouse at sea"
    And I save the document
    Then I should see the notification "Media successfully created."
    And the file details should show "320x200"
    And the file details should show "image/png"
    And there should be a document "test-lighthouse.png" in "Media"
    When I delete the document
    Then there should be no document "test-lighthouse.png" in "Media"

  Scenario: The media list
    Given I am a logged in user with the "editor" user
    And I am on the "Media" list
    Then the list should count 4 documents
    And the list should show "image-hero1.webp"
    When I search the list for "post2"
    Then the list should count 1 document
