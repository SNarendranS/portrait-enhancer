import { spawn }         from "child_process";
import { writeFileSync, readFileSync, unlinkSync, existsSync } from "fs";
import { tmpdir }        from "os";
import { join }          from "path";
import { fileURLToPath } from "url";
import { dirname }       from "path";

const __dir  = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(__dir, "../../python/enhance_gfpgan.py");

function checkPython(cmd) {
  return new Promise(resolve => {
    const p = spawn(cmd, ["--version"]);
    p.on("close", code => resolve(code === 0));
    p.on("error", () => resolve(false));
  });
}

async function getPython() {
  const fromEnv = process.env.PYTHON_CMD;
  if (fromEnv) {
    const normalized = fromEnv.replace(/\\/g, "/");
    if (await checkPython(normalized)) return normalized;
    throw new Error(
      `Python not found at: "${normalized}"\n` +
      `Fix: set PYTHON_CMD in .env using forward slashes`
    );
  }
  for (const cmd of ["python3", "python"]) {
    if (await checkPython(cmd)) return cmd;
  }
  throw new Error("Python not found in PATH. Set PYTHON_CMD in .env");
}

function runScript(python, args, timeoutMs, env) {
  return new Promise((resolve, reject) => {
    const proc   = spawn(python, args, { env });
    const stderr = [];
    let   killed = false;

    const timer = setTimeout(() => {
      killed = true;
      proc.kill("SIGTERM");
    }, timeoutMs);

    proc.stderr.on("data", d => stderr.push(d));

    proc.on("close", code => {
      clearTimeout(timer);
      if (killed) return reject(new Error("GFPGAN timed out (5 min). First run loads ~340 MB — try again."));
      if (code !== 0) {
        const msg = Buffer.concat(stderr).toString()
          .split("\n")
          .filter(l => !l.includes("UserWarning") && !l.includes("warnings.warn") && l.trim())
          .join("\n")
          .slice(0, 500);
        return reject(new Error(msg || "GFPGAN process failed"));
      }
      resolve();
    });

    proc.on("error", reject);
  });
}

export async function enhanceWithGFPGAN(imageBuffer, mimeType) {
  if (!existsSync(SCRIPT)) throw new Error("GFPGAN script missing — check python/ folder");

  const python  = await getPython();
  const ext     = mimeType === "image/png" ? ".png" : ".jpg";
  const inPath  = join(tmpdir(), `gfpgan_in_${Date.now()}${ext}`).replace(/\\/g, "/");
  const outPath = join(tmpdir(), `gfpgan_out_${Date.now()}.jpg`).replace(/\\/g, "/");
  const script  = SCRIPT.replace(/\\/g, "/");

  try {
    writeFileSync(inPath, imageBuffer);
    await runScript(
      python,
      ["-W", "ignore", script, "--input", inPath, "--output", outPath],
      300_000,
      { ...process.env, PYTHONWARNINGS: "ignore" }
    );
    if (!existsSync(outPath)) throw new Error("GFPGAN produced no output file");
    return { imageBase64: readFileSync(outPath).toString("base64"), mimeType: "image/jpeg" };
  } finally {
    try { unlinkSync(inPath);  } catch (_) {}
    try { unlinkSync(outPath); } catch (_) {}
  }
}
