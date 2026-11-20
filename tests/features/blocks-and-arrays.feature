@blocks
Feature: Blocks, arrays and their rows
  As an editor of the site
  I want to build a page from blocks and lists of links
  So that each page has the layout it needs

  Scenario: Blocks added, moved, collapsed and removed
    Given there is a document "Blocks test page" in "Pages"
    And I am a logged in user with the "editor" user
    When I open the document "Blocks test page" in "Pages"
    And I open the "Content" tab
    Then "Layout" should have 1 row
    When I add the "Call to Action" block to "Layout"
    And I add the "Media Block" block to "Layout"
    Then the rows of "Layout" should be "Content", "Call to Action" and "Media Block"
    When I move row 3 of "Layout" up
    Then the rows of "Layout" should be "Content", "Media Block" and "Call to Action"
    When I expand row 1 of "Layout"
    Then row 1 of "Layout" should be expanded
    When I collapse all rows of "Layout"
    Then row 1 of "Layout" should be collapsed
    When I remove row 2 of "Layout"
    Then the rows of "Layout" should be "Content" and "Call to Action"
    And the document should be saved automatically

  Scenario: The rows of an array inside a block
    Given there is a document "Columns test page" in "Pages"
    And I am a logged in user with the "editor" user
    When I open the document "Columns test page" in "Pages"
    And I open the "Content" tab
    And I expand row 1 of "Layout"
    Then "Columns" should have 1 row
    When I add a row to "Columns"
    Then "Columns" should have 2 rows
    When I set "Size" to "Half" in row 2 of "Columns"
    Then "Size" should be set to "Half" in row 2 of "Columns"
    When I remove row 2 of "Columns"
    Then "Columns" should have 1 row

  Scenario: The links of the header, changed and left without saving
    Given I am a logged in user with the "editor" user
    When I open the "Header" global
    Then the rows of "Nav Items" should be "Nav item 1: Posts" and "Nav item 2: Contact"
    And "Label" should be set to "Posts" in row 1 of "Nav Items"
    When I add a row to "Nav Items"
    And I set "Type" to "Custom URL" in row 3 of "Nav Items"
    And I set "Label" to "Search" in row 3 of "Nav Items"
    And I set "Custom URL" to "/search" in row 3 of "Nav Items"
    And I move row 3 of "Nav Items" up
    Then "Nav Items" should have 3 rows
    And "Label" should be set to "Search" in row 2 of "Nav Items"
    When I collapse row 2 of "Nav Items"
    Then row 2 of "Nav Items" should be collapsed
    When I go to "Posts" in the navigation
    Then the admin should ask to leave without saving
    When I leave without saving
    And I open the "Header" global
    Then "Nav Items" should have 2 rows
