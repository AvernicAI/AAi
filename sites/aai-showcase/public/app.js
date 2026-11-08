const workspace = {
  ide: {
    label: "EXPLORER",
    items: ["▾ orbit-studio", "　▾ src", "　　◈ workspace.ts", "　▾ assets", "　　◇ desktop-ide.png", "　≡ README.md"],
    active: 2,
    main: `<p class="demo-path">src / workspace.ts</p><pre class="demo-code"><span class="syntax-comment">// Start where your ideas are.</span>
<span class="syntax-purple">export const</span> workspace = {
  name: <span class="syntax-green">"Orbit Studio"</span>,
  tools: [<span class="syntax-green">"editor"</span>, <span class="syntax-green">"terminal"</span>],
  context: <span class="syntax-green">"current project"</span>,
}

<span class="syntax-comment">// Send a selection to your agent.</span></pre>`,
    side: `<p class="demo-label">SESSION / CODE REVIEW</p><div class="demo-bubble">Can you review this workspace setup?</div><p>The IDE can attach a code selection to the session so the agent can reason about the exact lines you’re editing.</p><span class="demo-pill">◈ workspace.ts · selected context</span>`,
    description:
      "Edit with Monaco, preview images in the editor pane, review Git changes, and bring project files into chat.",
  },
  agent: {
    label: "SESSIONS",
    items: ["▾ orbit-studio", "　✧ Add a preview", "　◌ Review changes", "　◌ Fix the tests"],
    active: 1,
    main: `<p class="demo-path">orbit-studio / Add a preview</p><h3 class="demo-title">Work with your project in view.</h3><div class="demo-bubble">Build a preview page for this project and check the result.</div><p>AlphaAi can read the project, propose changes, and use the tools permitted in your session.</p><span class="demo-pill">↳ Attach files · Queue a prompt · Steer the session</span>`,
    side: `<p class="demo-label">SESSION CONTEXT</p><div class="demo-result">✓ Project attached</div><ul class="demo-list"><li>Choose a model</li><li>Review tool requests</li><li>Inspect changes and outputs</li></ul>`,
    description:
      "Open project sessions, choose your provider and model, attach context, and queue or steer follow-up prompts.",
  },
  browser: {
    label: "WORKSPACE PANELS",
    items: ["✧ Session", "◎ Browser", "⌘ IDE", "▸ Terminal"],
    active: 1,
    main: `<p class="demo-path">BROWSER / PROJECT PREVIEW</p><span class="demo-url">◎ localhost:3000 / preview</span><div class="demo-page"><p class="eyebrow">ORBIT STUDIO</p><h3 class="demo-title">A little room to experiment.</h3><p>Preview your project beside the session working on it.</p></div>`,
    side: `<p class="demo-label">BROWSER CONTEXT</p><ul class="demo-list"><li>Research with /browse</li><li>Pick an element to discuss</li><li>Inspect accessible page structure</li><li>Open additional tabs</li></ul>`,
    description:
      "Browse, research, and inspect project previews from the session. Point your agent at a page or a specific element.",
  },
  create: {
    label: "CREATION TOOLS",
    items: ["◇ Ultima3D", "◉ Blender bridge", "⬡ Godot bridge", "▤ Office artifacts"],
    active: 0,
    main: `<p class="demo-path">ULTIMA3D / ILLUSTRATIVE ASSET</p><svg class="demo-cube" viewBox="0 0 300 200" role="img" aria-label="Illustration of a wireframe 3D cube"><path d="M27 149 150 96 274 149 150 193z M55 137l124 45m-96-57 124 46m-95-59 122 47M245 137l-124 45m96-57-124 46m95-59-122 47" fill="none" stroke="currentColor" opacity=".25"/><path d="m150 18 68 34v74l-68 36-68-36V52Z" fill="currentColor" fill-opacity=".09" stroke="currentColor" stroke-width="2"/><path d="m82 52 68 36 68-36m-68 36v74m0-144v72m-68 36 68-36 68 36" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M82 52l68 110 68-110M82 126l68-108 68 108" fill="none" stroke="currentColor" opacity=".46"/></svg>`,
    side: `<p class="demo-label">ASSET WORKFLOW</p><div class="demo-result">◇ Procedural asset</div><ul class="demo-list"><li>Generate and inspect</li><li>Render and validate</li><li>Export as GLB</li><li>Connect live editors with add-ons</li></ul>`,
    description:
      "Build procedural 3D assets with Ultima3D, connect creative apps, and work with document, spreadsheet, or presentation artifacts.",
  },
}

