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

```powershell
git clone <repo> && cd nest
npm install
cp example.env .env
```

Fill in `.env`. Two groups are validated lazily rather than at boot:

- `R2_*` — checked the first time `R2Service` is used.
- `APP_KEY` / `APP_SECRET` / `APP_NAME` — only required when
  `IS_VO1D_TESTING=mboten`, i.e. when request signing is enforced.

Everything else is required at boot. Then:

```powershell
npx prisma generate
npx prisma migrate dev --name <migration_name>
```

## Running The App

```bash
# development
npm run start

# watch mode  (note the colon — `npm run start dev` is NOT watch mode)
npm run start:dev

# production
npm run build && npm run start:prod
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
npm run test
npm run test:cov
```

Specs live in `test/` and are collected from `src/` too. `test/setup-env.ts`
supplies a baseline environment, so the suite runs on a fresh clone with no
`.env` present.

## Module map

```
AppModule
├─ ConfigModule      (global; loads jwtConfig + r2Config)
├─ ThrottlerModule   (100 req/min per IP, enforced by a global guard)
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

## Request signing

When `IS_VO1D_TESTING=mboten`, every route outside `SecurityMiddleware`'s
`openPaths` requires these headers:

| Header        | Value                                     |
| ------------- | ----------------------------------------- |
| `x-app-key`   | `APP_KEY`                                 |
| `x-timestamp` | ISO-8601, within 5 minutes of server time |
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
5-minute window. What actually constrains it is the IP allowlist below. Keep
that in mind before exposing this API to a caller you do not control.

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
