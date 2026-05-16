Feature: POST /users validation

  Scenario: Reject malformed email
    When the user POSTs /users with body { "email": "not-an-email" }
    Then the response status is 422
    And the response body contains an "errors" array

  Scenario: Accept valid email
    When the user POSTs /users with body { "email": "alice@example.com" }
    Then the response status is 201
    And the response body has fields "id" and "email"