const features = [
  [
    "build",
    "⌘",
    "Integrated IDE",
    "DESKTOP",
    "Open a local workspace in Monaco. Edit code, preview images in the same pane, switch SVGs to source, search the project, and send selections to chat.",
  ],
  [
    "build",
    "✧",
    "AI project sessions",
    "BUILT IN",
    "Keep conversations and project work together. Attach files and context, queue follow-up prompts, steer a running session, and return to your history.",
  ],
  [
    "build",
    "⎇",
    "Git and change review",
    "BUILT IN",
    "Review workspace changes and diffs. Stage, unstage, and commit from the IDE’s source control panel.",
  ],
  [
    "build",
    "TS",
    "Language intelligence",
    "IDE",
    "Use JavaScript and TypeScript editor intelligence, or connect installed language servers for diagnostics, completion, definitions, and references.",
  ],
  [
    "build",
    "⊙",
    "Run and debug",
    "IDE",
    "Configure a compatible Debug Adapter Protocol adapter to launch or attach, set breakpoints, inspect variables, and step through code.",
  ],
  [
    "build",
    ">_",
    "Integrated terminals",
    "DESKTOP",
    "Run commands and inspect output alongside your code and session.",
  ],
  [
    "build",
    "◎",
    "Browser and research",
    "DESKTOP",
    "Use browser tabs, /browse research, file previews, page interaction, and the element picker without leaving the session.",
  ],
  [
    "build",
    "↗",
    "Workspace access",
    "DESKTOP",
    "Work with local projects and available SSH or WSL workspace connections. Pair devices where supported.",
  ],
  [
    "build",
    "▤",
    "Files and artifacts",
    "BUILT IN",
    "Inspect files and outputs, review changes, and follow sources from the workspace panels.",
  ],
  [
    "build",
    "◎",
    "Session goals",
    "BUILT IN",
    "Track the session’s goal and pause, resume, or clear it as the work changes.",
  ],
  [
    "build",
    "?",
    "Side questions",
    "BUILT IN",
    "Use /btw for a one-shot answer without adding the question to the main conversation.",
  ],
  [
    "connect",
    "≋",
    "Provider and model choice",
    "CONFIGURABLE",
    "Connect supported providers or add a compatible Chat Completions or Responses endpoint. Choose a model by capability, provider, or task.",
  ],
  [
    "connect",
    "◌",
    "Free LLM API presets",
    "15 PRESETS",
    "Start with a keyless route from Kilo Code, LLM7.io, or OVHcloud. See model use cases, input types, tool support, limits, and billing requirements in Settings.",
  ],
  [
    "connect",
    "V",
    "Vyce Code",
    "PROVIDER",
    "Open Popular providers, connect Vyce Code, and choose from the models available to your account.",
  ],
  [
    "connect",
    "⌕",
    "Local capability discovery",
    "BUILT IN",
    "Rank relevant skills and tools on-device before the first primary model request, without a separate discovery model call.",
  ],
  [
    "connect",
    "{}",
    "Code Mode",
    "BUILT IN",
    "Work from a compact tool catalog and load detailed tool signatures only when needed.",
  ],
  [
    "connect",
    "⎇",
    "MCP extensions",
    "CONFIGURABLE",
    "Connect local and remote Model Context Protocol servers, import configuration, and manage which tools are enabled.",
  ],
  [
    "connect",
    "⇄",
    "Desktop MCP discovery",
    "EXPERIMENTAL",
    "Use the authenticated desktop-hosted MCP endpoint to discover capabilities. Agent tool execution stays in sessions.",
  ],
  [
    "connect",
    "C↗",
    "Convio project workflows",
    "API KEY",
    "Connect your Convio key, choose individual tools, and use guided project stages, skill discovery, and review checklists.",
  ],
  [
    "connect",
    "◇",
    "Skills library",
    "BUILT IN",
    "Browse SkillMD and additional catalogs in the AAi Library. Review instructions, install skills, and enable the workflows that fit your project.",
  ],
  [
    "connect",
    "+",
    "Community plugins",
    "LIBRARY",
    "Discover npm plugins, review version and permission information, and manage installed plugins from your library.",
  ],
  [
    "connect",
    "P↓",
    "Pullstack skills",
    "INCLUDED",
    "Compare repositories or artifacts, check licenses, and plan updates. Artifact extraction needs Docker and gVisor on Linux.",
  ],
  [
    "connect",
    "r_",
    "REA reverse engineering",
    "PRESET",
    "Connect REA’s MCP server for app, binary, or JavaScript inspection with the supported runtime and engines.",
  ],
  [
    "create",
    "◇",
    "Ultima3D asset workflows",
    "BUNDLED",
    "Generate procedural assets, inspect and validate output, and export GLB using the included host. Connect Blender or Godot for live workflows.",
  ],
  [
    "create",
    "B◉",
    "MCP for Blender",
    "PRESET",
    "Connect to a live Blender scene using the upstream add-on and uv. Ultima3D also supports its own live Blender and Godot bridges.",
  ],
  [
    "create",
    "m✦",
    "Merlin web workspace",
    "IN DEVELOPMENT",
    "The desktop web workspace for Merlin is in development. Account plans and available models are managed by Merlin.",
  ],
  [
    "create",
    "▤",
    "Office previews",
    "DESKTOP",
    "Preview Office documents, spreadsheets, and presentations alongside your session.",
  ],
  [
    "create",
    "↖",
    "Desktop control",
    "WINDOWS",
    "Use /control-mouse for permitted mouse, keyboard, and screenshot actions in a local interactive Windows session.",
  ],
  [
    "personalize",
    "☼",
    "Themes and backgrounds",
    "DESKTOP",
    "Choose dark or light mode, theme colors, and backgrounds such as Ember, Aurora, and Blueprint. Import or export themes and add your own artwork.",
  ],
  [
    "personalize",
    "≡",
    "Developer prompts",
    "LIBRARY",
    "Start from prompt templates, edit your own prompts, and import or export your collection.",
  ],
  [
    "personalize",
    "✓",
    "Permissions and approvals",
    "BUILT IN",
    "Control agent tool access, review permission requests, and enable only the capabilities you want available.",
  ],
  [
    "personalize",
    "◫",
    "Context configuration",
    "DESKTOP",
    "Save reusable instructions and project background, toggle context per prompt, and configure context limits and compaction.",
  ],
  [
    "personalize",
    "∴",
    "Developer diagnostics",
    "DESKTOP",
    "Inspect provider, MCP, model, and skill status. Copy a redacted summary when troubleshooting.",
  ],
  [
    "personalize",
    "↻",
    "Desktop updates",
    "DESKTOP",
    "Check for desktop updates from the app. Available builds depend on your release channel.",
  ],
]

