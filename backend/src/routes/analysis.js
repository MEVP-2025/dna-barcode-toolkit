// src/routes/analysis.js
import express from "express";
import Joi from "joi";
import { PythonExecutor } from "../services/pythonExecutor.js";

const router = express.Router();
const pythonExecutor = new PythonExecutor();

// Store current analysis state (single analysis only)
let currentAnalysis = null;
let currentPythonProcess = null;

// Validation schema for integrated pipeline
const pipelineSchema = Joi.object({
  r1File: Joi.string().required(),
  r2File: Joi.string().required(),
  barcodeFile: Joi.string().required(),
});

// Start integrated pipeline (main endpoint)
router.post("/pipeline/start", async (req, res, next) => {
  try {
    // Check if analysis is already running
    if (currentAnalysis && currentAnalysis.status === "running") {
      return res.status(409).json({
        error: "Analysis already in progress",
        message: "Please wait for the current analysis to complete",
      });
    }

    // Validate input
    const { error, value } = pipelineSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: "Validation failed",
        details: error.details,
      });
    }

    const { r1File, r2File, barcodeFile } = value;

    // Create progress callback for SSE
    const progressCallback = (progress) => {
      broadcastToSSEClients({
        type: "progress",
        ...progress,
      });
    };

    // Start pipeline in background
    const analysisPromise = pythonExecutor.executePipeline(
      {
        r1File,
        r2File,
        barcodeFile,
      },
      progressCallback,
      (pythonProcess) => {
        currentPythonProcess = pythonProcess;
      }
    );

    // Store the current analysis
    currentAnalysis = {
      status: "running",
      startTime: new Date(),
      promise: analysisPromise,
      sseConnections: new Set(), // Store SSE connections
    };

    // Handle completion
    analysisPromise
      .then((result) => {
        currentPythonProcess = null;
        if (currentAnalysis) {
          currentAnalysis.status = "completed";
          currentAnalysis.endTime = new Date();
          currentAnalysis.result = result;

          broadcastToSSEClients({
            type: "complete",
            result,
            message: "Analysis completed!",
          });

          // Close SSE connections after 5 seconds
          setTimeout(() => {
            closeSSEConnections();
          }, 5000);
        }
      })
      .catch((error) => {
        currentPythonProcess = null;
        if (currentAnalysis) {
          currentAnalysis.status = "error";
          currentAnalysis.endTime = new Date();
          currentAnalysis.error = error.message;

          broadcastToSSEClients({
            type: "error",
            error: error.message,
            message: `Analysis failed: ${error.message}`,
          });

          // Close SSE connections after 5 seconds
          setTimeout(() => {
            closeSSEConnections();
          }, 5000);
        }
      });

    res.json({
      message: "Integrated pipeline started",
      status: "running",
    });
  } catch (error) {
    next(error);
  }
});

router.post("/pipeline/stop", (req, res) => {
  try {
    if (!currentAnalysis || currentAnalysis.status !== "running") {
      return res.status(400).json({
        error: "No running analysis to stop",
        status: currentAnalysis?.status || "none",
      });
    }

    // 殺死 Python 程序
    if (currentPythonProcess) {
      console.log("Terminating Python process...");
      currentPythonProcess.kill("SIGTERM"); // 優雅停止

      // 如果 3 秒後還沒停止，強制殺死
      setTimeout(() => {
        if (currentPythonProcess && !currentPythonProcess.killed) {
          console.log("Force killing Python process...");
          currentPythonProcess.kill("SIGKILL");
        }
      }, 3000);
    }

    // 更新分析狀態
    currentAnalysis.status = "stopped";
    currentAnalysis.endTime = new Date();
    currentAnalysis.error = "Analysis stopped by user";

    // 廣播停止訊息
    broadcastToSSEClients({
      type: "error",
      error: "Analysis stopped by user",
      message: "Analysis has been stopped by user request",
    });

    // 關閉 SSE 連線
    setTimeout(() => {
      closeSSEConnections();
    }, 1000);

    res.json({
      message: "Analysis stopped successfully",
      status: "stopped",
    });
  } catch (error) {
    console.error("Failed to stop analysis:", error);
    res.status(500).json({
      error: "Failed to stop analysis",
      details: error.message,
    });
  }
});

