# Only the user may resend an uncertain create

Date: 2026-11-28
Source: user

A pending proposal cannot be checked through public reads. Keep an idempotency key with the unchanged draft so an explicit resend can recover its receipt. Editing the draft or successfully creating a row starts a new submission. Never resend automatically; reconcile other uncertain mutations through public reads.
