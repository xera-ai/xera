# EVAL-001 — User can log in to dashboard

## Story

As a registered user, I want to log in with my email and password so that I
can access my dashboard.

## Acceptance Criteria

1. Given the login page is open, when the user submits valid credentials,
   then the user is redirected to the dashboard.
2. Given the login page is open, when the user submits an invalid password,
   then an error message "Invalid email or password" is displayed.
3. The login form fields (email, password) are accessible by label.
4. The dashboard greeting includes the user's name after a successful login.