// SSE endpoint for real-time progress updates
router.get("/pipeline/progress", (req, res) => {
  if (!currentAnalysis) {
    return res.status(404).json({
      error: "No analysis found",
    });
  }

  // 設置正確的 SSE 標頭 - 這是關鍵！
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform", // 添加 no-transform
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Cache-Control",
    "X-Accel-Buffering": "no", // 禁用 nginx 緩衝
  });

  // 立即發送一個心跳來建立連線
  res.write(": heartbeat\n\n");

  // Add this connection to the analysis
  currentAnalysis.sseConnections.add(res);

  // Send initial status
  const initialData = {
    type: "start",
    message: "Starting to monitor analysis progress...",
    status: currentAnalysis.status,
    timestamp: new Date().toISOString(),
  };

  res.write(`data: ${JSON.stringify(initialData)}\n\n`);

  // 其餘程式碼保持不變...
  // If analysis is already completed, send the result immediately
  if (currentAnalysis.status === "completed") {
    res.write(
      `data: ${JSON.stringify({
        type: "complete",
        result: currentAnalysis.result,
        message: "Analysis completed",
        timestamp: new Date().toISOString(),
      })}\n\n`
    );

    setTimeout(() => {
      currentAnalysis.sseConnections.delete(res);
      res.end();
    }, 1000);
  } else if (currentAnalysis.status === "error") {
    res.write(
      `data: ${JSON.stringify({
        type: "error",
        error: currentAnalysis.error,
        message: `Analysis failed: ${currentAnalysis.error}`,
        timestamp: new Date().toISOString(),
      })}\n\n`
    );

    setTimeout(() => {
      currentAnalysis.sseConnections.delete(res);
      res.end();
    }, 1000);
  }

  // Handle client disconnect
  req.on("close", () => {
    if (currentAnalysis) {
      currentAnalysis.sseConnections.delete(res);
      console.log("SSE client disconnected");
    }
  });

  req.on("error", (error) => {
    console.error("SSE connection error:", error);
    if (currentAnalysis) {
      currentAnalysis.sseConnections.delete(res);
    }
  });
});

// Helper function to broadcast messages to all SSE clients
function broadcastToSSEClients(data) {
  if (!currentAnalysis || !currentAnalysis.sseConnections) {
    return;
  }

  const message = `data: ${JSON.stringify({
    ...data,
    timestamp: new Date().toISOString(),
  })}\n\n`;

  // 立即發送到所有連接的 SSE 客戶端
  currentAnalysis.sseConnections.forEach((connection) => {
    try {
      connection.write(message);
      // 強制刷新緩衝區 - 這是關鍵！
      if (connection.flush) {
        connection.flush();
      }
      // 或者使用 Node.js 的 flushHeaders
      if (connection.flushHeaders) {
        connection.flushHeaders();
      }
    } catch (error) {
      console.error("Failed to send SSE message:", error);
      currentAnalysis.sseConnections.delete(connection);
    }
  });

  console.log(`SSE broadcast: ${data.type} - ${data.message || "No message"}`);
}

// Helper function to close all SSE connections
function closeSSEConnections() {
  if (!currentAnalysis || !currentAnalysis.sseConnections) {
    return;
  }

  currentAnalysis.sseConnections.forEach((connection) => {
    try {
      connection.end();
    } catch (error) {
      console.error("Failed to close SSE connection:", error);
    }
  });

  currentAnalysis.sseConnections.clear();
  console.log("All SSE connections closed");
}

// Get current analysis status
router.get("/pipeline/status", (req, res) => {
  if (!currentAnalysis) {
    return res.status(404).json({
      error: "No analysis found",
    });
  }

  const response = {
    status: currentAnalysis.status,
    startTime: currentAnalysis.startTime,
    activeConnections: currentAnalysis.sseConnections
      ? currentAnalysis.sseConnections.size
      : 0,
  };

  if (currentAnalysis.endTime) {
    response.endTime = currentAnalysis.endTime;
    response.duration = currentAnalysis.endTime - currentAnalysis.startTime;
  }

  if (currentAnalysis.result) {
    response.result = currentAnalysis.result;
  }

  if (currentAnalysis.error) {
    response.error = currentAnalysis.error;
  }

  res.json(response);
});

// Get analysis results
router.get("/pipeline/results", (req, res) => {
  if (!currentAnalysis) {
    return res.status(404).json({
      error: "No analysis found",
    });
  }

  if (currentAnalysis.status !== "completed") {
    return res.status(400).json({
      error: "Analysis not completed yet",
      status: currentAnalysis.status,
    });
  }

  res.json({
    result: currentAnalysis.result,
    completedAt: currentAnalysis.endTime,
  });
});

// Get current analysis info
router.get("/current", (req, res) => {
  if (!currentAnalysis) {
    return res.json({
      hasAnalysis: false,
      message: "No analysis in progress or completed",
    });
  }

  res.json({
    hasAnalysis: true,
    status: currentAnalysis.status,
    startTime: currentAnalysis.startTime,
    endTime: currentAnalysis.endTime,
    activeConnections: currentAnalysis.sseConnections
      ? currentAnalysis.sseConnections.size
      : 0,
  });
});

// Clear current analysis
router.delete("/clear", (req, res) => {
  if (currentAnalysis) {
    // Close any remaining SSE connections
    closeSSEConnections();
    currentAnalysis = null;
  }

  res.json({
    message: "Current analysis cleared",
  });
});

export default router;
