// main.js - Electron主進程文件
const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const { spawn, exec } = require("child_process");
const fs = require("fs");

// Electron有兩種進程：
// 1. Main Process (主進程): 只有一個，負責管理整個應用
// 2. Renderer Process (渲染進程): 每個窗口一個，顯示UI

let mainWindow; // 主窗口實例
let backendContainer; // Docker容器進程
let isDockerReady = false; // Docker容器狀態

// ============ Docker 相關函數 ============

/**
 * 檢查用戶電腦是否安裝Docker
 * 這是必須的，因為我們的Python環境運行在Docker中
 */
async function checkDockerInstallation() {
  console.log("🔍 檢查Docker安裝狀態...");

  return new Promise((resolve) => {
    // 執行 docker --version 命令
    exec("docker --version", (error, stdout, stderr) => {
      if (error) {
        console.error("❌ Docker未安裝或無法訪問");
        // 彈出對話框提醒用戶安裝Docker
        dialog.showErrorBox(
          "Docker Required",
          "This application requires Docker to run.\nPlease install Docker Desktop and try again.\n\nDownload: https://www.docker.com/products/docker-desktop"
        );
        resolve(false);
      } else {
        console.log("✅ Docker已安裝:", stdout.trim());
        resolve(true);
      }
    });
  });
}

/**
 * 構建Docker鏡像
 * 這會根據你的Dockerfile創建包含所有生物信息學工具的環境
 */
async function buildDockerImage() {
  console.log("🏗️ 構建Docker鏡像...");

  return new Promise((resolve, reject) => {
    // 獲取Dockerfile所在目錄（在你的專案中是根目錄）
    const dockerContext = path.join(__dirname);

    // 執行 docker build 命令
    const buildProcess = spawn(
      "docker",
      [
        "build",
        "-t",
        "dna-barcode-toolkit", // 鏡像名稱
        ".", // 構建上下文（當前目錄）
      ],
      {
        cwd: dockerContext,
        stdio: "pipe", // 捕獲輸出用於日誌
      }
    );

    let buildOutput = "";

    // 監聽構建過程的輸出
    buildProcess.stdout.on("data", (data) => {
      const output = data.toString();
      console.log("Docker Build:", output);
      buildOutput += output;

      // 向渲染進程發送構建進度（可選）
      if (mainWindow) {
        mainWindow.webContents.send("build-progress", output);
      }
    });

    buildProcess.stderr.on("data", (data) => {
      console.error("Docker Build Error:", data.toString());
    });

    buildProcess.on("close", (code) => {
      if (code === 0) {
        console.log("✅ Docker鏡像構建成功");
        resolve();
      } else {
        console.error("❌ Docker鏡像構建失敗");
        reject(new Error(`Docker build failed with code ${code}`));
      }
    });
  });
}

/**
 * 啟動Docker容器
 * 這會啟動包含你的Node.js後端和Python環境的容器
 */
async function startDockerContainer() {
  console.log("🚀 啟動Docker容器...");

  return new Promise((resolve, reject) => {
    // Docker run 參數解釋：
    // --rm: 容器停止後自動刪除
    // -p 3001:3001: 端口映射，容器內3001端口映射到主機3001端口
    // -v: 掛載卷，讓容器能訪問用戶的文件
    const volumeMounts = [
      // 掛載用戶的上傳目錄（實際使用時需要獲取用戶選擇的目錄）
      `-v`,
      `${path.join(__dirname, "backend/uploads")}:/app/uploads`,
      `-v`,
      `${path.join(__dirname, "backend/outputs")}:/app/outputs`,
      `-v`,
      `${path.join(__dirname, "backend")}:/app/backend`,
    ];

    backendContainer = spawn(
      "docker",
      [
        "run",
        "--rm",
        "--name",
        "dna-toolkit-container",
        "-p",
        "3001:3001",
        ...volumeMounts,
        "dna-barcode-toolkit",
        "node",
        "/app/backend/src/server.js",
      ],
      {
        stdio: "pipe",
      }
    );

    // 監聽容器輸出
    backendContainer.stdout.on("data", (data) => {
      const output = data.toString();
      console.log("Container:", output);

      // 檢查後端是否準備就緒
      if (output.includes("Server running on port")) {
        isDockerReady = true;
        console.log("✅ 後端容器準備就緒");
        resolve();
      }
    });

    backendContainer.stderr.on("data", (data) => {
      console.error("Container Error:", data.toString());
    });

    backendContainer.on("close", (code) => {
      console.log(`容器進程結束，退出碼: ${code}`);
      isDockerReady = false;
    });

    // 設置超時，如果30秒內容器沒準備好就報錯
    setTimeout(() => {
      if (!isDockerReady) {
        reject(new Error("容器啟動超時"));
      }
    }, 30000);
  });
}