const tabs = [...document.querySelectorAll("[data-workspace]")]
const workspacePanel = document.querySelector("#workspace-panel")

function showWorkspace(tab, focus = false, image = false) {
  const item = workspace[tab.dataset.workspace]
  const ide = item === workspace.ide
  const fileTabs = ide
    ? `<div class="demo-file-tabs" role="group" aria-label="Open IDE files"><button data-ide-file="code" aria-pressed="${!image}">workspace.ts</button><button data-ide-file="image" aria-pressed="${image}">desktop-ide.png</button></div>`
    : ""
  const content = image
    ? `<figure class="demo-image"><img src="assets/desktop-ide.png" width="1280" height="800" alt="AlphaAi desktop with its editor, file explorer, and chat side by side"><figcaption>desktop-ide.png · Actual desktop capture</figcaption></figure>`
    : item.main
  for (const button of tabs) {
    button.setAttribute("aria-selected", String(button === tab))
    button.tabIndex = button === tab ? 0 : -1
  }
  workspacePanel.setAttribute("aria-labelledby", tab.id)
  const tree = item.items
    .map((label, index) => {
      const current = index === (image ? 4 : item.active)
      const file =
        ide && index === 4 ? `<button data-ide-file="image" aria-pressed="${image}">${label.trim()}</button>` : label
      return `<li${current ? ' class="current"' : ""}>${file}</li>`
    })
    .join("")
  workspacePanel.innerHTML = `<div class="demo"><aside class="demo-sidebar"><p class="demo-label">${item.label}</p><ul class="demo-tree">${tree}</ul></aside><div class="demo-main">${fileTabs}${content}</div><aside class="demo-side">${item.side}</aside></div>`
  document.querySelector("#tour-description").textContent = item.description
  if (focus) tab.focus()
}

