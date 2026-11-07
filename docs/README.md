# Documentation

RemitEase frontend for IS444 Team 3. Start with [Development](DEVELOPMENT.md)
to run the app and [Architecture](ARCHITECTURE.md) to understand its boundaries.

| Document | Purpose |
| --- | --- |
| [Architecture](ARCHITECTURE.md) | Application structure, service integration, identity and request recovery |
| [Development](DEVELOPMENT.md) | Local configuration, commands, browser tests and troubleshooting |
| [Contributing](CONTRIBUTING.md) | Change workflow, review expectations and validation |
| [Design](DESIGN.md) | Responsive layout, visual language, accessibility and financial states |
| [Changelog](CHANGELOG.md) | Unreleased changes and dated verification notes |
| [Pull request template](pull_request_template.md) | Description and review checklist for a PR |
| [P1 proxy routes](p1-proxy-routes.md) | Sender onboarding and family API contracts |
| [P3 proxy routes](p3-proxy-routes.md) | Account, notification and OTP API contracts |
| [RabbitMQ setup](../infra/rabbitmq/README.md) | Optional notification infrastructure |

Status as of **7 November 2026**: the P6 browser checks and live blocked-response
recovery test pass. Successful loan funding and normal monthly repayments with
interest remain unverified. Read the changelog before treating a test result as
evidence of an enabled banking feature.
