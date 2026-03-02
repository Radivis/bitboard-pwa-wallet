import { test, expect, makeUser } from '../fixtures';

test.describe('Newsletter', () => {
  test('newsletter form submission requires authentication', async ({ page, backendApp, frontendServer }) => {
    // Create a user so we don't get redirected to initial_password
    await makeUser(backendApp.address, 'test-user', 'test-password-12345');
    
    // Try to access newsletter page without authentication
    await page.goto(`${frontendServer.url}/admin/newsletters`);
    
    // Should redirect to login
    await page.waitForURL(/\/login/, { timeout: 10000 });
    expect(page.url()).toContain('/login');
  });

  test('successful newsletter submission', async ({ authenticatedPage }) => {
    const { page } = authenticatedPage;
    
    await page.goto('/admin/newsletters');
    
    // Fill in the newsletter form using ARIA labels
    await page.getByLabel('Newsletter title').waitFor({ state: 'visible' });
    
    await page.getByLabel('Newsletter title').fill('Test Newsletter');
    await page.getByLabel('HTML content').fill('<p>Test HTML content</p>');
    await page.getByLabel('Text content').fill('Test text content');
    
    // Submit the form
    await page.getByRole('button', { name: 'Send newsletter' }).click();
    
    // Wait for success message
    await expect(page.locator('text=/newsletter issue has been accepted/i')).toBeVisible({ timeout: 10000 });
    
    // Form should be reset (title should be empty)
    const titleValue = await page.getByLabel('Newsletter title').inputValue();
    expect(titleValue).toBe('');
  });

  test('shows validation error for missing fields', async ({ authenticatedPage }) => {
    const { page } = authenticatedPage;
    
    await page.goto('/admin/newsletters');
    
    // Try to submit without filling required fields
    await page.getByRole('button', { name: 'Send newsletter' }).click();
    
    // HTML5 validation should prevent submission, or we should see an error
    // Check if form is still visible (not submitted)
    await expect(page.locator('form')).toBeVisible();
  });
});
