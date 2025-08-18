// src/components/AnalysisPanel.jsx
import { CheckCircle2, Circle, Dot, Play, RotateCcw, Terminal } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { api } from '../services/api'
import '../styles/components/AnalysisPanel.css'

const AnalysisPanel = ({ uploadedFiles, onAnalysisStart, onReset }) => {
  const [logs, setLogs] = useState([])
  const [showLogs, setShowLogs] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  
  // 修改狀態：單一物種選擇模式
  const [analysisStep, setAnalysisStep] = useState('ready')
  const [detectedSpecies, setDetectedSpecies] = useState([])
  const [selectedSpecies, setSelectedSpecies] = useState(null) // 新增：選中的物種
  const [qualityConfig, setQualityConfig] = useState({}) // 現在只針對單一物種
  
  const eventSourceRef = useRef(null)
  const logContainerRef = useRef(null)

  // 組件載入時檢查檔案中是否已包含物種檢測結果
  useEffect(() => {
    if (uploadedFiles?.detectedSpecies && uploadedFiles?.defaultQualityConfig) {
      // 如果檔案已包含物種檢測結果，直接進入物種選擇階段
      setDetectedSpecies(uploadedFiles.detectedSpecies)
      setAnalysisStep('selecting') // 新的步驟：選擇物種
      
      addLog(`Pre-detected projects loaded: ${uploadedFiles.detectedSpecies.join(', ')}`, 'success')
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
        
        addLog(`Species detection completed. Found ${species.length} species: ${species.join(', ')}`, 'success')
        setAnalysisStep('selecting') // 進入物種選擇階段
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

  // 新增：選擇物種（不改變 step，保持在 selecting）
  const selectSpecies = (species) => {
    setSelectedSpecies(species)
    
    // 初始化該物種的品質配置
    setQualityConfig({
      [species]: 0 // 預設最大錯配數為 0
    })
    
    // 保持在 selecting 階段，不跳轉到 configuring
    addLog(`Selected project: ${species}`, 'info')
  }

  // 步驟 3: 開始分析（單一物種）
  const startPipeline = async () => {
    // Check if files are complete
    if (!uploadedFiles.R1 || !uploadedFiles.R2 || !uploadedFiles.barcode) {
      alert('Please upload R1, R2, and barcode files to start the pipeline.')
      return
    }

    // Check if species is selected
    if (!selectedSpecies) {
      alert('Please select a species to analyze.')
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
        qualityConfig: qualityConfig // 只包含選中物種的配置
      }

      addLog(`Starting DNA analysis for project: ${selectedSpecies}`, 'info')
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
      setAnalysisStep('selecting') // 錯誤時回到選擇階段
    }
  }

  // 處理品質參數變更（單一物種）
  const handleQualityChange = (value) => {
    setQualityConfig({
      [selectedSpecies]: parseInt(value) || 0
    })
  }

  // 重設到初始狀態
  const resetToStart = () => {
    setAnalysisStep('ready')
    setDetectedSpecies([])
    setSelectedSpecies(null)
    setQualityConfig({})
    setLogs([])
    setShowLogs(false)
  }

  // 重新檢測物種
  const redetectSpecies = () => {
    setDetectedSpecies([])
    setSelectedSpecies(null)
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
            setAnalysisStep('selecting') // 完成後回到物種選擇，可以選擇其他物種
            
            // Optionally fetch results here
            fetchAnalysisResults()
          },

          onError: (data) => {
            addLog(`Analysis error: ${data.message || data.error || 'Unknown error'}`, 'error')
            setIsAnalyzing(false)
            setAnalysisStep('selecting')
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
        setAnalysisStep('selecting')
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
        addLog(`Analysis completed for ${selectedSpecies}!`, 'success')
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
      setAnalysisStep('selecting')
      
    } catch (error) {
      console.error('Failed to stop analysis:', error)
      addLog(`Failed to stop analysis: ${error.response?.data?.error || error.message}`, 'error')
      
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
      }
      setIsAnalyzing(false)
      setAnalysisStep('selecting')
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

      {/* 物種選擇階段 */}
      {detectedSpecies.length > 0 && (
        <div className="species-selection-container">
          <h3>Analysis Steps</h3>
          <div className='steps'>
            <h3>1. Data Preprocessing</h3>
            <div className='detail'>
              <p><Dot />Standardizes read identifiers in R1/R2 FASTQ files</p>
              <p><Dot />Matches barcodes with reference database and trims adapters</p>
              <p><Dot />Applies quality filtering based on configurable parameters</p>

              <div className='input-container'>
                {/* 物種選擇列表 */}
                <div className="species-selection">
                  <div className="selection-header">
                    <h3>Select Species to Analyze</h3>
                  </div>
                  <div className="species-list">
                    {detectedSpecies.map(species => (
                      <div 
                        key={species} 
                        className={`species-option ${selectedSpecies === species ? 'selected' : ''} ${selectedSpecies && selectedSpecies !== species ? 'dimmed' : ''}`}
                        onClick={() => selectSpecies(species)}
                      >
                        <div className="species-checkbox">
                          {selectedSpecies === species ? (
                            <CheckCircle2 size={20} className="checked" />
                          ) : (
                            <Circle size={20} className="unchecked" />
                          )}
                        </div>
                        <div className="species-info">
                          <span className="species-name">{species}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 品質配置（當有選擇時顯示） */}
                {selectedSpecies && (
                  <div className="inline-configuration">
                    <div className="config-panel">
                      <div className="quality-control">
                        <label htmlFor={`quality-${selectedSpecies}`}>
                          Maximum mismatches for <strong>{selectedSpecies}</strong> :
                        </label>
                        <div className="input-group">
                          <input
                            id={`quality-${selectedSpecies}`}
                            type="number"
                            min="0"
                            max="99"
                            value={qualityConfig[selectedSpecies] || 0}
                            onChange={(e) => handleQualityChange(e.target.value)}
                            className="quality-input"
                          />
                          <span className="input-suffix">mismatches</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className='steps'>
            <h3>2. Sequence Assembly & Length Filtering</h3>
            <div className='detail'>
              <p><Dot />Tool: PEAR v0.9.6 for assembly</p>
              <p><Dot />Merges overlapping paired-end reads (R1/R2) into single contigs</p>
              <p><Dot />Converts FASTQ format to FASTA format</p>
              <p><Dot />Applies length filtering with 200bp minimum threshold</p>
            </div>
          </div>
          
          <div className='steps'>
            <h3>3. Species Assignment & Classification</h3>
            <div className='detail'>
              <p><Dot />Creates BLAST database from mitochondrial D-loop reference sequences</p>
              <p><Dot />Performs BLAST search against NCBI reference database</p>
              <div className='input-container'>
                <h3>Upload NCBI reference file</h3>
                <input type="file" id="ncbi-file" className="ncbi-reference"></input>
              </div>
              <p><Dot />Applies intelligent species assignment rules with quality control 這裡有部分要討論 Hint ["Opsariichthys_acutipinnis", "Opsariichthys_bidens", "Opsariichthys_uncirostris"]</p>
              <div className="input-container">
                <h3>I have no idea what this is</h3>
                <div className='identity-container'>
                  <p>Mitochondrial sequences with ≥</p>
                  <input type='number' id = "identity" className='identity' min="0" max="100" value={0} />
                  <p>% identity</p>
                </div>
              </div>
              <p><Dot />Separates sequences by assigned species into individual FASTA files</p>
            </div>
          </div>

          <div className='steps'>
            <h3>4. Multiple Sequence Alignment</h3>
            <div className='detail'>
              <p><Dot />Tool: MAFFT v7.505 with auto-selection strategy</p>
              <p><Dot />Aligns sequences within each species group separately</p>
              <p><Dot />Requires minimum 2 sequences per species for alignment</p>
              <p><Dot />Generates aligned FASTA files for downstream haplotype analysis</p>
            </div>
          </div>

          <div className='steps'>
            <h3>5. Duplicate Analysis & Haplotype Identification</h3>
            <div className='detail'>
              <p><Dot />Identifies identical sequences and counts their occurrence frequency</p>
              <p><Dot />Separates high-frequency sequences (potential haplotypes) from unique sequences</p>
              <p><Dot />Applies configurable copy number threshold for haplotype detection</p>
              <p><Dot />Generates separate files for common haplotypes and rare variants</p>
              <div className='input-container'>
                <h3>I have no idea what this is called</h3>
                <input type='number' min="1" max="100" value={2}/>
              </div>
            </div>
          </div>

          <div className='steps'>
            <h3>6. Location-Haplotype Table Generation</h3>
            <div className='detail'>
              <p><Dot />Parses haplotype data to extract geographic location information</p>
              <p><Dot />Creates a cross-tabulation matrix of locations vs. haplotypes</p>
              <p><Dot />Counts haplotype frequency at each sampling location</p>
              <p><Dot />Generates CSV format table for population genetic analysis</p>
            </div>
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
        {/* {analysisStep === 'ready' && (
          <button
            className="btn btn-primary"
            onClick={detectSpecies}
            disabled={!uploadedFiles.barcode}
          >
            <Settings size={20} />
            Detect Species
          </button>
        )} */}

        {analysisStep === 'selecting' && (
          <>
            {!selectedSpecies && (
              <p className="action-hint">Click on a species above to select it for analysis</p>
            )}
            {selectedSpecies && (
              <button
                className="btn btn-primary"
                onClick={startPipeline}
                disabled={!uploadedFiles.R1 || !uploadedFiles.R2 || !uploadedFiles.barcode || !selectedSpecies}
              >
                <Play size={20} />
                Start Analysis for {selectedSpecies}
              </button>
            )}
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
            <span>Analyzing {selectedSpecies}...</span>
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
      
      {/* 物種選擇提示 */}
      {analysisStep === 'selecting' && detectedSpecies.length === 0 && (
        <div className="requirements-notice">
          <h4>No Species Detected</h4>
          <p>No species were found in your barcode file. Please check your file or try re-detection.</p>
        </div>
      )}
    </div>
  )
}

export default AnalysisPanel