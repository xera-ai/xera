Feature: Sign-up form client-side validation

  Scenario: Invalid email shows inline error
    Given the sign-up page is open
    When the user enters "not-an-email" into the email field and blurs it
    Then the inline error "Please enter a valid email address" is displayed

  Scenario: Short password shows inline error
    Given the sign-up page is open
    When the user enters "short" into the password field and blurs it
    Then the inline error "Password must be at least 8 characters" is displayed

  Scenario: Submit button stays disabled until form is valid
    Given the sign-up page is open
    When all required fields are empty
    Then the "Create account" button is disabled

  Scenario: Valid form submits and redirects to welcome
    Given the sign-up page is open
    When the user fills email "alice@example.com" and password "long-enough-password"
    And the user clicks "Create account"
    Then the user is redirected to a URL containing "/welcome"
