# Webpack next/font needs a real font face in the offline fixture

Date: 2026-11-28
Source: agent

## Need
Launch browser QA with Webpack and no font downloads.
## Tried
The comment-only CSS in `tests/fixtures/google-fonts.cjs` works with Turbopack but fails Webpack's `next/font` loader.
## Decision
Return a real `@font-face` with `local("Arial")` from `scripts/local-stack/fonts.cjs`.
## Revisit when
The launcher stops using Webpack or its `next/font` loader accepts comment-only CSS.
