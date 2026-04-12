# TODO

## P0) Must-Have Before Paid Launch

- [ ] Wire web api to macOS app.

### Product Direction & Scope

- [ ] Confirm primary launch market: Japanese university students.
- [ ] Define target user in one sentence (primary ICP).
- [ ] Define product promise in one sentence (what duee does better than alternatives).
- [ ] Freeze MVP scope so we ship fast without quality loss.

### Landing Page + Early Demand Validation

- [ ] Ship simple landing page with:
  - [ ] Japanese copy as default (with optional English version later)
  - [ ] value proposition
  - [ ] screenshots / short demo
  - [ ] waitlist form
  - [ ] pricing intent question in JPY ("Would you pay ¥X/month or ¥Y/year?")
- [ ] Track conversion funnel:
  - [ ] landing visit -> waitlist signup
  - [ ] waitlist signup -> first active use
- [ ] Run user interviews with Japanese university students (at least 15).
- [ ] Collect top 5 reasons users would pay (and why they would not).

### Legal & Policy

- [ ] Publish Privacy Policy.
- [ ] Publish Terms of Service.
- [ ] Publish Refund/Cancellation Policy.
- [ ] Publish Acceptable Use Policy (short version is fine).
- [ ] Provide Japanese versions of all policy pages.
- [ ] Add contact email for legal/privacy/support requests.
- [ ] Add policy links in app settings and landing page footer.
- [ ] Add "Last updated" date and versioning for all policy pages.

### User Data Rights & Account Lifecycle

- [ ] Implement Delete Account flow (self-serve, in-app).
- [ ] On delete account:
  - [ ] delete user profile
  - [ ] delete tasks
  - [ ] delete sessions
  - [ ] delete any related records
- [ ] Implement Export Account Data (JSON).
- [ ] Add endpoint/UI to download export package.
- [ ] Add data retention rules and document them in Privacy Policy.
- [ ] Add "Delete my data" and "Export my data" entries in settings.

### Auth, Security, and Abuse Protection

- [ ] Email verification flow.
- [ ] Password reset flow.
- [ ] Add rate limiting for auth + task mutation endpoints.
- [ ] Add brute-force protection for login/register.
- [ ] Add secure headers (`helmet` or equivalent).
- [ ] Confirm cookie settings for production HTTPS (`Secure`, `HttpOnly`, `SameSite`).
- [ ] Add CSRF mitigation strategy for cookie-based auth.
- [ ] Add server-side input validation hardening across all endpoints.
- [ ] Add audit log entries for sensitive account actions (delete/export/password reset).

### Billing & Subscription Product

- [ ] Choose billing provider (likely Stripe).
- [ ] Set default product currency to JPY.
- [ ] Decide initial pricing model:
  - [ ] monthly
  - [ ] annual
- [ ] Define concrete JPY price points for each plan.
- [ ] Display prices consistently in JPY (`¥`) across landing page, app, checkout, and invoices.
- [ ] Validate tax display requirements for Japan-facing pricing.
- [ ] Implement subscription lifecycle:
  - [ ] trial
  - [ ] active
  - [ ] canceled
  - [ ] grace period / payment failure handling
- [ ] Add subscription management page (plan, renewal date, cancel).
- [ ] Add invoice/email receipt support.
- [ ] Ensure ToS/Refund Policy align with billing behavior.

### Engineering Quality & Shipping Reliability

- [ ] Add automated test suite for web API auth/task flows.
- [ ] Add frontend smoke/e2e tests for critical user path.
- [ ] Add CI pipeline (test + lint + build).
- [ ] Add structured error logging and alerting.
- [ ] Add uptime health monitoring (`/api/health`).
- [ ] Add DB backup + restore drill documentation.
- [ ] Add schema migration strategy (versioned migrations).
- [ ] Add staging environment before production deploys.

### Distribution & Launch Execution

- [ ] Document unsigned macOS install instructions clearly.
- [ ] Add safety guidance for first-run Gatekeeper warnings.
- [ ] Add update strategy for macOS binary distribution.
- [ ] Host downloadable macOS build on trusted domain.
- [ ] Provide checksum/signature info for release artifacts.
- [ ] Private beta with classmates/friends.
- [ ] Weekly bug triage + rapid patch cadence.
- [ ] Collect testimonials and permission to quote.
- [ ] Prepare launch checklist (legal, billing, support, reliability all green).
- [ ] Public launch.

## P1) High-Value After Launch

- [ ] Improve onboarding for first-time users.
- [ ] Add clear empty states and first-task guidance.
- [ ] Add in-app feedback/report issue flow.
- [ ] Add reminder settings + notifications roadmap.
- [ ] Define retention metrics:
  - [ ] activation
  - [ ] D1/D7 retention
  - [ ] paid conversion
- [ ] Build analytics dashboard for these metrics.
- [ ] Re-evaluate Apple Developer Program once revenue justifies cost.
- [ ] Consider optional multi-year plans (2 years, 4 years) after retention data stabilizes.

## Existing Feature Roadmap

- [ ] Daily due-today morning announcement
  - [ ] Add a configurable morning reminder time.
  - [ ] At that time each day, announce the tasks due today.
  - [ ] Include task count and task titles in the announcement.
  - [ ] Add settings to enable/disable this reminder.
  - [ ] Respect user timezone and avoid duplicate announcements on the same day.
