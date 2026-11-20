@must-fail
Feature: Assertions that must fail: the forms, the rows and the website
  Every scenario here asserts what the test site does not do. tests/check-must-fail.js runs them and
  checks that each fails at its last step with the message its description announces, and a hint.
  They make only test documents, which the steps delete after them.

  Scenario: A field set to another value
    Fails with: "Name" is set to "Editor Webship", not "Someone Else".
    Given I am a logged in user with the "editor" user
    When I go to my account
    Then "Name" should be set to "Someone Else"

  Scenario: A field the form does not have
    Fails with: There is no field "Colour"
    Given I am a logged in user with the "editor" user
    When I go to my account
    Then "Colour" should be set to "Blue"

  Scenario: Another status
    Fails with: The status of the document is "Draft", not "Published".
    Given there is a document "Must fail draft post" in "Posts"
    And I am a logged in user with the "editor" user
    When I open the document "Must fail draft post" in "Posts"
    Then the status of the document should be "Published"

  Scenario: A notification never shown
    Fails with: The admin showed no notification "Saved for ever."
    Given I am a logged in user with the "editor" user
    And I am on the "Posts" list
    Then I should see the notification "Saved for ever."

  Scenario: The rows of a field in another order
    Fails with: The rows of "Nav Items" are "Nav item 1: Posts", "Nav item 2: Contact", not "Nav item 1: Contact" and "Nav item 2: Posts".
    Given I am a logged in user with the "editor" user
    When I open the "Header" global
    Then the rows of "Nav Items" should be "Nav item 1: Contact" and "Nav item 2: Posts"

  Scenario: The site's navigation with another link
    Fails with: The site navigation lists "Posts", "Contact", "Search", not "Posts" and "Blog".
    Given I am on the homepage
    Then the site navigation should list "Posts" and "Blog"

  Scenario: The site search finds a post it does not have
    Fails with: The search did not find "A post that does not exist"
    Given I am on "/search"
    When I search the site for "harbour"
    Then the search should find "A post that does not exist"

  Scenario: Another range of posts
    Fails with: not 1 to 10.
    Given I am on "/posts"
    Then the page should show posts 1 to 10

  Scenario: A page the site has is no missing page
    Fails with: The page answered 200, not 404
    Given I am on "/posts"
    Then I should see the page for an address the site does not have
