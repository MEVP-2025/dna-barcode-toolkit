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

  // Analysis
  analysis: {
    pipeline: {
      start: (params) => apiClient.post("/analysis/pipeline/start", params),
      status: (analysisId) =>
        apiClient.get(`/analysis/pipeline/status/${analysisId}`),
      results: (analysisId) =>
        apiClient.get(`/analysis/pipeline/results/${analysisId}`),

      // 🆕 SSE監聽進度的方法
      watchProgress: (analysisId, callbacks) => {
        const eventSource = new EventSource(
          `${API_BASE_URL}/analysis/pipeline/progress/${analysisId}`
        );

        eventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);

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
            callbacks.onError?.({
              message: "資料格式錯誤",
              error: error.message,
            });
          }
        };

        eventSource.onerror = (error) => {
          console.error("SSE連線錯誤:", error);
          callbacks.onError?.({
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
    },
  },
};

export default api;
