// src/services/websocket.js
import { io } from "socket.io-client";

class WebSocketService {
  constructor() {
    this.socket = null;
    this.listeners = new Map();
  }

  connect() {
    if (this.socket?.connected) {
      return this.socket;
    }

    const SOCKET_URL =
      import.meta.env.VITE_API_URL?.replace("/api", "") ||
      "http://localhost:3001";

    this.socket = io(SOCKET_URL, {
      transports: ["websocket"],
      upgrade: false,
    });

    this.socket.on("connect", () => {
      console.log("🔌 WebSocket connected:", this.socket.id);
    });

    this.socket.on("disconnect", () => {
      console.log("🔌 WebSocket disconnected");
    });

    this.socket.on("connect_error", (error) => {
      console.error("🔴 WebSocket connection error:", error);
    });

    // Set up event listeners
    this.setupEventListeners();

    return this.socket;
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      console.log("🔌 WebSocket disconnected manually");
    }
  }

  setupEventListeners() {
    // Analysis progress events
    this.socket.on("analysis_progress", (data) => {
      console.log("📊 Analysis progress:", data);
      this.emit("analysis_progress", data);
    });

    this.socket.on("analysis_complete", (data) => {
      console.log("✅ Analysis complete:", data);
      this.emit("analysis_complete", data);
    });

    this.socket.on("analysis_error", (data) => {
      console.error("🔴 Analysis error:", data);
      this.emit("analysis_error", data);
    });
  }

  // Event emitter methods
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);
  }

  off(event, callback) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).delete(callback);
    }
  }

  emit(event, data) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach((callback) => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in ${event} listener:`, error);
        }
      });
    }
  }

  // Join analysis room for progress updates
  joinAnalysis(analysisId) {
    if (this.socket?.connected) {
      this.socket.emit("join_analysis", analysisId);
      console.log(`🏠 Joined analysis room: ${analysisId}`);
    }
  }
}

// Create singleton instance
const wsService = new WebSocketService();

export default wsService;
