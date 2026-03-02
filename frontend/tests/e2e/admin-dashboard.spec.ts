import { test, expect, makeUser } from '../fixtures';

test.describe('Admin Dashboard', () => {
  test('protected route redirects to login when not authenticated', async ({ page, backendApp, frontendServer }) => {
    // Create a user so we don't get redirected to initial_password
    await makeUser(backendApp.address, 'test-user', 'test-password-12345');
    
    // Try to access admin dashboard without logging in
    await page.goto(`${frontendServer.url}/admin/dashboard`);
    
    // Should redirect to login
    await page.waitForURL(/\/login/, { timeout: 10000 });
    expect(page.url()).toContain('/login');
  });

  test('dashboard displays username after login', async ({ authenticatedPage }) => {
    const { page, username } = authenticatedPage;
    
    // authenticatedPage fixture already logs us in and navigates to dashboard
    
    // Should see welcome message with the actual username
    await expect(page.locator(`text=/Welcome ${username}/i`)).toBeVisible();
  });

  test('logout functionality works', async ({ authenticatedPage }) => {
    const { page } = authenticatedPage;
    
    // Click logout button
    await page.getByRole('button', { name: 'Logout' }).click();
    
    // Should redirect to login page
    await page.waitForURL(/\/login/, { timeout: 10000 });
    expect(page.url()).toContain('/login');
    
    // Try to access dashboard again - should redirect to login
    await page.goto('/admin/dashboard');
    await page.waitForURL(/\/login/, { timeout: 10000 });
  });

  test('navigation links work', async ({ authenticatedPage }) => {
    const { page } = authenticatedPage;
    
    // Click on "Change password" link
    await page.getByRole('link', { name: 'Change password' }).click();
    await page.waitForURL(/\/admin\/password/, { timeout: 5000 });
    expect(page.url()).toContain('/admin/password');
    
    // Go back to dashboard
    await page.goto('/admin/dashboard');
    
    // Click on "Send a newsletter" link
    await page.getByRole('link', { name: 'Send newsletter' }).click();
    await page.waitForURL(/\/admin\/newsletters/, { timeout: 5000 });
    expect(page.url()).toContain('/admin/newsletters');
  });
});
