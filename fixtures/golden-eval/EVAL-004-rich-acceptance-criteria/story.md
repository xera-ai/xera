# EVAL-004 — Settings page edit & save

## Story

As a logged-in user, I want to edit my profile settings and persist them so
that my preferences are remembered across sessions.

## Acceptance Criteria

1. The settings page shows current values for: display name, email,
   notification frequency (daily / weekly / never), and dark-mode toggle.
2. The user can edit each field. Edits are tracked in a "dirty" state.
3. While the form is dirty, a "Save" button is enabled and a "Discard"
   button is shown.
4. While the form is clean, both buttons are hidden.
5. Clicking "Save" persists changes and shows a toast "Settings saved".
6. Clicking "Discard" reverts unsaved edits and hides both buttons.
7. Reloading the page after "Save" preserves the saved values.
8. Attempting to navigate away while dirty shows a confirmation modal
   "You have unsaved changes. Discard?".
