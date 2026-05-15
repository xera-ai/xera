# EVAL-003 — Multi-step onboarding wizard

## Story

As a new user, I want to complete onboarding via a 3-step wizard so that
my profile is configured before I land in the app.

## Acceptance Criteria

1. Step 1 collects "Display name" (required, min 2 chars).
2. Step 2 collects "Timezone" (required, dropdown).
3. Step 3 shows a review screen with the entered values and a "Finish" button.
4. The user can navigate back to a previous step using "Back" without
   losing data.
5. Clicking "Finish" on step 3 saves the profile and redirects to `/home`.
