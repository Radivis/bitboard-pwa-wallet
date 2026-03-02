-- Remove the seeded admin user to allow initial_password endpoint to work
-- This ensures a fresh start for both production deployments and test databases
-- The initial_password endpoint will create the first admin user when accessed
DELETE FROM users WHERE user_id = '46528a93-9697-4db2-a13a-36d5043cb8f2';
