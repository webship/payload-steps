@list
Feature: A collection's list
  As an editor of the site
  I want to find documents in a list
  So that I can open the one I need

  Background:
    Given I am a logged in user with the "editor" user
    And I am on the "Posts" list

  @critical
  Scenario: The list counts the posts and pages them
    Then the list should count 17 documents
    And the list should have 10 rows
    And the list should have 2 pages
    And the list should be on page 1
    When I go to page 2 of the list
    Then the list should be on page 2
    And the list should have 7 rows

  Scenario: A search narrows the list
    When I search the list for "harbour"
    Then the list should count 2 documents
    And the list should show "Morning light over the harbour"
    And the list should not show "A field guide to city gardens"
    When I clear the search of the list
    Then the list should count 17 documents

  Scenario: A search that finds nothing
    When I search the list for "no such document anywhere"
    Then the list should be empty

  Scenario: Sorting by a column, both ways
    When I sort the list by "Title"
    Then the first row of the list should be "A draft about the new library"
    When I sort the list by "Title" in descending order
    Then the first row of the list should be "The market on a rainy Saturday"
    And the "The market on a rainy Saturday" row should show "the-market-on-a-rainy-saturday" in the "Slug" column

  Scenario: Filtering by the status
    When I filter the list where "Status" "equals" "Draft"
    Then the list should be filtered where "Status" "equals" "Draft"
    And the list should count 2 documents
    And the list should show the documents:
      | A draft about the new library |
      | A draft about the winter fair |
    When I remove the filters of the list
    Then the list should count 17 documents

  Scenario: Filtering by a relationship and by a text
    When I filter the list where "Categories" "is in" "News"
    Then the list should count 4 documents
    When I filter the list where "Title" "contains" "river"
    Then the list should count 1 document
    And the list should show "Notes from a quiet river"

  Scenario: Columns shown and hidden
    When I show the "Status" column
    Then the list should have the column "Status"
    And the "A draft about the winter fair" row should show "Draft" in the "Status" column
    And the "Counting birds on the marsh" row should show "Published" in the "Status" column
    When I hide the "Slug" column
    Then the list should not have the column "Slug"

  Scenario: The page size
    When I show 25 documents per page
    Then the list should have 17 rows
    And the list should have 1 page
