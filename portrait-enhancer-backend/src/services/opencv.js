/**
 * OpenCV + Pillow — rule-based, always works, no models needed
 * Bilateral filter, CLAHE, teeth whitening, sharpening.
 * Not AI, but deterministic and fast. The unbreakable floor.
 * Uses async spawn for non-blocking execution.
 */

import { spawn }        from "child_process";
import { writeFile, readFile, unlink, access } from "fs/promises";
import { tmpdir }       from "os";
import { join }         from "path";
import { fileURLToPath } from "url";
import { dirname }       from "path";

const __dir      = dirname(fileURLToPath(import.meta.url));
const SCRIPT     = join(__dir, "../../python/enhance_opencv.py");

const PYTHON_CMD = process.env.PYTHON_CMD ?? (process.platform === "win32" ? "py" : "python3");

function spawnAsync(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { ...opts, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", d => (stdout += d.toString()));
    proc.stderr.on("data", d => (stderr += d.toString()));

    proc.on("close", code => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(stderr.slice(0, 600) || `Process exited with code ${code}`));
      }
    });

    proc.on("error", err => reject(new Error(`Failed to start process: ${err.message}`)));

    const timeout = opts.timeout ?? 60_000;
    const timer = setTimeout(() => {
      proc.kill("SIGTERM");
      reject(new Error(`OpenCV timed out after ${timeout / 1000}s`));
    }, timeout);

    proc.on("close", () => clearTimeout(timer));
  });
}

export async function enhanceWithOpenCV(imageBuffer, mimeType) {
  try { await access(SCRIPT); } catch {
    throw new Error("OpenCV script not found — run: npm run setup:python");
  }

  const ts      = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const ext     = mimeType === "image/png" ? ".png" : ".jpg";
  const inPath  = join(tmpdir(), `cv_in_${ts}${ext}`);
  const outPath = join(tmpdir(), `cv_out_${ts}.jpg`);

  try {
    await writeFile(inPath, imageBuffer);

    await spawnAsync(
      PYTHON_CMD,
      [SCRIPT, "--input", inPath, "--output", outPath],
      {
        timeout: 60_000,
        env: { ...process.env },
      }
    );

    try { await access(outPath); } catch {
      throw new Error("OpenCV produced no output file");
    }

    return {
      imageBase64: (await readFile(outPath)).toString("base64"),
      mimeType:    "image/jpeg",
    };
  } finally {
    unlink(inPath).catch(() => {});
    unlink(outPath).catch(() => {});
  }
}