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
   * Execute integrated pipeline (rename + trim) with SSE support
   * @param {Object} params - Pipeline parameters
   * @param {string} params.r1File - R1 FASTQ file path
   * @param {string} params.r2File - R2 FASTQ file path
   * @param {string} params.barcodeFile - Barcode CSV file path
   * @param {Function} progressCallback - Progress callback function for SSE
   * @returns {Promise<Object>} Pipeline results
   */
  async executePipeline(params, progressCallback = null) {
    const { r1File, r2File, barcodeFile } = params;
    const analysisId = `pipeline_${Date.now()}`;

    try {
      // Create main pipeline output directory
      const outputDir = path.join(this.outputsDir, "pipeline", analysisId);
      await fs.ensureDir(outputDir);

      // Create subdirectories for each step
      const renameOutputDir = path.join(this.outputsDir, "rename", analysisId);
      const trimOutputDir = path.join(this.outputsDir, "trim", analysisId);
      await fs.ensureDir(renameOutputDir);
      await fs.ensureDir(trimOutputDir);

      // Prepare command arguments for integrated pipeline
      const scriptPath = path.join(this.scriptsDir, "integrated_pipeline.py");
      const args = [scriptPath, r1File, r2File, barcodeFile, analysisId];

      logger.info(`Starting integrated pipeline: ${analysisId}`, {
        r1File,
        r2File,
        barcodeFile,
      });
      analysisLogger.info(`Pipeline started: ${analysisId}`, { args });

      // Send initial progress
      if (progressCallback) {
        progressCallback({
          type: "start",
          message: `🚀 開始DNA分析流水線... (ID: ${analysisId})`,
          analysisId,
        });
      }

      const result = await this._executeScriptWithSSE(scriptPath, args, {
        cwd: this.backendRootDir,
        analysisId,
        progressCallback,
      });

      // Parse and return results from trim output directory
      const analysisResults = await this._parsePipelineResults(
        renameOutputDir,
        trimOutputDir
      );

      logger.info(`Integrated pipeline completed: ${analysisId}`);

      // Send completion message
      if (progressCallback) {
        progressCallback({
          type: "complete",
          message: "✅ 分析完成！",
          result: analysisResults,
          analysisId,
        });
      }

      return {
        analysisId,
        status: "completed",
        outputDir,
        renameOutputDir,
        trimOutputDir,
        results: analysisResults,
      };
    } catch (error) {
      logger.error(`Integrated pipeline failed: ${analysisId}`, error);

      // Send error message
      if (progressCallback) {
        progressCallback({
          type: "error",
          message: `❌ 分析失敗: ${error.message}`,
          error: error.message,
          analysisId,
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
    const { cwd, analysisId, progressCallback } = options;

    return new Promise((resolve, reject) => {
      // Send start message
      if (progressCallback) {
        progressCallback({
          type: "progress",
          message: `🐍 啟動Python腳本: ${path.basename(scriptPath)}`,
          analysisId,
        });
      }

      const process = spawn(this.pythonPath, args, {
        cwd: cwd || this.backendRootDir,
        stdio: ["pipe", "pipe", "pipe"],
      });

      let output = "";
      let errorOutput = "";

      // Handle stdout - 即時發送給SSE
      process.stdout.on("data", (data) => {
        const chunk = data.toString();
        output += chunk;

        // Log output
        analysisLogger.info(`[${analysisId}] ${chunk.trim()}`);

        // 即時發送每一行輸出到SSE
        const lines = chunk.split("\n");
        lines.forEach((line) => {
          if (line.trim()) {
            if (progressCallback) {
              progressCallback({
                type: "progress",
                message: line.trim(),
                analysisId,
              });
            }
          }
        });

        // Parse structured progress if available
        this._parseStructuredProgress(chunk, progressCallback, analysisId);
      });

      // Handle stderr - 也發送到SSE
      process.stderr.on("data", (data) => {
        const chunk = data.toString();
        errorOutput += chunk;
        analysisLogger.error(`[${analysisId}] ERROR: ${chunk.trim()}`);

        // 發送錯誤訊息到SSE
        if (progressCallback) {
          progressCallback({
            type: "error",
            message: `🔴 Python錯誤: ${chunk.trim()}`,
            analysisId,
          });
        }
      });

      // Handle process completion
      process.on("close", (code) => {
        if (code === 0) {
          if (progressCallback) {
            progressCallback({
              type: "progress",
              message: `✅ Python腳本執行完成 (退出碼: ${code})`,
              analysisId,
            });
          }

          resolve({
            success: true,
            output,
            analysisId,
          });
        } else {
          const errorMsg = `Python腳本執行失敗 (退出碼: ${code})${
            errorOutput ? ": " + errorOutput : ""
          }`;

          if (progressCallback) {
            progressCallback({
              type: "error",
              message: `❌ ${errorMsg}`,
              analysisId,
            });
          }

          reject(new Error(errorMsg));
        }
      });

      // Handle process error
      process.on("error", (error) => {
        const errorMsg = `無法啟動Python腳本: ${error.message}`;

        if (progressCallback) {
          progressCallback({
            type: "error",
            message: `❌ ${errorMsg}`,
            analysisId,
          });
        }

        reject(new Error(errorMsg));
      });
    });
  }

  /**
   * Parse structured progress from script output
   * @private
   */
  _parseStructuredProgress(output, progressCallback, analysisId) {
    if (!progressCallback) return;

    const lines = output.split("\n");

    for (const line of lines) {
      // Look for pipeline steps
      if (line.includes("=== Step 1: Renaming R1 reads ===")) {
        progressCallback({
          type: "progress",
          step: "rename_r1",
          percentage: 20,
          message: "📝 重新命名R1序列...",
          analysisId,
        });
      } else if (line.includes("=== Step 2: Renaming R2 reads ===")) {
        progressCallback({
          type: "progress",
          step: "rename_r2",
          percentage: 40,
          message: "📝 重新命名R2序列...",
          analysisId,
        });
      } else if (line.includes("=== Step 3: Barcode trimming ===")) {
        progressCallback({
          type: "progress",
          step: "trim",
          percentage: 60,
          message: "✂️ 開始條碼修剪...",
          analysisId,
        });
      } else if (line.includes("Loading barcode file:")) {
        progressCallback({
          type: "progress",
          message: "📋 載入條碼檔案...",
          analysisId,
        });
      } else if (line.includes("Loading R1 reads...")) {
        progressCallback({
          type: "progress",
          message: "📖 載入R1序列...",
          analysisId,
        });
      } else if (line.includes("Loading R2 reads...")) {
        progressCallback({
          type: "progress",
          message: "📖 載入R2序列...",
          analysisId,
        });
      } else if (
        line.includes("Processing reads for barcode/primer matching...")
      ) {
        progressCallback({
          type: "progress",
          percentage: 70,
          message: "🔍 進行條碼/引子匹配...",
          analysisId,
        });
      } else if (line.includes("Writing trimmed reads to output files...")) {
        progressCallback({
          type: "progress",
          percentage: 90,
          message: "💾 寫入修剪後的序列...",
          analysisId,
        });
      }

      // Look for "Processed X/Y reads" pattern
      const progressMatch = line.match(/Processed (\d+)\/(\d+) reads/);
      if (progressMatch) {
        const [, current, total] = progressMatch;
        const percentage =
          70 + Math.round((parseInt(current) / parseInt(total)) * 20); // 70-90%
        progressCallback({
          type: "progress",
          current: parseInt(current),
          total: parseInt(total),
          percentage,
          message: `🔄 處理序列: ${current}/${total}`,
          analysisId,
        });
      }

      // Look for completion messages
      if (line.includes("Integrated pipeline completed successfully")) {
        progressCallback({
          type: "progress",
          percentage: 100,
          message: "🎉 整合流水線成功完成！",
          analysisId,
        });
      }
    }
  }

  // 保留原有的方法以維持兼容性
  async _executeScript(scriptPath, args, options = {}) {
    return this._executeScriptWithSSE(scriptPath, args, options);
  }

  _parseProgress(output, progressCallback) {
    // 為了兼容性保留，但使用新的方法
    this._parseStructuredProgress(output, progressCallback, "legacy");
  }

  // 其他方法保持不變...
  async _moveOutputFiles(analysisId, outputDir) {
    try {
      const sourceDir = path.join(this.scriptsDir, "output_files");

      if (await fs.pathExists(sourceDir)) {
        const files = await fs.readdir(sourceDir);

        for (const file of files) {
          const sourcePath = path.join(sourceDir, file);
          const targetPath = path.join(outputDir, file);
          await fs.move(sourcePath, targetPath);
        }

        await fs.remove(sourceDir);
      }
    } catch (error) {
      logger.warn(`Failed to move output files for ${analysisId}:`, error);
    }
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
