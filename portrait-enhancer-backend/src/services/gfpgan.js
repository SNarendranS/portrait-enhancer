/**
 * GFPGAN + Real-ESRGAN — local Python, fully free, self-hosted
 * Runs the python/enhance_gfpgan.py script.
 * First run downloads weights (~340MB) once; subsequent runs are instant.
 */

import { spawnSync }  from "child_process";
import { writeFileSync, readFileSync, unlinkSync, existsSync } from "fs";
import { tmpdir }     from "os";
import { join }       from "path";
import { fileURLToPath } from "url";
import { dirname }       from "path";

const __dir      = dirname(fileURLToPath(import.meta.url));
const PYTHON_CMD = process.env.PYTHON_CMD || detectPython();
// src/services/ → ../../python/  (two levels up from services → src → root)
const SCRIPT     = join(__dir, "../../python/enhance_gfpgan.py");

function detectPython() {
  for (const cmd of ["python3", "python"]) {
    const r = spawnSync(cmd, ["--version"], { encoding: "utf8" });
    if (r.status === 0) return cmd;
  }
  return "python3";
}

export async function enhanceWithGFPGAN(imageBuffer, mimeType) {
  if (!existsSync(SCRIPT)) throw new Error("GFPGAN script not found — run npm run setup:python");

  const ext    = mimeType === "image/png" ? ".png" : ".jpg";
  const inPath  = join(tmpdir(), `enhance_in_${Date.now()}${ext}`);
  const outPath = join(tmpdir(), `enhance_out_${Date.now()}.jpg`);

  try {
    writeFileSync(inPath, imageBuffer);

    const result = spawnSync(
      PYTHON_CMD,
      [SCRIPT, "--input", inPath, "--output", outPath],
      {
        timeout: 300_000, // 5 min — CPU inference is slow; facexlib preload adds ~30s on cold start
        encoding: "utf8",
        env: { ...process.env },
      }
    );

    if (result.status !== 0) {
      const err = result.stderr?.slice(0, 500) || result.error?.message || "GFPGAN process failed";
      throw new Error(err);
    }

    if (!existsSync(outPath)) throw new Error("GFPGAN produced no output file");

    const outputBuffer = readFileSync(outPath);
    return {
      imageBase64: outputBuffer.toString("base64"),
      mimeType:    "image/jpeg",
    };
  } finally {
    try { if (existsSync(inPath))  unlinkSync(inPath);  } catch (_) {}
    try { if (existsSync(outPath)) unlinkSync(outPath); } catch (_) {}
  }
}
