# Fireworks AI in AlphaAi

This extends the existing desktop, provider catalog, agent terminal and settings. Other providers and their saved credentials are preserved.

## Connect and use models

1. Open **Settings → Providers → Connect provider → Playground → Fireworks AI**.
2. **Sign in to Fireworks** opens its official account login in your browser. The **Fireworks AI** workspace also has an isolated console and login, using Fireworks' own Google/GitHub/LinkedIn/email/SSO flows. If an identity provider rejects embedded browsers, use the system-browser button.
3. Create a key on Fireworks' API keys page and enter it in the existing AAi connection form, or set `FIREWORKS_API_KEY` on the AAi server.
4. Select a Fireworks model from the ordinary model picker. Fireworks groups carry a **Playground** badge in the model picker and model settings.
5. Open **Fireworks AI → API & training → Refresh native models** to discover the live public catalog. Enter your Fireworks account ID first to also include your own serverless models and READY deployments whose default model is a chat model or LoRA. The selected catalog account persists on the server. Non-default adapters and inactive deployments are not advertised as runnable models.

Signing into a website does not issue AAi an inference API credential. This implementation does not invent a third-party OAuth client, read browser cookies into the backend, or use the playground's private network APIs. The console has its own `persist:aai-fireworks` Chromium partition, sandbox and context isolation, with no Node integration or AAi preload. **Clear Fireworks console sign-in** clears only that partition, retaining the native API connection.

Existing models.dev/configured models keep their routes and prices. Live additions report the API's tool, image and context capabilities; tools are disabled when the catalog does not advertise them. No model IDs from screenshots are hardcoded. Serverless inference uses `https://api.fireworks.ai/inference/v1`; default dedicated deployments use their documented `accounts/<account>/deployments/<deployment>` inference identifiers. Model availability and pricing remain subject to the connected account.

## Train a model

1. Open a local project chat session. Connect a Fireworks API key with training permission.
2. Install Python 3.11+ and the documented, pinned SDK/cookbook in the Python environment used by the AAi server:

   ```powershell
   python -m pip install "fireworks-ai[training]==1.2.31" "fireworks-training-cookbook==2026.11.5.1"
   ```

3. Prepare a local chat JSONL dataset, one JSON object per line, containing `messages` with at least one assistant response. Paths may be relative to the project or absolute on the server. Dataset content is sent to Fireworks only when training runs.
4. In **Fireworks AI → API & training**, configure the dataset, base model, matching tokenizer/renderer, unique output model ID, epochs, batch size, sequence length, learning rate and LoRA rank. Muse Glimmer 30B defaults are prefilled.
5. Choose **Review training run**, inspect the exact configuration, then **Launch reviewed run**. A server-side Python command appears in the existing agent terminal. The generated, reusable script and recipe outputs appear under `.aai/fireworks/<run-id>/`. The key is passed in the child process environment; it is absent from the script and command text. Re-running the saved script manually requires setting `FIREWORKS_API_KEY` yourself.
6. Watch the original terminal for errors, loss/progress and completion. The recipe saves final/resumable checkpoints, promotes the final adapter to the chosen output model ID, and closes its shared training session on exit. Abrupt process termination may require checking Fireworks for cleanup. This is an ordinary server shell execution; it can outlive the workspace panel and be stopped from AAi's existing terminal controls.
7. Deploy the resulting model using the Fireworks console, then refresh your account's native model catalog. Training and serving availability are separate: a successful fine-tune does not imply free inference or an active serving deployment.

The launcher validates JSONL before importing the SDK or opening a remote training session. It calls the official `training.recipes.sft_loop` with `serverless=True`, LoRA, checkpointing, no generation evaluation and `tokenizer_trust_remote_code=False`. SFT supports the UI above; the console and linked official guides expose DPO/RL/dedicated workflows. Those workflows are not launched by this SFT form.

## Current platform limits

Verified against official documentation on November 16, 2026:

- [Muse Glimmer promotion](https://docs.fireworks.ai/fine-tuning/training-api/cookbook/muse-glimmer): LoRA SFT jobs started before **December 1, 2026, 08:00 UTC** qualify. The launcher checks that deadline and exact base model. Other models and later runs require the explicit **Allow paid training outside the promotion** checkbox. Regular inference, deployments, DPO/RL and evaluation sampling are not represented as free.
- [Batch API status](https://docs.fireworks.ai/guides/batch-inference): new jobs and dataset uploads are paused by Fireworks. AAi displays that status and links to the preemptible deployment migration guide; it does not expose a submission button that would fail or silently switch billing modes.
- [Training migration](https://docs.fireworks.ai/fine-tuning/migrate-from-managed-training): managed SFT/DPO no longer accepts new jobs. AAi uses the current Serverless Training SDK rather than retired create-job endpoints.
- [Official training cookbook](https://docs.fireworks.ai/fine-tuning/training-api/cookbook/overview) documents the pinned versions and recipe parameters.
- [Text inference](https://docs.fireworks.ai/guides/querying-text-models) documents serverless and deployment inference identifiers.

The API workspace can inspect model, deployment, dataset and quota metadata for an account, including pagination tokens. Deployment provisioning, billing administration and other platform actions remain in the real Fireworks console. No provisioning, dataset upload, inference charge or real training job is part of the automated verification.

## Implementation map

- `packages/schema/src/fireworks.ts`: experimental, typed plugin RPC and bounded training parameters. No public HttpApi endpoint changes or generated client edits.
- `packages/core/src/plugin/provider/fireworks.ts`: existing-credential resolution, paginated live/account discovery, metadata inventory and training launch through the existing Shell service.
- `packages/core/src/plugin/provider/fireworks-training.ts`: reusable Python recipe launcher, dataset validation and promotion guard.
- `packages/core/src/plugin/provider.ts`: registers the provider enhancement.
- `packages/gui-plugins/src/fireworks/`: isolated console, toolbar/sidebar/settings contribution, native API/training form, lifecycle machines, translations and navigation policy.
- `packages/gui-plugins/src/{main,renderer}.ts` and README: built-in registration and source-matched guide.
- `packages/app/src/providers/{catalog/order.ts,connect/dialog.tsx,models/provider-group.tsx}`: discoverability, official account login link and Playground grouping.
- `packages/app/src/runtime/i18n/en.ts`: application strings; other locales fall back to English.
- `packages/util/src/provider-pricing.ts`: Fireworks inference is classified as paid, independent of its limited SFT promotion.
- Core and GUI contract tests cover pagination, account deployment routes, credentials, capability flags, real Python preflight guards, navigation and stale completions. The shared core test graph includes the real Shell service used by the training integration.

## Build and verify

Use the repository's Windows build workflow (`build.bat`) for a complete CLI, embedded web client, desktop and installer build. Run `bun run check` at the root; run focused tests from their package directories. The release notes/checksum manifest in `artifacts/` identifies the exact built version.
