// src/services/api.js
import axios from "axios";

const API_BASE_URL =
  import.meta.env.VITE_API_URL || "http://localhost:3001/api";

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 300000, // 5 minutes for large file uploads
});

// Simple API methods
export const api = {
  // File upload
  files: {
    uploadPaired: (formData, onUploadProgress) => {
      return apiClient.post("/files/upload/paired", formData, {
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress,
      });
    },
  },

  // Analysis (簡化版 - 移除 analysisId)
  analysis: {
    pipeline: {
      // 開始分析 (不返回 analysisId)
      start: (params) => apiClient.post("/analysis/pipeline/start", params),

      // 取得當前分析狀態 (不需要 analysisId)
      getStatus: () => apiClient.get("/analysis/pipeline/status"),

      // 取得分析結果 (不需要 analysisId)
      getResults: () => apiClient.get("/analysis/pipeline/results"),

      // 檢查當前分析
      getCurrent: () => apiClient.get("/analysis/current"),

      // 清除當前分析
      clear: () => apiClient.delete("/analysis/clear"),

      stop: () => apiClient.post("/analysis/pipeline/stop"),

      // 🆕 SSE監聽進度的方法 (簡化版 - 不需要 analysisId)
      watchProgress: (callbacks) => {
        const eventSource = new EventSource(
          `${API_BASE_URL}/analysis/pipeline/progress`
        );

        eventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            console.log("SSE message received:", data);

            // 根據訊息類型呼叫對應的回調
            switch (data.type) {
              case "start":
                callbacks.onStart?.(data);
                break;
              case "progress":
                callbacks.onProgress?.(data);
                break;
              case "complete":
                callbacks.onComplete?.(data);
                eventSource.close();
                break;
              case "error":
                callbacks.onError?.(data);
                eventSource.close();
                break;
              default:
                callbacks.onMessage?.(data);
            }
          } catch (error) {
            console.error("解析SSE資料失敗:", error);
            callbacks.onSSEError?.({
              message: "資料格式錯誤",
              error: error.message,
            });
          }
        };

        eventSource.onerror = (error) => {
          console.error("SSE連線錯誤:", error);
          callbacks.onSSEError?.({
            message: "連線中斷，正在重新連線...",
            error: "Connection lost",
          });
        };

        eventSource.onopen = () => {
          console.log("SSE連線已建立");
          callbacks.onConnect?.();
        };

        // 返回EventSource實例，讓呼叫者可以手動關閉
        return eventSource;
      },

      // 🆕 便利方法：取得 SSE URL (用於除錯)
      getSSEUrl: () => `${API_BASE_URL}/analysis/pipeline/progress`,
    },
  },
};

export default api;
