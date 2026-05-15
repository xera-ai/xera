Feature: Multi-step onboarding wizard

  Scenario: User completes all three steps and lands on home
    Given the onboarding wizard is open on step 1
    When the user enters display name "Alice" and clicks "Next"
    Then the wizard advances to step 2
    When the user selects timezone "Europe/London" and clicks "Next"
    Then the wizard advances to step 3
    And the review screen shows display name "Alice"
    And the review screen shows timezone "Europe/London"
    When the user clicks "Finish"
    Then the user is redirected to a URL containing "/home"

  Scenario: Back button preserves data
    Given the user has filled step 1 with display name "Bob"
    And advanced to step 2
    When the user clicks "Back"
    Then the wizard returns to step 1
    And the display name field still contains "Bob"

  Scenario: Step 1 rejects short display name
    Given the onboarding wizard is open on step 1
    When the user enters display name "A" and clicks "Next"
    Then an inline error "Display name must be at least 2 characters" is displayed
    And the wizard remains on step 1