workspacePanel.addEventListener("click", (event) => {
  const file = event.target.closest("[data-ide-file]")
  if (!file) return
  showWorkspace(tabs[0], false, file.dataset.ideFile === "image")
  workspacePanel.querySelector(`.demo-file-tabs [data-ide-file="${file.dataset.ideFile}"]`).focus()
})

for (const tab of tabs) {
  tab.addEventListener("click", () => showWorkspace(tab))
  tab.addEventListener("keydown", (event) => {
    const index = tabs.indexOf(tab)
    const target = {
      ArrowRight: (index + 1) % tabs.length,
      ArrowLeft: (index + tabs.length - 1) % tabs.length,
      Home: 0,
      End: tabs.length - 1,
    }[event.key]
    if (target === undefined) return
    event.preventDefault()
    showWorkspace(tabs[target], true)
  })
}
showWorkspace(tabs[0])

const modelRoutes = {
  code: {
    provider: "Kilo Code / Free route",
    name: "North Mini Code",
    id: "cohere/north-mini-code:free",
    description: "Use it to generate or explain code, review a focused patch, and ask for a test plan. This route supports tool calls.",
    tags: ["No API key", "Text", "Tool calling"],
    note: "Anonymous traffic shares an IP quota. Model and router availability can change.",
  },
  vision: {
    provider: "OVHcloud / Free route",
    name: "Qwen3.5 397B",
    id: "Qwen3.5-397B-A17B",
    description: "Attach a screenshot or diagram and ask about layout, errors, or visual details. This route accepts image inputs.",
    tags: ["No API key", "Text + images", "Tool calling off"],
    note: "Anonymous access has a per-IP, per-model request limit.",
  },
  reasoning: {
    provider: "NVIDIA NIM / Free allowance",
    name: "Nemotron 3 Ultra",
    id: "nvidia/nemotron-3-ultra-550b-a55b",
    description: "Compare architectural options, sketch a migration, or break a complex problem into steps.",
    tags: ["API key required", "Text", "Tool calling off"],
    note: "Developer Program access and model quotas apply.",
  },
  chat: {
    provider: "LLM7.io / Free route",
    name: "Mistral Nemo Instruct",
    id: "mistral-Nemo-Instruct-2407",
    description: "Use a text route for short summaries, rewriting, and everyday questions.",
    tags: ["Optional API key", "Text", "Tool calling off"],
    note: "A free token raises limits on the same models. Check the provider’s current quotas.",
  },
}
const taskButtons = [...document.querySelectorAll("[data-model-task]")]
const routeProvider = document.querySelector("#route-provider")
const routeTitle = document.querySelector("#route-title")
const routeID = document.querySelector("#route-id")
const routeDescription = document.querySelector("#route-description")
const routeTags = document.querySelector("#route-tags")
const routeNote = document.querySelector("#route-note")

for (const button of taskButtons) {
  button.addEventListener("click", () => {
    if (button.getAttribute("aria-pressed") === "true") return

    const route = modelRoutes[button.dataset.modelTask]
    for (const task of taskButtons) task.setAttribute("aria-pressed", String(task === button))
    routeProvider.textContent = route.provider
    routeTitle.textContent = route.name
    routeID.textContent = route.id
    routeDescription.textContent = route.description
    routeTags.replaceChildren(...route.tags.map((tag) => {
      const item = document.createElement("li")
      item.textContent = tag
      return item
    }))
    routeNote.textContent = route.note
  })
}

