# SAMPLE-001 — User signs in to the dashboard

## Background

A first-touch sample ticket scaffolded by `xera init --samples`. Use it to learn
the pipeline end-to-end without needing a Jira ticket.

## User story

As a registered user
I want to sign in with my email and password
So that I can access my dashboard.

## Acceptance criteria

- Given I am on the login page
- When I enter a valid email and password and click "Sign in"
- Then I am redirected to `/dashboard`
- And I see my name in the top-right header

- Given I am on the login page
- When I enter an incorrect password
- Then I see the error "Invalid email or password"
- And I remain on the login page

## Notes

- `meta.json.source` is `"local"`, so `/xera-run SAMPLE-001` will NOT post to Jira.
- Remove the sample later with `xera samples remove`.
