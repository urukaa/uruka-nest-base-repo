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

| Endpoint             | Notes                                            |
| -------------------- | ------------------------------------------------ |
| `POST /api/auth/register` | Returns the user plus an access/refresh pair |
| `POST /api/auth/login`    | Same shape; rate-limited to 5/min per IP     |
| `GET  /api/auth/me`       | Requires `Authorization: Bearer <accessToken>` |

Two token types, on purpose:

- **access token** — a signed JWT, short-lived, **not revocable**. Keep
  `JWT_EXPIRE_IN` small; expiry is the only thing that ends it.
- **refresh token** — an opaque random string with a row in `refresh_tokens`.
  Only its SHA-256 is stored, so a database leak yields no usable session, and
  the row is what makes revocation possible at all.

Login answers identically for a wrong password, an unknown username, and an
account that belongs to an external provider. Anything more specific turns the
endpoint into a username oracle. The real reason is written to the Winston log.

### Adding an external provider

Every path ends at the same two methods, so a provider only has to verify a
token and hand over the claims:

```ts
@Post('clerk/session')            // add to SecurityMiddleware.openPaths
async clerkSession(@Body() body: { token: string }) {
  const claims = await verifyClerkToken(body.token);   // provider-specific
  const user = await this.auth.linkExternalUser({
    provider: AuthProvider.CLERK,
    externalId: claims.sub,
    username: claims.email,
  });
  return this.auth.issueTokens(user.id, user.username, user.role);
}
```

`linkExternalUser` upserts on `externalId`, so the same account is reused on
every login and never gets a password. `User.id` stays numeric and
provider-independent — foreign keys never point at a vendor's identifier.

> [!NOTE]
> A default Clerk session token carries only `sub`; email and name require a
> JWT template configured in the Clerk dashboard. Clerk also uses `azp` rather
> than `aud`, and validating it against your known origins is required — not
> doing so leaves you open to CSRF.

## Module map

```
AppModule
├─ ConfigModule      (global; loads jwtConfig + r2Config)
├─ ThrottlerModule   (rate limit per IP, enforced by a global guard)
├─ CommonModule      (@Global: PrismaService, ValidationService, R2Service, ErrorFilter)
├─ MiddlewareModule  (SecurityMiddleware on every route)
└─ HealthyCheckModule
```

Two modules are **intentionally not wired** into `AppModule`:

| Module          | Why                                                                                                                                                      |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AuthModule`    | Import it from your feature module — typically `UserModule`. Self-contained via `ConfigModule.forFeature`; exports `JwtModule` + `PassportModule`.         |
| `ExampleModule` | Scaffold to copy when starting a new feature module.                                                                                                       |

Both are covered by compile-smoke specs (`test/auth.module.spec.ts`,
`test/example.module.spec.ts`) so their wiring stays verified even though
nothing imports them at runtime.

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

The signature is `HMAC-SHA256(APP_SECRET, "<timestamp>:<APP_NAME>")` in hex:

```js
const signature = crypto
  .createHmac('sha256', APP_SECRET)
  .update(`${timestamp}:${APP_NAME}`)
  .digest('hex');
```

Note that the signature is **not bound to the endpoint** — it covers only the
timestamp and app name, so one signature is valid for any route inside the
window. What actually constrains it is the IP allowlist below. Keep that in mind
before exposing this API to a caller you do not control.

The request IP must appear in `ALLOWED_IPS` (defaults to localhost). Behind a
reverse proxy, set `TRUST_PROXY` so `req.ip` is the client rather than the
proxy — leave it empty otherwise, since it makes `X-Forwarded-For` spoofable,
and the IP allowlist is what this scheme leans on.

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
