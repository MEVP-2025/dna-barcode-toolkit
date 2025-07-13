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
  }

  /**
   * Execute trim analysis
   * @param {Object} params - Analysis parameters
   * @param {string} params.r1File - R1 FASTQ file path
   * @param {string} params.r2File - R2 FASTQ file path
   * @param {string} params.barcodeFile - Barcode CSV file path (optional)
   * @param {Function} progressCallback - Progress callback function
   * @returns {Promise<Object>} Analysis results
   */
  async executeTrim(params, progressCallback = null) {
    const { r1File, r2File, barcodeFile } = params;
    const analysisId = `trim_${Date.now()}`;

    try {
      // Create output directory for this analysis
      const outputDir = path.join(this.outputsDir, "trim", analysisId);
      await fs.ensureDir(outputDir);

      // Prepare command arguments
      const scriptPath = path.join(this.scriptsDir, "2-1-trimPair.py");
      const args = [scriptPath, r1File, r2File];

      // If barcode file is provided, copy it to the expected location
      if (barcodeFile) {
        const dataDir = path.join(this.scriptsDir, "../data");
        await fs.ensureDir(dataDir);
        const targetBarcodeFile = path.join(dataDir, "all-tags.csv");
        await fs.copy(barcodeFile, targetBarcodeFile);
      }

      logger.info(`Starting trim analysis: ${analysisId}`, {
        r1File,
        r2File,
        barcodeFile,
      });
      analysisLogger.info(`Trim analysis started: ${analysisId}`, { args });

      const result = await this._executeScript(scriptPath, args, {
        cwd: this.scriptsDir,
        analysisId,
        progressCallback,
      });

      // Move output files to analysis output directory
      await this._moveOutputFiles(analysisId, outputDir);

      // Parse and return results
      const analysisResults = await this._parseTrimResults(outputDir);

      logger.info(`Trim analysis completed: ${analysisId}`);
      return {
        analysisId,
        status: "completed",
        outputDir,
        results: analysisResults,
      };
    } catch (error) {
      logger.error(`Trim analysis failed: ${analysisId}`, error);
      throw error;
    }
  }

  /**
   * Execute rename script
   * @param {Object} params - Rename parameters
   * @param {string} params.inputFile - Input file path
   * @param {Function} progressCallback - Progress callback function
   * @returns {Promise<Object>} Rename results
   */
  async executeRename(params, progressCallback = null) {
    const { inputFile } = params;
    const analysisId = `rename_${Date.now()}`;

    try {
      const scriptPath = path.join(this.scriptsDir, "1-rename.py");
      const args = [scriptPath, inputFile];

      logger.info(`Starting rename analysis: ${analysisId}`, { inputFile });

      const result = await this._executeScript(scriptPath, args, {
        cwd: this.scriptsDir,
        analysisId,
        progressCallback,
      });

      logger.info(`Rename analysis completed: ${analysisId}`);
      return {
        analysisId,
        status: "completed",
        result,
      };
    } catch (error) {
      logger.error(`Rename analysis failed: ${analysisId}`, error);
      throw error;
    }
  }

  /**
   * Execute Python script with real-time progress tracking
   * @private
   */
  async _executeScript(scriptPath, args, options = {}) {
    const { cwd, analysisId, progressCallback } = options;

    return new Promise((resolve, reject) => {
      const process = spawn(this.pythonPath, args, {
        cwd: cwd || this.scriptsDir,
        stdio: ["pipe", "pipe", "pipe"],
      });

      let output = "";
      let errorOutput = "";

      // Handle stdout
      process.stdout.on("data", (data) => {
        const chunk = data.toString();
        output += chunk;

        // Log output
        analysisLogger.info(`[${analysisId}] ${chunk.trim()}`);

        // Parse progress if callback provided
        if (progressCallback) {
          this._parseProgress(chunk, progressCallback);
        }
      });

      // Handle stderr
      process.stderr.on("data", (data) => {
        const chunk = data.toString();
        errorOutput += chunk;
        analysisLogger.error(`[${analysisId}] ERROR: ${chunk.trim()}`);
      });

      // Handle process completion
      process.on("close", (code) => {
        if (code === 0) {
          resolve({
            success: true,
            output,
            analysisId,
          });
        } else {
          reject(
            new Error(
              `Script execution failed with code ${code}: ${errorOutput}`
            )
          );
        }
      });

      // Handle process error
      process.on("error", (error) => {
        reject(new Error(`Failed to start script: ${error.message}`));
      });
    });
  }

  /**
   * Parse progress from script output
   * @private
   */
  _parseProgress(output, progressCallback) {
    // Look for progress indicators in output
    const lines = output.split("\n");

    for (const line of lines) {
      // Look for "Processed X/Y reads" pattern
      const progressMatch = line.match(/Processed (\d+)\/(\d+) reads/);
      if (progressMatch) {
        const [, current, total] = progressMatch;
        const percentage = Math.round(
          (parseInt(current) / parseInt(total)) * 100
        );
        progressCallback({
          type: "progress",
          current: parseInt(current),
          total: parseInt(total),
          percentage,
        });
      }

      // Look for completion messages
      if (line.includes("Pipeline completed successfully")) {
        progressCallback({
          type: "completion",
          message: "Analysis completed successfully",
        });
      }
    }
  }

  /**
   * Move output files to designated directory
   * @private
   */
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

        // Remove empty source directory
        await fs.remove(sourceDir);
      }
    } catch (error) {
      logger.warn(`Failed to move output files for ${analysisId}:`, error);
    }
  }

  /**
   * Parse trim analysis results
   * @private
   */
  async _parseTrimResults(outputDir) {
    try {
      const files = await fs.readdir(outputDir);
      const results = {
        species: {},
        totalFiles: files.length,
        files: files,
      };

      // Group files by species
      for (const file of files) {
        const match = file.match(/^(\w+)\.(f|r)\.fq$/);
        if (match) {
          const [, species, direction] = match;

          if (!results.species[species]) {
            results.species[species] = {};
          }

          results.species[species][direction] = {
            filename: file,
            path: path.join(outputDir, file),
            size: (await fs.stat(path.join(outputDir, file))).size,
          };
        }
      }

      return results;
    } catch (error) {
      logger.error("Failed to parse trim results:", error);
      return { species: {}, totalFiles: 0, files: [] };
    }
  }
}
