// Packaged acceptance test. Everything uses a private profile, workspace and loopback test model.
const fs = require("node:fs")
const path = require("node:path")
const http = require("node:http")
const { execFileSync } = require("node:child_process")
const { createRequire } = require("node:module")
const { _electron, expect } = createRequire(path.resolve(__dirname, "../../app/package.json"))("@playwright/test")
const root = path.resolve(__dirname, "../../..")
const profile = fs.mkdtempSync(path.join(root, "node_modules/.cache/alphie-native-"))
const project = path.join(profile, "project")
const config = path.join(profile, "config/opencode")
const registration = path.join(profile, ".local/state/opencode/service.json")
const temp = path.join(profile, "AppData/Local/Temp")
const gates = { shell: Promise.withResolvers(), finish: Promise.withResolvers() }
const requests = []
const phases = []
const prompt = "Create hello.js that prints Hello Alphie and run it"

async function main() {
  for (const directory of [project, config, temp, path.join(profile, "desktop")])
    fs.mkdirSync(directory, { recursive: true })
  fs.writeFileSync(
    path.join(profile, "desktop/opencode.settings"),
    JSON.stringify({ firstLaunchOnboardingComplete: true }),
  )
  execFileSync("git", ["init", "-q", project], { windowsHide: true, stdio: "ignore" })
  fs.writeFileSync(path.join(project, "README.md"), "# Alphie acceptance workspace\n")
  fs.writeFileSync(path.join(project, "diagnostics.ts"), 'const broken: number = "wrong"\n')
  execFileSync("git", ["-C", project, "add", "README.md"], { windowsHide: true, stdio: "ignore" })
  execFileSync(
    "git",
    [
      "-C",
      project,
      "-c",
      "user.name=Alphie Test",
      "-c",
      "user.email=alphie@example.invalid",
      "commit",
      "-qm",
      "fixture",
    ],
    { windowsHide: true, stdio: "ignore" },
  )
  let primary = 0
  const model = http.createServer(async (req, res) => {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    if (!req.url.endsWith("/chat/completions")) {
      res.writeHead(404)
      res.end()
      return
    }
    const body = JSON.parse(Buffer.concat(chunks).toString())
    requests.push(body)
    const isPrimary = body.tools?.some((tool) => tool.function?.name === "execute")
    const phase = isPrimary ? primary++ : -1
    phases.push(phase)
    if (phase === 2) await gates.shell.promise
    if (phase === 3) await gates.finish.promise
    const todos =
      phase === 0
        ? [
            { content: "Create hello.js", status: "in_progress" },
            { content: "Run and verify Hello Alphie", status: "pending" },
          ]
        : [
            { content: "Create hello.js", status: "completed" },
            { content: "Run and verify Hello Alphie", status: "completed" },
          ]
    const call =
      phase === 0 || phase === 3
        ? { name: "todowrite", input: { todos } }
        : phase === 1
          ? {
              name: "write",
              input: {
                path: path.join(project, "hello.js"),
                content: 'console.log("Hello Alphie")',
              },
            }
          : phase === 2
            ? {
                name: "shell",
                input: {
                  command: "node hello.js",
                  workdir: project,
                },
              }
            : undefined
    const text =
      phase === -1
        ? "Hello Alphie verification"
        : phase === 0
          ? "We got this! I’ll create the file, run it, and verify the output."
          : phase >= 4
            ? "Hello Alphie printed successfully. Let’s ship it!"
            : ""
    const delta = call
      ? {
          role: "assistant",
          ...(text ? { content: text } : {}),
          tool_calls: [
            {
              index: 0,
              id: `call_${phase}`,
              type: "function",
              function: { name: call.name, arguments: JSON.stringify(call.input) },
            },
          ],
        }
      : { role: "assistant", content: text }
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" })
    const frame = (delta, reason) => ({
      id: `chatcmpl_alphie_${phase}`,
      object: "chat.completion.chunk",
      created: Math.floor(Date.now() / 1000),
      model: "local",
      choices: [{ index: 0, delta, finish_reason: reason }],
    })
    res.write(`data: ${JSON.stringify(frame(delta, null))}\n\n`)
    res.write(`data: ${JSON.stringify(frame({}, call ? "tool_calls" : "stop"))}\n\n`)
    res.end("data: [DONE]\n\n")
  })
  await new Promise((resolve) => model.listen(0, "127.0.0.1", resolve))
  fs.writeFileSync(
    path.join(config, "opencode.jsonc"),
    JSON.stringify({
      model: "alphie-smoke/local",
      shell: "powershell.exe",
      permissions: [{ action: "*", resource: "*", effect: "allow" }],
      providers: {
        "alphie-smoke": {
          name: "Local Alphie test model",
          package: "@opencode/ai/providers/openai-compatible",
          settings: { baseURL: `http://127.0.0.1:${model.address().port}/v1`, apiKey: "local-test-only" },
          models: {
            local: {
              name: "Local Alphie verification",
              capabilities: { tools: true, input: ["text"], output: ["text"] },
              limit: { context: 131072, output: 8192 },
            },
          },
        },
      },
    }),
  )
  const portProbe = http.createServer()
  await new Promise((resolve) => portProbe.listen(0, "127.0.0.1", resolve))
  const servicePort = portProbe.address().port
  await new Promise((resolve) => portProbe.close(resolve))
  fs.writeFileSync(path.join(config, "service.json"), JSON.stringify({ port: servicePort, hostname: "127.0.0.1" }))
  const env = {
    ...Object.fromEntries(
      Object.entries(process.env).filter(
        ([key]) =>
          !/^(OPENCODE_|OTEL_|SENTRY_|ELECTRON_RUN_AS_NODE)|API_?KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL/i.test(key),
      ),
    ),
    HOME: profile,
    USERPROFILE: profile,
    OPENCODE_TEST_HOME: profile,
    XDG_CONFIG_HOME: path.join(profile, "config"),
    XDG_DATA_HOME: path.join(profile, ".local/share"),
    XDG_STATE_HOME: path.join(profile, ".local/state"),
    XDG_CACHE_HOME: path.join(profile, ".cache"),
    APPDATA: path.join(profile, "AppData/Roaming"),
    LOCALAPPDATA: path.join(profile, "AppData/Local"),
    TEMP: temp,
    TMP: temp,
    OPENCODE_DESKTOP_TEST_ROOT: profile,
    OPENCODE_DESKTOP_DISABLE_PROTOCOL_REGISTRATION: "1",
    OPENCODE_DB: path.join(profile, "data/opencode.db"),
    OPENCODE_CONFIG_DIR: config,
  }
  let app
  let page
  try {
    app = await _electron.launch({
      executablePath: path.join(root, "packages/desktop/dist/win-unpacked/AAi Dev.exe"),
      args: ["--disable-gpu"],
      env,
      timeout: 120000,
    })
    page = await app.firstWindow({ timeout: 120000 })
    if (process.env.ALPHIE_EXPECT_VERSION)
      expect(await app.evaluate(({ app }) => app.getVersion())).toBe(process.env.ALPHIE_EXPECT_VERSION)
    page.on("pageerror", (error) => console.error("RENDERER", error.message))
    await expect.poll(() => fs.existsSync(registration), { timeout: 120000 }).toBe(true)
    const service = JSON.parse(fs.readFileSync(registration, "utf8"))
    if (process.env.ALPHIE_EXPECT_VERSION) expect(service.version).toBe(process.env.ALPHIE_EXPECT_VERSION)
    const headers = {
      authorization: "Basic " + Buffer.from("opencode:" + service.password).toString("base64"),
      "content-type": "application/json",
    }
    const response = await fetch(new URL("/api/session", service.url), {
      method: "POST",
      headers,
      body: JSON.stringify({ location: { directory: project }, title: "Alphie acceptance" }),
    })
    if (!response.ok) throw new Error("Session creation: " + response.status + " " + (await response.text()))
    const session = (await response.json()).data
    await expect(page.getByRole("button", { name: "AAi menu", exact: true })).toBeVisible({ timeout: 120000 })
    const entryStarted = performance.now()
    await page.getByRole("button", { name: "Home", exact: true }).click()
    await page
      .getByRole("region", { name: "Recent sessions", exact: true })
      .getByRole("button", { name: /Alphie acceptance/ })
      .click({ timeout: 120000 })
    const editor = page.locator('[data-component="composer-editor"]')
    await expect(editor).toBeEditable({ timeout: 120000 })
    console.log("SESSION_ENTRY_MS", Math.round(performance.now() - entryStarted))
    await expect
      .poll(() => app.windows().find((window) => window.url().includes("alphie.html")), { timeout: 60000 })
      .toBeTruthy()
    const mate = app.windows().find((window) => window.url().includes("alphie.html"))
    // Observe in-page: the 650 ms file-navigation pose can finish before a cross-window query returns.
    const poses = await mate.evaluateHandle(() => {
      const values = []
      const element = document.querySelector(".alphie-mate")
      const observer = new MutationObserver((records) => {
        records.forEach((record) => values.push(record.oldValue))
        values.push(element.getAttribute("data-pose"))
      })
      observer.observe(element, { attributes: true, attributeFilter: ["data-pose"], attributeOldValue: true })
      return { values }
    })
    await expect(mate.getByLabel("Alphie", { exact: true })).toHaveAttribute("data-pose", "idle")
    expect(await mate.locator(".alphie-sprite img").evaluate((img) => img.complete && img.naturalWidth > 0)).toBe(true)
    console.log("PASS transparent native companion, isolated profile, real sprite and preload MessagePort")
    const bubble = await mate.locator(".alphie-bubble").evaluate((element) => getComputedStyle(element).backgroundColor)
    expect(
      Math.max(
        ...bubble
          .match(/[\d.]+/g)
          .slice(0, 3)
          .map(Number),
      ),
    ).toBeLessThan(180)
    console.log("PASS native companion follows the default dark theme")
    await mate.locator(".alphie-sprite").click()
    await expect(mate.getByLabel("Alphie", { exact: true })).toHaveAttribute("data-pose", "wave")
    await editor.fill(prompt)
    await editor.press("Enter")
    await expect.poll(() => phases.includes(2), { timeout: 120000 }).toBe(true)
    expect(fs.readFileSync(path.join(project, "hello.js"), "utf8")).toContain('console.log("Hello Alphie")')
    await expect(page.locator(".aai-ide").getByRole("tab", { name: "hello.js", exact: true })).toHaveAttribute(
      "aria-selected",
      "true",
      { timeout: 60000 },
    )
    await expect(page.locator(".aai-ide .monaco-editor .view-lines")).toContainText("Hello Alphie")
    if (!process.env.ALPHIE_SMOKE_BASELINE) {
      const plan = page.locator('[data-component="session-todo-pill"]')
      await expect(plan).toBeVisible()
      await plan.getByRole("button").click()
      await expect(page.locator('[data-slot="session-todo-panel"]')).toContainText("Create hello.js")
      await expect(page.locator('[data-slot="session-todo-panel"]')).toContainText("Run and verify Hello Alphie")
      await page.keyboard.press("Escape")
      console.log("PASS existing live chat checklist is visible by default")
    }
    expect(
      requests.some((request) =>
        request.messages.some(
          (message) => message.role === "system" && JSON.stringify(message.content).includes("You are Alphie"),
        ),
      ),
    ).toBe(true)
    console.log(
      "PASS original agent loop, additive persona, live task checklist, real file write and existing editor tab",
    )
    const explorer = page.locator(".aai-ide").getByRole("complementary", { name: "Explorer", exact: true })
    await poses.evaluate((state) => (state.values.length = 0))
    await explorer.getByRole("button", { name: "Quick open files", exact: true }).click()
    const picker = page.getByRole("dialog", { name: "Quick open files", exact: true })
    await picker.getByRole("combobox").fill("README.md")
    await expect(picker.getByRole("option")).toHaveText("README.md")
    await picker.getByRole("combobox").press("Enter")
    await expect(picker).toBeHidden()
    await expect.poll(() => poses.evaluate((state) => state.values.includes("walk"))).toBe(true)
    await explorer.getByRole("button", { name: "Quick open files", exact: true }).click()
    await picker.getByRole("combobox").fill("hello.js")
    await expect(picker.getByRole("option")).toHaveText("hello.js")
    await picker.getByRole("combobox").press("Enter")
    await expect(picker).toBeHidden()
    console.log("PASS existing editor file switches drive the shared walking pose")
    await page.screenshot({ path: path.join(root, "artifacts/Alphie-native-IDE.png") })
    gates.shell.resolve()
    await expect.poll(() => phases.includes(3), { timeout: 120000 }).toBe(true)
    const commands = page.getByRole("region", { name: "Alphie commands", exact: true })
    await expect(commands).toContainText("Hello Alphie", { timeout: 60000 })
    await expect(mate.getByLabel("Alphie", { exact: true })).toHaveAttribute("data-pose", "lifting")
    expect(
      await mate
        .locator(".alphie-sprite img")
        .evaluate((img) => img.currentSrc.endsWith("alphie_lifting_transparent.gif") && img.naturalWidth === 720),
    ).toBe(true)
    await mate.screenshot({ path: path.join(root, "artifacts/Alphie-native-mate.png"), omitBackground: true })
    console.log("PASS original shell execution and live output in existing Terminal; animated transparent GIF")
    gates.finish.resolve()
    await expect(mate.getByLabel("Alphie", { exact: true })).toHaveAttribute("data-pose", "cheering", {
      timeout: 60000,
    })
    await expect(page.getByText("Task complete", { exact: true })).toBeVisible()
    await expect(mate.getByLabel("Alphie", { exact: true })).toHaveAttribute("data-pose", "idle", { timeout: 8000 })
    if (!process.env.ALPHIE_SMOKE_BASELINE) {
      await page.getByRole("tab", { name: "IDE", exact: true }).click()
      const workspace = page.locator(".aai-ide")
      await workspace.getByRole("button", { name: "Build and tasks", exact: true }).click()
      const tasks = workspace.getByRole("region", { name: "Task runner", exact: true })
      await tasks.getByRole("textbox", { name: "Shell command" }).fill("node hello.js")
      await tasks.getByRole("button", { name: "Run task", exact: true }).click()
      await expect(tasks.getByRole("status")).toContainText("Completed", { timeout: 60000 })
      await expect(mate.getByLabel("Alphie", { exact: true })).toHaveAttribute("data-pose", "cheering", {
        timeout: 10000,
      })
      await expect(mate.getByLabel("Alphie", { exact: true })).toHaveAttribute("data-pose", "idle", { timeout: 8000 })
      console.log("PASS real IDE task completion updates Alphie and releases the running state")
      await explorer.getByRole("button", { name: "Quick open files", exact: true }).click()
      await picker.getByRole("combobox").fill("diagnostics.ts")
      await expect(picker.getByRole("option")).toHaveText("diagnostics.ts")
      await picker.getByRole("combobox").press("Enter")
      await expect(picker).toBeHidden()
      await workspace.getByRole("button", { name: /\d+ Problems/, exact: true }).click()
      await expect(workspace.getByRole("region", { name: "Problems", exact: true })).toContainText(
        "not assignable to type 'number'",
        { timeout: 60000 },
      )
      console.log("PASS packaged Monaco TypeScript worker populates the existing Problems panel")
    }
    await mate.locator(".alphie-sprite").click({ button: "right" })
    await mate.getByRole("button", { name: "Settings", exact: true }).click()
    await page.getByRole("tab", { name: "Desktop", exact: true }).click()
    await page.locator('[data-action="settings-close-behavior"]').click()
    await page.getByRole("option", { name: "Keep running in the tray", exact: true }).click()
    const mainWindow = await app.browserWindow(page)
    await mainWindow.evaluate((window) => window.close())
    expect(await mainWindow.evaluate((window) => window.isVisible())).toBe(false)
    await mate.locator(".alphie-sprite").click()
    await expect.poll(() => mainWindow.evaluate((window) => window.isVisible())).toBe(true)
    await page.locator('[data-action="settings-close-behavior"]').click()
    await page.getByRole("option", { name: "Quit AAi", exact: true }).click()
    console.log("PASS native Desktop settings, close-to-tray and companion restore share the same app window")
    if (process.env.ALPHIE_VERIFY_PAID_ONLY) {
      await page.getByRole("tab", { name: "Providers", exact: true }).click()
      const provider = page.locator(".settings-provider-row").filter({ hasText: "FreeBuff (Paid API)" })
      await expect(provider).toBeVisible()
      await provider.getByRole("button", { name: "Connect", exact: true }).click()
      await expect(page.locator('[data-input="provider-api-key"]')).toBeVisible()
      await expect(page.getByRole("button", { name: /sign in.*freebuff/i })).toHaveCount(0)
      await page.keyboard.press("Escape")
      console.log("PASS packaged FreeBuff connection offers the paid API key form without browser sign-in")
    }
    await mate.locator(".alphie-sprite").click({ button: "right" })
    await mate.getByRole("button", { name: "Hide Alphie", exact: true }).click()
    await expect.poll(() => app.windows().filter((window) => window.url().includes("alphie.html")).length).toBe(0)
    console.log("PASS confirmed success, two-second cheer, shared completion and native companion cleanup")
    console.log("PROFILE", profile)
  } catch (error) {
    if (page) await page.screenshot({ path: path.join(profile, "failure.png") }).catch(() => {})
    fs.writeFileSync(path.join(profile, "model-requests.json"), JSON.stringify(requests, null, 2))
    console.error("PROFILE", profile, "PHASES", phases)
    throw error
  } finally {
    gates.shell.resolve()
    gates.finish.resolve()
    model.closeAllConnections()
    model.close()
    if (app) app.process().kill()
    if (fs.existsSync(registration)) {
      const service = JSON.parse(fs.readFileSync(registration, "utf8"))
      try {
        execFileSync("taskkill", ["/PID", String(service.pid), "/F", "/T"], { windowsHide: true, stdio: "ignore" })
      } catch {}
    }
    if (app) await app.close().catch(() => {})
  }
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
