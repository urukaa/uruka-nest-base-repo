# Nest Base Repo

## Tech Stacks

- Language : TypeScript (strict)
- Framework : NestJS 11
- ORM : Prisma 7 (`@prisma/adapter-pg`)
- Database : PostgreSQL
- Validation : Zod
- Logging : Winston
- Storage : Cloudflare R2 (S3-compatible, optional)

> [!NOTE]
> make sure that you have Node.js >= 22.17.1

## Setup

This repo uses **pnpm**, pinned via the `packageManager` field. corepack ships
with Node, so enabling it once is all that is needed:

```powershell
corepack enable pnpm
```

```powershell
git clone <repo> && cd nest
pnpm install
cp example.env .env
```

> [!IMPORTANT]
> pnpm blocks install scripts by default. The packages allowed to run one are
> listed explicitly in `pnpm-workspace.yaml` — add to `allowBuilds` when you
> introduce a native dependency, or it will fail at runtime rather than install.

A `preinstall` guard rejects `npm install`, because a flat `node_modules` would
silently undo pnpm's protection against importing undeclared packages. Note that
npm writes that flat tree *before* the guard aborts it, so if you hit the guard,
clean up rather than just re-running:

```powershell
rm -rf node_modules; pnpm install
```

`npm run <script>` stays safe — there npm is only a task runner, and the
binaries in `node_modules/.bin` work the same either way.

Fill in `.env`. Two groups are validated lazily rather than at boot:

- `R2_*` — checked the first time `R2Service` is used.
- `APP_KEY` / `APP_SECRET` / `APP_NAME` — only required when
  `IS_VO1D_TESTING=mboten`, i.e. when request signing is enforced.

Everything else is required at boot. Then apply the schema to your database:

```powershell
pnpm exec prisma migrate dev --name <migration_name>
```

`prisma generate` runs automatically as a `postinstall` hook, so the client is
already in place after `pnpm install`. Run it by hand only after editing
`schema.prisma` without creating a migration.

## Running The App

```bash
# development
pnpm start

# watch mode  (note the colon — `pnpm start` alone is NOT watch mode)
pnpm start:dev

# production
pnpm build && pnpm start:prod
```

Swagger is served at `/api/docs` whenever `IS_VO1D_PRODUCTION=mboten`.

`GET /api/health` runs `SELECT 1` against the database and answers **503** when
that fails or takes longer than 3s, so an orchestrator can pull the instance out
of rotation. A 200 means the process *and* its database are reachable:

```json
{ "status": "ok", "service": "api", "database": "up", "timestamp": "..." }
```

## Run tests

```bash
pnpm test
pnpm test:cov
```

Specs live in `test/` and are collected from `src/` too. `test/setup-env.ts`
supplies a baseline environment, so the suite runs on a fresh clone with no
`.env` present.

## Auth

| Endpoint                        | Notes                                          |
| ------------------------------- | ---------------------------------------------- |
| `POST /api/auth/register`       | Returns the user plus an access/refresh pair   |
| `POST /api/auth/login`          | Same shape; 20/min per IP                      |
| `POST /api/auth/refresh`        | Rotates the pair; 60/min per IP                |
| `POST /api/auth/logout`         | Revokes one session, always 204                |
| `POST /api/auth/logout-all`     | Revokes every session for the caller           |
| `POST /api/auth/external/session` | Exchanges a provider token — see below       |
| `GET  /api/auth/me`             | Requires `Authorization: Bearer <accessToken>` |

> [!NOTE]
> Those limits key on **IP**, and behind a BFF every user shares one — so they
> cap the whole application, not an individual attacker. Sized accordingly. To
> limit per account instead, override `ThrottlerGuard#getTracker`.

Refresh tokens rotate on use: presenting one spends it and issues a new pair. A
token replayed after rotation means a copy exists somewhere, so **every** session
for that user is revoked. Expired rows are deleted nightly — see
`RefreshTokenCleanupService`.

Two token types, on purpose:

