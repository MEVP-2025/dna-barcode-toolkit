import { spawn } from "child_process";
import { app, BrowserWindow, dialog, ipcMain, screen, shell } from "electron";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = !app.isPackaged;

let mainWindow;
let backendProcess;

// create the main application window
function createWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } =
    primaryDisplay.workAreaSize;

  mainWindow = new BrowserWindow({
    width: Math.max(Math.floor(screenWidth * 0.8), 1200),
    height: Math.max(Math.floor(screenHeight * 0.8), 800),
    minWidth: 1000,
    minHeight: 800,
    titleBarStyle: "hiddenInset",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
      webSecurity: !isDev,
    },
    icon: path.join(__dirname, "../frontend/public/MEVP_logo.png"),
    show: false, // 先不顯示，等載入完成
  });

  // Loading the frontend
  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
    // F12
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, "../frontend/dist/index.html"));
  }

  // Display when it's ready to avoid flickering
  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  // handle external url
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  // handle window closed
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function getSystemPath() {
  const platform = process.platform;

  if (platform == "darwin") {
    // -- MacOS
    return "/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin";
  } else if (platform == "win32") {
    // -- Windows
    return (
      "C:\\Program Files\\Docker\\Docker\\resources\\bin;" +
      (process.env.PATH || "")
    );
  } else {
    // -- Linux
    return "/usr/local/bin:/usr/bin:/bin";
  }
}

// -- Start Backend Server
function startBackend() {
  return new Promise((resolve, reject) => {
    const platform = process.platform;
    const arch = process.arch;

    const platformKey = `${platform}-${arch}`;
    const nodeBinary = path.join(
      process.resourcesPath,
      "node",
      platformKey,
      "bin",
      "node"
    );

    const serverScript = path.join(
      process.resourcesPath,
      "backend",
      "src",
      "server.js"
    );

    console.log("Using Node.js binary:", nodeBinary);
    console.log("Server script:", serverScript);

    backendProcess = spawn(nodeBinary, [serverScript], {
      cwd: path.join(process.resourcesPath, "backend"),
      env: {
        ...process.env,
        NODE_ENV: "production",
        PORT: "3001",
        PATH: "/usr/local/bin:/usr/bin:/bin:" + (process.env.PATH || ""),
        // PATH: getSystemPath() + ":" + (process.env.PATH || ""),
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

    // -- Wait the backend start
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

// Application ready
app.whenReady().then(async () => {
  try {
    // Start backend server first
    if (!isDev) {
      await startBackend();
    }

    createWindow();

    // special handling for macOS
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
