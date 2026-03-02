import { test, expect } from '../fixtures';

test.describe('Initial Password', () => {
  test('creates initial admin user successfully', async ({ page, frontendServer }) => {
    await page.goto(`${frontendServer.url}/initial-password`);
    
    // Fill in password form
    await page.getByLabel('New password').waitFor({ state: 'visible' });
    
    await page.getByLabel('New password').fill('testpassword123456');
    await page.getByLabel('Confirm password').fill('testpassword123456');
    
    // Submit the form
    await page.getByRole('button', { name: 'Create account' }).click();
    
    // Should redirect to login page
    await page.waitForURL(/\/login/, { timeout: 10000 });
    expect(page.url()).toContain('/login');
  });

  test('shows error when initial passwords do not match', async ({ page, frontendServer }) => {
    await page.goto(`${frontendServer.url}/initial-password`);
    
    await page.getByLabel('New password').waitFor({ state: 'visible' });
    
    await page.getByLabel('New password').fill('testpassword123456');
    await page.getByLabel('Confirm password').fill('differentpassword123456');
    
    await page.getByRole('button', { name: 'Create account' }).click();
    
    // Should show validation error
    await expect(page.locator('text=/Passwords do not match/i')).toBeVisible({ timeout: 5000 });
    
    // Should still be on initial password page
    expect(page.url()).toContain('/initial-password');
  });

  test('shows error when password is too short', async ({ page, frontendServer }) => {
    await page.goto(`${frontendServer.url}/initial-password`);
    
    await page.getByLabel('New password').waitFor({ state: 'visible' });
    
    await page.getByLabel('New password').fill('short');
    await page.getByLabel('Confirm password').fill('short');
    
    await page.getByRole('button', { name: 'Create account' }).click();
    
    // Should show validation error
    await expect(page.locator('text=/at least 12 characters/i')).toBeVisible({ timeout: 5000 });
  });

  test('shows error when password is too long', async ({ page, frontendServer }) => {
    await page.goto(`${frontendServer.url}/initial-password`);
    
    await page.getByLabel('New password').waitFor({ state: 'visible' });
    
    const longPassword = 'a'.repeat(129);
    await page.getByLabel('New password').fill(longPassword);
    await page.getByLabel('Confirm password').fill(longPassword);
    
    await page.getByRole('button', { name: 'Create account' }).click();
    
    // Should show validation error
    await expect(page.locator('text=/must not exceed 128 characters/i')).toBeVisible({ timeout: 5000 });
  });
});
