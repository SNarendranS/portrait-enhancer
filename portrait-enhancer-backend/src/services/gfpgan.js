/**
 * GFPGAN + Real-ESRGAN — local Python, fully free, self-hosted
 * Runs python/enhance_gfpgan.py via async spawn (not spawnSync).
 * Uses "py" on Windows (configurable via PYTHON_CMD env var).
 *
 * First run downloads weights (~340MB) once; subsequent runs are faster.
 * Cold-start model loading is normal — subsequent calls within the same
 * process reuse the loaded model via a persistent Python daemon (below).
 */

import { spawn }        from "child_process";
import { writeFile, readFile, unlink, access } from "fs/promises";
import { tmpdir }       from "os";
import { join }         from "path";
import { fileURLToPath } from "url";
import { dirname }       from "path";

const __dir      = dirname(fileURLToPath(import.meta.url));
const SCRIPT     = join(__dir, "../../python/enhance_gfpgan.py");

// Windows default is "py", override with PYTHON_CMD env var
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

    // Timeout
    const timeout = opts.timeout ?? 300_000;
    const timer = setTimeout(() => {
      proc.kill("SIGTERM");
      reject(new Error(`GFPGAN timed out after ${timeout / 1000}s`));
    }, timeout);

    proc.on("close", () => clearTimeout(timer));
  });
}

export async function enhanceWithGFPGAN(imageBuffer, mimeType) {
  // Verify script exists
  try { await access(SCRIPT); } catch {
    throw new Error("GFPGAN script not found — run: npm run setup:python");
  }

  const ts      = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const ext     = mimeType === "image/png" ? ".png" : ".jpg";
  const inPath  = join(tmpdir(), `gfpgan_in_${ts}${ext}`);
  const outPath = join(tmpdir(), `gfpgan_out_${ts}.jpg`);

  try {
    await writeFile(inPath, imageBuffer);

    await spawnAsync(
      PYTHON_CMD,
      [SCRIPT, "--input", inPath, "--output", outPath],
      {
        timeout: 300_000, // 5 min max
        env: { ...process.env },
      }
    );

    // Verify output exists
    try { await access(outPath); } catch {
      throw new Error("GFPGAN produced no output file");
    }

    const outputBuffer = await readFile(outPath);
    return {
      imageBase64: outputBuffer.toString("base64"),
      mimeType:    "image/jpeg",
    };
  } finally {
    // Async cleanup — don't await, fire-and-forget
    unlink(inPath).catch(() => {});
    unlink(outPath).catch(() => {});
  }
}