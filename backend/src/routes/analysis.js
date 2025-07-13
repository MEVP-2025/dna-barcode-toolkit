// src/routes/analysis.js
import express from "express";
import Joi from "joi";
import { PythonExecutor } from "../services/pythonExecutor.js";

const router = express.Router();
const pythonExecutor = new PythonExecutor();

// Store active analyses
const activeAnalyses = new Map();

// Validation schemas
const trimAnalysisSchema = Joi.object({
  r1File: Joi.string().required(),
  r2File: Joi.string().required(),
  barcodeFile: Joi.string().optional(),
});

const renameAnalysisSchema = Joi.object({
  inputFile: Joi.string().required(),
});

// Start trim analysis
router.post("/trim/start", async (req, res, next) => {
  try {
    // Validate input
    const { error, value } = trimAnalysisSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: "Validation failed",
        details: error.details,
      });
    }

    const { r1File, r2File, barcodeFile } = value;
    const io = req.app.get("io");

    // Create progress callback
    const progressCallback = (progress) => {
      io.emit("analysis_progress", {
        type: "trim",
        ...progress,
      });
    };

    // Start analysis in background
    const analysisPromise = pythonExecutor.executeTrim(
      {
        r1File,
        r2File,
        barcodeFile,
      },
      progressCallback
    );

    // Store the analysis promise
    const analysisId = `trim_${Date.now()}`;
    activeAnalyses.set(analysisId, {
      type: "trim",
      status: "running",
      startTime: new Date(),
      promise: analysisPromise,
    });

    // Handle completion
    analysisPromise
      .then((result) => {
        const analysis = activeAnalyses.get(analysisId);
        if (analysis) {
          analysis.status = "completed";
          analysis.endTime = new Date();
          analysis.result = result;

          io.emit("analysis_complete", {
            type: "trim",
            analysisId,
            result,
          });
        }
      })
      .catch((error) => {
        const analysis = activeAnalyses.get(analysisId);
        if (analysis) {
          analysis.status = "error";
          analysis.endTime = new Date();
          analysis.error = error.message;

          io.emit("analysis_error", {
            type: "trim",
            analysisId,
            error: error.message,
          });
        }
      });

    res.json({
      message: "Trim analysis started",
      analysisId,
      status: "running",
    });
  } catch (error) {
    next(error);
  }
});

// Get trim analysis status
router.get("/trim/status/:analysisId", (req, res) => {
  const { analysisId } = req.params;
  const analysis = activeAnalyses.get(analysisId);

  if (!analysis) {
    return res.status(404).json({
      error: "Analysis not found",
    });
  }

  const response = {
    analysisId,
    type: analysis.type,
    status: analysis.status,
    startTime: analysis.startTime,
  };

  if (analysis.endTime) {
    response.endTime = analysis.endTime;
    response.duration = analysis.endTime - analysis.startTime;
  }

  if (analysis.result) {
    response.result = analysis.result;
  }

  if (analysis.error) {
    response.error = analysis.error;
  }

  res.json(response);
});

// Get trim analysis results
router.get("/trim/results/:analysisId", (req, res) => {
  const { analysisId } = req.params;
  const analysis = activeAnalyses.get(analysisId);

  if (!analysis) {
    return res.status(404).json({
      error: "Analysis not found",
    });
  }

  if (analysis.status !== "completed") {
    return res.status(400).json({
      error: "Analysis not completed yet",
      status: analysis.status,
    });
  }

  res.json({
    analysisId,
    result: analysis.result,
    completedAt: analysis.endTime,
  });
});

// Start rename analysis
router.post("/rename/start", async (req, res, next) => {
  try {
    // Validate input
    const { error, value } = renameAnalysisSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: "Validation failed",
        details: error.details,
      });
    }

    const { inputFile } = value;
    const io = req.app.get("io");

    // Create progress callback
    const progressCallback = (progress) => {
      io.emit("analysis_progress", {
        type: "rename",
        ...progress,
      });
    };

    // Start analysis in background
    const analysisPromise = pythonExecutor.executeRename(
      {
        inputFile,
      },
      progressCallback
    );

    // Store the analysis promise
    const analysisId = `rename_${Date.now()}`;
    activeAnalyses.set(analysisId, {
      type: "rename",
      status: "running",
      startTime: new Date(),
      promise: analysisPromise,
    });

    // Handle completion
    analysisPromise
      .then((result) => {
        const analysis = activeAnalyses.get(analysisId);
        if (analysis) {
          analysis.status = "completed";
          analysis.endTime = new Date();
          analysis.result = result;

          io.emit("analysis_complete", {
            type: "rename",
            analysisId,
            result,
          });
        }
      })
      .catch((error) => {
        const analysis = activeAnalyses.get(analysisId);
        if (analysis) {
          analysis.status = "error";
          analysis.endTime = new Date();
          analysis.error = error.message;

          io.emit("analysis_error", {
            type: "rename",
            analysisId,
            error: error.message,
          });
        }
      });

    res.json({
      message: "Rename analysis started",
      analysisId,
      status: "running",
    });
  } catch (error) {
    next(error);
  }
});

// Get rename analysis status
router.get("/rename/status/:analysisId", (req, res) => {
  const { analysisId } = req.params;
  const analysis = activeAnalyses.get(analysisId);

  if (!analysis) {
    return res.status(404).json({
      error: "Analysis not found",
    });
  }

  const response = {
    analysisId,
    type: analysis.type,
    status: analysis.status,
    startTime: analysis.startTime,
  };

  if (analysis.endTime) {
    response.endTime = analysis.endTime;
    response.duration = analysis.endTime - analysis.startTime;
  }

  if (analysis.result) {
    response.result = analysis.result;
  }

  if (analysis.error) {
    response.error = analysis.error;
  }

  res.json(response);
});

// List all analyses
router.get("/list", (req, res) => {
  const analyses = Array.from(activeAnalyses.entries()).map(
    ([id, analysis]) => ({
      analysisId: id,
      type: analysis.type,
      status: analysis.status,
      startTime: analysis.startTime,
      endTime: analysis.endTime,
      ...(analysis.error && { error: analysis.error }),
    })
  );

  res.json({
    analyses,
    count: analyses.length,
  });
});

// Clear completed/failed analyses
router.delete("/cleanup", (req, res) => {
  let cleaned = 0;

  for (const [id, analysis] of activeAnalyses.entries()) {
    if (analysis.status === "completed" || analysis.status === "error") {
      activeAnalyses.delete(id);
      cleaned++;
    }
  }

  res.json({
    message: `Cleaned up ${cleaned} analyses`,
    remaining: activeAnalyses.size,
  });
});

export default router;
