import { expect, test } from "@playwright/test"
import { NO_PROVIDER } from "../utils/app"
import { openSettings } from "../utils/workspace"

test("custom backgrounds retain their fit and visibility after reload", async ({ page }) => {
  const { settings } = await openSettings(page, { name: "Background", provider: NO_PROVIDER, sessions: [] })
  await settings.getByRole("tab", { name: "Appearance", exact: true }).click()
  await settings.locator('input[type="file"][accept*="image/webp"]').setInputFiles({
    name: "background.png",
    mimeType: "image/png",
    buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==", "base64"),
  })
  const image = page.locator('img[aria-hidden="true"][src^="data:image/png"]')
  await expect(image).toBeVisible()
  await settings.getByLabel("Background image fit").selectOption("contain")
  await expect(image).toHaveCSS("object-fit", "contain")
  await settings.getByLabel("Show background").uncheck()
  await expect(image).toHaveCount(0)
  await settings.getByLabel("Show background").check()
  await page.reload()
  await expect(image).toHaveCSS("object-fit", "contain")
})
