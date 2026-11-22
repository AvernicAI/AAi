export default {
  title: "Gemini",
  open: "Open Gemini workspace",
  description:
    "Use Gemini with your Google account inside AAi. Alphie and other browser-enabled agents can use this same saved sign-in through browser.accounts and browser.tabs.open({account: 'gemini'}).",
  capabilities: "Gemini · Chat, images, video, research & Canvas",
  limits:
    "Choose Sign in on Google’s page. Google controls model access, regional availability, generation limits and your plan. This account workspace is separate from the Google/Gemini API provider, which keeps its existing API credentials. Browser sign-in does not transfer into AAi.",
  loading: "Opening Gemini…",
  failed:
    "Gemini could not load or Google restricted this browser. Try Reload or Open in browser. Browser sign-in uses a separate session.",
  unavailable: "The signed-in Gemini workspace requires AAi desktop. You can still open Gemini in your browser.",
  chat: "Gemini chat & tools",
  signIn: "Sign in to Gemini",
  reload: "Reload",
  browser: "Open in browser",
  signOut: "Clear Gemini sign-in",
  signOutDescription:
    "Clears only AAi’s Gemini account partition, including its agent-browser sign-in. Your system browser and other providers are unaffected.",
  confirm: "Clear sign-in?",
  cancel: "Cancel",
  cleared: "Gemini sign-in cleared",
}
