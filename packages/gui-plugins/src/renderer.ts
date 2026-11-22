import { compose, type Entry } from "@opencode/plugin/gui/host"
import context from "./context"
import contextRenderer from "./context/renderer"
import btw from "./btw"
import btwRenderer from "./btw/renderer"
import debug from "./debug"
import debugRenderer from "./debug/renderer"
import terminal from "./terminal"
import terminalRenderer from "./terminal/renderer"
import file from "./file"
import fileRenderer from "./file/renderer"
import review from "./review"
import reviewRenderer from "./review/renderer"
import details from "./details"
import detailsRenderer from "./details/renderer"
import browser from "./browser"
import browserRenderer from "./browser/renderer"
import pairing from "./pairing"
import pairingRenderer from "./pairing/renderer"
import updater from "./updater"
import updaterRenderer from "./updater/renderer"
import ssh from "./ssh"
import sshRenderer from "./ssh/renderer"
import wsl from "./wsl"
import wslRenderer from "./wsl/renderer"
import microsoftOffice from "./microsoft-office"
import microsoftOfficeRenderer from "./microsoft-office/renderer"
import sources from "./sources"
import sourcesRenderer from "./sources/renderer"
import goal from "./goal"
import goalRenderer from "./goal/renderer"
import ide from "./ide"
import ideRenderer from "./ide/renderer"
import backgrounds from "./backgrounds"
import backgroundsRenderer from "./backgrounds/renderer"
import skills from "./skills"
import skillsRenderer from "./skills/renderer"
import merlin from "./merlin"
import merlinRenderer from "./merlin/renderer"
import orlon from "./orlon"
import orlonRenderer from "./orlon/renderer"
import metaAI from "./meta-ai"
import fireworks from "./fireworks"
import deepai from "./deepai"
import gemini from "./gemini"
import devin from "./devin"
import antigravity from "./antigravity"
import googleAIStudio from "./google-ai-studio"
import ace from "./ace-ai"
import chatBox from "./chat-box"
import metaAIRenderer from "./meta-ai/renderer"
import fireworksRenderer from "./fireworks/renderer"
import deepaiRenderer from "./deepai/renderer"
import geminiRenderer from "./gemini/renderer"
import devinRenderer from "./devin/renderer"
import antigravityRenderer from "./antigravity/renderer"
import googleAIStudioRenderer from "./google-ai-studio/renderer"
import aceRenderer from "./ace-ai/renderer"
import chatBoxRenderer from "./chat-box/renderer"
import alphie from "./alphie"
import alphieRenderer from "./alphie/renderer"

// The window renders once every built-in is active, so the small renderer entries load with the app, like the
// features they replaced. Heavy UI stays behind `lazy()` inside them.
const eager = (setup: Awaited<ReturnType<NonNullable<Entry["windowEntry"]>>>["default"]) => () =>
  Promise.resolve({ default: setup })

/** Built-in plugins with their window entries, by id. The only place host builds name built-ins. */
export const builtins = compose({
  alphie: { ...alphie, windowEntry: eager(alphieRenderer) },
  merlin: { ...merlin, windowEntry: eager(merlinRenderer) },
  orlon: { ...orlon, windowEntry: eager(orlonRenderer) },
  "meta-ai": { ...metaAI, windowEntry: eager(metaAIRenderer) },
  fireworks: { ...fireworks, windowEntry: eager(fireworksRenderer) },
  deepai: { ...deepai, windowEntry: eager(deepaiRenderer) },
  gemini: { ...gemini, windowEntry: eager(geminiRenderer) },
  devin: { ...devin, windowEntry: eager(devinRenderer) },
  antigravity: { ...antigravity, windowEntry: eager(antigravityRenderer) },
  "google-ai-studio": { ...googleAIStudio, windowEntry: eager(googleAIStudioRenderer) },
  "ace-ai": { ...ace, windowEntry: eager(aceRenderer) },
  "chat-box": { ...chatBox, windowEntry: eager(chatBoxRenderer) },
  ide: { ...ide, windowEntry: eager(ideRenderer) },
  backgrounds: { ...backgrounds, windowEntry: eager(backgroundsRenderer) },
  skills: { ...skills, windowEntry: eager(skillsRenderer) },
  context: { ...context, windowEntry: eager(contextRenderer) },
  btw: { ...btw, windowEntry: eager(btwRenderer) },
  debug: { ...debug, windowEntry: eager(debugRenderer) },
  terminal: { ...terminal, windowEntry: eager(terminalRenderer) },
  file: { ...file, windowEntry: eager(fileRenderer) },
  review: { ...review, windowEntry: eager(reviewRenderer) },
  details: { ...details, windowEntry: eager(detailsRenderer) },
  browser: { ...browser, windowEntry: eager(browserRenderer) },
  pairing: { ...pairing, windowEntry: eager(pairingRenderer) },
  updater: { ...updater, windowEntry: eager(updaterRenderer) },
  ssh: { ...ssh, windowEntry: eager(sshRenderer) },
  wsl: { ...wsl, windowEntry: eager(wslRenderer) },
  "microsoft-office": {
    ...microsoftOffice,
    windowEntry: eager(microsoftOfficeRenderer),
  },
  sources: { ...sources, windowEntry: eager(sourcesRenderer) },
  goal: { ...goal, windowEntry: eager(goalRenderer) },
})
