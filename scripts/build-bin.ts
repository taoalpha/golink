import { mkdir } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

const rootDir = fileURLToPath(new URL("..", import.meta.url))
const distDir = join(rootDir, "dist")
const binPath = join(distDir, `golink${process.platform === "win32" ? ".exe" : ""}`)

await mkdir(distDir, { recursive: true })

const buildProc = Bun.spawn([
  "bun",
  "build",
  join(rootDir, "src/index.ts"),
  "--compile",
  "--minify",
  "--target",
  "bun",
  "--outfile",
  binPath,
], { stdout: "inherit", stderr: "inherit" })

const exitCode = await buildProc.exited
if (exitCode !== 0) {
  process.exit(exitCode)
}

console.log("Built dist/golink")
