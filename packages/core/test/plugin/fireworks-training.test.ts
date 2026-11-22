import { expect, test } from "bun:test"
import path from "node:path"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { trainingScript } from "../../src/plugin/provider/fireworks-training"
import type { Fireworks } from "@opencode/schema/fireworks"

const configuration: Fireworks.Training = {
  outputModel: "aai-offline-test",
  dataset: "missing.jsonl",
  baseModel: "accounts/fireworks/models/qwen3-8b",
  tokenizer: "Qwen/Qwen3-8B",
  renderer: "",
  epochs: 1,
  batchSize: 4,
  maxSeqLen: 2048,
  learningRate: 0.0001,
  loraRank: 8,
  allowPaid: false,
}

test("the generated Python launcher refuses paid training before SDK imports or remote requests", async () => {
  const child = Bun.spawn(["python", "-c", trainingScript(configuration, "unused")], {
    env: { ...process.env, FIREWORKS_API_KEY: "offline-fixture" },
    stdout: "pipe",
    stderr: "pipe",
  })
  const error = await new Response(child.stderr).text()
  expect(await child.exited).toBe(1)
  expect(error).toContain("outside the Muse Glimmer SFT promotion")
})

test("the generated launcher validates JSONL before attempting to import the training SDK", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "aai-fireworks-"))
  try {
    const file = path.join(directory, "train';do-not-execute.jsonl")
    await Bun.write(file, JSON.stringify({ messages: [{ role: "user", content: "Missing assistant response" }] }))
    const child = Bun.spawn(
      ["python", "-c", trainingScript({ ...configuration, dataset: file, allowPaid: true }, directory)],
      {
        env: { ...process.env, FIREWORKS_API_KEY: "offline-fixture" },
        stdout: "pipe",
        stderr: "pipe",
      },
    )
    const error = await new Response(child.stderr).text()
    expect(await child.exited).toBe(1)
    expect(error).toContain("Invalid chat training row 1")
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
