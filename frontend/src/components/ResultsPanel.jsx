// src/components/ResultsPanel.jsx
import { Download, Eye, Folder, RotateCcw } from 'lucide-react'

const ResultsPanel = ({ result, onReset }) => {
  const formatFileSize = (bytes) => {
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    if (bytes === 0) return '0 Bytes'
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i]
  }

  const downloadFile = (filePath, fileName) => {
    // 簡化的下載邏輯 - 根據新的資料夾結構
    let downloadUrl
    
    if (filePath.includes('/rename/')) {
      // rename 檔案
      downloadUrl = `http://localhost:3001/outputs/rename/${fileName}`
    } else if (filePath.includes('/trim/')) {
      // trim 檔案
      downloadUrl = `http://localhost:3001/outputs/trim/${fileName}`
    } else {
      // 直接使用檔名
      downloadUrl = `http://localhost:3001/outputs/trim/${fileName}`
    }
    
    const link = document.createElement('a')
    link.href = downloadUrl
    link.download = fileName
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const previewFile = async (fileName) => {
    try {
      alert(`Preview functionality for ${fileName} - to be implemented`)
    } catch (error) {
      alert('Preview failed: ' + error.message)
    }
  }

  return (
    <div className="results-section">
      <h2>✅ Pipeline Analysis Complete</h2>
      <p>Your integrated DNA analysis pipeline has finished successfully. All results are ready for download.</p>

      {/* Analysis Summary */}
      <div className="analysis-summary">
        <h3>Pipeline Summary:</h3>
        <div className="summary-item">
          <span className="label">Status:</span>
          <span className="value success">Completed</span>
        </div>
        <div className="summary-item">
          <span className="label">Pipeline Steps:</span>
          <span className="value">Rename → Trim → Species Classification</span>
        </div>
        <div className="summary-item">
          <span className="label">Output Location:</span>
          <span className="value">outputs/rename/ & outputs/trim/</span>
        </div>
      </div>

      {/* Step Results */}
      <div className="pipeline-results">
        
        {/* Rename Results */}
        {result.results && result.results.rename && (
          <div className="step-results">
            <h3>📝 Step 1-2: Rename Results</h3>
            <div className="step-summary">
              <Folder size={20} />
              <span>Generated {result.results.rename.totalFiles} renamed files</span>
            </div>
            <div className="files-grid">
              {result.results.rename.files.map((file) => (
                <div key={file} className="file-result-item">
                  <span className="file-info">
                    <strong>{file}</strong>
                  </span>
                  <div className="file-actions">
                    <button
                      className="btn btn-sm"
                      onClick={() => previewFile(file)}
                    >
                      <Eye size={16} />
                      Preview
                    </button>
                    <button
                      className="btn btn-sm"
                      onClick={() => downloadFile(`rename/${file}`, file)}
                    >
                      <Download size={16} />
                      Download
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Trim Results - Species Classification */}
        {result.results && result.results.trim && result.results.trim.species && (
          <div className="step-results">
            <h3>✂️ Step 3: Species Classification Results</h3>
            <div className="step-summary">
              <Folder size={20} />
              <span>Classified into {Object.keys(result.results.trim.species).length} species</span>
            </div>
            
            <div className="species-results">
              {Object.entries(result.results.trim.species).map(([species, data]) => (
                <div key={species} className="species-section">
                  <h4>🧬 {species.toUpperCase()}</h4>
                  <div className="species-files">
                    {data.f && (
                      <div className="file-result-item">
                        <span className="file-info">
                          <strong>Forward:</strong> {data.f.filename}
                          <small>({formatFileSize(data.f.size)})</small>
                        </span>
                        <div className="file-actions">
                          <button
                            className="btn btn-sm"
                            onClick={() => previewFile(data.f.filename)}
                          >
                            <Eye size={16} />
                            Preview
                          </button>
                          <button
                            className="btn btn-sm"
                            onClick={() => downloadFile(data.f.path, data.f.filename)}
                          >
                            <Download size={16} />
                            Download
                          </button>
                        </div>
                      </div>
                    )}
                    {data.r && (
                      <div className="file-result-item">
                        <span className="file-info">
                          <strong>Reverse:</strong> {data.r.filename}
                          <small>({formatFileSize(data.r.size)})</small>
                        </span>
                        <div className="file-actions">
                          <button
                            className="btn btn-sm"
                            onClick={() => previewFile(data.r.filename)}
                          >
                            <Eye size={16} />
                            Preview
                          </button>
                          <button
                            className="btn btn-sm"
                            onClick={() => downloadFile(data.r.path, data.r.filename)}
                          >
                            <Download size={16} />
                            Download
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* No results case */}
        {(!result.results || (!result.results.rename && !result.results.trim)) && (
          <div className="step-results">
            <h3>Analysis Result:</h3>
            <div className="simple-result">
              <p>✅ Pipeline analysis completed successfully</p>
              <p><strong>Status:</strong> {result.status}</p>
              <p>Check the outputs/rename/ and outputs/trim/ directories for your results.</p>
            </div>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="results-actions">
        <button
          className="btn btn-primary"
          onClick={onReset}
        >
          <RotateCcw size={20} />
          Start New Analysis
        </button>
      </div>
    </div>
  )
}

export default ResultsPanel