@front-end
Feature: The website
  As a visitor of the site
  I want to read its pages and posts, search it and write to it
  So that I find what it offers

  Scenario: The home page and the site's navigation
    Given I am on the homepage
    Then the site navigation should list "Posts", "Contact" and "Search"

  # The template renders the list of posts ahead and renews it at most every ten minutes: the total
  # may still count a test post of an earlier scenario, so it is not read here.
  Scenario: The list of posts and its pages
    Given I am on "/posts"
    Then the page should show posts 1 to 12
    And the page should list the post "Counting birds on the marsh"
    And the page should not list the post "A draft about the new library"
    When I go to the next page of posts
    Then the page should list the post "Digital Horizons: A Glimpse into Tomorrow"
    When I go to the previous page of posts
    Then the page should show posts 1 to 12

  Scenario: A post
    Given I am on "/posts/digital-horizons"
    Then the title of the post should be "Digital Horizons: A Glimpse into Tomorrow"
    And the author of the post should be "Demo Author"

  Scenario: The site search
    Given I am on "/search"
    When I search the site for "harbour"
    Then the search should find "Morning light over the harbour"
    And the search should find "Recipes from the harbour kitchen"
    When I search the site for "no such post anywhere"
    Then the search should find nothing

  Scenario: A published post shows at once, and in the search
    Given there is a published document "Front end test post" in "Posts"
    When I am on "/posts/front-end-test-post"
    Then the title of the post should be "Front end test post"
    When I am on "/search"
    And I search the site for "Front end test"
    Then the search should find "Front end test post"

  Scenario: The contact form refuses a form without its required fields
    Given I am on "/contact"
    When I send the form
    Then the "Full Name" field of the form should show "This field is required"
    And the "Email" field of the form should show "This field is required"

  Scenario: The contact form is sent
    Given I am on "/contact"
    When I fill in the form with:
      | field     | value                          |
      | Full Name | Test Visitor                   |
      | Email     | visitor@example.com            |
      | Message   | A message from the test suite. |
    And I send the form
    Then the form should confirm "The contact form has been submitted successfully."

  # The browser logs the missing page (404): no error of the site.
  @js-off
  Scenario: An address the site does not have
    Given I am on "/no-such-page-here"
    Then I should see the page for an address the site does not have
