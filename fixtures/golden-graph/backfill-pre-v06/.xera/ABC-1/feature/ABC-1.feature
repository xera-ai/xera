@p0
Feature: Login page loads correctly

  Scenario: User logs in with valid credentials
    Given the user is on the login page
    When the user enters valid email and password
    Then the user is redirected to the dashboard
