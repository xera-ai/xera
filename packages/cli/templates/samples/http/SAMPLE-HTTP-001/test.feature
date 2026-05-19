Feature: SAMPLE-HTTP-001 — Create user via API

  Background:
    Given I am authenticated as the "user" role

  Scenario: Valid payload creates a user
    When I POST "/users" with a name and email
    Then the response status is 201
    And the response body has a non-empty "id"
    And the response body "email" equals the sent email

  Scenario: Missing name returns 422 with errors
    When I POST "/users" with only an email
    Then the response status is 422
    And the response body has an "errors" array

  Scenario: Expired token returns 401
    Given my token is expired
    When I POST "/users" with a name and email
    Then the response status is 401