- **access token** — a signed JWT, short-lived, **not revocable**. Keep
  `JWT_EXPIRE_IN` small; expiry is the only thing that ends it.
- **refresh token** — an opaque random string with a row in `refresh_tokens`.
  Only its SHA-256 is stored, so a database leak yields no usable session, and
  the row is what makes revocation possible at all.

Login answers identically for a wrong password, an unknown username, and an
account that belongs to an external provider. Anything more specific turns the
endpoint into a username oracle. The real reason is written to the Winston log.

### External providers

`POST /api/auth/external/session` takes a provider's token, verifies it against
that provider's JWKS, and returns **our** access/refresh pair. After that call
the provider is out of the picture — nothing downstream knows it exists.

It is provider-agnostic by construction: Clerk, Auth0, Supabase, Firebase,
Cognito and Keycloak all issue RS256 JWTs over JWKS, so switching is a change of
configuration rather than of code. Fill in four variables and the route is live;
leave `AUTH_EXTERNAL_JWKS_URL` empty and it answers 503.

```bash
AUTH_EXTERNAL_JWKS_URL=https://clerk.your-app.com/.well-known/jwks.json
AUTH_EXTERNAL_ISSUER=https://clerk.your-app.com
AUTH_EXTERNAL_AUTHORIZED_PARTIES=https://app.yourdomain.com
AUTH_EXTERNAL_USERNAME_CLAIM=email
```

Users are provisioned on first login and matched on `externalId` afterwards, so
the row is reused and never gets a password. `User.id` stays numeric and
provider-independent — foreign keys never point at a vendor's identifier.

The endpoint is **not** in `SecurityMiddleware.openPaths`: your BFF calls it
like any other endpoint, signature included. Only a redirect arriving straight
from a provider — an OAuth callback — needs to bypass signing.

> [!IMPORTANT]
> **Clerk needs a JWT template.** A default session token carries only `sub`,
> so `email` and `name` are absent until you configure one in the dashboard.
> The endpoint rejects such a token rather than falling back to `sub`, which
> would otherwise fill your table with users named `user_2abc...`.
>
> Clerk also puts the calling origin in `azp`, not `aud`. Leaving
> `AUTH_EXTERNAL_AUTHORIZED_PARTIES` empty skips that check — which Clerk's own
> docs describe as a CSRF exposure.

## Module map

```
AppModule
├─ ConfigModule      (global; loads jwtConfig + r2Config)
├─ ThrottlerModule   (rate limit per IP, enforced by a global guard)
├─ ScheduleModule    (drives the refresh-token cleanup cron)
├─ CommonModule      (@Global: Prisma, Validation, R2, Multer limits, ErrorFilter)
├─ MiddlewareModule  (SecurityMiddleware on every route)
├─ AuthModule        (login, sessions, external providers)
└─ HealthyCheckModule
```

`AuthModule` sits directly under `AppModule` because authentication is its own
concern, not part of user management — it owns session rotation, revocation and
provider federation. A `UserModule` should import it as well, for `JwtAuthGuard`
and `AuthService`; both imports are correct and Nest instantiates it once.

`ExampleModule` is **intentionally not wired** — it is the scaffold to copy when
starting a new feature module. A compile-smoke spec
(`test/example.module.spec.ts`) keeps its wiring verified even though nothing
imports it at runtime.

## Environment toggles

`nggih` = yes, `mboten` = no. Any other value throws at boot.

| Variable             | `nggih`                                                  | `mboten`                                         |
| -------------------- | -------------------------------------------------------- | ------------------------------------------------ |
| `IS_VO1D_PRODUCTION` | Swagger off, `Vo1dApp` User-Agent only, no query logging | Swagger on, relaxed User-Agent, query logging on |
| `IS_VO1D_TESTING`    | `SecurityMiddleware` bypassed                            | `SecurityMiddleware` enforced                    |

## Tunable limits

All in **seconds**, all optional — leave a variable empty to take its default.
A value that is present but not a positive number throws at boot.

