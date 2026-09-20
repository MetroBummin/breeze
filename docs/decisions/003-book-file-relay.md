# 003 — Opt-in temporary encrypted book relay (development, not enabled)

Supabase remains the small-state/login/vocabulary/progress service. Client-encrypted,
per-book files travel device ↔ private R2 directly. A separate Worker provides
verified-account + permanent-device-proof authorization and short scoped grants.
The existing ephemeral ECDH pairing can deliver the vault master, but is NOT a
permanent device authorization registry. Add P-256 signing-key approval separately.

Use per-account transactional CAS and per-file small records in Supabase; no D1,
Durable Objects, new vault polling, or client-sync changes. A server-side conditional
copy moves unique upload staging objects to unexposed ready keys. All designated
receivers must ACK durable verified local storage, or be explicitly waived, before
normal early deletion. Receipt is not equivalent to HTTP download success.

24h is a configurable access deadline, not an exact deletion SLA. No automatic
expiry renewal, no permanent backup, cross-user sharing or email-only key recovery.
This does not change the currently shipped privacy statement; a consented client
release must adopt `../relay-privacy-proposal.md` before enabling this feature.

Initial development enrollment is operator-approved. Production bootstrap/recovery
UX, Cloudflare account verification/deployment, SQL execution and device integration
remain approval/implementation gates documented in `../relay-handoff.md`.