const cards = features.map(([category, icon, title, status, description]) => {
  const card = document.createElement("details")
  card.className = "feature-card"
  card.innerHTML = `<summary><span class="feature-icon" aria-hidden="true"></span><span><strong></strong><span class="tag"></span></span></summary><p></p>`
  card.querySelector(".feature-icon").textContent = icon
  card.querySelector("strong").textContent = title
  card.querySelector(".tag").textContent = status
  card.querySelector("p").textContent = description
  return { card, category, search: `${title} ${status} ${description}`.toLowerCase() }
})
document.querySelector("#feature-catalog").append(...cards.map((entry) => entry.card))
const filters = [...document.querySelectorAll("[data-filter]")]
const search = document.querySelector("#feature-search")

function updateCatalog() {
  const filter = filters.find((button) => button.getAttribute("aria-pressed") === "true").dataset.filter
  const terms = search.value.trim().toLowerCase().split(/\s+/)
  const results = cards.filter((entry) => {
    const visible =
      (filter === "all" || entry.category === filter) && terms.every((term) => entry.search.includes(term))
    entry.card.hidden = !visible
    return visible
  })
  document.querySelector("#catalog-count").textContent = `${results.length} of ${cards.length} capabilities`
  document.querySelector("#empty-results").hidden = results.length > 0
}

for (const filter of filters)
  filter.addEventListener("click", () => {
    for (const button of filters) button.setAttribute("aria-pressed", String(button === filter))
    updateCatalog()
  })
search.addEventListener("input", updateCatalog)
updateCatalog()

const themeToggle = document.querySelector("#theme-toggle")
const appearanceToggle = document.querySelector("#appearance-toggle")
const themeKey = "aai-showcase-theme"

function setTheme(theme) {
  const next = theme === "light" ? "dark" : "light"
  document.documentElement.dataset.theme = theme
  themeToggle.textContent = next === "light" ? "☼" : "☾"
  themeToggle.setAttribute("aria-label", `Switch to ${next} theme`)
  appearanceToggle.textContent = `Try the ${next} theme ${themeToggle.textContent}`
  document.querySelector('meta[name="theme-color"]').content = theme === "light" ? "#fff6ec" : "#100c0c"
}

try {
  setTheme(localStorage.getItem(themeKey) === "light" ? "light" : "dark")
} catch {
  setTheme("dark")
}
for (const button of [themeToggle, appearanceToggle])
  button.addEventListener("click", () => {
    const theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark"
    setTheme(theme)
    try {
      localStorage.setItem(themeKey, theme)
    } catch {
      // The current theme still works when browser storage is unavailable.
    }
  })

const menu = document.querySelector(".menu-toggle")
const nav = document.querySelector("#navigation")
function setMenu(open) {
  menu.setAttribute("aria-expanded", String(open))
  menu.setAttribute("aria-label", open ? "Close navigation" : "Open navigation")
  menu.textContent = open ? "×" : "☰"
  nav.dataset.open = String(open)
}
menu.addEventListener("click", () => setMenu(menu.getAttribute("aria-expanded") !== "true"))
nav.addEventListener("click", (event) => {
  if (event.target.closest("a")) setMenu(false)
})
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape" || menu.getAttribute("aria-expanded") !== "true") return
  setMenu(false)
  menu.focus()
})

const dialog = document.querySelector("#screenshot-dialog")
const screenshots = {
  appearance: [
    "AlphaAi desktop appearance",
    "assets/desktop-appearance.png",
    "AlphaAi desktop settings showing Aurora, Ember, Blueprint, and default backgrounds",
  ],
}
for (const link of document.querySelectorAll("[data-screenshot]"))
  link.addEventListener("click", (event) => {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    if (link.dataset.screenshot === "ide") {
      showWorkspace(tabs[0], false, true)
      workspacePanel.querySelector('.demo-file-tabs [data-ide-file="image"]').focus({ preventScroll: true })
      document.querySelector("#workspace").scrollIntoView()
      return
    }
    const [title, src, alt] = screenshots.appearance
    document.querySelector("#screenshot-title").textContent = title
    const screenshot = document.querySelector("#screenshot-image")
    screenshot.src = src
    screenshot.alt = alt
    dialog.showModal()
  })
document.querySelector("#close-dialog").addEventListener("click", () => dialog.close())
