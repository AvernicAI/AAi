import { expect, sourceURL, story } from "../../stories/playwright/story"

const modules = {
  fixture: sourceURL(new URL("../../gui-plugins/src/ide/panel.fixture.tsx", import.meta.url)),
  host: sourceURL(new URL("./plugin-host.fixture.tsx", import.meta.url)),
}

type Handle = {
  text(): string | undefined
  attached: readonly string[]
  preferences(): { minimap: boolean; wordWrap: boolean; fontSize: number }
  reload(): void
  runs(): readonly string[]
  invoked(): readonly string[]
  disableTerminal(): void
}

story(
  "IDE quick open reaches collapsed folders, commands update preferences, and edits save and attach",
  async ({ page, mount }) => {
    page.on("pageerror", (error) => console.error(error.message))
    await mount("ui-line-comment--editor", { globals: { theme: "dark" } })

    const host = await page.evaluateHandle(async (modules: { fixture: string; host: string }): Promise<Handle> => {
      const [{ createIdeFixture }, { mountPlugins }] = await Promise.all([
        import(modules.fixture),
        import(modules.host),
      ])

      const data = createIdeFixture()

      const host = mountPlugins({
        definitions: [data.entry],
        desktop: data.desktop,
        ipc: () => data.client,
        commands: data.commands,
      })

      host.container.style.cssText = "position:fixed;inset:0;z-index:100;background:var(--background-base)"
      host.release()

      return {
        text: () => data.document("src/main.ts"),
        attached: data.attached,
        preferences: () => host.saved()["plugin.ide.preferences"],
        reload: () => host.reload("ide"),
        runs: () => data.runs,
        invoked: data.invoked,
        disableTerminal: data.disableTerminal,
      }
    }, modules)

    const workspace = page
      .getByLabel("IDE workspace", { exact: true })
      .filter({ has: page.getByRole("navigation", { name: "Workspace tools" }) })

    const explorer = workspace.getByRole("complementary", { name: "Explorer", exact: true })
    await expect(explorer.getByRole("button", { name: "src", exact: true })).toHaveAttribute("aria-expanded", "false")
    await workspace.getByRole("button", { name: "Quick open files", exact: true }).click()
    const files = page.getByRole("dialog", { name: "Quick open files", exact: true })
    await files.getByRole("combobox").fill("main:3:2")
    await expect(files.getByRole("option")).toHaveText("src/main.ts")
    await files.getByRole("combobox").press("Enter")
    await expect(files).toBeHidden()
    await expect(workspace.getByRole("tab", { name: "main.ts", exact: true })).toHaveAttribute("aria-selected", "true")
    await expect(workspace.getByText("Ln 3, Col 2", { exact: true })).toBeVisible()
    await page.keyboard.press("Control+p")
    await files.getByRole("combobox").fill("README")
    await expect(files.getByRole("option")).toHaveText("README.md")
    await files.getByRole("combobox").press("Escape")
    await expect(files).toBeHidden()
    await expect(workspace.getByRole("tab", { name: "main.ts", exact: true })).toHaveAttribute("aria-selected", "true")
    await workspace.getByRole("button", { name: "Toggle sidebar", exact: true }).click()
    await expect(explorer).toBeHidden()
    await workspace.getByRole("button", { name: "Explorer", exact: true }).click()
    await expect(explorer).toBeVisible()
    await page.keyboard.press("Control+Shift+p")
    const commands = page.getByRole("dialog", { name: "Workspace commands", exact: true })
    await commands.getByRole("combobox").fill("Toggle minimap")
    await commands.getByRole("combobox").press("Enter")
    await workspace.getByRole("button", { name: "Language servers", exact: true }).click()
    await expect(workspace.getByLabel("Show minimap", { exact: true })).not.toBeChecked()
    await workspace.getByLabel("Wrap long lines", { exact: true }).check()
    await workspace.getByLabel("Editor font size", { exact: true }).fill("16")
    await workspace.getByLabel("Editor font size", { exact: true }).press("Tab")
    await workspace.locator(".monaco-editor .view-lines").click()
    await page.keyboard.press("Control+End")
    await page.keyboard.press("Enter")
    await page.keyboard.insertText("// edited in AAi")
    await page.keyboard.press("Control+s")
    await expect(workspace.getByText("Saved", { exact: true })).toBeVisible()
    await workspace.getByRole("button", { name: "Add selection to AI chat", exact: true }).click()

    const saved = await host.evaluate((host) => ({
      text: host.text(),
      attached: host.attached,
      preferences: host.preferences(),
    }))

    expect(saved.text).toContain("// edited in AAi")
    expect(saved.attached).toEqual(["src/main.ts"])
    expect(saved.preferences).toMatchObject({ minimap: false, wordWrap: true, fontSize: 16 })
    await workspace.locator(".monaco-editor .view-lines").click()
    await page.keyboard.press("Control+End")
    await page.keyboard.press("Enter")
    await page.keyboard.insertText('const broken: number = "wrong"')
    await workspace.getByRole("button", { name: "Build and tasks", exact: true }).click()
    const tasks = workspace.getByRole("region", { name: "Task runner", exact: true })
    await tasks.getByRole("combobox", { name: "Project script" }).selectOption("npm run test")
    await expect(tasks.getByRole("textbox", { name: "Shell command" })).toHaveValue("npm run test")
    await tasks.getByRole("button", { name: "Run task", exact: true }).click()
    await expect(tasks.getByRole("log", { name: "Task output" })).toContainText("Project checks passed")
    expect(await host.evaluate((host) => host.runs())).toEqual([
      expect.stringContaining('const broken: number = "wrong"'),
    ])
    await workspace.getByRole("button", { name: /\d+ Problems/, exact: true }).click()
    // Monaco starts its TypeScript diagnostic worker on this first semantic check.
    await expect(workspace.getByRole("region", { name: "Problems", exact: true })).toContainText(
      "not assignable to type 'number'",
      { timeout: 20000 },
    )
    await workspace.getByRole("button", { name: "Source control", exact: true }).click()
    await workspace.getByRole("button", { name: "Show diff", exact: true }).click()
    const comparison = workspace.getByRole("region", { name: "Compare src/main.ts", exact: true })
    await expect(comparison.locator(".monaco-diff-editor")).toBeVisible()
    await comparison.getByRole("button", { name: "Staged vs HEAD", exact: true }).click()
    await expect(comparison.locator(".modified .view-lines")).toContainText("43")
    await comparison.getByRole("button", { name: "Close", exact: true }).click()
    await host.evaluate((host) => host.reload())
    await expect(workspace.getByRole("tab", { name: "main.ts", exact: true })).toHaveAttribute("aria-selected", "true")
    await expect(workspace.locator(".monaco-editor .view-lines")).toContainText('"wrong"')
    await workspace.getByRole("main").getByRole("button", { name: "Open terminal", exact: true }).click()
    expect(await host.evaluate((host) => host.invoked())).toEqual(["terminal.toggle"])
    await host.evaluate((host) => host.disableTerminal())
    await workspace.getByRole("main").getByRole("button", { name: "Open terminal", exact: true }).click()
    await expect(workspace.getByRole("alert")).toContainText("Terminal is unavailable")
    await page.setViewportSize({ width: 640, height: 720 })
    await expect(workspace.getByRole("tab", { name: "main.ts", exact: true })).toBeVisible()
  },
)
