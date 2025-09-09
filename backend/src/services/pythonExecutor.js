// backend/src/services/pythonExecutor.js
import fs from "fs-extra";
import path from "path";
import { fileURLToPath } from "url";
import { analysisLogger, logger } from "../utils/logger.js";
import { DockerService } from "./dockerService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class PythonExecutor {
  constructor() {
    this.dockerService = new DockerService();

    this.outputsDir = path.join(__dirname, "../../outputs");
    this.backendRootDir = path.join(__dirname, "../../");
    this.uploadsDir = path.join(__dirname, "../../uploads");

    this.standardPipeline = [
      {
        name: "trim and rename",
        script: "Step1/rename_trim.py",
        requiredFiles: ["R1", "R2", "barcode", "qualityConfig"],
        description: "",
      },
      {
        name: "pear",
        script: "Step2/joinPear.py",
        requiredFiles: [],
        description: "",
      },
      {
        name: "length filter",
        script: "Step2/lenFilter.py",
        requiredFiles: ["minLength"],
        description: "",
      },
      {
        name: "blast",
        script: "Step3/joinBlast.py",
        requiredFiles: ["ncbiReference"],
        description: "",
      },
      {
        name: "assign species",
        script: "Step3/assign_species.py",
        requiredFiles: ["keyword", "identity"],
        description: "",
      },
      {
        name: "species classifier",
        script: "Step3/speciesClassifier.py",
        requiredFiles: [],
        description: "",
      },
      {
        name: "MAFFT",
        script: "Step4/joinMAFFT.py",
        requiredFiles: [],
        description: "",
      },
      {
        name: "tab formatter",
        script: "Step4/tabFormatter.py",
        requiredFiles: [],
        description: "",
      },
      {
        name: "trim gaps",
        script: "Step4/trim_gaps.py",
        requiredFiles: [],
        description: "",
      },
      {
        name: "separate reads",
        script: "Step5/separate_reads.py",
        requiredFiles: ["copyNumber"],
        description: "",
      },
      {
        name: "generate location-haplotype table",
        script: "Step6/get_loc_hap_table.py",
        requiredFiles: ["barcode"],
        description: "",
      },
    ];
  }

  /**
   * Check Docker environment, throw error if not available
   */
  async checkEnvironment() {
    try {
      const dockerCheck = await this.dockerService.checkEnvironment();
      if (dockerCheck.success) {
        logger.info("Docker environment verified successfully");
        return { ready: true, dockerInfo: dockerCheck };
      } else {
        const errorMsg = `Docker environment is required but not available: ${dockerCheck.message}`;
        logger.error(errorMsg);
        throw new Error(errorMsg);
      }
    } catch (error) {
      const errorMsg = `Docker environment check failed: ${error.message}`;
      logger.error(errorMsg);
      throw new Error(errorMsg);
    }
  }

  /**
   * Clear all output directories before starting new analysis
   */
  async clearOutputDirectories() {
    try {
      const renameDir = path.join(this.outputsDir, "rename");
      const trimDir = path.join(this.outputsDir, "trim");
      const pearDir = path.join(this.outputsDir, "pear");
      const filterDir = path.join(this.outputsDir, "filter");
      const filterDelDir = path.join(this.outputsDir, "filter_del");
      const blastDir = path.join(this.outputsDir, "blast");
      const assignDir = path.join(this.outputsDir, "assign");
      const classifierDir = path.join(this.outputsDir, "classifier");
      const mafftDir = path.join(this.outputsDir, "mafft");
      const tabFormatter = path.join(this.outputsDir, "tab_formatter");
      const trimmedDir = path.join(this.outputsDir, "trimmed");
      const copyNumberDir = path.join(this.outputsDir, "separated");
      const tableDir = path.join(this.outputsDir, "table");

      // Remove and recreate directories
      await fs.remove(renameDir);
      await fs.remove(trimDir);
      await fs.remove(pearDir);
      await fs.remove(filterDir);
      await fs.remove(filterDelDir);
      await fs.remove(blastDir);
      await fs.remove(assignDir);
      await fs.remove(classifierDir);
      await fs.remove(mafftDir);
      await fs.remove(tabFormatter);
      await fs.remove(trimmedDir);
      await fs.remove(copyNumberDir);
      await fs.remove(tableDir);

      await fs.ensureDir(renameDir);
      await fs.ensureDir(trimDir);
      await fs.ensureDir(pearDir);
      await fs.ensureDir(filterDir);
      await fs.ensureDir(filterDelDir);
      await fs.ensureDir(blastDir);
      await fs.ensureDir(assignDir);
      await fs.ensureDir(classifierDir);
      await fs.ensureDir(mafftDir);
      await fs.ensureDir(tabFormatter);
      await fs.ensureDir(trimmedDir);
      await fs.ensureDir(copyNumberDir);
      await fs.ensureDir(tableDir);

      logger.info("Output directories cleared successfully");
    } catch (error) {
      logger.error("Failed to clear output directories:", error);
      throw error;
    }
  }

  /**
   * Create quality configuration file
   * @private
   */
  async _createQualityConfigFile(qualityConfig) {
    try {
      const configFileName = `quality_config_${Date.now()}.json`;
      const configFilePath = path.join(this.uploadsDir, configFileName);

      await fs.writeJson(configFilePath, qualityConfig, { spaces: 2 });

      logger.info(
        `Created quality config file: ${configFileName}`,
        qualityConfig
      );
      return configFileName;
    } catch (error) {
      logger.error("Failed to create quality config file:", error);
      throw new Error(`Failed to create quality config file: ${error.message}`);
    }
  }

  /**
   * Execute integrated pipeline with Docker only
   */
  async executePipeline(
    params,
    progressCallback = null,
    processCallback = null
  ) {
    const {
      r1File,
      r2File,
      barcodeFile,
      qualityConfig = {},
      minLength = 200,
      ncbiReferenceFile,
      keyword,
      identity,
      copyNumber,
    } = params;

    try {
      // -- check Docker environment
      const envCheck = await this.checkEnvironment();

      await this.clearOutputDirectories();

      // -- create quality config json file
      const qualityConfigFileName = await this._createQualityConfigFile(
        qualityConfig
      );

      logger.info("Starting integrated pipeline with Docker", {
        r1File,
        r2File,
        barcodeFile,
        qualityConfig,
        minLength,
        ncbiReferenceFile,
        keyword,
        identity,
        copyNumber,
        steps: this.standardPipeline.map((s) => s.name),
      });

      // 發送初始進度
      if (progressCallback) {
        progressCallback({
          type: "start",
          message: "Starting DNA analysis pipeline with Docker...",
        });
      }

      const stepResults = {};

      for (let i = 0; i < this.standardPipeline.length; i++) {
        const step = this.standardPipeline[i];

        if (progressCallback) {
          progressCallback({
            type: "step_start",
            message: `Starting ${step.description}...`,
            stepName: step.name,
          });
        }

        const stepResult = await this._executeStep(
          step,
          {
            r1File,
            r2File,
            barcodeFile,
            qualityConfigFile: qualityConfigFileName,
            minLength,
            ncbiReferenceFile,
            keyword,
            identity,
            copyNumber,
          },
          progressCallback,
          processCallback
        );

        stepResults[step.name] = stepResult;

        if (progressCallback) {
          progressCallback({
            type: "step_complete",
            message: `Completed ${step.description}`,
            stepName: step.name,
          });
        }
      }

      // 清理臨時配置檔案
      try {
        await fs.remove(path.join(this.uploadsDir, qualityConfigFileName));
      } catch (cleanupError) {
        logger.warn("Failed to cleanup quality config file:", cleanupError);
      }

      // 解析結果
      const analysisResults = await this._parsePipelineResults();

      logger.info("Docker pipeline completed successfully");

      if (progressCallback) {
        progressCallback({
          type: "complete",
          message: "Analysis completed!",
          result: analysisResults,
        });
      }

      return {
        status: "completed",
        results: analysisResults,
        executionMode: "docker",
        // qualityConfig,
        // minLength, // 回傳 minLength 參數
      };
    } catch (error) {
      logger.error("Docker pipeline failed", error);

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
   * Execute pipeline using Docker
   * @private
   */
  async _executeStep(step, params, progressCallback, processCallback) {
    const {
      r1File,
      r2File,
      barcodeFile,
      qualityConfigFile,
      minLength,
      ncbiReferenceFile,
      keyword,
      identity,
      copyNumber,
    } = params;

    const containerArgs = [`/app/data/python_scripts/${step.script}`];

    for (const requiredFile of step.requiredFiles) {
      switch (requiredFile) {
        case "R1":
          containerArgs.push(`/app/data/uploads/${path.basename(r1File)}`);
          break;
        case "R2":
          containerArgs.push(`/app/data/uploads/${path.basename(r2File)}`);
          break;
        case "barcode":
          containerArgs.push(`/app/data/uploads/${path.basename(barcodeFile)}`);
          break;
        case "qualityConfig":
          containerArgs.push(`/app/data/uploads/${qualityConfigFile}`);
          break;
        case "minLength":
          containerArgs.push(parseInt(minLength));
          break;
        case "ncbiReference":
          containerArgs.push(
            `/app/data/uploads/${path.basename(ncbiReferenceFile)}`
          );
          break;
        case "keyword":
          containerArgs.push(keyword ? keyword.toString() : "");
          break;
        case "identity":
          containerArgs.push(parseInt(identity));
          break;
        case "copyNumber":
          containerArgs.push(parseInt(copyNumber));
          break;
      }
    }

    // -- Docker
    const result = await this.dockerService.runContainer({
      workDir: this.backendRootDir,
      command: "python3",
      args: containerArgs,
      onStdout: (chunk) => {
        analysisLogger.info(`Docker: ${chunk.trim()}`);
        if (progressCallback) {
          const lines = chunk.split(/\r?\n/);
          lines.forEach((line) => {
            if (line.trim()) {
              progressCallback({
                type: "progress",
                message: line.trim(),
              });
            }
          });
        }
      },
      onStderr: (chunk) => {
        analysisLogger.error(`Docker ERROR: ${chunk.trim()}`);
        if (progressCallback) {
          progressCallback({
            type: "error",
            message: `Docker error: ${chunk.trim()}`,
          });
        }
      },
      onExit: (code, signal) => {
        if (processCallback) {
          processCallback(null); // 清除 process reference
        }
      },
    });

    return {
      stepName: step.name,
      script: step.script,
      status: "completed",
    };
  }

  /**
   * Parse pipeline results from output directories
   * @private
   */
  async _parsePipelineResults() {
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
        pear: {
          files: [],
          totalFiles: 0,
        },
        filter: {
          files: [],
          totalFiles: 0,
          deletedFiles: [],
          deletedCount: 0,
        },
      };

      // Parse rename results
      const renameDir = path.join(this.outputsDir, "rename");
      if (await fs.pathExists(renameDir)) {
        const renameFiles = await fs.readdir(renameDir);
        results.rename.files = renameFiles;
        results.rename.totalFiles = renameFiles.length;
      }

      // Parse trim results
      const trimDir = path.join(this.outputsDir, "trim");
      if (await fs.pathExists(trimDir)) {
        const trimFiles = await fs.readdir(trimDir);
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
              path: path.join(trimDir, file),
              size: (await fs.stat(path.join(trimDir, file))).size,
            };
          }
        }
      }

      // Parse pear results
      const pearDir = path.join(this.outputsDir, "pear");
      if (await fs.pathExists(pearDir)) {
        const pearFiles = await fs.readdir(pearDir);
        results.pear.files = pearFiles;
        results.pear.totalFiles = pearFiles.length;
      }

      // Parse filter results
      const filterDir = path.join(this.outputsDir, "filter");
      if (await fs.pathExists(filterDir)) {
        const filterFiles = await fs.readdir(filterDir);
        results.filter.files = filterFiles;
        results.filter.totalFiles = filterFiles.length;
      }

      // Parse deleted sequences
      const filterDelDir = path.join(this.outputsDir, "filter_del");
      if (await fs.pathExists(filterDelDir)) {
        const deletedFiles = await fs.readdir(filterDelDir);
        results.filter.deletedFiles = deletedFiles;
        results.filter.deletedCount = deletedFiles.length;
      }

      return results;
    } catch (error) {
      logger.error("Failed to parse pipeline results:", error);
      return {
        rename: { files: [], totalFiles: 0 },
        trim: { species: {}, totalFiles: 0, files: [] },
        pear: { files: [], totalFiles: 0 },
        filter: { files: [], totalFiles: 0, deletedFiles: [], deletedCount: 0 },
      };
    }
  }
}
