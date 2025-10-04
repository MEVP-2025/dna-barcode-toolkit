import { execSync, spawn } from "child_process";
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
    show: false, // -- wait until loading is complete
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

function findExecutablePath(command) {
  try {
    const shell = process.env.SHELL;

    const result = execSync(`${shell} -l -c "which ${command}"`, {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"],
      timeout: 3000,
    });
    return result.trim();
  } catch (error) {
    return null;
  }
}

function buildEnhancedPath() {
  const criticalTools = ["docker"];
  const foundPaths = new Set();

  criticalTools.forEach((tool) => {
    const toolPath = findExecutablePath(tool);
    if (toolPath) {
      const dirPath = path.dirname(toolPath);
      foundPaths.add(dirPath);
      console.log(`Found ${tool} at: ${toolPath}`);
    } else {
      console.warn(`${tool} not found in current PATH`);
    }
  });

  // -- Create PATH: detected paths + original paths + common paths
  const separator = process.platform === "win32" ? ";" : ":";
  const pathComponents = [
    ...Array.from(foundPaths), // Highest priority: dynamically detected paths
    ...(process.env.PATH || "").split(separator), // Original PATH
    ...getCommonPaths(), // Fallback: common system paths
  ];

  // -- Remove duplicates and empty values
  const uniquePaths = [...new Set(pathComponents.filter(Boolean))];
  return uniquePaths.join(separator);
}

function getCommonPaths() {
  if (process.platform === "darwin") {
    return ["/usr/local/bin", "/opt/homebrew/bin", "/usr/bin", "/bin"];
  } else if (process.platform === "win32") {
    return ["C:\\Program Files\\Docker\\Docker\\resources\\bin"];
  } else {
    return ["/usr/local/bin", "/usr/bin", "/bin"];
  }
}

function createEnhancedEnvironment() {
  const env = { ...process.env };

  try {
    env.PATH = buildEnhancedPath();
    dialog.showErrorBox("env.PATH: ", env.PATH);
  } catch (error) {
    console.warn(
      "Failed to build enhanced PATH, using fallback: ",
      error.message
    );
    // const separator = process.platform === "win32" ? ";" : ":";
    // env.PATH =
    //   (process.env.PATH || "") + separator + getCommonPaths().join(separator);
  }

  env.NODE_ENV = "production";
  env.PORT = "3001";

  return env;
}

async function validateEnvironment() {
  const requiredTools = ["docker"];
  const missing = [];

  for (const tool of requiredTools) {
    if (!findExecutablePath(tool)) {
      missing.push(tool);
    }
  }

  if (missing.length > 0) {
    const error = new Error(`Required tools not found ${missing.join(", ")}`);
    dialog.showErrorBox(
      "Missing Dependencies",
      `The following required tools were not found:\n${missing.join(
        ", "
      )}\n\nPlease ensure they are installed and accessible from the command line.`
    );
    throw error;
  }

  console.log("All required tools found");
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

    const enhancedEnv = createEnhancedEnvironment();

    backendProcess = spawn(nodeBinary, [serverScript], {
      cwd: path.join(process.resourcesPath, "backend"),
      env: enhancedEnv,
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
    console.log("find executable path: ", findExecutablePath("docker"));
    if (!isDev) {
      console.log(findExecutablePath("docker"));
      await validateEnvironment();
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
