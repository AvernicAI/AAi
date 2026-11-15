import { expect, test } from "bun:test"
import { startTask } from "./task"
import type { TaskUpdate } from "./contract"

test("project tasks stream real process output and preserve nonzero exit codes", async () => {
  const events: (typeof TaskUpdate.Type)[] = []

  const task = startTask({
    command: `"${process.execPath}" -e "console.log('task-output');process.exit(7)"`,
    directory: process.cwd(),
    emit: (event) => events.push(event),
  })

  await task.closed
  expect(events.map((event) => event.text).join("")).toContain("task-output")
  expect(events.at(-1)).toMatchObject({ id: task.id, status: "failed", code: 7 })
  expect(task.running()).toBe(false)
})

// Starts an OS process and allows the task runner's two-second process-tree shutdown grace period.
test("stopping an owned task terminates its process and reports stopped", async () => {
  const ready = Promise.withResolvers<void>()
  const events: (typeof TaskUpdate.Type)[] = []

  const task = startTask({
    command: `"${process.execPath}" -e "console.log('READY');setInterval(()=>{},1000)"`,
    directory: process.cwd(),
    emit: (event) => {
      events.push(event)

      if (event.text.includes("READY")) ready.resolve()
    },
  })

  await Promise.try(async () => {
    await ready.promise
    await task.stop()
    expect(task.running()).toBe(false)
    expect(events.at(-1)?.status).toBe("stopped")
  }).finally(() => task.stop())
}, 15000)
