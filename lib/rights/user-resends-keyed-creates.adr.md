# Only the user may resend an uncertain create

Date: 2026-11-28
Source: user

A pending proposal cannot be checked through public reads. Keep an idempotency key with the unchanged draft so an explicit resend can recover its receipt. Editing the draft or successfully creating a row starts a new submission. Never resend automatically; reconcile other uncertain mutations through public reads.

For all four keyed creates, retain the original receipt independently of the created row. Resending the same caller, action, key, and content returns that receipt even after moderation deletes the row. The receipt confirms that the original create committed; it does not imply that the row still exists. This preserves the existing client success handling. Reusing the key with different content still conflicts.
