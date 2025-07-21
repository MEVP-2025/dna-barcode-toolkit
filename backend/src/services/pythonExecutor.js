// src/services/pythonExecutor.js
import { spawn } from "child_process";
import fs from "fs-extra";
import path from "path";
import { fileURLToPath } from "url";
import { analysisLogger, logger } from "../utils/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class PythonExecutor {
  constructor() {
    this.pythonPath = process.env.PYTHON_PATH || "python3";
    this.scriptsDir = path.join(__dirname, "../../python_scripts");
    this.outputsDir = path.join(__dirname, "../../outputs");
    this.backendRootDir = path.join(__dirname, "../../");
  }

  /**
   * Clear all output directories before starting new analysis
   */
  async clearOutputDirectories() {
    try {
      const renameDir = path.join(this.outputsDir, "rename");
      const trimDir = path.join(this.outputsDir, "trim");

      // Remove and recreate directories
      await fs.remove(renameDir);
      await fs.remove(trimDir);
      await fs.ensureDir(renameDir);
      await fs.ensureDir(trimDir);

      logger.info("Output directories cleared successfully");
    } catch (error) {
      logger.error("Failed to clear output directories:", error);
      throw error;
    }
  }

  /**
   * Execute integrated pipeline (rename + trim) with SSE support
   * @param {Object} params - Pipeline parameters
   * @param {string} params.r1File - R1 FASTQ file path
   * @param {string} params.r2File - R2 FASTQ file path
   * @param {string} params.barcodeFile - Barcode CSV file path
   * @param {Function} progressCallback - Progress callback function for SSE
   * @returns {Promise<Object>} Pipeline results
   */
  async executePipeline(
    params,
    progressCallback = null,
    processCallback = null
  ) {
    const { r1File, r2File, barcodeFile } = params;

    try {
      // Clear output directories first
      await this.clearOutputDirectories();

      // Create output directories
      const renameOutputDir = path.join(this.outputsDir, "rename");
      const trimOutputDir = path.join(this.outputsDir, "trim");

      // Ensure directories exist (should already exist from clearOutputDirectories)
      await fs.ensureDir(renameOutputDir);
      await fs.ensureDir(trimOutputDir);

      // Prepare command arguments for integrated pipeline
      const scriptPath = path.join(this.scriptsDir, "integrated_pipeline.py");
      const args = [scriptPath, r1File, r2File, barcodeFile];
      console.log("args:", args);

      logger.info("Starting integrated pipeline", {
        r1File,
        r2File,
        barcodeFile,
      });
      analysisLogger.info("Pipeline started", { args });

      // Send initial progress
      if (progressCallback) {
        progressCallback({
          type: "start",
          message: "Starting DNA analysis pipeline...",
        });
      }

      const result = await this._executeScriptWithSSE(scriptPath, args, {
        cwd: this.backendRootDir,
        progressCallback,
        processCallback, // 傳遞程序回調
      });

      // Parse and return results from output directories
      const analysisResults = await this._parsePipelineResults(
        renameOutputDir,
        trimOutputDir
      );

      logger.info("Integrated pipeline completed");

      // Send completion message
      if (progressCallback) {
        progressCallback({
          type: "complete",
          message: "Analysis completed!",
          result: analysisResults,
        });
      }

      return {
        status: "completed",
        renameOutputDir,
        trimOutputDir,
        results: analysisResults,
      };
    } catch (error) {
      logger.error("Integrated pipeline failed", error);

      // Send error message
      if (progressCallback) {
        progressCallback({
          type: "error",
          message: `Analysis failed: ${error.message}`,
          error: error.message,
        });
      }

      throw error;
    }
  }

  /**
   * Execute Python script with SSE progress updates
   * @private
   */
  async _executeScriptWithSSE(scriptPath, args, options = {}) {
    const { cwd, progressCallback, processCallback } = options;

    return new Promise((resolve, reject) => {
      // Send start message
      if (progressCallback) {
        progressCallback({
          type: "progress",
          message: `Starting Python script: ${path.basename(scriptPath)}`,
        });
      }

      // 重新命名避免與全域 process 物件衝突
      const pythonProcess = spawn(this.pythonPath, args, {
        cwd: cwd || this.backendRootDir,
        stdio: ["pipe", "pipe", "pipe"],
        env: {
          ...process.env, // 這裡使用全域 process 物件
          PYTHONUNBUFFERED: "1",
          PYTHONIOENCODING: "utf-8",
        },
      });

      if (processCallback) {
        processCallback(pythonProcess);
      }

      let output = "";
      let errorOutput = "";

      // 設置編碼
      pythonProcess.stdout.setEncoding("utf8");
      pythonProcess.stderr.setEncoding("utf8");

      // Handle stdout
      pythonProcess.stdout.on("data", (data) => {
        const chunk = data.toString();
        output += chunk;

        // 立即記錄
        analysisLogger.info(chunk.trim());

        // 立即逐行發送到 SSE
        const lines = chunk.split(/\r?\n/);
        lines.forEach((line) => {
          if (line.trim()) {
            if (progressCallback) {
              progressCallback({
                type: "progress",
                message: line.trim(),
              });
            }
          }
        });
      });

      // Handle stderr
      pythonProcess.stderr.on("data", (data) => {
        const chunk = data.toString();
        errorOutput += chunk;
        analysisLogger.error(`ERROR: ${chunk.trim()}`);

        if (progressCallback) {
          progressCallback({
            type: "error",
            message: `Python error: ${chunk.trim()}`,
          });
        }
      });

      // Handle process termination (包括被殺死的情況)
      pythonProcess.on("close", (code, signal) => {
        if (signal === "SIGTERM" || signal === "SIGKILL") {
          // 程序被終止
          const errorMsg = `Python process was terminated (signal: ${signal})`;
          if (progressCallback) {
            progressCallback({
              type: "error",
              message: errorMsg,
            });
          }
          reject(new Error(errorMsg));
        } else if (code === 0) {
          // 正常完成
          if (progressCallback) {
            progressCallback({
              type: "progress",
              message: `Python script execution completed (exit code: ${code})`,
            });
          }
          resolve({
            success: true,
            output,
          });
        } else {
          // 錯誤退出
          const errorMsg = `Python script execution failed (exit code: ${code})${
            errorOutput ? ": " + errorOutput : ""
          }`;
          if (progressCallback) {
            progressCallback({
              type: "error",
              message: errorMsg,
            });
          }
          reject(new Error(errorMsg));
        }
      });

      // Handle process error
      pythonProcess.on("error", (error) => {
        const errorMsg = `Unable to start Python script: ${error.message}`;

        if (progressCallback) {
          progressCallback({
            type: "error",
            message: errorMsg,
          });
        }

        reject(new Error(errorMsg));
      });
    });
  }

  async _parsePipelineResults(renameOutputDir, trimOutputDir) {
    try {
      const results = {
        rename: {
          files: [],
          totalFiles: 0,
        },
        trim: {
          species: {},
          totalFiles: 0,
          files: [],
        },
      };

      // Parse rename results
      if (await fs.pathExists(renameOutputDir)) {
        const renameFiles = await fs.readdir(renameOutputDir);
        results.rename.files = renameFiles;
        results.rename.totalFiles = renameFiles.length;
      }

      // Parse trim results
      if (await fs.pathExists(trimOutputDir)) {
        const trimFiles = await fs.readdir(trimOutputDir);
        results.trim.files = trimFiles;
        results.trim.totalFiles = trimFiles.length;

        // Group files by species
        for (const file of trimFiles) {
          const match = file.match(/^(\w+)\.(f|r)\.fq$/);
          if (match) {
            const [, species, direction] = match;

            if (!results.trim.species[species]) {
              results.trim.species[species] = {};
            }

            results.trim.species[species][direction] = {
              filename: file,
              path: path.join(trimOutputDir, file),
              size: (await fs.stat(path.join(trimOutputDir, file))).size,
            };
          }
        }
      }

      return results;
    } catch (error) {
      logger.error("Failed to parse pipeline results:", error);
      return {
        rename: { files: [], totalFiles: 0 },
        trim: { species: {}, totalFiles: 0, files: [] },
      };
    }
  }
}
