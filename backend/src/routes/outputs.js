import express from "express";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const safeJoin = (...parts) => path.normalize(path.join(...parts));

async function listDirContents(dirPath) {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const result = {};

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const speciesName = entry.name;
        const speciesPath = safeJoin(dirPath, speciesName);
        const files = await fs.readdir(speciesPath);
        const fileInfos = [];

        for (const f of files) {
          try {
            const stat = await fs.stat(safeJoin(speciesPath, f));
            fileInfos.push({
              filename: f,
              size: stat.size,
            });
          } catch (e) {
            // skip unreadable files
          }
        }

        result[speciesName] = fileInfos;
      }
    }

    return result;
  } catch (error) {
    return {};
  }
}

// GET /api/outputs/list
router.get("/list", async (req, res, next) => {
  try {
    const outputsRoot = path.join(__dirname, "../../outputs");
    const separatedDir = path.join(outputsRoot, "separated");
    const tableDir = path.join(outputsRoot, "table");

    const separated = await listDirContents(separatedDir);
    const table = await listDirContents(tableDir);

    res.json({ success: true, separated, table });
  } catch (error) {
    next(error);
  }
});

router.get("/download/:category/:species/:filename", async (req, res, next) => {
  try {
    const { category, species, filename } = req.params;

    // 驗證 category 只能是 'separated' 或 'table'
    if (!["separated", "table"].includes(category)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid category. Must be "separated" or "table"',
      });
    }

    // 建構檔案路徑
    const outputsRoot = path.join(__dirname, "../../outputs");
    const categoryDir = path.join(outputsRoot, category);
    const speciesDir = path.join(categoryDir, species);
    const filePath = safeJoin(speciesDir, filename);

    // 安全性檢查：確保檔案路徑在預期的目錄內
    if (!filePath.startsWith(speciesDir)) {
      return res.status(400).json({
        success: false,
        error: "Invalid file path",
      });
    }

    // 檢查檔案是否存在
    try {
      await fs.access(filePath);
    } catch (error) {
      return res.status(404).json({
        success: false,
        error: "File not found",
      });
    }

    // 設定下載標頭
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Type", "application/octet-stream");

    // 發送檔案
    res.sendFile(filePath, (err) => {
      if (err) {
        console.error("Error sending file:", err);
        if (!res.headersSent) {
          res.status(500).json({
            success: false,
            error: "Error downloading file",
          });
        }
      }
    });
  } catch (error) {
    console.error("Download error:", error);
    next(error);
  }
});

export default router;
