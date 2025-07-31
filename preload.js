// preload.js - 預載腳本，在渲染進程載入前執行
// 這是主進程和渲染進程之間安全通信的橋樑

const { contextBridge, ipcRenderer } = require("electron");

/**
 * contextBridge 是Electron提供的安全機制
 * 它允許我們向渲染進程暴露特定的API，而不需要開啟nodeIntegration
 * 這樣既保證了安全性，又提供了必要的功能
 */
contextBridge.exposeInMainWorld("electronAPI", {
  // Docker相關API
  docker: {
    /**
     * 獲取Docker容器狀態
     * 渲染進程可以調用 window.electronAPI.docker.getStatus()
     */
    getStatus: () => ipcRenderer.invoke("get-docker-status"),

    /**
     * 監聽Docker構建進度
     * 渲染進程可以設置監聽器接收構建輸出
     */
    onBuildProgress: (callback) => {
      ipcRenderer.on("build-progress", (event, data) => callback(data));
    },
  },

  // 文件系統相關API
  files: {
    /**
     * 打開文件選擇對話框
     * 渲染進程可以調用 window.electronAPI.files.selectFiles()
     */
    selectFiles: () => ipcRenderer.invoke("select-files"),
  },

  // 應用信息
  app: {
    /**
     * 獲取應用版本等信息
     */
    getVersion: () => process.env.npm_package_version || "1.0.0",

    /**
     * 檢查是否在Electron環境中運行
     */
    isElectron: true,
  },
});

console.log("🔧 Preload script loaded - 預載腳本已載入");
