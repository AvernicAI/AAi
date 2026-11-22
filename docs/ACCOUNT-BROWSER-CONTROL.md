# Alphie and agent access to signed-in AI workspaces

Meta AI, DeepAI, Orlon, Gemini, Ace AI and Chat-Box AI now contribute their existing saved desktop account sessions to the built-in browser tools. This is the Orlon integration previously added from orlon.org; it is not a separate Orion service.

Any tool-capable model or agent with browser permission, including Alphie, can use the existing browser skill. The session must be open in AAi desktop so its browser attachment is available. There is no second agent loop, duplicate editor, API-key conversion, cookie export, or undocumented service API.

## Agent workflow

1. Load the browser skill and call `browser.accounts({})`.
2. Call `browser.tabs.open({ account: "deepai" })`, `"meta-ai"`, `"orlon"`, or `"gemini"` using an ID actually returned by the tool. The browser opens or reuses that account's tab in the current session. Repeating this call without a URL preserves the current page.
3. Snapshot the page. If signed out, the user signs in directly on the website. Signing in through the existing workspace or account browser uses the same persistent Electron session partition. A system-browser sign-in remains separate.
4. Use snapshots and real element refs to choose an available model, send chat messages, generate images/video/music/3D where offered, upload files, edit images, or use other visible site controls. Wait for and inspect the real outcome before reporting success.
5. Use `files.list` after clicking a download. `files.get` transfers up to 5 MiB to the connected server. `files.save` opens desktop Save As for larger completed assets. Downloads are retained up to 250 MiB; uploads remain limited to 5 MiB per call. A desktop save path need not exist on a remote server.

The service controls features, model access, credits, entitlements and generation availability. Agents must stop at purchase, quota, CAPTCHA or account-verification gates. This change enables interaction with real site controls; it does not promise that every provider offers every media capability or that a plan allows every generation. Microphone requests from supported service origins show a desktop confirmation; camera/screen capture are not granted automatically.

## Architecture

- Each owning integration contributes a `BrowserAccount` registry entry from its main setup. The browser reads the live registry; its host contains no provider IDs or credentials.
- `browser.accounts` returns public ID/title/home URL only. The desktop-only registry owns the partition names.
- `tabs.open({account})` reuses that partition and labels tab metadata with its account ID, including restoration and popup inheritance. Ordinary tabs retain their isolated session partitions.
- Account pages use the desktop network, preserving the service's normal signed-in browser behavior. Ordinary browser pages continue using the connected-server proxy. Opening an account page never changes the shared partition's proxy or replaces its microphone permission handler.
- Browser tools continue through the existing permission/inspection flow. Saved downloads remain tab-owned; larger assets do not enter model context or bypass the 5 MiB RPC byte-transfer cap.
- Settings sidebar duplication was caused by rendering the same client/plugin group twice. The repeated group was removed; the separate Servers entry and About groups remain. Orlon's titlebar contribution also receives its own unique ID.

## Verification

Run `bun run check` from the root, `bun test` from `packages/plugin-browser`, focused browser/provider tests from `packages/gui-plugins`, and the built-in plugin independence component test from `packages/app`.

The native Chromium fixture exercises the production page driver against a local test page, including saved-session reuse, snapshot/fill/click, ordinary-tab isolation and a download larger than the agent transfer limit. The packaged desktop check asserts one Settings tab per provider. Signed-in third-party generation, billing entitlements, microphone hardware and CAPTCHA flows require the user's account and are not simulated as provider success.

## Gemini

The Gemini titlebar item, settings page, command and session panel open https://gemini.google.com/app in its own saved `persist:aai-gemini` session. Google’s site provides the current model selector, chats, image/video tools, research and Canvas as available to the account. AAi agents access that session with the same browser account tools. The existing Google/Gemini API provider and keys remain unchanged. Google can restrict embedded sign-in; AAi does not bypass those restrictions or import a system-browser login.

References: [Google Gemini Apps help](https://support.google.com/gemini/answer/13275745?hl=en), [Google AI plan management](https://support.google.com/gemini/answer/14517446).

## Chat-Box AI and Ace AI

Chat-Box AI opens the requested https://chat-box.ai/app web app in `persist:aai-chat-box`, including its live model menus, chat and account controls. Its verified public frontend references admin.chat-box.ai for service traffic. No relation to similarly named Chatbox applications or their APIs is assumed. Agents open it with the returned `chat-box` account ID.

Ace AI opens the user-supplied **https://app.ace.ai/chat_ai** in `persist:aai-ace-ai`; agents use the `ace-ai` account ID. Public unauthenticated HTML still carried the **Get Ace Browser** title during verification, so compatibility and authenticated model availability must be checked on the actual page. The agent skill reports a download/client restriction if present rather than inventing model access or installing another browser automatically. The root download page is no longer the account entry.

Each service has one settings page and its own sign-in data. Clearing a service’s session does not clear other providers. As with the other account integrations, a fallback system-browser login is separate from AAi.
