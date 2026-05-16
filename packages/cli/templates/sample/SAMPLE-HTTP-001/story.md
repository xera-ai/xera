# SAMPLE-HTTP-001 — POST /users validation

As a developer integrating the registration API,
I want POST /users to reject invalid emails with 422,
so that clients receive structured validation feedback.

## Acceptance Criteria

- POST /users with empty email returns 422 with `errors` containing "email is required" or similar.
- POST /users with malformed email (no @) returns 422 with a message containing "email must be valid".
- POST /users with a valid email returns 201 with `{ id, email }`.
