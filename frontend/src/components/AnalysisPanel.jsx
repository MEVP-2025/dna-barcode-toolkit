// src/components/AnalysisPanel.jsx
import { Play, RotateCcw, Terminal } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { api } from '../services/api'

const AnalysisPanel = ({ uploadedFiles, onAnalysisStart, onReset }) => {
  const [logs, setLogs] = useState([])
  const [showLogs, setShowLogs] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  
  const eventSourceRef = useRef(null)
  const logContainerRef = useRef(null)

  const formatFileSize = (bytes) => {
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    if (bytes === 0) return '0 Bytes'
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i]
  }

  // Add log entry
  const addLog = (message, type = 'info') => {
    const logEntry = {
      id: Date.now() + Math.random(),
      message,
      type,
      timestamp: new Date().toLocaleTimeString()
    }
    
    setLogs(prev => [...prev, logEntry])
    
    // Auto scroll to bottom
    setTimeout(() => {
      if (logContainerRef.current) {
        logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight
      }
    }, 100)
  }

  const startPipeline = async () => {
    // Check if files are complete
    if (!uploadedFiles.R1 || !uploadedFiles.R2 || !uploadedFiles.barcode) {
      alert('Please upload R1, R2, and barcode files to start the pipeline.')
      return
    }

    try {
      setIsAnalyzing(true)
      setLogs([])
      setShowLogs(true)
      
      const params = {
        r1File: `uploads/${uploadedFiles.R1.filename}`,
        r2File: `uploads/${uploadedFiles.R2.filename}`,
        barcodeFile: `uploads/${uploadedFiles.barcode.filename}`
      }

      addLog('Starting DNA analysis pipeline...', 'info')

      // Call API to start analysis (no analysisId returned)
      const response = await api.analysis.pipeline.start(params)
      
      addLog('Analysis task started successfully', 'success')

      // Call original callback if needed
      if (onAnalysisStart) {
        onAnalysisStart('pipeline', params)
      }

      // Start SSE monitoring (no analysisId needed)
      startSSEMonitoring()

    } catch (error) {
      console.error('Failed to start analysis:', error)
      addLog(`Startup failed: ${error.response?.data?.error || error.message}`, 'error')
      setIsAnalyzing(false)
    }
  }

  const startSSEMonitoring = () => {
    addLog('Starting SSE connection...', 'info')
    
    // Test if SSE endpoint is accessible first
    testSSEEndpoint()
    
    // Connect to simplified SSE endpoint (no analysisId in URL)
    eventSourceRef.current = api.analysis.pipeline.watchProgress({
      onConnect: () => {
        addLog('SSE connection established', 'success')
      },

      onStart: (data) => {
        addLog(data.message || 'Started monitoring analysis progress...', 'info')
      },

      onProgress: (data) => {
        addLog(data.message || 'Analysis in progress...', 'info')
      },

      onComplete: (data) => {
        addLog(data.message || 'Analysis completed!', 'success')
        setIsAnalyzing(false)
        
        // Optionally fetch results here
        fetchAnalysisResults()
      },

      onError: (data) => {
        addLog(`Analysis error: ${data.message || data.error || 'Unknown error'}`, 'error')
        setIsAnalyzing(false)
      },

      onSSEError: (error) => {
        addLog(`SSE connection error: ${error.message}`, 'error')
        setIsAnalyzing(false)
      }
    })
  }

  // Test SSE endpoint (simplified URL)
  const testSSEEndpoint = async () => {
    try {
      const testUrl = `${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/analysis/pipeline/status`
      addLog(`Testing backend connection: ${testUrl}`, 'info')
      
      const response = await fetch(testUrl)
      if (response.ok) {
        const data = await response.json()
        addLog(`Backend response OK: status=${data.status}`, 'success')
      } else {
        addLog(`Backend response error: ${response.status} ${response.statusText}`, 'warning')
      }
    } catch (error) {
      addLog(`Unable to connect to backend: ${error.message}`, 'error')
    }
  }

  // Fetch analysis results when completed
  const fetchAnalysisResults = async () => {
    try {
      const response = await api.analysis.pipeline.getResults()
      if (response.data) {
        addLog(`Results ready: ${JSON.stringify(response.data.result, null, 2)}`, 'success')
      }
    } catch (error) {
      addLog(`Failed to fetch results: ${error.message}`, 'warning')
    }
  }

  // Stop analysis
  const stopAnalysis = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }
    setIsAnalyzing(false)
    addLog('Analysis stopped by user', 'warning')
  }

  // Check for existing analysis on component mount
  useEffect(() => {
    const checkExistingAnalysis = async () => {
      try {
        const response = await api.analysis.pipeline.getCurrent()
        if (response.data.hasAnalysis) {
          const status = response.data.status
          addLog(`Found existing analysis: ${status}`, 'info')
          
          if (status === 'running') {
            setIsAnalyzing(true)
            setShowLogs(true)
            addLog('Reconnecting to existing analysis...', 'info')
            startSSEMonitoring()
          } else if (status === 'completed') {
            addLog('Previous analysis completed', 'success')
            fetchAnalysisResults()
          } else if (status === 'error') {
            addLog('Previous analysis failed', 'error')
          }
        }
      } catch (error) {
        // No existing analysis or error - this is normal
        console.log('No existing analysis found')
      }
    }

    checkExistingAnalysis()
  }, [])

  // Close SSE when component unmounts
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
      }
    }
  }, [])

  return (
    <div className="analysis-section">
      <h2>DNA Analysis Pipeline</h2>
      <p>Ready to start the integrated rename and trim analysis pipeline.</p>

      {/* Uploaded Files Summary */}
      <div className="files-summary">
        <h3>Uploaded Files:</h3>
        <div className="files-list">
          <div className="file-item">
            <span className="file-type">R1</span>
            <span className="file-name">{uploadedFiles.R1?.originalName}</span>
            <span className="file-size">({formatFileSize(uploadedFiles.R1?.size || 0)})</span>
          </div>
          <div className="file-item">
            <span className="file-type">R2</span>
            <span className="file-name">{uploadedFiles.R2?.originalName}</span>
            <span className="file-size">({formatFileSize(uploadedFiles.R2?.size || 0)})</span>
          </div>
          <div className="file-item">
            <span className="file-type">Barcode</span>
            <span className="file-name">{uploadedFiles.barcode?.originalName}</span>
            <span className="file-size">({formatFileSize(uploadedFiles.barcode?.size || 0)})</span>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="analysis-actions">
        {!isAnalyzing ? (
          <button
            className="btn btn-primary"
            onClick={startPipeline}
            disabled={!uploadedFiles.R1 || !uploadedFiles.R2 || !uploadedFiles.barcode}
          >
            <Play size={20} />
            Start DNA Analysis Pipeline
          </button>
        ) : (
          <button
            className="btn btn-danger"
            onClick={stopAnalysis}
          >
            Stop Analysis
          </button>
        )}
        
        <button
          className="btn btn-secondary"
          onClick={onReset}
          disabled={isAnalyzing}
        >
          <RotateCcw size={20} />
          Upload Different Files
        </button>

        {logs.length > 0 && (
          <button
            className="btn btn-outline"
            onClick={() => setShowLogs(!showLogs)}
          >
            <Terminal size={20} />
            {showLogs ? 'Hide' : 'Show'} Debug Logs
          </button>
        )}
      </div>

      {/* Analysis Status */}
      {isAnalyzing && (
        <div className="analysis-status">
          <div className="status-indicator">
            <div className="spinner"></div>
            <span>Analysis in progress...</span>
          </div>
        </div>
      )}

      {/* Python Output Logs */}
      {showLogs && logs.length > 0 && (
        <div className="analysis-logs">
          <div className="logs-header">
            <h3>Debug Logs & Python Output</h3>
          </div>
          
          <div 
            ref={logContainerRef}
            className="logs-container"
          >
            {logs.map(log => (
              <div key={log.id} className={`log-entry log-${log.type}`}>
                <span className="log-timestamp">{log.timestamp}</span>
                <span className="log-message">{log.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Requirements Notice */}
      {(!uploadedFiles.R1 || !uploadedFiles.R2 || !uploadedFiles.barcode) && (
        <div className="requirements-notice">
          <h4>Required Files</h4>
          <p>All three files (R1, R2, and barcode CSV) are required to start the analysis pipeline.</p>
        </div>
      )}
    </div>
  )
}

export default AnalysisPanel