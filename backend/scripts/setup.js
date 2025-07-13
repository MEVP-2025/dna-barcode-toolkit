#!/usr/bin/env node
// scripts/setup.js - 設置腳本

import fs from "fs-extra";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, "..");

async function setup() {
  console.log("🚀 Setting up Evolution Analysis Backend...\n");

  // Create necessary directories
  const directories = [
    "uploads",
    "outputs/trim",
    "outputs/join",
    "outputs/filter",
    "outputs/blast",
    "outputs/msa",
    "outputs/final",
    "logs",
    "data",
  ];

  console.log("📁 Creating directories...");
  for (const dir of directories) {
    const dirPath = path.join(rootDir, dir);
    await fs.ensureDir(dirPath);
    console.log(`   ✓ ${dir}`);
  }

  // Create .env file if it doesn't exist
  const envPath = path.join(rootDir, ".env");
  if (!(await fs.pathExists(envPath))) {
    const envContent = `# Backend Configuration
PORT=3001
NODE_ENV=development

# File Upload Configuration  
UPLOAD_DIR=uploads
OUTPUT_DIR=outputs
MAX_FILE_SIZE=1073741824
ALLOWED_FILE_TYPES=.fq,.fastq,.fa,.fasta,.csv

# Python Scripts Configuration
PYTHON_PATH=python3
SCRIPTS_DIR=python_scripts

# CORS Configuration
FRONTEND_URL=http://localhost:5173

# Logging Configuration
LOG_LEVEL=info
LOG_DIR=logs

# Analysis Configuration
MAX_CONCURRENT_ANALYSES=3
CLEANUP_TEMP_FILES=true
KEEP_RESULTS_DAYS=30
`;

    await fs.writeFile(envPath, envContent);
    console.log("   ✓ .env file created");
  }

  // Check if Python scripts exist
  console.log("\n🐍 Checking Python scripts...");
  const scriptsDir = path.join(rootDir, "python_scripts");
  const requiredScripts = ["1-rename.py", "2-1-trimPair.py"];

  for (const script of requiredScripts) {
    const scriptPath = path.join(scriptsDir, script);
    if (await fs.pathExists(scriptPath)) {
      console.log(`   ✓ ${script} found`);
    } else {
      console.log(`   ❌ ${script} not found`);
    }
  }

  // Check for barcode file
  console.log("\n🧬 Checking data files...");
  const dataDir = path.join(rootDir, "data");
  const barcodeFile = path.join(dataDir, "all-tags.csv");

  if (await fs.pathExists(barcodeFile)) {
    console.log("   ✓ all-tags.csv found");
  } else {
    console.log("   ❌ all-tags.csv not found");
    console.log("     Please add your barcode file to data/all-tags.csv");
  }

  console.log("\n✅ Setup completed!");
  console.log("\nNext steps:");
  console.log("1. Make sure your Python scripts are in python_scripts/");
  console.log("2. Add your barcode file to data/all-tags.csv");
  console.log("3. Run: npm run dev");
  console.log("4. Test the API at: http://localhost:3001/api");
}

setup().catch(console.error);
