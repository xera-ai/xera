Feature: Settings page edit & save

  Scenario: Initial state shows current values and hides Save/Discard
    Given the settings page is open for a user with display name "Alice"
    Then the display name field contains "Alice"
    And the "Save" button is hidden
    And the "Discard" button is hidden

  Scenario: Editing a field reveals Save and Discard buttons
    Given the settings page is open
    When the user changes display name to "Alicia"
    Then the "Save" button is enabled
    And the "Discard" button is visible

  Scenario: Saving persists changes and shows toast
    Given the user has changed display name to "Alicia"
    When the user clicks "Save"
    Then a toast "Settings saved" is displayed
    And the "Save" button is hidden
    And the "Discard" button is hidden

  Scenario: Reload preserves saved values
    Given the user has saved display name "Alicia"
    When the user reloads the page
    Then the display name field contains "Alicia"

  Scenario: Discard reverts unsaved edits
    Given the user has changed display name to "Alicia"
    When the user clicks "Discard"
    Then the display name field contains "Alice"
    And the "Save" button is hidden

  Scenario: Navigating away while dirty shows confirmation
    Given the user has changed display name to "Alicia"
    When the user attempts to navigate to "/home"
    Then a confirmation modal "You have unsaved changes. Discard?" is displayed
