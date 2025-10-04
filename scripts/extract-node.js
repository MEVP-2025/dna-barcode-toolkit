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
  "darwin-arm64": {
    file: `node-v${NODE_VERSION}-darwin-arm64.tar.gz`,
    type: "tar.gz"
  },
  "darwin-x64": {
    file: `node-v${NODE_VERSION}-darwin-x64.tar.gz`,
    type: "tar.gz"
  },
  "win-x64": {
    file: `node-v${NODE_VERSION}-win-x64.zip`,
    type: "zip"
  },
  "linux-x64": {
    file: `node-v${NODE_VERSION}-linux-x64.tar.xz`,
    type: "tar.xz"
  }
}

// ** Just for MacOS **
for (const [platform, { file: filename, type }] of Object.entries(platforms)) {
  const archivePath = path.join(nodeDir, filename);
  const platformDir = path.join(extractDir, platform);

  if (!fs.existsSync(archivePath)) {
    console.log(`${filename} not found, skipping...`);
    continue;
  }

  fs.mkdirSync(platformDir, { recursive: true });

  console.log(`Extracting ${filename}...`);

  try {
    if (type == "zip") {
      execSync(`unzip -q "${archivePath}" -d "${platformDir}"`, {
        stdio: "inherit",
      });

      const extractedDir = path.join(platformDir, `node-v${NODE_VERSION}-${platform}`);
      if (fs.existsSync(extractedDir)) {
        const files = fs.readdirSync(extractedDir);
        files.forEach((file) => {
          const src = path.join(extractedDir, file);
          const dest = path.join(platformDir, file);
          fs.renameSync(src, dest);
        });
        fs.rmdirSync(extractedDir);
      }
    } else if (type === "tar.gz") {
      execSync(
        `tar -xzf "${archivePath}" -C "${platformDir}" --strip-components=1`,
        { stdio: "inherit" }
      );
    } else if (type === "tar.xz") {
      execSync(
        `tar -xJf "${archivePath}" -C "${platformDir}" --strip-components=1`,
        { stdio: "inherit" }
      );
    }
  } catch (error) {
    console.log(`Failed to extract ${filename}:`, error.message);
  }
}
