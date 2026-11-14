import { expect, type Page } from '@playwright/test';

/** Pick a language on the landing page, agree to the notice and start. */
export async function begin(page: Page, languageNative: string): Promise<void> {
  await page.goto('/');
  await page.getByRole('radio', { name: languageNative }).click();
  await page.getByTestId('agree').check();
  await page.getByTestId('start').click();
  await expect(page).toHaveURL(/\/chat$/);
  await expect(page.getByTestId('msg-assistant')).toHaveCount(1); // the welcome message has rendered
}

export async function say(page: Page, text: string): Promise<void> {
  const before = await page.getByTestId('msg-assistant').count();
  await page.getByTestId('chat-input').fill(text);
  await page.getByTestId('send').click();
  await expect(page.getByTestId('msg-assistant')).toHaveCount(before + 1);
}
