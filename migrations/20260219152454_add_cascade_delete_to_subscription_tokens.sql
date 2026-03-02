-- Add ON DELETE CASCADE to subscription_tokens foreign key
-- This ensures that when a subscriber is deleted, their token is automatically removed

-- Drop the existing foreign key constraint
ALTER TABLE subscription_tokens
DROP CONSTRAINT subscription_tokens_subscriber_id_fkey;

-- Add the constraint back with ON DELETE CASCADE
ALTER TABLE subscription_tokens
ADD CONSTRAINT subscription_tokens_subscriber_id_fkey
    FOREIGN KEY (subscriber_id)
    REFERENCES subscriptions (id)
    ON DELETE CASCADE;
