// AAi Dev keeps its installed upgrade and profile identity. The installer rejects
// a legacy registration owned by another product before invoking its uninstaller.
export const APP_IDS = {
  dev: "ai.opencode.desktop.dev",
  beta: "com.avernic.aai.beta",
  prod: "com.avernic.aai",
} as const

export const AAI_DEV_UPGRADE_GUID = "b82a3793-6cb8-5d2a-9ed8-4e6f2297ac4b"
export const APP_PROTOCOL = "aai"
