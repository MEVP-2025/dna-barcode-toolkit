// src/App.jsx
import { useState } from 'react'
import AnalysisPanel from './components/AnalysisPanel'
import FileUpload from './components/FileUpload'
import ResultsPanel from './components/ResultsPanel'
import './styles/components.css'
import './styles/globals.css'

const App = () => {
  const [uploadedFiles, setUploadedFiles] = useState(null)
  const [analysisResult, setAnalysisResult] = useState(null)
  const [showResults, setShowResults] = useState(false)

  const handleFilesUploaded = (files) => {
    setUploadedFiles(files)
    setAnalysisResult(null)
    setShowResults(false)
  }

  const handleAnalysisComplete = (result) => {
    setAnalysisResult(result)
    setShowResults(true)
  }

  const resetApp = () => {
    setUploadedFiles(null)
    setAnalysisResult(null)
    setShowResults(false)
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>🧬 DNA Barcode Analysis Tool</h1>
        <p>Upload FASTQ files and run rename/trim analysis</p>
      </header>

      <main className="app-main">
        {/* Step 1: File Upload */}
        {!uploadedFiles && (
          <FileUpload onFilesUploaded={handleFilesUploaded} />
        )}

        {/* Step 2: Analysis Panel */}
        {uploadedFiles && !showResults && (
          <AnalysisPanel
            uploadedFiles={uploadedFiles}
            onAnalysisComplete={handleAnalysisComplete}
            onReset={resetApp}
          />
        )}

        {/* Step 3: Results */}
        {showResults && analysisResult && (
          <ResultsPanel
            result={analysisResult}
            onReset={resetApp}
          />
        )}
      </main>
    </div>
  )
}

export default App