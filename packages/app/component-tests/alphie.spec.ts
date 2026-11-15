import { expect, sourceURL, story } from "../../stories/playwright/story"

const modules = {
  fixture: sourceURL(new URL("../../gui-plugins/src/alphie/alphie.fixture.tsx", import.meta.url)),
  host: sourceURL(new URL("./plugin-host.fixture.tsx", import.meta.url)),
}

story(
  "Alphie follows real tool state, reveals edits, opens original command output and persists the hide toggle",
  async ({ page, mount }) => {
    await mount("ui-line-comment--editor", { globals: { theme: "dark" } })

    const fixture = await page.evaluateHandle(async (modules) => {
      const [{ createAlphieFixture }, { mountPlugins }] = await Promise.all([
        import(modules.fixture),
        import(modules.host),
      ])

      const fixture = createAlphieFixture()
      const host = mountPlugins({ definitions: fixture.entries, sessions: fixture.sessions, screen: fixture.screen })
      host.release()

      return { fixture, host }
    }, modules)

    const mate = page.getByLabel("Alphie", { exact: true })
    await expect(mate).toHaveAttribute("data-pose", "idle")
    await fixture.evaluate(({ fixture }) => fixture.run("write"))
    await expect(mate).toHaveAttribute("data-pose", "typing")
    await expect(page.getByTestId("shared-state")).toHaveText("typing")
    await fixture.evaluate(({ fixture }) => fixture.run("write", "completed"))
    await expect.poll(() => fixture.evaluate(({ fixture }) => fixture.revealed)).toEqual(["hello.js"])
    await fixture.evaluate(({ fixture }) => fixture.run("shell"))
    await expect(mate).toHaveAttribute("data-pose", "lifting")
    await expect.poll(() => fixture.evaluate(({ fixture }) => fixture.opened)).toContain("terminal")
    await fixture.evaluate(({ fixture }) => fixture.nested("write"))
    await expect(mate).toHaveAttribute("data-pose", "typing")
    await fixture.evaluate(({ fixture }) => fixture.nested("write", "completed"))
    await expect.poll(() => fixture.evaluate(({ fixture }) => fixture.revealed)).toEqual(["hello.js", "nested.js"])
    await fixture.evaluate(({ fixture }) => fixture.nested("shell"))
    await expect(mate).toHaveAttribute("data-pose", "lifting")
    await fixture.evaluate(({ fixture }) => fixture.finish("failed"))
    await expect(mate).toHaveAttribute("data-pose", "lifting")
    await expect(mate).toContainText("Needs attention")
    await fixture.evaluate(({ fixture }) => {
      fixture.run("shell")
      fixture.failedCommand()
      fixture.finish("succeeded")
    })
    await expect(mate).toContainText("Needs attention")
    await expect(mate).toHaveAttribute("data-pose", "lifting")
    await fixture.evaluate(({ fixture }) => fixture.run("shell"))
    await fixture.evaluate(({ fixture }) => fixture.finish("succeeded"))
    await expect(mate).toHaveAttribute("data-pose", "cheering")
    await expect(page.getByTestId("shared-state")).toHaveText("cheering")
    await expect(mate).toHaveAttribute("data-pose", "idle", { timeout: 5000 })
    await mate.locator("button.alphie-sprite").click({ button: "right" })
    await mate.getByRole("button", { name: "Hide Alphie", exact: true }).click()
    await expect(mate).toHaveCount(0)
    await expect
      .poll(() => fixture.evaluate(({ host }) => host.saved()["plugin.alphie.preferences"]?.features.alphieMate))
      .toBe(false)
    await fixture.evaluate(({ host }) => host.reload("alphie"))
    await expect(mate).toHaveCount(0)
  },
)
