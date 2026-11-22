import { expect, story } from "../../stories/playwright/story"

story("AI workspace actions share one keyboard-accessible titlebar menu", async ({ mount, page }) => {
  await mount("app-titlebar-items--workspaces")
  const menu = page.getByRole("button", { name: "AI workspaces" })
  await expect(menu).toHaveCount(1)
  await expect(page.getByRole("button", { name: "Update available" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Devin" })).toHaveCount(0)
  await menu.focus()
  await page.keyboard.press("Enter")
  await expect(page.getByRole("menuitem", { name: "Gemini" })).toBeVisible()
  await page.getByRole("menuitem", { name: "Devin" }).click()
  await expect(page.locator("output")).toHaveText("Devin")
  await expect(page.getByRole("menu")).toBeHidden()
})
