# SAMPLE-HTTP-001 — Create user via API

## Background

A first-touch sample ticket for HTTP API testing scaffolded by
`xera init --samples`. Use it to learn the API pipeline end-to-end without a
Jira ticket. If `http.spec` is configured, `/xera-script` will use the
OpenAPI schema to inform body shape + assertions.

## User story

As an API consumer with a bearer token
I want to POST /users with a JSON body
So that a new user is created with a stable id.

## Acceptance criteria

- Given I have a valid bearer token for the `user` role
- When I POST `/users` with `{ name: "Alice", email: "alice@example.com" }`
- Then the response status is `201`
- And the response body has a non-empty `id` string
- And the response body's `email` equals the email I sent

- Given I have a valid bearer token
- When I POST `/users` with `{ email: "missing-name@example.com" }` (no name)
- Then the response status is `422`
- And the response body has an `errors` array

- Given I have an expired or invalid token
- When I POST `/users` with any body
- Then the response status is `401`

## Notes

- `meta.json.source` is `"local"`, so `/xera-run SAMPLE-HTTP-001` will NOT post to Jira.
- Use `process.env.XERA_RUN_ID` in emails to keep test runs isolated, e.g.
  `email: \`alice-${process.env.XERA_RUN_ID}@example.com\``.
- Remove the sample later with `xera samples remove`.
