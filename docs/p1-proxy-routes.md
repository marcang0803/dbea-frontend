# P1 routes for P2's Next.js proxy (allow-list)

The P1 pages call only these paths. P2's `/api/[...path]` proxy forwards them to OutSystems
(`https://smuedu-dev.outsystemsenterprise.com`). All of them are already in P2's `routeFor()`.
Login and logout are P2's (`/login`, `/api/auth/*`).

| Browser → Next.js | Next.js → OutSystems | Auth |
|---|---|---|
| `POST /api/onboard/otp` | `POST /T3RE_Sender_CS/rest/Onboard/otp` | none (public) |
| `POST /api/onboard/senders` | `POST /T3RE_Sender_CS/rest/Onboard/senders` | none (public) |
| `GET /api/family/payout-options?country=` | `GET /T3RE_Sender_CS/rest/Family/payout-options?country=` | `Authorization: Bearer <token>` |
| `GET /api/family/beneficiaries` | `GET /T3RE_Sender_CS/rest/Family/beneficiaries` | `Authorization: Bearer <token>` |
| `POST /api/family/beneficiaries` | `POST /T3RE_Sender_CS/rest/Family/beneficiaries` | `Authorization: Bearer <token>` |
| `DELETE /api/family/beneficiaries/{id}` | `DELETE /T3RE_Sender_CS/rest/Family/beneficiaries/{id}` | `Authorization: Bearer <token>` |
| `POST /api/account/topup` | `POST /T3RE_Sender_CS/rest/Account/topup` `{ AmountSGD, RequestId, ChallengeId, OtpCode }` | `Authorization: Bearer <token>` + TOPUP OTP |

Note: the Family API reads `Authorization: Bearer`, **not** the `Token` header.

**Never add these to the allow-list** (service-key only, called by composites with
`X-RE-Service-Key` + `X-RE-User-Id`):
`/T3RE_Sender_AS/rest/Sender/*` · `/T3RE_Sender_AS/rest/Beneficiary/*`.

## Error format
The team format is `errors: [{ code, message }]`. The P1 OutSystems services currently return
`errors: ["message"]` and omit `success` on failure. `lib/p1Api.js` normalises both into
`{ code, message }` (code = HTTP status when the backend sends a string), so the proxy can pass
the body through unchanged.

| Status | When | Page behaviour |
|---|---|---|
| 400 | Invalid NRIC/FIN, bad mobile, invalid relationship/account/nickname, unknown payout option | Field error |
| 401 | Missing/expired token | Redirect to `/login?next=...` |
| 404 | Family member not found | Removed from list |
| 409 | Username taken · OTP challenge expired/used · account already saved | Field error / ask for a new code |
| 422 | Incorrect OTP | Ask for a new code |
| 502 | tBank/SMULab error | Show message, ask for a new code |

## Files
| Path | Purpose |
|---|---|
| `lib/p1Api.js` | API calls, error normalising, `familyItems()`, form option lists |
| `lib/mock/p1MockStore.js` | Mock sign-up data; family uses the shared `store.beneficiaries` |
| `app/api/mock/onboard/[...path]/route.js` | Mock C1 OnboardSender |
| `app/api/mock/family/[...path]/route.js` | Mock C2 ManageFamily (same `{ items }` shape as P2's proxy) |
| `app/(public)/signup/page.jsx` | Sign-up: details → OTP → done |
| `app/(app)/family/page.jsx` | Family list + remove |
| `app/(app)/family/new/page.jsx` | Add family member |
| `app/(app)/topup/page.jsx` | Top up: amount → TOPUP OTP → tBank DepositCash |
| `app/api/mock/account/topup/route.js` | Mock top-up (adds to the shared mock balance) |

## Mock mode (`NEXT_PUBLIC_USE_MOCK_API=true`)
- Sign-up OTP: `123456` correct, `000000` expired, anything else incorrect. Username `demo` is taken.
- Family members added or removed on `/family` show up on P2's `/send` screen (shared mock store).
- Payout countries: PH (PHP), IN (INR), BD (BDT), ID (IDR), MY (MYR), MM (MMK), VN (VND); mock corridor IDs `T3RE_PRD_SGD_<CCY>`.
- Top up: OTP `123456`; the new balance shows on Home.
- The P1 mock routes are more specific than `app/api/mock/[...path]`, so Next.js matches them first.
