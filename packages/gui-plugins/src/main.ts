import { compose } from "@opencode/plugin/gui/host"
import context from "./context"
import btw from "./btw"
import debug from "./debug"
import terminal from "./terminal"
import file from "./file"
import review from "./review"
import details from "./details"
import browser from "./browser"
import pairing from "./pairing"
import updater from "./updater"
import ssh from "./ssh"
import wsl from "./wsl"
import microsoftOffice from "./microsoft-office"
import sources from "./sources"
import goal from "./goal"
import ide from "./ide"
import backgrounds from "./backgrounds"
import skills from "./skills"
import merlin from "./merlin"
import orlon from "./orlon"
import metaAI from "./meta-ai"
import fireworks from "./fireworks"
import deepai from "./deepai"
import gemini from "./gemini"
import devin from "./devin"
import antigravity from "./antigravity"
import googleAIStudio from "./google-ai-studio"
import ace from "./ace-ai"
import chatBox from "./chat-box"
import alphie from "./alphie"

/** Built-in plugins with their main entries, by id. Lists every built-in so their ids stay reserved. */
export const builtins = compose({
  alphie: { ...alphie, mainEntry: () => import("./alphie/main") },
  merlin: { ...merlin, mainEntry: () => import("./merlin/main") },
  orlon: { ...orlon, mainEntry: () => import("./orlon/main") },
  "meta-ai": { ...metaAI, mainEntry: () => import("./meta-ai/main") },
  fireworks: { ...fireworks, mainEntry: () => import("./fireworks/main") },
  deepai: { ...deepai, mainEntry: () => import("./deepai/main") },
  gemini: { ...gemini, mainEntry: () => import("./gemini/main") },
  devin: { ...devin, mainEntry: () => import("./devin/main") },
  antigravity: { ...antigravity, mainEntry: () => import("./antigravity/main") },
  "google-ai-studio": { ...googleAIStudio, mainEntry: () => import("./google-ai-studio/main") },
  "ace-ai": { ...ace, mainEntry: () => import("./ace-ai/main") },
  "chat-box": { ...chatBox, mainEntry: () => import("./chat-box/main") },
  ide: { ...ide, mainEntry: () => import("./ide/main") },
  backgrounds,
  skills: { ...skills, mainEntry: () => import("./skills/main") },
  context,
  btw,
  debug: { ...debug, mainEntry: () => import("./debug/main") },
  terminal,
  file,
  review,
  details,
  browser: { ...browser, mainEntry: () => import("./browser/main") },
  pairing: { ...pairing, mainEntry: () => import("./pairing/main") },
  updater: { ...updater, mainEntry: () => import("./updater/main") },
  ssh: { ...ssh, mainEntry: () => import("./ssh/main") },
  wsl: { ...wsl, mainEntry: () => import("./wsl/main") },
  "microsoft-office": microsoftOffice,
  sources,
  goal,
})
