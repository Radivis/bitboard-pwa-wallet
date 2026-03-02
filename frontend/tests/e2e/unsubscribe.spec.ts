import { test, expect } from '../fixtures';
import { makeConfirmedSubscriber } from '../fixtures';

test.describe('Unsubscribe', () => {
  test('complete unsubscribe workflow', async ({ page, backendApp, frontendServer }) => {
    const email = 'test-subscriber@example.com';
    const name = 'Test Subscriber';

    // 1. Create a confirmed subscriber and get the token
    const token = await makeConfirmedSubscriber(backendApp.address, email, name);

    // 2. Navigate to the unsubscribe page with the token
    await page.goto(`${frontendServer.url}/subscriptions/unsubscribe?subscription_token=${token}`);

    // 3. Verify the unsubscribe page loads
    await expect(page.getByRole('heading', { name: /unsubscribe from newsletter/i })).toBeVisible();

    // 4. Verify the confirmation prompt shows the correct email
    await expect(page.getByText(email)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/are you sure you want to unsubscribe/i)).toBeVisible();

    // 5. Click the "Confirm Unsubscribe" button
    const confirmButton = page.getByRole('button', { name: /confirm unsubscribe/i });
    await expect(confirmButton).toBeVisible();
    await confirmButton.click();

    // 6. Verify success message appears
    await expect(page.getByText(/successfully unsubscribed/i)).toBeVisible({ timeout: 10000 });

    // 7. Verify the "Return to Home" button appears
    const returnButton = page.getByRole('button', { name: /return to home/i });
    await expect(returnButton).toBeVisible();

    // 8. Verify that trying to use the same token again shows an error
    await page.goto(`${frontendServer.url}/subscriptions/unsubscribe?subscription_token=${token}`);
    await expect(page.getByText(/invalid or expired/i)).toBeVisible({ timeout: 10000 });
  });

  test('shows error for missing token', async ({ page, frontendServer }) => {
    // Navigate to unsubscribe page without a token
    await page.goto(`${frontendServer.url}/subscriptions/unsubscribe`);

    // Verify error message appears
    await expect(page.getByRole('heading', { name: /unsubscribe/i })).toBeVisible();
    await expect(page.getByText(/no subscription token provided/i)).toBeVisible({ timeout: 5000 });
  });

  test('shows error for invalid token', async ({ page, frontendServer }) => {
    // Navigate with an invalid token
    await page.goto(`${frontendServer.url}/subscriptions/unsubscribe?subscription_token=definitely-invalid-token`);

    // Verify heading is shown
    await expect(page.getByRole('heading', { name: /unsubscribe/i })).toBeVisible();

    // Verify error message for invalid token
    await expect(page.getByText(/invalid or expired/i)).toBeVisible({ timeout: 10000 });
  });

  test('cancel button navigates to home', async ({ page, backendApp, frontendServer }) => {
    const email = 'cancel-test@example.com';
    const name = 'Cancel Test';

    // Create a confirmed subscriber
    const token = await makeConfirmedSubscriber(backendApp.address, email, name);

    // Navigate to unsubscribe page
    await page.goto(`${frontendServer.url}/subscriptions/unsubscribe?subscription_token=${token}`);

    // Wait for the confirmation prompt to load
    await expect(page.getByText(email)).toBeVisible({ timeout: 10000 });

    // Click the Cancel button
    const cancelButton = page.getByRole('button', { name: /cancel/i });
    await expect(cancelButton).toBeVisible();
    await cancelButton.click();

    // Verify we're redirected to home page
    await expect(page).toHaveURL(`${frontendServer.url}/`);
  });
});
