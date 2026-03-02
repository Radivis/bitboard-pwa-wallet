#!/usr/bin/env bash
set -x
set -euo pipefail

if ! [ -x "$(command -v sqlx)" ]; then
  echo >&2 "Error: sqlx is not installed."
  echo >&2 "Use:"
  echo >&2 "
 cargo install --version='~0.8' sqlx-cli \
--no-default-features --features rustls,postgres"
  echo >&2 "to install it."
  exit 1
fi

# Check if a custom parameter has been set, otherwise use default values
DB_PORT="${POSTGRES_PORT:=5432}"
SUPERUSER="${SUPERUSER:=postgres}"
SUPERUSER_PWD="${SUPERUSER_PWD:=STOPSERG!2345already}"

APP_USER="${APP_USER:=app}"
APP_USER_PWD="${APP_USER_PWD:=secret}"
APP_DB_NAME="${APP_DB_NAME:=newsletter}"

# Allow to skip Docker if a dockerized Postgres database is already running
if [[ -z "${SKIP_DOCKER:-}" ]]
then
  # if a postgres container is running, print instructions to kill it and exit
  RUNNING_POSTGRES_CONTAINER=$(docker ps --filter 'name=postgres' --format '{{.ID}}')
  if [[ -n $RUNNING_POSTGRES_CONTAINER ]]; then
    echo >&2 "there is a postgres container already running, kill it with"
    echo >&2 "    docker kill ${RUNNING_POSTGRES_CONTAINER}"
    exit 1
  fi
  # Launch postgres using Docker
  # If you are on a Linux system, and you get the error
  # "docker: permission denied while trying to connect to the docker API at unix:///var/run/docker.sock",
  # you need to add the docker group to your user to execute this,
  # with $USER being your Linux username:
  # sudo usermod -aG docker $USER
  # Afterwards refresh shell session with:
  # newgrp docker
  CONTAINER_NAME="zero2prod-axum-postgres_$(date '+%s')"
  docker run \
    --env POSTGRES_USER=${SUPERUSER} \
    --env POSTGRES_PASSWORD=${SUPERUSER_PWD} \
    --health-cmd="pg_isready -U ${SUPERUSER} || exit 1" \
    --health-interval=1s \
    --health-timeout=5s \
    --health-retries=5 \
    --publish "${DB_PORT}":5432 \
    --detach \
    --name "${CONTAINER_NAME}" \
    postgres -N 1000
    # ^ Increased maximum number of connections for testing purposes

  # Wait for Postgres to be ready to accept connections
  until [ \
    "$(docker inspect -f "{{.State.Health.Status}}" ${CONTAINER_NAME})" == \
    "healthy" \
  ]; do
    >&2 echo "Postgres is still unavailable - sleeping"
    sleep 1
  done
  >&2 echo "Postgres is up and running on port ${DB_PORT}!"

  # Create the application user
  docker exec "${CONTAINER_NAME}" \
    psql -U "${SUPERUSER}" -h localhost -d postgres -c "
  CREATE USER ${APP_USER} WITH PASSWORD '${APP_USER_PWD}';
  ALTER USER ${APP_USER} CREATEDB;
  "
fi

DATABASE_URL=postgres://${APP_USER}:${APP_USER_PWD}@localhost:${DB_PORT}/${APP_DB_NAME}
export DATABASE_URL
sqlx database create
>&2 echo "Running migrations"
# sqlx migrate add create_subscriptions_table
sqlx migrate run