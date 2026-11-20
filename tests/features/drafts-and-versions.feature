@drafts
Feature: Drafts, publishing and versions
  As an editor of the site
  I want my changes kept as drafts until I publish them, and every version kept
  So that I can change a published post without the visitors seeing it half done, and go back

  Scenario: A published post changed, compared with its published version and restored
    Given there is a published document "Version test post" in "Posts"
    And I am a logged in user with the "editor" user
    When I open the document "Version test post" in "Posts"
    And I set "Title" to "Version test post, changed"
    Then the document should be saved automatically
    And the status of the document should be "Changed"
    When I open the versions of the document
    Then a version should be marked "Currently Published"
    And a version should be marked "Current Draft"
    When I open the version marked "Current Draft"
    Then the version should change "Title" from "Version test post" to "Version test post, changed"
    When I open the versions of the document
    And I open the version marked "Currently Published"
    And I restore this version
    Then "Title" should be set to "Version test post"
    And the status of the document should be "Published"

  Scenario: A change reverted to the published version
    Given there is a published document "Revert test post" in "Posts"
    And I am a logged in user with the "editor" user
    When I open the document "Revert test post" in "Posts"
    And I set "Title" to "Revert test post, changed"
    Then the status of the document should be "Changed"
    When I revert the document to its published version
    Then "Title" should be set to "Revert test post"
    And the status of the document should be "Published"

  Scenario: A published post unpublished, and published again
    Given there is a published document "Unpublish test post" in "Posts"
    And I am a logged in user with the "editor" user
    When I open the document "Unpublish test post" in "Posts"
    Then the status of the document should be "Published"
    And I should not be able to publish the document
    When I unpublish the document
    Then I should see the notification "Unpublished successfully."
    And the status of the document should be "Draft"
    When I set "Title" to "Unpublish test post, again"
    And I publish the document
    Then the status of the document should be "Published"

  Scenario: Posts edited, published, unpublished and deleted together from the list
    Given there is a document "Bulk test post one" in "Posts"
    And there is a document "Bulk test post two" in "Posts"
    And I am a logged in user with the "editor" user
    And I am on the "Posts" list
    When I search the list for "Bulk test post"
    And I select all documents on the page
    Then the selection should read "2 selected"
    When I edit the selected documents, setting "Categories" to "News"
    And I save the edit of the selected documents as drafts
    Then I should see the notification "Updated 2 Posts successfully."
    When I select all documents on the page
    And I publish the selected documents
    And I show the "Status" column
    Then the "Bulk test post one" row should show "Published" in the "Status" column
    When I select "Bulk test post one" in the list
    Then the selection should read "1 selected"
    When I unpublish the selected documents
    Then the "Bulk test post one" row should show "Draft" in the "Status" column
    When I select all documents on the page
    And I delete the selected documents
    Then the list should be empty
    And there should be no document "Bulk test post one" in "Posts"
