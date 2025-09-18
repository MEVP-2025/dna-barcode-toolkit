import { execSync } from "child_process";
import fs from "fs";
import path from "path";

const NODE_VERSION = "23.5.0";
const nodeDir = path.join(process.cwd(), "node-binaries");
const extractDir = path.join(process.cwd(), "resources", "node");

// 清理並創建目錄
if (fs.existsSync(extractDir)) {
  fs.rmSync(extractDir, { recursive: true });
}
fs.mkdirSync(extractDir, { recursive: true });

const platforms = {
  "darwin-arm64": `node-v${NODE_VERSION}-darwin-arm64.tar.gz`,
  "darwin-x64": `node-v${NODE_VERSION}-darwin-x64.tar.gz`,
};

for (const [platform, filename] of Object.entries(platforms)) {
  const archivePath = path.join(nodeDir, filename);
  const platformDir = path.join(extractDir, platform);

  if (!fs.existsSync(archivePath)) {
    console.log(`${filename} not found, skipping...`);
    continue;
  }

  fs.mkdirSync(platformDir, { recursive: true });

  console.log(`Extracting ${filename}...`);
  execSync(
    `tar -xzf "${archivePath}" -C "${platformDir}" --strip-components=1`
  );
}
