import fs from "node:fs";
import path from "node:path";

const moduleId = "pokemon-hud-like";
const configPath = path.resolve("foundryconfig.json");

if (!fs.existsSync(configPath)) {
  console.error("Falta foundryconfig.json con la propiedad \"dataPath\".");
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const dataPath = config.dataPath;

if (!dataPath) {
  console.error("foundryconfig.json debe incluir \"dataPath\".");
  process.exit(1);
}

const modulesDir = path.join(dataPath, "modules");
const linkPath = path.join(modulesDir, moduleId);
const distPath = path.resolve("dist");

fs.mkdirSync(modulesDir, { recursive: true });

if (fs.existsSync(linkPath)) {
  fs.rmSync(linkPath, { recursive: true, force: true });
}

fs.symlinkSync(distPath, linkPath, "dir");
console.log(`Enlace creado: ${linkPath} -> ${distPath}`);