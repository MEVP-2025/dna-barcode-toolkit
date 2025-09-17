import { spawn } from "child_process";
import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 開發模式檢測 - 暫時強制使用開發模式
// const isDev = true; // process.env.NODE_ENV === 'development';
const isDev = !app.isPackaged;

let mainWindow;
let backendProcess;

// 建立主視窗
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
      webSecurity: !isDev, // 開發模式下放寬安全限制
    },
    icon: path.join(__dirname, "../frontend/public/MEVP_logo.png"), // 應用圖示
    show: false, // 先不顯示，等載入完成
  });

  // 載入前端
  if (isDev) {
    // 開發模式：載入 Vite 開發伺服器
    mainWindow.loadURL("http://localhost:5173");
    // 開啟開發者工具
    // mainWindow.webContents.openDevTools();
  } else {
    // 生產模式：載入打包後的檔案
    mainWindow.loadFile(path.join(__dirname, "../frontend/dist/index.html"));
  }

  // 視窗準備好後顯示
  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  // 處理外部連結
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  // 視窗關閉事件
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// 啟動後端伺服器
function startBackend() {
  return new Promise((resolve, reject) => {
    const backendPath = path.join(
      process.resourcesPath,
      "backend/src/server.js"
    );
    const backendDir = path.join(process.resourcesPath, "backend");

    console.log("Starting backend from:", backendPath);

    backendProcess = spawn("node", [backendPath], {
      cwd: backendDir,
      env: {
        ...process.env,
        NODE_ENV: "production",
        PORT: "3001",
      },
      stdio: ["pipe", "pipe", "pipe"],
    });

    backendProcess.stdout.on("data", (data) => {
      console.log(`Backend: ${data.toString().trim()}`);
    });

    backendProcess.stderr.on("data", (data) => {
      console.error(`Backend Error: ${data.toString().trim()}`);
    });

    backendProcess.on("error", (error) => {
      console.error("Failed to start backend:", error);
      reject(error);
    });

    // 等待後端啟動
    setTimeout(() => {
      if (backendProcess && !backendProcess.killed) {
        console.log("Backend process started");
        resolve();
      } else {
        reject(new Error("Backend failed to start"));
      }
    }, 3000);
  });
}

// 應用準備就緒
app.whenReady().then(async () => {
  try {
    // 先啟動後端
    if (!isDev) {
      await startBackend();
    }

    // 再建立視窗
    createWindow();

    // macOS 特殊處理
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  } catch (error) {
    console.error("Failed to start application:", error);
    dialog.showErrorBox(
      "Startup Error",
      `Failed to start the application: ${error.message}`
    );
    app.quit();
  }
});

// 所有視窗關閉時
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// 應用退出前清理
app.on("before-quit", () => {
  if (backendProcess && !backendProcess.killed) {
    console.log("Terminating backend process...");
    backendProcess.kill("SIGTERM");
  }
});

// IPC 處理器 - 檔案對話框
ipcMain.handle("show-open-dialog", async (event, options) => {
  const result = await dialog.showOpenDialog(mainWindow, options);
  return result;
});

// IPC 處理器 - 顯示資料夾
ipcMain.handle("show-item-in-folder", async (event, fullPath) => {
  shell.showItemInFolder(fullPath);
});

// IPC 處理器 - 開啟外部連結
ipcMain.handle("open-external", async (event, url) => {
  await shell.openExternal(url);
});

// 錯誤處理
process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
});

process.on("unhandledRejection", (error) => {
  console.error("Unhandled Rejection:", error);
});
