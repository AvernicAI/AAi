# DeepAI in AlphaAi

DeepAI is integrated into the existing desktop plugin system. Open **DeepAI** from the titlebar, the session panel menu, the command palette, or Settings → DeepAI. The desktop embeds the real DeepAI workspace, rather than a copied model list or a second app.

Choose **Sign in to DeepAI**, then **Login** on DeepAI’s page. Account authentication happens on DeepAI’s site. AAi does not extract credentials or turn a website session into an undocumented model API token. **Open in browser** is a fallback with its own browser session; browser login is not transferred into the desktop.

## Available tools

- **Chat & models:** DeepAI’s live model selector, chat history, account features, attachments, and chat presets.
- **Images:** model, quality, style, and image generation controls.
- **Video**, **Music**, **Photo editor**, and **Voice chat**.
- **All tools:** DeepAI’s current directory, including background removal, colorization, super resolution, website builder, and other tools.
- **Account & API key**, **Plan & allowances**, and **API documentation**.

DeepAI controls which models and capabilities the account can use, including upgrades, regional availability, allowances, and usage billing. AAi does not hardcode entitlement claims or bypass plan gates. New models available in DeepAI’s model selector appear through the hosted page without an AAi catalog update.

The native AAi agent model picker is unchanged. DeepAI documents media APIs authenticated with an API key, not an OpenAI-compatible chat API or a third-party OAuth client flow. Those API endpoints are not represented as fake native chat models. This integration uses the complete hosted workspace; it does not add a native media API connector or merge DeepAI chat history into AAi sessions.

## Desktop behavior

The embedded browser uses its own persistent `persist:aai-deepai` partition, sandboxing, context isolation, no Node integration, and no AAi preload bridge. Files can be uploaded through DeepAI’s native file picker and downloads use native Save As. Voice chat requests microphone permission through a desktop confirmation; camera and unrelated permissions are denied. Operating-system permission or DeepAI browser restrictions can still prevent audio access.

**Clear DeepAI sign-in** asks for confirmation and clears only this workspace’s site data, not the system browser or other AAi providers. DeepAI sign-in popups remain inside the same isolated partition. The reload action retains the current tool page.

## Verification

1. Launch the rebuilt desktop and choose DeepAI.
2. Sign in on DeepAI’s page using your existing account.
3. Open Chat & models and compare the available models with the same account on DeepAI.
4. Open Images, Video, Music, and Photo editor; verify the account’s plan controls and history.
5. Open Voice chat, request audio, and approve microphone access only if desired.
6. Download a generated asset using Save As.
7. Clear DeepAI sign-in and confirm other providers stay connected.

Automated policy/lifecycle tests cover destinations, navigation isolation, stale completions, retries, and disposal. Account-specific model availability, purchases, real generations, and microphone hardware require the user’s signed-in account and are not claimed as automatically verified.

Sources: [DeepAI tools](https://deepai.org/), [chat](https://deepai.org/chat), [API documentation](https://deepai.org/docs), [pricing and allowances](https://deepai.org/pricing).
