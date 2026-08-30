// Régénère app-icon.png depuis app-icon.svg, puis lancer : npm run tauri icon
import { Resvg } from "@resvg/resvg-js";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const svg = readFileSync(join(root, "app-icon.svg"), "utf8");
const png = new Resvg(svg, { fitTo: { mode: "width", value: 1024 } })
  .render()
  .asPng();
writeFileSync(join(root, "app-icon.png"), png);
console.log(`app-icon.png : ${png.length} octets`);
