@edit-view
Feature: The edit view of a document
  As an editor of the site
  I want to write a post with every kind of field
  So that the site shows it as I meant it

  Scenario: A new post with a title, a rich text, an upload and a relationship
    Given there is no document "Editor test post" in "Posts"
    And I am a logged in user with the "editor" user
    When I create a new document in "Posts"
    And I set "Title" to "Editor test post"
    And I write "A paragraph typed in the editor." in the rich text editor
    And I set "Hero Image" to "image-post2.webp"
    And I open the "Meta" tab
    And I set "Categories" to "Design"
    Then the document should be saved automatically
    And the status of the document should be "Draft"
    And the "Categories" field should hold "Design"
    And "Slug" should be set to "editor-test-post"
    When I open the "Content" tab
    Then the rich text editor should contain "A paragraph typed in the editor."
    And "Hero Image" should be set to "image-post2.webp"
    When I publish the document
    Then I should see the notification "Updated successfully."
    And the status of the document should be "Published"
    And there should be a document "Editor test post" in "Posts"

  Scenario: A relationship value and a file taken out
    Given there is a document "Field test post" in "Posts" with:
      | field      | value            |
      | categories | News, Design     |
      | heroImage  | image-post1.webp |
    And I am a logged in user with the "editor" user
    When I open the document "Field test post" in "Posts"
    And I remove "image-post1.webp" from the "Hero Image" field
    And I open the "Meta" tab
    And I remove "News" from the "Categories" field
    Then the "Categories" field should not hold "News"
    And the "Categories" field should hold "Design"
    And the document should be saved automatically

  Scenario: The slug unlocked and set by hand
    Given there is a document "Slug test post" in "Posts"
    And I am a logged in user with the "editor" user
    When I open the document "Slug test post" in "Posts"
    Then the "Slug" field should be read only
    When I unlock the slug
    And I set "Slug" to "a-slug-set-by-hand"
    Then "Slug" should be set to "a-slug-set-by-hand"
    And the document should be saved automatically

  # The site refuses the publication (400), which the browser logs: no error of the site.
  @js-off
  Scenario: A publication refused without a title
    Given I am a logged in user with the "editor" user
    When I create a new document in "Posts"
    And I write "A body without a title." in the rich text editor
    And I publish the document
    Then I should see the notification "The following fields are invalid (2): Title Slug"
    And the status of the document should be "Draft"

  Scenario: A post deleted from its form
    Given there is a document "Delete test post" in "Posts"
    And I am a logged in user with the "editor" user
    When I open the document "Delete test post" in "Posts"
    And I delete the document
    Then I should see the notification "successfully deleted"
    And there should be no document "Delete test post" in "Posts"

  Scenario: A post duplicated from its form
    Given there is a document "Duplicate test post" in "Posts"
    And I am a logged in user with the "editor" user
    When I open the document "Duplicate test post" in "Posts"
    And I duplicate the document
    Then "Title" should be set to "Duplicate test post"
    And the status of the document should be "Draft"
