import fs from "fs-extra";
import path from "path";
import { fileURLToPath } from "url";
import { analysisLogger, logger } from "../utils/logger.js";
import { DockerService } from "./dockerService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class PythonExecutor {
  constructor() {
    // Docker 配置 - 移除本地執行相關配置
    this.dockerService = new DockerService();

    // 路徑配置
    this.outputsDir = path.join(__dirname, "../../outputs");
    this.backendRootDir = path.join(__dirname, "../../");
    this.uploadsDir = path.join(__dirname, "../../uploads");
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
    const { r1File, r2File, barcodeFile, qualityConfig = {} } = params;

    try {
      // 檢查 Docker 環境 - 如果不可用直接拋出錯誤
      const envCheck = await this.checkEnvironment();

      // 清理輸出目錄
      await this.clearOutputDirectories();

      // 創建品質配置檔案
      const qualityConfigFileName = await this._createQualityConfigFile(
        qualityConfig
      );

      // 創建輸出目錄
      const renameOutputDir = path.join(this.outputsDir, "rename");
      const trimOutputDir = path.join(this.outputsDir, "trim");
      await fs.ensureDir(renameOutputDir);
      await fs.ensureDir(trimOutputDir);

      logger.info("Starting integrated pipeline with Docker", {
        r1File,
        r2File,
        barcodeFile,
        qualityConfig,
      });

      // 發送初始進度
      if (progressCallback) {
        progressCallback({
          type: "start",
          message: "Starting DNA analysis pipeline with Docker...",
        });
      }

      // 只使用 Docker 執行
      const result = await this._executeWithDocker(
        {
          ...params,
          qualityConfigFile: qualityConfigFileName,
        },
        {
          progressCallback,
          processCallback,
        }
      );

      // 清理臨時配置檔案
      try {
        await fs.remove(path.join(this.uploadsDir, qualityConfigFileName));
      } catch (cleanupError) {
        logger.warn("Failed to cleanup quality config file:", cleanupError);
      }

      // 解析結果
      const analysisResults = await this._parsePipelineResults(
        renameOutputDir,
        trimOutputDir
      );

      logger.info("Docker pipeline completed successfully");

      // 發送完成訊息
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
        executionMode: "docker",
        qualityConfig,
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
  async _executeWithDocker(params, options = {}) {
    const { r1File, r2File, barcodeFile, qualityConfigFile } = params;
    const { progressCallback, processCallback } = options;

    const containerArgs = [
      "/app/data/python_scripts/integrated_pipeline.py",
      `/app/data/uploads/${path.basename(r1File)}`,
      `/app/data/uploads/${path.basename(r2File)}`,
      `/app/data/uploads/${path.basename(barcodeFile)}`,
      `/app/data/uploads/${qualityConfigFile}`, // 新增品質配置檔案參數
    ];

    // 使用 DockerService 的標準方法
    return this.dockerService.runContainer({
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
  }

  /**
   * Parse pipeline results from output directories
   * @private
   */
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
