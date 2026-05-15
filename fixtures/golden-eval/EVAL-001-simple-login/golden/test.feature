Feature: User can log in to dashboard

  Scenario: Valid credentials redirect to dashboard
    Given the login page is open
    When the user submits email "alice@example.com" and password "correct-horse"
    Then the user is redirected to a URL containing "/dashboard"
    And the dashboard greeting contains "Alice"

  Scenario: Invalid password shows error
    Given the login page is open
    When the user submits email "alice@example.com" and password "wrong-password"
    Then an error message "Invalid email or password" is displayed
    And the user remains on the login page
