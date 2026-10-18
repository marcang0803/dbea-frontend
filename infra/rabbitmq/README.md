# RabbitMQ for RemitEase (P3)

A RabbitMQ broker in Docker plus a Cloudflare Quick Tunnel. OutSystems reaches it through the
**SMULab RabbitMQ wrapper**, which calls RabbitMQ's management HTTP API. It only needs to run
while you test or demo. The rest of the time, OutSystems runs with `UseRabbitMQ = False`
(notifications go straight to the dispatcher).

```
OutSystems (SMU cloud) → SMULab_RabbitMQ wrapper → https://<random>.trycloudflare.com
                                                         │ Cloudflare Quick Tunnel (container "tunnel")
                                                         ▼
                                        RabbitMQ management API :15672 (container "rabbitmq")
```

## Prerequisites
- Docker Desktop (Windows/macOS) or Docker Engine + Compose (Linux)
- Node.js (already needed for the frontend) for `npm run rabbitmq:url`
- Nothing else. The Cloudflare Quick Tunnel needs no account.

## Start (≈1 minute, from the repo root)
```bash
cp infra/rabbitmq/.env.example infra/rabbitmq/.env   # first time only; then set a long random password in it
npm run rabbitmq:up           # = docker compose -f infra/rabbitmq/docker-compose.yml up -d
npm run rabbitmq:status       # rabbitmq should be "healthy", tunnel "running"
npm run rabbitmq:url          # prints the tunnel URL + RabbitHost value (works on Windows/macOS/Linux)
```
On Windows PowerShell, use `copy` instead of `cp` for the first line.
The script prints something like:
```
Tunnel URL : https://quiet-river-1234.trycloudflare.com
RabbitHost : quiet-river-1234.trycloudflare.com
```
Local management UI (this laptop only): http://localhost:15672, logged in with the `.env` user.

## Point OutSystems at it (Service Center → `T3RE_Notify_Lib` → Site Properties)
| Site Property | Value |
|---|---|
| `RabbitHost` | the **RabbitHost** line from the script (no `https://`) |
| `RabbitPort` | `443` |
| `RabbitVHost` | `t3re` (or whatever `RABBITMQ_VHOST` is in `.env`) |
| `RabbitUser` / `RabbitPassword` | from your `.env` |

Then:
1. **Test the connection first:** on the SMULab RabbitMQ Swagger page, run **GetBindings** with the same values. A JSON list (even an empty one) means the wrapper can reach the broker.
2. Call `POST /T3RE_Notify_CS/rest/NotifyDispatch/setup` (Admin). It creates exchange `t3re.events`, queue `t3re.notifications` and binding `notify.#`. It's safe to re-run.
3. Set `UseRabbitMQ = True`.

## Stop
1. **First** set `UseRabbitMQ = False` in Service Center. Otherwise events published while the broker is down are logged and dropped.
2. `npm run rabbitmq:down`. Queues and messages are kept in the `rabbitmq-data` volume. To wipe everything: `docker compose -f infra/rabbitmq/docker-compose.yml down -v`.

> **The tunnel URL changes every time the `tunnel` container restarts.** After each
> `npm run rabbitmq:up`, re-run `npm run rabbitmq:url` and update `RabbitHost`. Site Property
> changes apply without republishing.

## Demo day checklist
- [ ] Laptop on, Docker running, `npm run rabbitmq:up`
- [ ] `npm run rabbitmq:url` → update `RabbitHost`
- [ ] GetBindings on Swagger shows `notify.#` (screenshot for the appendix)
- [ ] `UseRabbitMQ = True`
- [ ] Laptop set not to sleep during the presentation
- [ ] Fallback if the tunnel fails: set `UseRabbitMQ = False`. The demo still works (the direct path).

## Security
- While the tunnel runs, **the management API is on the public internet** behind your username and password. Use a long random password, never commit `.env`, and stop the stack when you aren't testing.
- The default `guest` account is not created: setting `RABBITMQ_DEFAULT_USER` replaces it.
- Only port 15672 goes through the tunnel. AMQP (5672) is not published anywhere.
- Quick Tunnels are meant for testing and development, with no uptime guarantee and a 200 concurrent-request cap. That's fine for coursework; mention it if asked in Q&A.

## Troubleshooting
| Symptom | Check |
|---|---|
| `rabbitmq:url` prints nothing | `docker compose -f infra/rabbitmq/docker-compose.yml logs tunnel`. Wait ~10 s after start; the rabbitmq container must be healthy first. |
| GetBindings fails with 443 | [verify] how the wrapper builds its URL. Try `RabbitPort = 80`, and/or `RabbitHost` with or without `https://`. Note what works in the P3 guide. |
| 401 Unauthorized | Wrong user or password, or the user has no permission on the vhost. Use the `.env` user and `RabbitVHost = t3re`. |
| 404 on vhost | `RabbitVHost` doesn't match `RABBITMQ_VHOST`. |
| Quick Tunnel refuses to start | A `config.yaml` in a `.cloudflared` directory on the host disables Quick Tunnels. Rename it. |
