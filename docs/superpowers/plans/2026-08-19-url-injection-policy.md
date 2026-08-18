# URL Injection Policy Implementation Plan

1. Add shared injection-policy types and pure hostname rule resolution with
   focused shared tests.
2. Replace widget allowlist/blocklist defaults with default injection,
   assistant, and ordered site-rule settings.
3. Split the isolated content runtime into an inert bootstrap plus idempotent
   runner, widget, pairing, and breathing-border activation hooks.
4. Remove unconditional MAIN-world recorder manifest injection and add
   background install/uninstall helpers driven by resolved policy.
5. Add background policy enforcement before tool dispatch, classifying DOM
   tools as read or operate while preserving background-only metadata tools.
6. Replace the mounting settings UI with defaults, ordered site rules,
   validation, and current-tab policy preview.
7. Distinguish pairing transport failures from explicit denial.
8. Add and update unit/integration tests, then run typecheck, the full test
   suite, and production build.
