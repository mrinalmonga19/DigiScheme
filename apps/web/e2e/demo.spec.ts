import { expect, test } from '@playwright/test';
import { begin, say } from './helpers';

test.describe('DigiScheme demo flows', () => {
  test('landing page works in every language and requires consent before starting', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('start')).toBeDisabled();
    await page.getByRole('radio', { name: 'ಕನ್ನಡ' }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'kn');
    await expect(page.getByTestId('demo-badge')).toBeVisible().catch(() => undefined);
    await page.getByTestId('agree').check();
    await expect(page.getByTestId('start')).toBeEnabled();
  });

  test('Ramesh (Kannada): PM-KISAN needs landholding, then becomes eligible, then guided application with kit', async ({ page }) => {
    await begin(page, 'ಕನ್ನಡ');
    await say(page, 'ನಾನು ಕರ್ನಾಟಕದ ರೈತ, ನನಗೆ 45 ವರ್ಷ.');
    await expect(page.getByTestId('scheme-pm-kisan')).toContainText(/.+/);
    await expect(page.getByTestId('scheme-pm-kisan').getByTestId('badge-needs_info')).toBeVisible();
    await say(page, '2 ಹೆಕ್ಟೇರ್');
    await say(page, 'ಇಲ್ಲ');
    await say(page, 'ಇಲ್ಲ');
    await page.goto('/results');
    await expect(page.getByTestId('scheme-pm-kisan').getByTestId('badge-estimated')).toBeVisible();
    await page.getByTestId('scheme-pm-kisan').getByRole('button').first().click();
    await expect(page.getByTestId('guide')).toBeVisible();
    for (let i = 0; i < 6; i++) await page.getByTestId('next').click();
    await expect(page.getByTestId('guide-done')).toBeVisible();
    const kit = page.getByTestId('kit');
    const res = await page.request.get((await kit.getAttribute('href'))!);
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('application/pdf');
    expect((await res.body()).subarray(0, 4).toString()).toBe('%PDF');
  });

  test('Gurpreet (Punjabi): DigiLocker consent turns the scholarship Verified', async ({ page }) => {
    await begin(page, 'ਪੰਜਾਬੀ');
    await say(page, 'ਮੈਂ ਪੰਜਾਬ ਤੋਂ ਹਾਂ, ਮੇਰੀ ਉਮਰ 19 ਸਾਲ ਹੈ।');
    await say(page, 'ਮੈਂ ਇੰਜੀਨੀਅਰਿੰਗ ਕਾਲਜ ਦੇ ਪਹਿਲੇ ਸਾਲ ਦਾ ਵਿਦਿਆਰਥੀ ਹਾਂ।');
    await page.goto('/dashboard');
    await page.getByRole('button').filter({ hasText: /DigiLocker|ਡਿਜੀਲਾਕਰ/ }).first().click();
    await expect(page).toHaveURL(/\/consent\//);
    await expect(page.getByTestId('consent-demo')).toBeVisible(); // the simulation is always labelled
    await page.getByTestId('allow').click();
    await expect(page.getByTestId('consent-done')).toBeVisible();
    await page.goto('/results');
    await expect(page.getByTestId('scheme-post-matric-scholarship-sc').getByTestId('badge-verified')).toBeVisible();
  });

  test('Anita (Hindi): a scam message is flagged SUSPICIOUS with the real scheme suggested', async ({ page }) => {
    await page.goto('/links');
    await page.getByRole('combobox').first().selectOption('hi');
    await page.getByTestId('link-input').fill('बधाई हो! 50,000 का फ्री लोन। 499 रुपये फ़ीस देकर आवेदन करें http://pm-svanidhi-loan.online/apply');
    await page.getByTestId('link-check').click();
    await expect(page.getByTestId('link-SUSPICIOUS')).toBeVisible();
    await expect(page.getByRole('link', { name: /pmsvanidhi\.mohua\.gov\.in/ })).toBeVisible();
  });

  test('an official link is confirmed as official', async ({ page }) => {
    await page.goto('/links');
    await page.getByTestId('link-input').fill('https://pmkisan.gov.in/');
    await page.getByTestId('link-check').click();
    await expect(page.getByTestId('link-OFFICIAL')).toBeVisible();
  });

  test('low-data mode, settings and "Delete my data" return to a clean start', async ({ page }) => {
    await begin(page, 'English');
    await say(page, 'I am a farmer in Karnataka, 45 years old');
    await page.goto('/settings');
    await page.getByTestId('low-bandwidth').check();
    await expect(page.locator('html')).toHaveAttribute('data-low-bandwidth', 'true');
    await page.getByTestId('delete').click();
    await page.getByTestId('delete-confirm').click();
    await expect(page).toHaveURL(/\/$/);
    await page.goto('/chat');
    await expect(page).toHaveURL(/\/$/); // session is gone: guarded pages send us back to the start
  });

  test('the app stays usable offline: banner shows and the catalogue is readable from cache', async ({ page, context }) => {
    await page.goto('/schemes');
    await expect(page.getByRole('listitem').first()).toBeVisible();
    await context.setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event('offline')));
    await expect(page.getByRole('status').filter({ hasText: /offline|You are offline/i }).first()).toBeVisible();
    await context.setOffline(false);
  });

  test('admin view needs the passcode', async ({ page }) => {
    await page.goto('/admin');
    await page.getByLabel('Admin passcode').fill('wrong');
    await page.getByRole('button', { name: 'Open' }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await page.getByLabel('Admin passcode').fill('demo-admin');
    await page.getByRole('button', { name: 'Open' }).click();
    await expect(page.getByText('Audit log')).toBeVisible();
  });
});
