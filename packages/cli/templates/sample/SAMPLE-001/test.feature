Feature: Playwright docs site smoke test

  Scenario: Home page loads with expected title
    Given I open the Playwright docs site
    Then the page title contains "Playwright"
    And I see the main heading
