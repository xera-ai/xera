# EVAL-002 — Sign-up form client-side validation

## Story

As a new user, I want the sign-up form to validate my inputs before
submitting so that I get immediate feedback on mistakes.

## Acceptance Criteria

1. The email field must show "Please enter a valid email address" when the
   user blurs the field with non-email text.
2. The password field must show "Password must be at least 8 characters"
   when the user blurs the field with a value shorter than 8 characters.
3. The "Create account" button must remain disabled until all fields are
   valid.
4. When all fields are valid and the user clicks "Create account", the
   form submits and the user is redirected to `/welcome`.
