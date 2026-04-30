/**
 * GFPGAN + Real-ESRGAN — local Python, fully free, self-hosted
 * Runs python/enhance_gfpgan.py via async spawn.
 *
 * PYTHON_CMD resolution order:
 *   1. PYTHON_CMD env var (set this in .env to your venv python absolute path)
 *   2. "py" on Windows (Python Launcher)
 *   3. "python" fallback
 *   4. "python3" fallback (Linux/Mac)
 *
 * First run downloads weights (~340MB) once; subsequent runs are faster.
 */

import { spawn }        from "child_process";
import { writeFile, readFile, unlink, access } from "fs/promises";
import { tmpdir }       from "os";
import { join }         from "path";
import { fileURLToPath } from "url";
import { dirname }       from "path";

const __dir  = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(__dir, "../../python/enhance_gfpgan.py");

function getPythonCmd() {
  if (process.env.PYTHON_CMD) return [process.env.PYTHON_CMD];
  if (process.platform === "win32") return ["py", "python"];
  return ["python3", "python"];
}

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

    proc.on("error", err => {
      if (err.code === "ENOENT") {
        reject(new Error(`Python not found: "${cmd}" is not in PATH. Set PYTHON_CMD in .env to the full path of your python executable.`));
      } else {
        reject(new Error(`Failed to start "${cmd}": ${err.message}`));
      }
    });

    const timeout = opts.timeout ?? 300_000;
    const timer = setTimeout(() => {
      proc.kill("SIGTERM");
      reject(new Error(`GFPGAN timed out after ${timeout / 1000}s`));
    }, timeout);

    proc.on("close", () => clearTimeout(timer));
  });
}

export async function enhanceWithGFPGAN(imageBuffer, mimeType) {
  try { await access(SCRIPT); } catch {
    throw new Error("GFPGAN script not found — run: npm run setup:python");
  }

  const ts      = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const ext     = mimeType === "image/png" ? ".png" : ".jpg";
  const inPath  = join(tmpdir(), `gfpgan_in_${ts}${ext}`);
  const outPath = join(tmpdir(), `gfpgan_out_${ts}.jpg`);

  try {
    await writeFile(inPath, imageBuffer);

    const pythonCmds = getPythonCmd();
    let lastErr;
    for (const cmd of pythonCmds) {
      try {
        await spawnAsync(
          cmd,
          [SCRIPT, "--input", inPath, "--output", outPath],
          { timeout: 300_000, env: { ...process.env } }
        );
        lastErr = null;
        break;
      } catch (err) {
        lastErr = err;
        if (!err.message.includes("not in PATH") && !err.message.includes("not found")) {
          throw err;
        }
        console.warn(`  [gfpgan] "${cmd}" not found, trying next...`);
      }
    }
    if (lastErr) throw lastErr;

    try { await access(outPath); } catch {
      throw new Error("GFPGAN produced no output file");
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
