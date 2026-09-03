# Changelog

## Unreleased

### Added

- Added public, HTTPS-only participant enrollment that verifies the authoritative study disclosure before handing a one-time invitation to the Chronicle Android app.
- Added an unlisted Google Play reviewer enrollment page that exchanges a reusable reviewer secret for a fresh one-time synthetic-study invitation without placing credentials in URLs or browser storage.
- Added complete participant-policy and exact Health Connect record-type controls to study setup.
- Added researcher downloads for every Android collection data type supported by the server.
- Preserved Android and iOS sensor downloads for studies created before the unified collection-module model.

### Changed

- Clarified the publisher privacy notice: each Android installation supports one active study at a time, while independent Chronicle servers can host many studies.
- Replaced the legacy Pa11y/Puppeteer accessibility dependency chain with Axe on the existing Playwright test stack.

### Security

- Participant QR codes and links now use the configured public HTTPS origin and keep one-time credentials exclusively in the URL fragment.
- Enrollment and reviewer responses are validated against the requested study, participant, server origin, disclosure version, expiry, and manifest digest before Android handoff.
- Enrollment-link generation rejects private, reserved, documentation, benchmark, multicast, and other non-public IP literals.
