import { spawn }         from "child_process";
import { writeFileSync, readFileSync, unlinkSync, existsSync } from "fs";
import { tmpdir }        from "os";
import { join }          from "path";
import { fileURLToPath } from "url";
import { dirname }       from "path";

const __dir  = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(__dir, "../../python/enhance_opencv.py");

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
      `Python executable not found: "${normalized}"\n` +
      `In your .env, set PYTHON_CMD using FORWARD SLASHES, e.g.:\n` +
      `PYTHON_CMD=C:/Python311/python.exe`
    );
  }
  for (const cmd of ["python3", "python"]) {
    if (await checkPython(cmd)) return cmd;
  }
  throw new Error(
    `Python not found in PATH.\n` +
    `Install Python 3.9+ or set PYTHON_CMD in your .env:\n` +
    `PYTHON_CMD=C:/Python311/python.exe`
  );
}

function runScript(python, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const proc   = spawn(python, args);
    const stderr = [];
    let   killed = false;

    const timer = setTimeout(() => {
      killed = true;
      proc.kill("SIGTERM");
    }, timeoutMs);

    proc.stderr.on("data", d => stderr.push(d));

    proc.on("close", code => {
      clearTimeout(timer);
      if (killed) return reject(new Error("OpenCV process timed out"));
      if (code !== 0) {
        const msg = Buffer.concat(stderr).toString().slice(0, 500);
        return reject(new Error(msg || "OpenCV process failed"));
      }
      resolve();
    });

    proc.on("error", reject);
  });
}

export async function enhanceWithOpenCV(imageBuffer, mimeType) {
  if (!existsSync(SCRIPT)) throw new Error("OpenCV script missing — check python/ folder");

  const python  = await getPython();
  const ext     = mimeType === "image/png" ? ".png" : ".jpg";
  const inPath  = join(tmpdir(), `cv_in_${Date.now()}${ext}`).replace(/\\/g, "/");
  const outPath = join(tmpdir(), `cv_out_${Date.now()}.jpg`).replace(/\\/g, "/");
  const script  = SCRIPT.replace(/\\/g, "/");

  try {
    writeFileSync(inPath, imageBuffer);
    await runScript(python, [script, "--input", inPath, "--output", outPath], 30_000);
    if (!existsSync(outPath)) throw new Error("OpenCV produced no output file");
    return { imageBase64: readFileSync(outPath).toString("base64"), mimeType: "image/jpeg" };
  } finally {
    try { unlinkSync(inPath);  } catch (_) {}
    try { unlinkSync(outPath); } catch (_) {}
  }
}
