# syntax=docker/dockerfile:1.4

# --- Stage 1: Rust dependency planner ---
FROM lukemathwalker/cargo-chef:latest-rust-1.91.1 AS chef
WORKDIR /app
RUN apt update && apt install lld clang -y

FROM chef AS planner
COPY . .
RUN cargo chef prepare --recipe-path recipe.json

# --- Stage 2: Rust builder ---
FROM chef AS builder
COPY --from=planner /app/recipe.json recipe.json
RUN cargo chef cook --release --recipe-path recipe.json
COPY . .
ENV SQLX_OFFLINE=true
RUN cargo build --release --bin zero2prod

# --- Stage 3: Frontend builder ---
FROM node:24-slim AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ .
RUN npm run build

# --- Stage 4: Runtime ---
FROM debian:bookworm-slim AS runtime
WORKDIR /app
RUN apt-get update -y \
    && apt-get install -y --no-install-recommends openssl ca-certificates curl \
    && apt-get autoremove -y \
    && apt-get clean -y \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/target/release/zero2prod zero2prod
COPY --from=frontend-builder /app/frontend/dist static
COPY configuration configuration

ENV APP_ENVIRONMENT=production
ENV STATIC_FILES_DIR=/app/static
ENTRYPOINT ["./zero2prod"]