/**
 * 停止Docker容器
 */
function stopDockerContainer() {
  if (backendContainer) {
    console.log("🛑 停止Docker容器...");
    exec("docker stop dna-toolkit-container", (error) => {
      if (error) {
        console.error("停止容器時出錯:", error);
      } else {
        console.log("✅ 容器已停止");
      }
    });
  }
}

// ============ Electron 窗口管理 ============

function createWindow() {
  console.log("🪟 創建主窗口...");

  mainWindow = new BrowserWindow({
    width: 1400, // 窗口寬度
    height: 900, // 窗口高度
    minWidth: 800, // 最小寬度
    minHeight: 600, // 最小高度
    resizable: true,
    webPreferences: {
      nodeIntegration: false, // 安全設定：不允許渲染進程直接使用Node.js
      contextIsolation: true, // 安全設定：隔離上下文
      enableRemoteModule: false, // 安全設定：禁用remote模塊
      preload: path.join(__dirname, "preload.js"), // 預載腳本
    },
    icon: path.join(__dirname, "frontend/public/MEVP_logo.png"), // 應用圖標
    show: false, // 先不顯示，等準備好再顯示
    titleBarStyle: "default",
    title: "DNA Barcode Toolkit",
  });

  // 窗口準備好後再顯示（避免白屏）
  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
    console.log("✅ 主窗口已顯示");
  });

  // 開發模式載入本地開發服務器，生產模式載入構建後的文件
  const isDev = process.env.NODE_ENV === "development";

  if (isDev) {
    // 開發模式：載入Vite開發服務器
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools(); // 打開開發者工具
  } else {
    // 生產模式：載入構建後的React應用
    mainWindow.loadFile(path.join(__dirname, "frontend/dist/index.html"));
  }

  // 窗口關閉事件
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// ============ 應用生命週期管理 ============

/**
 * 應用準備就緒事件
 * 這是Electron應用啟動的入口點
 */
app.whenReady().then(async () => {
  console.log("🚀 DNA Barcode Toolkit 啟動中...");

  try {
    // 步驟1: 檢查Docker
    const dockerInstalled = await checkDockerInstallation();
    if (!dockerInstalled) {
      app.quit();
      return;
    }

    // 步驟2: 構建Docker鏡像（第一次使用時）
    await buildDockerImage();

    // 步驟3: 啟動Docker容器
    await startDockerContainer();

    // 步驟4: 創建Electron窗口
    createWindow();

    console.log("✅ 應用啟動完成");
  } catch (error) {
    console.error("❌ 應用啟動失敗:", error);
    dialog.showErrorBox(
      "Startup Error",
      `Failed to start application: ${error.message}`
    );
    app.quit();
  }
});

/**
 * 所有窗口關閉事件
 * macOS特殊處理：即使關閉所有窗口，應用仍在後台運行
 */
app.on("window-all-closed", () => {
  stopDockerContainer(); // 停止Docker容器

  // macOS外的平台，關閉所有窗口時退出應用
  if (process.platform !== "darwin") {
    app.quit();
  }
});

/**
 * 應用激活事件（macOS特有）
 */
app.on("activate", () => {
  // macOS中，如果應用在運行但沒有窗口，重新創建窗口
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

/**
 * 應用退出前事件
 */
app.on("before-quit", () => {
  console.log("應用正在退出...");
  stopDockerContainer();
});

// ============ IPC通信設定 ============
// IPC (Inter-Process Communication) 用於主進程和渲染進程之間的通信

/**
 * 處理來自渲染進程的Docker狀態查詢
 */
ipcMain.handle("get-docker-status", () => {
  return {
    ready: isDockerReady,
    containerRunning: backendContainer && !backendContainer.killed,
  };
});

/**
 * 處理文件選擇請求（例如選擇FASTQ文件）
 */
ipcMain.handle("select-files", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openFile", "multiSelections"],
    filters: [
      { name: "FASTQ Files", extensions: ["fastq", "fq"] },
      { name: "CSV Files", extensions: ["csv"] },
      { name: "All Files", extensions: ["*"] },
    ],
  });

  return result.filePaths;
});

console.log("🧬 DNA Barcode Toolkit - Electron主進程已載入");