| Variable                   | Default | Effect                                       |
| -------------------------- | ------- | -------------------------------------------- |
| `SIGNATURE_WINDOW_SECONDS` | `60`    | How long an `x-signature` stays valid        |
| `THROTTLE_TTL_SECONDS`     | `60`    | Rate-limit window                            |
| `THROTTLE_LIMIT`           | `100`   | Requests allowed per window, per IP          |
| `JWT_EXPIRE_IN`            | —       | Required. Seconds, or an `ms` duration (`7d`) |

The 60-second signature window assumes both ends are servers you control, so
clock skew is small. Widen it only if you see spurious `Request expired.`
rejections. Raise `THROTTLE_LIMIT` if the default gets in the way during
development.

## Request signing

When `IS_VO1D_TESTING=mboten`, every route outside `SecurityMiddleware`'s
`openPaths` requires these headers:

| Header        | Value                                     |
| ------------- | ----------------------------------------- |
| `x-app-key`   | `APP_KEY`                                 |
| `x-timestamp` | ISO-8601, within `SIGNATURE_WINDOW_SECONDS` of server time |
| `x-signature` | see below                                 |
| `User-Agent`  | non-empty; `Vo1dApp` in production        |

The signature is `HMAC-SHA256(APP_SECRET, canonical)` in hex, where `canonical`
is these five fields joined by a newline:

```
METHOD
/path/without/query
x-timestamp
APP_NAME
sha256(raw request body)     # sha256 of "" when there is no body
```

```js
// One variable, used for both. Calling JSON.stringify twice can reorder keys,
// and then the hash no longer matches the bytes actually sent.
const raw = JSON.stringify(payload);
const bodyHash = crypto.createHash('sha256').update(raw ?? '').digest('hex');

const canonical = ['POST', '/api/thing', timestamp, APP_NAME, bodyHash].join('
');
const signature = crypto.createHmac('sha256', APP_SECRET).update(canonical).digest('hex');

await fetch(url, { method: 'POST', body: raw, headers: { /* ... */ } });
```

Binding method, path and body means a captured signature is useless anywhere
else: it cannot be replayed against another route, another verb, or the same
route with altered content. The query string is deliberately excluded — the
server strips it before building the canonical string, so sign the bare path.

The request IP must appear in `ALLOWED_IPS` (defaults to localhost). Behind a
reverse proxy, set `TRUST_PROXY` so `req.ip` is the client rather than the
proxy — leave it empty otherwise, since it makes `X-Forwarded-For` spoofable,
and the IP allowlist is what this scheme leans on.

## Rotating APP_KEY / APP_SECRET

Both credentials have a second slot, `*_PREVIOUS`. Both values are accepted;
only the current one is used for signing.

| Deploy | `APP_SECRET` | `APP_SECRET_PREVIOUS` | Effect |
| ------ | ------------ | --------------------- | ------ |
| before | old          | *(empty)*             | only old works |
| 1. API | **new**      | old                   | both work — BFF is still on old |
| 2. BFF | new          | old                   | BFF switches over |
| 3. API | new          | *(empty)*             | old is dead |

Nothing has to happen simultaneously, which is the point. With a single slot,
the API and every caller must switch in the same instant or all signed requests
are rejected — so rotation becomes a scheduled outage, gets postponed, and a
possibly-leaked secret stays live.

No waiting period is needed between steps 2 and 3: signatures are recomputed on
every request, so nothing outlives the switch. `JWT_SECRET` would be different —
already-issued tokens are signed with the old key, so its acceptance window has
to be at least `JWT_EXPIRE_IN`.

Both keys are checked without short-circuiting, so response time does not reveal
which one matched.

## Error responses

Every error, handled or not, comes back in one shape:

```json
{
  "statusCode": 400,
  "message": "Validation failed",
  "errors": { "fieldErrors": {}, "formErrors": [] },
  "path": "/api/thing",
  "timestamp": "2026-08-16T00:00:00.000Z"
}
```

`errors` is `null` for 5xx — the detail goes to the Winston log instead.
