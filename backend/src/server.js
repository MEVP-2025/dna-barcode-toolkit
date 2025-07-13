// src/server.js
import compression from "compression";
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import helmet from "helmet";
import { createServer } from "http";
import path from "path";
import { Server as SocketServer } from "socket.io";
import { fileURLToPath } from "url";

// Import routes
import analysisRoutes from "./routes/analysis.js";
import fileRoutes from "./routes/files.js";
import indexRoutes from "./routes/index.js";

// Import middleware
import { errorHandler } from "./middleware/errorHandler.js";
import { logger } from "./utils/logger.js";

// ES module __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config();

const app = express();
const server = createServer(app);
const io = new SocketServer(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    methods: ["GET", "POST"],
  },
});

// Middleware
app.use(helmet());
app.use(compression());
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    credentials: true,
  })
);
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Static file serving for outputs
app.use("/outputs", express.static(path.join(__dirname, "../outputs")));

// Routes
app.use("/api", indexRoutes);
app.use("/api/files", fileRoutes);
app.use("/api/analysis", analysisRoutes);

// WebSocket handling
io.on("connection", (socket) => {
  logger.info(`Client connected: ${socket.id}`);

  socket.on("disconnect", () => {
    logger.info(`Client disconnected: ${socket.id}`);
  });

  // Join analysis room for progress updates
  socket.on("join_analysis", (analysisId) => {
    socket.join(`analysis_${analysisId}`);
    logger.info(`Client ${socket.id} joined analysis room: ${analysisId}`);
  });
});

// Make io available to routes
app.set("io", io);

// Error handling
app.use(errorHandler);

// 404 handler
app.use("*", (req, res) => {
  res.status(404).json({ error: "Route not found" });
});

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || "development"}`);
});
