// src/routes/files.js
import express from "express";
import fs from "fs-extra";
import path from "path";
import { fileURLToPath } from "url";
import { uploadPairedFiles, uploadSingleFile } from "../middleware/upload.js";
import { logger } from "../utils/logger.js";

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Upload paired-end files (R1, R2, and optional barcode file)
router.post("/upload/paired", uploadPairedFiles, async (req, res, next) => {
  try {
    const { R1, R2, barcode } = req.files;

    // Validate required files
    if (!R1 || !R2) {
      return res.status(400).json({
        error: "Both R1 and R2 files are required",
      });
    }

    const uploadedFiles = {
      R1: {
        id: R1[0].filename.split("_")[0],
        originalName: R1[0].originalname,
        filename: R1[0].filename,
        path: R1[0].path,
        size: R1[0].size,
        uploadTime: new Date().toISOString(),
      },
      R2: {
        id: R2[0].filename.split("_")[0],
        originalName: R2[0].originalname,
        filename: R2[0].filename,
        path: R2[0].path,
        size: R2[0].size,
        uploadTime: new Date().toISOString(),
      },
    };

    // Add barcode file if provided
    if (barcode && barcode[0]) {
      uploadedFiles.barcode = {
        id: barcode[0].filename.split("_")[0],
        originalName: barcode[0].originalname,
        filename: barcode[0].filename,
        path: barcode[0].path,
        size: barcode[0].size,
        uploadTime: new Date().toISOString(),
      };
    }

    logger.info("Paired files uploaded successfully", {
      R1: uploadedFiles.R1.originalName,
      R2: uploadedFiles.R2.originalName,
      barcode: uploadedFiles.barcode?.originalName || "none",
    });

    res.json({
      message: "Files uploaded successfully",
      files: uploadedFiles,
    });
  } catch (error) {
    next(error);
  }
});

// Upload single file
router.post("/upload/single", uploadSingleFile, async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: "No file uploaded",
      });
    }

    const uploadedFile = {
      id: req.file.filename.split("_")[0],
      originalName: req.file.originalname,
      filename: req.file.filename,
      path: req.file.path,
      size: req.file.size,
      uploadTime: new Date().toISOString(),
    };

    logger.info("Single file uploaded successfully", {
      originalName: uploadedFile.originalName,
      size: uploadedFile.size,
    });

    res.json({
      message: "File uploaded successfully",
      file: uploadedFile,
    });
  } catch (error) {
    next(error);
  }
});

// Get file list
router.get("/list", async (req, res, next) => {
  try {
    const uploadsDir = path.join(__dirname, "../../uploads");
    const files = await fs.readdir(uploadsDir);

    const fileList = await Promise.all(
      files.map(async (filename) => {
        const filePath = path.join(uploadsDir, filename);
        const stats = await fs.stat(filePath);

        return {
          filename,
          size: stats.size,
          uploadTime: stats.birthtime.toISOString(),
          modifiedTime: stats.mtime.toISOString(),
        };
      })
    );

    res.json({
      files: fileList,
      count: fileList.length,
    });
  } catch (error) {
    next(error);
  }
});

// Preview file content (first few lines)
router.get("/preview/:filename", async (req, res, next) => {
  try {
    const { filename } = req.params;
    const lines = parseInt(req.query.lines) || 10;

    const filePath = path.join(__dirname, "../../uploads", filename);

    // Check if file exists
    if (!(await fs.pathExists(filePath))) {
      return res.status(404).json({
        error: "File not found",
      });
    }

    // Read first few lines
    const fileContent = await fs.readFile(filePath, "utf8");
    const fileLines = fileContent.split("\n");
    const preview = fileLines.slice(0, lines).join("\n");

    res.json({
      filename,
      lines: lines,
      totalLines: fileLines.length,
      preview,
    });
  } catch (error) {
    next(error);
  }
});

// Delete file
router.delete("/:filename", async (req, res, next) => {
  try {
    const { filename } = req.params;
    const filePath = path.join(__dirname, "../../uploads", filename);

    if (!(await fs.pathExists(filePath))) {
      return res.status(404).json({
        error: "File not found",
      });
    }

    await fs.remove(filePath);

    logger.info("File deleted successfully", { filename });

    res.json({
      message: "File deleted successfully",
      filename,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
