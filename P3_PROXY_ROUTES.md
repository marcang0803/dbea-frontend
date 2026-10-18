# P3 routes for P2's Next.js proxy (allow-list)

The P3 pages call only these paths. P2's `/api/[...path]` proxy must forward them to
OutSystems with `Authorization: Bearer <token from the httpOnly cookie>`.

| Browser → Next.js | Next.js → OutSystems (`https://smuedu-dev.outsystemsenterprise.com`) |
|---|---|
| `GET /api/account/summary` | `GET /T3RE_Notify_CS/rest/Account/summary` |
| `GET /api/notifications?page=&pageSize=` | `GET /T3RE_Notify_AS/rest/Notification/notifications?page=&pageSize=` |
| `PUT /api/notifications/{id}/read` | `PUT /T3RE_Notify_AS/rest/Notification/notifications/{id}/read` |
| `GET /api/notifications/unread-count` | `GET /T3RE_Notify_AS/rest/Notification/notifications/unread-count` |
| `POST /api/otp/challenges` | `POST /T3RE_Notify_CS/rest/Otp/challenges` |

**Never add these to the allow-list** (service-key only, called server-to-server by composites):
`/Otp/challenges/signup` · `/Otp/challenges/{id}/verify` · `/deliveries/*` · `/otp-challenges/*` ·
`/NotifyDispatch/*` · `POST /notifications`.

## Files
| Path in `remitease-web` | Purpose |
|---|---|
| `lib/p3Api.js` | API calls + envelope handling (`ApiError`) |
| `lib/format.js` | Money/date formatting, safe-link check |
| `components/OtpDialog.jsx` | Shared OTP dialog for P2, P4, P6 confirm screens |
| `components/UnreadBadge.jsx` | Bell + unread count |
| `app/(app)/home/page.jsx` | Home |
| `app/(app)/notifications/page.jsx` | Inbox |

Imports use the `@/` alias (create-next-app default: `"@/*": ["./*"]` in `jsconfig.json`).
Styling: Tailwind CSS (no other libraries).
