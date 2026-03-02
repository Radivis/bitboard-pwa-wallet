-- Add migration script here

-- Create Subscriptions Table
-- gen_random_uuid should be replaced with uuidv7 for Postgres 18+,
CREATE TABLE subscriptions(
id uuid NOT NULL DEFAULT gen_random_uuid(),
PRIMARY KEY (id),
email TEXT NOT NULL UNIQUE,
name TEXT NOT NULL,
subscribed_at timestamptz NOT NULL
);