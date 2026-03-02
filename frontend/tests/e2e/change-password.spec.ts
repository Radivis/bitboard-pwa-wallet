import { test, expect, makeUser } from '../fixtures';

test.describe('Change Password', () => {
  test('password change form requires authentication', async ({ page, backendApp, frontendServer }) => {
    // Create a user so we don't get redirected to initial_password
    await makeUser(backendApp.address, 'test-user', 'test-password-12345');
    
    // Try to access password change page without authentication
    await page.goto(`${frontendServer.url}/admin/password`);
    
    // Should redirect to login
    await page.waitForURL(/\/login/, { timeout: 10000 });
    expect(page.url()).toContain('/login');
  });

  test('shows error when passwords do not match', async ({ authenticatedPage }) => {
    const { page } = authenticatedPage;
    
    // Go to password change page
    await page.goto('/admin/password');
    
    // Wait for all network requests (including auth check) to settle
    await page.waitForLoadState('networkidle', { timeout: 15000 });
    // Verify we're on the password change page
    const currentUrl = page.url();
    if (!currentUrl.includes('/admin/password')) {
        throw new Error(`Expected to be on password change page, but current URL is: ${currentUrl}`);
    }
        
    // Wait for the password form to be visible
    await page.getByLabel('Current password', { exact: true }).waitFor({ state: 'visible', timeout: 15000 });
    
    // Fill passwords with mismatch (doesn't need to be the real password - client-side validation)
    await page.getByLabel('Current password', { exact: true }).fill('anypassword123456');
    await page.getByLabel('New password', { exact: true }).fill('newpassword123456');
    await page.getByLabel('Confirm new password', { exact: true }).fill('differentpassword123456');
    
    await page.getByRole('button', { name: 'Change password' }).click();
    
    // Should show validation error (client-side, so it appears immediately)
    await expect(page.locator('text=/two different new passwords/i')).toBeVisible({ timeout: 5000 });
  });

  test('shows error when new password is too short', async ({ authenticatedPage }) => {
    const { page } = authenticatedPage;
    
    // Go to password change page
    await page.goto('/admin/password');
    await page.waitForLoadState('networkidle', { timeout: 15000 });
    
    await page.getByLabel('Current password', { exact: true }).waitFor({ state: 'visible', timeout: 15000 });
    
    await page.getByLabel('Current password', { exact: true }).fill('anypassword123456');
    await page.getByLabel('New password', { exact: true }).fill('short');
    await page.getByLabel('Confirm new password', { exact: true }).fill('short');
    
    await page.getByRole('button', { name: 'Change password' }).click();
    
    // Should show validation error (client-side)
    await expect(page.locator('text=/at least 12 characters/i')).toBeVisible({ timeout: 5000 });
  });

  test('shows error when new password is too long', async ({ authenticatedPage }) => {
    const { page } = authenticatedPage;
    
    // Go to password change page
    await page.goto('/admin/password');
    await page.waitForLoadState('networkidle', { timeout: 15000 });
    
    await page.getByLabel('Current password', { exact: true }).waitFor({ state: 'visible', timeout: 15000 });
    
    const longPassword = 'a'.repeat(129);
    await page.getByLabel('Current password', { exact: true }).fill('anypassword123456');
    await page.getByLabel('New password', { exact: true }).fill(longPassword);
    await page.getByLabel('Confirm new password', { exact: true }).fill(longPassword);
    
    await page.getByRole('button', { name: 'Change password' }).click();
    
    // Should show validation error (client-side)
    await expect(page.locator('text=/not have more than 128 characters/i')).toBeVisible({ timeout: 5000 });
  });

  test('shows error when current password is incorrect', async ({ authenticatedPage }) => {
    const { page } = authenticatedPage;
    
    await page.goto('/admin/password');
    await page.waitForLoadState('networkidle', { timeout: 15000 });
    
    await page.getByLabel('Current password', { exact: true }).waitFor({ state: 'visible', timeout: 15000 });
    
    // Use wrong current password (backend validation)
    await page.getByLabel('Current password', { exact: true }).fill('wrongpassword123456');
    await page.getByLabel('New password', { exact: true }).fill('newpassword123456');
    await page.getByLabel('Confirm new password', { exact: true }).fill('newpassword123456');
    
    await page.getByRole('button', { name: 'Change password' }).click();
    
    // Should show error from backend
    await expect(page.locator('text=/current password is incorrect/i')).toBeVisible({ timeout: 5000 });
  });

  test('successful password change', async ({ authenticatedPage }) => {
    const { page, password, username } = authenticatedPage;
    
    // Go to password change page
    await page.goto('/admin/password');
    await page.waitForLoadState('networkidle', { timeout: 15000 });
    
    await page.getByLabel('Current password', { exact: true }).waitFor({ state: 'visible', timeout: 15000 });
    
    // Now we have access to the actual current password!
    const newPassword = 'newpassword123456';
    await page.getByLabel('Current password', { exact: true }).fill(password);
    await page.getByLabel('New password', { exact: true }).fill(newPassword);
    await page.getByLabel('Confirm new password', { exact: true }).fill(newPassword);
    
    await page.getByRole('button', { name: 'Change password' }).click();
    
    // Should show success message
    await expect(page.locator('text=/password has been changed/i')).toBeVisible({ timeout: 10000 });
    
    // Logout
    await page.goto('/admin/dashboard');
    await page.getByRole('button', { name: 'Logout' }).click();
    await page.waitForURL(/\/login/);
    
    // Login with new password to verify it worked
    await page.getByLabel('Username').fill(username);
    await page.getByLabel('Password').fill(newPassword);
    await page.getByRole('button', { name: 'Login' }).click();
    
    // Should successfully login with new password
    await page.waitForURL(/\/admin\/dashboard/, { timeout: 10000 });
    expect(page.url()).toContain('/admin/dashboard');
  });
});
