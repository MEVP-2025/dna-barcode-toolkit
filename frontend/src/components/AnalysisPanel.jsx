// src/components/AnalysisPanel.jsx
import { Play, RotateCcw, Terminal } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { api } from '../services/api'

const AnalysisPanel = ({ uploadedFiles, onAnalysisStart, onReset }) => {
  const [logs, setLogs] = useState([])
  const [showLogs, setShowLogs] = useState(false)
  const [currentAnalysisId, setCurrentAnalysisId] = useState(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  
  const eventSourceRef = useRef(null)
  const logContainerRef = useRef(null)

  const formatFileSize = (bytes) => {
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    if (bytes === 0) return '0 Bytes'
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i]
  }

  // 添加日誌條目
  const addLog = (message, type = 'info') => {
    const logEntry = {
      id: Date.now() + Math.random(),
      message,
      type,
      timestamp: new Date().toLocaleTimeString()
    }
    
    setLogs(prev => [...prev, logEntry])
    
    // 自動滾動到底部
    setTimeout(() => {
      if (logContainerRef.current) {
        logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight
      }
    }, 100)
  }

  const startPipeline = async () => {
    // 檢查檔案是否完整
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

      addLog('🚀 正在啟動DNA分析流水線...', 'info')

      // 直接呼叫API啟動分析
      const response = await api.analysis.pipeline.start(params)
      const analysisId = response.data.analysisId

      addLog(`📋 分析任務已建立: ${analysisId}`, 'success')
      setCurrentAnalysisId(analysisId)

      // 同時呼叫原有的callback（如果需要的話）
      if (onAnalysisStart) {
        onAnalysisStart('pipeline', params)
      }

      // 開始SSE監聽
      startSSEMonitoring(analysisId)

    } catch (error) {
      console.error('啟動分析失敗:', error)
      addLog(`❌ 啟動失敗: ${error.response?.data?.error || error.message}`, 'error')
      setIsAnalyzing(false)
      
      // 測試：嘗試手動訪問SSE端點
      addLog(`🔍 測試SSE端點: ${api.analysis.pipeline.getSSEUrl?.(analysisId) || 'URL未定義'}`, 'warning')
    }
  }

  const startSSEMonitoring = (analysisId) => {
    addLog('🔗 開始建立SSE連線...', 'info')
    
    // 先測試SSE端點是否可訪問
    testSSEEndpoint(analysisId)
    
    eventSourceRef.current = api.analysis.pipeline.watchProgress(analysisId, {
      onConnect: () => {
        addLog('✅ SSE連線已建立', 'success')
      },

      onStart: (data) => {
        addLog(data.message || '開始監聽分析進度...', 'info')
      },

      onProgress: (data) => {
        addLog(data.message || '分析進行中...', 'info')
      },

      onComplete: (data) => {
        addLog(data.message || '✅ 分析完成！', 'success')
        setIsAnalyzing(false)
      },

      onError: (data) => {
        addLog(`❌ SSE錯誤: ${data.message || data.error || '未知錯誤'}`, 'error')
        setIsAnalyzing(false)
      }
    })
  }

  // 測試SSE端點
  const testSSEEndpoint = async (analysisId) => {
    try {
      const testUrl = `${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/analysis/pipeline/status/${analysisId}`
      addLog(`🧪 測試後端連線: ${testUrl}`, 'info')
      
      const response = await fetch(testUrl)
      if (response.ok) {
        const data = await response.json()
        addLog(`✅ 後端回應正常: 狀態=${data.status}`, 'success')
      } else {
        addLog(`⚠️ 後端回應異常: ${response.status} ${response.statusText}`, 'warning')
      }
    } catch (error) {
      addLog(`❌ 無法連接後端: ${error.message}`, 'error')
    }
  }

  // 停止分析
  const stopAnalysis = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }
    setIsAnalyzing(false)
    addLog('🛑 分析已停止', 'warning')
  }

  // 組件卸載時關閉SSE
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

      {/* Debug資訊 */}
      <div className="debug-info">
        <p><strong>當前分析ID:</strong> {currentAnalysisId || '未啟動'}</p>
        <p><strong>分析狀態:</strong> {isAnalyzing ? '進行中' : '閒置'}</p>
        <p><strong>SSE連線:</strong> {eventSourceRef.current ? '已連接' : '未連接'}</p>
      </div>

      {/* Python輸出日誌 */}
      {showLogs && logs.length > 0 && (
        <div className="analysis-logs">
          <div className="logs-header">
            <h3>🔍 Debug Logs & Python Output</h3>
            {currentAnalysisId && (
              <span className="analysis-id">ID: {currentAnalysisId}</span>
            )}
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
          <h4>⚠️ Required Files</h4>
          <p>All three files (R1, R2, and barcode CSV) are required to start the analysis pipeline.</p>
        </div>
      )}
    </div>
  )
}

export default AnalysisPanel