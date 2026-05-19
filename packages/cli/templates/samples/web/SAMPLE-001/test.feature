Feature: SAMPLE-001 — Sign in flow

  Background:
    Given I am on the login page

  Scenario: Valid credentials redirect to dashboard
    When I enter a valid email and password
    And I click "Sign in"
    Then I am redirected to "/dashboard"
    And I see my display name in the header

  Scenario: Invalid password shows an inline error
    When I enter a valid email and an invalid password
    And I click "Sign in"
    Then I see the error "Invalid email or password"
    And I remain on the login page
