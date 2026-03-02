# zero2prod-axum
Template app based on the book "Zero To Production in Rust" by Luca Palmieri with Axum instead of actix-web.

In this context "template app" means that this repo is intended to be a conventient "starter package" for more specific apps using a Rust + Axum + React or similar stack.

## Deployment

The app is fully Dockerized and can run on any VPS or machine with Docker and Docker Compose.

### Quick Start

1. Copy the example environment file and fill in your values:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` with your actual secrets and domain:
   - `DOMAIN` -- your domain name (e.g., `myapp.example.com`)
   - `APP_BASE_URL` -- full URL including scheme (e.g., `https://myapp.example.com`)
   - `APP_HMAC_SECRET` -- a long random string for HMAC verification
   - `APP_EMAIL_CLIENT__SENDER_EMAIL` — Postmark-approved sender email address
   - `POSTGRES_APP_PASSWORD` -- a strong database password
   - `POSTMARK_API_TOKEN` -- your Postmark API token for sending emails
   - `GRAFANA_ADMIN_PASSWORD` -- Grafana admin password (required)

3. Start everything:
   ```bash
   docker compose up -d
   ```

This brings up seven containers:
- **caddy** -- reverse proxy with automatic HTTPS via Let's Encrypt
- **zero2prod** -- the Rust API server, also serving the React SPA
- **postgres** -- PostgreSQL 16 database (data persisted in a Docker volume)
- **valkey** -- Valkey 8 for session storage (data persisted in a Docker volume)
- **loki** -- Log aggregation and storage (data persisted in a Docker volume)
- **promtail** -- Log collection agent that scrapes container logs
- **grafana** -- Log visualization UI accessible at `/grafana` path via Caddy (data persisted in a Docker volume)

Database migrations run automatically on startup.

### DNS Setup

Point your domain's A record to the VPS IP address. Caddy will automatically obtain and renew TLS certificates once DNS resolves correctly.

### Grafana UI
When deployed via Docker Compose, Grafana is automatically available through Caddy:

- Access Grafana at `https://your-domain/grafana` (served via Caddy reverse proxy)
- Grafana credentials: `admin` / value of `GRAFANA_ADMIN_PASSWORD` from `.env`
- Navigate to **Explore** and use LogQL queries:
  ```logql
  # All API logs
  {compose_service="zero2prod"}
  
  # Filter by log level
  {compose_service="zero2prod"} | json | level="ERROR"
  
  # Search in log messages
  {compose_service="zero2prod"} |= "database"
  ```

**Log Retention**: Logs are retained for 31 days by default (configurable in `loki-config.yaml`)

**Learn more about LogQL**: [Loki Query Language Documentation](https://grafana.com/docs/loki/latest/logql/)

## Development
### Requirements
- Docker
    - Postgres
    - Redis / Valkey
    - Loki + Promtail + Grafana (for log aggregation)
    - The indentation means that the app expects those servers to run in Docker containers. All you really need is Docker
- Rust
- Optional, but suggested: Go and lefthook for the Git hooks

### Initialization

#### .env file
Make a copy of .env.example and name it .env.

Uncomment the line

```# DATABASE_URL=postgres://app:secret@localhost:5432/newsletter```

so that your app knows where your database lives.

The other lines in the .env file are not particularly relevant in the local development context, but should exist.

#### Git hooks
For CD there is a lefthook.yml file. You need to run

`lefthook install`

for the Git hooks to actually work.
The same commands also updates the hooks, if you update the config file lefthook.yml.

If you don't have lefthook installed, you need to install it first.
I've tried Rust-based alternatives, but they are still a far cry from the simplicity of lefthook.

When you perform a commit, it is suggested to do so in a console in which you can see the output.

### Startup
Don't forget to start the Postgres and Redis/Valkey servers/Docker containers before trying anything!

See initialization logic under scripts/

For local development, you can start the required services:
```bash
./scripts/init_postgres.sh  # Start Postgres
./scripts/init_redis.sh     # Start Redis
./scripts/init_loki.sh      # Start logging stack (optional, for viewing logs)
```

Then run your application:
```bash
cargo run                            # Run natively
# OR
./scripts/init_backend_dockerized.sh # Run in Docker (to test with Loki/Grafana)
```

To stop local development services:
```bash
./scripts/stop_backend.sh    # Stop backend container
./scripts/stop_postgres.sh   # Stop Postgres container
./scripts/stop_redis.sh      # Stop Redis container
./scripts/stop_loki.sh       # Stop logging stack (Loki, Promtail, Grafana)
./scripts/stop_all.sh        # Stop all at once
```

#### Local Testing with Docker

Leave `DOMAIN=localhost` in `.env`. Caddy will use its built-in local CA (expect a self-signed certificate warning in the browser).

### Coding Guidelines
Both humans and agents should adhere to `.cursor/rules`. The file `.cursor/rules/coding-codex.mdc` is the canonical starting point.

### Testing
#### Backend
Testing works with the default

`cargo test`

but using nextest is preferred:

`cargo nextest run`

#### Frontend

There is a convenient script that can run all e2e tests conveniently in the background and issues a notification (currently only tested on Linux) on test success / failure:
`./scripts/run-e2e-background.sh`

Otherwise change to frontend directory first:
`cd frontend`

Component tests:
`npm run test`

e2e tests:
`npm run test:e2e`

### Viewing Logs

The application uses structured JSON logging (via `tracing` and `tracing-bunyan-formatter`). Logs can be viewed in multiple ways:

#### Console
By default, logs are printed to the console when running `cargo run`.

#### Grafana UI
For a better log viewing experience during local development:

1. Start the logging stack:
   ```bash
   ./scripts/init_loki.sh
   ```

2. Open Grafana at `http://localhost:3200`
   - Username: `admin`
   - Password: `admin`
   - Note: Using port 3200 to avoid conflict with React dev server (port 3000)

3. Navigate to **Explore** (compass icon in left sidebar)

4. Query your application logs using LogQL:
   ```logql
   # All logs from your dev containers
   {container_name=~".*zero2prod-axum.*"}
   
   # Only errors
   {container_name=~".*zero2prod-axum.*"} | json | level="ERROR"
   
   # Search for specific text
   {container_name=~".*zero2prod-axum.*"} |= "subscription"
   
   # Filter by extracted JSON fields
   {container_name=~".*zero2prod-axum.*"} | json | status_code >= 400
   ```

5. Use **Live** mode (button in top right) for real-time log streaming

## Improvements
Some improvements over the solutions from the book

- Switched to a React front-end
- Switched from actix-web to Axum
- Integration test logs are written into per test logfiles when run via nextest
- The TestApp struct is refactored into two versions: One without user, and one with a user
- Added basic blogging features
- Added unsubscribe functionality
- Added a nice start page
- Added Grafana UI for logs with Loki and Promtail in the backend

## Caveats
- Deployment was optimized for Docker Compose to enable cheap and simple pre-packaged deployment, but using this deployment route breaks the nice automatic CD pipeline using Digital Ocean described in the book.

### Future Options
- Refactor to Tailwind + shadcn/ui. Reason: MUI Update 6 -> 7 was a complete and utter failure.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.