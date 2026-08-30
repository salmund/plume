// Récupère le binaire PDFium correspondant à la plateforme et le dépose
// dans src-tauri/. Lancé par `npm run setup`.
import { createWriteStream, existsSync, mkdirSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const tauriDir = join(root, "src-tauri");

const TARGETS = {
  "win32-x64": { asset: "pdfium-win-x64.tgz", lib: "bin/pdfium.dll", out: "pdfium.dll" },
  "win32-arm64": { asset: "pdfium-win-arm64.tgz", lib: "bin/pdfium.dll", out: "pdfium.dll" },
  "linux-x64": { asset: "pdfium-linux-x64.tgz", lib: "lib/libpdfium.so", out: "libpdfium.so" },
  "linux-arm64": { asset: "pdfium-linux-arm64.tgz", lib: "lib/libpdfium.so", out: "libpdfium.so" },
  "darwin-x64": { asset: "pdfium-mac-x64.tgz", lib: "lib/libpdfium.dylib", out: "libpdfium.dylib" },
  "darwin-arm64": { asset: "pdfium-mac-arm64.tgz", lib: "lib/libpdfium.dylib", out: "libpdfium.dylib" },
};

const key = `${process.platform}-${process.arch}`;
const target = TARGETS[key];
if (!target) {
  console.error(`Plateforme non prise en charge : ${key}`);
  process.exit(1);
}

const destination = join(tauriDir, target.out);
if (existsSync(destination) && !process.argv.includes("--force")) {
  console.log(`${target.out} est déjà en place.`);
  process.exit(0);
}

const url = `https://github.com/bblanchon/pdfium-binaries/releases/latest/download/${target.asset}`;
const tmpDir = join(root, ".pdfium-tmp");
const archive = join(tmpDir, target.asset);

console.log(`Téléchargement de ${target.asset}…`);
mkdirSync(tmpDir, { recursive: true });

// Le CDN de GitHub met parfois plus de dix secondes à répondre : on réessaie.
const ATTEMPTS = 4;
for (let attempt = 1; ; attempt++) {
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(180_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    await pipeline(Readable.fromWeb(response.body), createWriteStream(archive));
    break;
  } catch (error) {
    const reason = error.cause?.code ?? error.message;
    if (attempt === ATTEMPTS) {
      console.error(`Téléchargement impossible (${reason}).`);
      console.error(`Récupérez le binaire à la main : ${url}`);
      rmSync(tmpDir, { recursive: true, force: true });
      process.exit(1);
    }
    console.warn(`Tentative ${attempt}/${ATTEMPTS} échouée (${reason}), nouvel essai…`);
    await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
  }
}

// tar est présent par défaut sur Windows 10+, macOS et Linux.
execFileSync("tar", ["-xzf", archive, "-C", tmpDir, target.lib], {
  stdio: "inherit",
});
execFileSync(process.platform === "win32" ? "cmd" : "cp",
  process.platform === "win32"
    ? ["/c", "move", "/y", join(tmpDir, ...target.lib.split("/")), destination]
    : [join(tmpDir, ...target.lib.split("/")), destination],
  { stdio: "inherit" });

rmSync(tmpDir, { recursive: true, force: true });
console.log(`${target.out} installé dans src-tauri/.`);
