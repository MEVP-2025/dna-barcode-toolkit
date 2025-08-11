// src/components/AnalysisPanel.jsx
import { Play, RotateCcw, Settings, Terminal } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { api } from '../services/api'
import '../styles/components/AnalysisPanel.css'

const AnalysisPanel = ({ uploadedFiles, onAnalysisStart, onReset }) => {
  const [logs, setLogs] = useState([])
  const [showLogs, setShowLogs] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  
  // 修改狀態：檢查是否已有物種檢測結果
  const [analysisStep, setAnalysisStep] = useState('ready')
  const [detectedSpecies, setDetectedSpecies] = useState([])
  const [qualityConfig, setQualityConfig] = useState({})
  
  const eventSourceRef = useRef(null)
  const logContainerRef = useRef(null)

  // 組件載入時檢查檔案中是否已包含物種檢測結果
  useEffect(() => {
    if (uploadedFiles?.detectedSpecies && uploadedFiles?.defaultQualityConfig) {
      // 如果檔案已包含物種檢測結果，直接進入配置階段
      setDetectedSpecies(uploadedFiles.detectedSpecies)
      setQualityConfig(uploadedFiles.defaultQualityConfig)
      setAnalysisStep('configuring')
      
      addLog(`Pre-detected species loaded: ${uploadedFiles.detectedSpecies.join(', ')}`, 'success')
    } else if (uploadedFiles?.barcode) {
      // 如果只有檔案但沒有物種檢測結果，停留在準備階段
      setAnalysisStep('ready')
    }
  }, [uploadedFiles])

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

  // 步驟 1: 物種檢測 (現在只在需要時執行)
  const detectSpecies = async () => {
    if (!uploadedFiles.barcode) {
      alert('Please upload barcode file first.')
      return
    }

    try {
      setAnalysisStep('detecting')
      setLogs([])
      setShowLogs(true)
      
      addLog('Starting species detection...', 'info')

      const response = await api.analysis.pipeline.detectSpecies({
        barcodeFile: `uploads/${uploadedFiles.barcode.filename}`
      })

      if (response.data.success) {
        const species = response.data.data.species
        setDetectedSpecies(species)
        
        // 初始化品質配置（預設值）
        const defaultConfig = {}
        species.forEach(sp => {
          defaultConfig[sp] = 0 // 預設最大錯配數為 0
        })
        setQualityConfig(defaultConfig)
        
        addLog(`Species detection completed. Found ${species.length} species: ${species.join(', ')}`, 'success')
        setAnalysisStep('configuring')
      } else {
        addLog('Species detection failed', 'error')
        setAnalysisStep('ready')
      }

    } catch (error) {
      console.error('Failed to detect species:', error)
      addLog(`Species detection failed: ${error.response?.data?.error || error.message}`, 'error')
      setAnalysisStep('ready')
    }
  }

  // 步驟 2: 開始分析（帶品質配置）
  const startPipeline = async () => {
    // Check if files are complete
    if (!uploadedFiles.R1 || !uploadedFiles.R2 || !uploadedFiles.barcode) {
      alert('Please upload R1, R2, and barcode files to start the pipeline.')
      return
    }

    // Check if species are configured
    if (detectedSpecies.length === 0) {
      alert('Please detect species first or configure manually.')
      return
    }

    try {
      setIsAnalyzing(true)
      setAnalysisStep('running')
      setShowLogs(true)
      
      const params = {
        r1File: `uploads/${uploadedFiles.R1.filename}`,
        r2File: `uploads/${uploadedFiles.R2.filename}`,
        barcodeFile: `uploads/${uploadedFiles.barcode.filename}`,
        qualityConfig: qualityConfig
      }

      addLog('Starting DNA analysis pipeline with quality configuration...', 'info')
      addLog(`Quality settings: ${JSON.stringify(qualityConfig)}`, 'info')

      // Call API to start analysis
      const response = await api.analysis.pipeline.start(params)
      
      addLog('Analysis task started successfully', 'success')

      // Call original callback if needed
      if (onAnalysisStart) {
        onAnalysisStart('pipeline', params)
      }

      // 延遲啟動 SSE 監控，讓後端有時間設置分析狀態
      setTimeout(() => {
        startSSEMonitoring()
      }, 1000)

    } catch (error) {
      console.error('Failed to start analysis:', error)
      addLog(`Startup failed: ${error.response?.data?.error || error.message}`, 'error')
      setIsAnalyzing(false)
      setAnalysisStep('configuring')
    }
  }

  // 處理品質參數變更
  const handleQualityChange = (species, value) => {
    setQualityConfig(prev => ({
      ...prev,
      [species]: parseInt(value) || 0
    }))
  }

  // 重設到初始狀態
  const resetToStart = () => {
    setAnalysisStep('ready')
    setDetectedSpecies([])
    setQualityConfig({})
    setLogs([])
    setShowLogs(false)
  }

  // 重新檢測物種
  const redetectSpecies = () => {
    setDetectedSpecies([])
    setQualityConfig({})
    detectSpecies()
  }

  const startSSEMonitoring = () => {
    addLog('Starting SSE connection...', 'info')
    
    // 先檢查是否有正在進行的分析
    checkAnalysisExists()
      .then(() => {
        // 如果有分析存在，則建立 SSE 連線
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
            setAnalysisStep('ready')
            
            // Optionally fetch results here
            fetchAnalysisResults()
          },

          onError: (data) => {
            addLog(`Analysis error: ${data.message || data.error || 'Unknown error'}`, 'error')
            setIsAnalyzing(false)
            setAnalysisStep('configuring')
          },

          onSSEError: (error) => {
            addLog(`SSE connection error: ${error.message}`, 'warning')
            // 不要立即停止分析狀態，可能只是連線問題
            // 嘗試重新連線
            setTimeout(() => {
              if (isAnalyzing && eventSourceRef.current?.readyState === EventSource.CLOSED) {
                addLog('Attempting to reconnect SSE...', 'info')
                startSSEMonitoring()
              }
            }, 3000)
          }
        })
      })
      .catch((error) => {
        addLog(`No active analysis found: ${error.message}`, 'warning')
        setIsAnalyzing(false)
        setAnalysisStep('configuring')
      })
  }

  // 檢查是否有正在進行的分析
  const checkAnalysisExists = async () => {
    try {
      const response = await api.analysis.pipeline.getStatus()
      if (response.data && response.data.status === 'running') {
        return true
      } else {
        throw new Error('No running analysis found')
      }
    } catch (error) {
      throw new Error('No active analysis')
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
  const stopAnalysis = async () => {
    try {
      addLog('Stopping analysis...', 'warning')
      
      const response = await api.analysis.pipeline.stop()
      addLog(`Analysis stopped: ${response.data.message}`, 'warning')
      
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
      }
      
      setIsAnalyzing(false)
      setAnalysisStep('configuring')
      
    } catch (error) {
      console.error('Failed to stop analysis:', error)
      addLog(`Failed to stop analysis: ${error.response?.data?.error || error.message}`, 'error')
      
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
      }
      setIsAnalyzing(false)
      setAnalysisStep('configuring')
    }
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
            setAnalysisStep('running')
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

      {/* 物種檢測結果和品質配置 */}
      {analysisStep === 'configuring' && detectedSpecies.length > 0 && (
        <div className="quality-configuration">
          <p>Set maximum allowed mismatches for each species:</p>
          
          <div className="species-config-list">
            {detectedSpecies.map(species => (
              <div key={species} className="species-config-item">
                <label htmlFor={`quality-${species}`}>
                  <strong>{species}</strong>:
                </label>
                <input
                  id={`quality-${species}`}
                  type="number"
                  min="0"
                  max="20"
                  value={qualityConfig[species] || 0}
                  onChange={(e) => handleQualityChange(species, e.target.value)}
                  className="quality-input"
                />
                <span className="input-help">max mismatches</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 檔案摘要 */}
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

      {/* 動作按鈕 */}
      <div className="analysis-actions">
        {analysisStep === 'ready' && (
          <button
            className="btn btn-primary"
            onClick={detectSpecies}
            disabled={!uploadedFiles.barcode}
          >
            <Settings size={20} />
            Detect Species & Configure
          </button>
        )}

        {analysisStep === 'configuring' && (
          <>
            <button
              className="btn btn-primary"
              onClick={startPipeline}
              disabled={!uploadedFiles.R1 || !uploadedFiles.R2 || !uploadedFiles.barcode || detectedSpecies.length === 0}
            >
              <Play size={20} />
              Start DNA Analysis
            </button>
            <button
              className="btn btn-secondary"
              onClick={resetToStart}
            >
              Back to File Selection
            </button>
          </>
        )}

        {analysisStep === 'running' && (
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

      {/* 分析狀態 */}
      {isAnalyzing && (
        <div className="analysis-status">
          <div className="status-indicator">
            <div className="spinner"></div>
            <span>Analysis in progress...</span>
          </div>
        </div>
      )}

      {/* Python 輸出日誌 */}
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

      {/* 需求提示 */}
      {analysisStep === 'ready' && (!uploadedFiles.R1 || !uploadedFiles.R2 || !uploadedFiles.barcode) && (
        <div className="requirements-notice">
          <h4>Required Files</h4>
          <p>All three files (R1, R2, and barcode CSV) are required to start the analysis pipeline.</p>
        </div>
      )}
      
      {/* 物種檢測提示 */}
      {analysisStep === 'configuring' && detectedSpecies.length === 0 && (
        <div className="requirements-notice">
          <h4>Species Detection Required</h4>
          <p>Please detect species from your barcode file before proceeding with the analysis.</p>
        </div>
      )}
    </div>
  )
}

export default AnalysisPanel