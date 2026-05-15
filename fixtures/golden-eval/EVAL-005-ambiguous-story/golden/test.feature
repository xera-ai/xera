# This golden represents the IDEAL output for an ambiguous story:
# the gen prompt should refuse to invent scenarios and instead emit a
# single placeholder feature whose body asks the author to clarify.
#
# The eval judge's "Coverage" dimension should PASS when the actual
# matches this shape (or any similarly-refusing shape), and FAIL when
# the gen hallucinates concrete scenarios from vague verbs.

Feature: Improve the search

  # NOTE FROM TEST AUTHOR:
  # Story acceptance criteria are too vague to translate to executable
  # scenarios. The following clarifications are required before generating:
  #   - What inputs constitute "work well"?
  #   - What latency threshold defines "fast"?
  #   - What user-observable behavior corresponds to "users should like it"?
  #
  # Returning a single placeholder scenario instead of fabricating tests.

  Scenario: PLACEHOLDER — clarification required
    Given the story acceptance criteria are clarified
    When the criteria specify concrete inputs, expected outputs, and constraints
    Then this scenario will be replaced with executable steps
