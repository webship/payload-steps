@live-preview
Feature: Previewing a document
  As an editor of the site
  I want to see the page of a post while I write it
  So that I publish what I meant

  Scenario: The live preview follows the form
    Given there is a published document "Preview test post" in "Posts"
    And I am a logged in user with the "editor" user
    When I open the document "Preview test post" in "Posts"
    Then the preview link should open "/posts/preview-test-post"
    When I open the live preview
    Then the live preview should show "Preview test post"
    And the live preview should show "Exit preview mode"
    When I set "Title" to "Preview test post, changed"
    Then the live preview should show "Preview test post, changed"
    When I close the live preview
    Then the status of the document should be "Changed"
