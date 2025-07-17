// src/components/FileUpload.jsx
import { File, Upload, X } from 'lucide-react'
import { useCallback, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import api from '../services/api'

const FileUpload = ({ onFilesUploaded }) => {
  const [files, setFiles] = useState({
    R1: null,
    R2: null,
    barcode: null
  })
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [error, setError] = useState(null)

  const onDrop = useCallback((acceptedFiles) => {
    const file = acceptedFiles[0]
    if (!file) return

    // Simple auto-detection based on filename
    let fileType = 'R1'
    if (file.name.includes('R2') || file.name.includes('_2') || file.name.includes('r2')) {
      fileType = 'R2'
    } else if (file.name.endsWith('.csv')) {
      fileType = 'barcode'
    }

    setFiles(prev => ({
      ...prev,
      [fileType]: file
    }))
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/plain': ['.fq', '.fastq'],
      'text/csv': ['.csv']
    },
    multiple: false
  })

  const removeFile = (type) => {
    setFiles(prev => ({
      ...prev,
      [type]: null
    }))
  }

  const uploadFiles = async () => {
    if (!files.R1 || !files.R2) {
      setError('Please select both R1 and R2 files')
      return
    }

    try {
      setUploading(true)
      setUploadProgress(0)
      setError(null)

      const formData = new FormData()
      formData.append('R1', files.R1)
      formData.append('R2', files.R2)
      if (files.barcode) {
        formData.append('barcode', files.barcode)
      }

      const response = await api.files.uploadPaired(formData, (progressEvent) => {
        const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total)
        setUploadProgress(progress)
      })

      onFilesUploaded(response.data.files)

    } catch (error) {
      setError(error.response?.data?.error || 'Upload failed')
    } finally {
      setUploading(false)
      setUploadProgress(0)
    }
  }

  const formatFileSize = (bytes) => {
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    if (bytes === 0) return '0 Bytes'
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i]
  }

  return (
    <div className="upload-section">
      <h2>Upload Files</h2>
      <p>Upload R1, R2 FASTQ files and optional barcode CSV file</p>

      {error && (
        <div className="alert error">
          {error}
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}

      <div className="file-drop-zone" {...getRootProps()}>
        <input {...getInputProps()} />
        {isDragActive ? (
          <div className="drop-active">
            <Upload size={48} />
            <p>Drop files here...</p>
          </div>
        ) : (
          <div className="drop-idle">
            <Upload size={48} />
            <p>Drag & drop files here, or click to select</p>
            <small>Supported: .fq, .fastq, .csv</small>
          </div>
        )}
      </div>

      {/* Selected Files */}
      <div className="selected-files">
        {Object.entries(files).map(([type, file]) => {
          if (!file) return null
          return (
            <div key={type} className="file-item">
              <File size={20} />
              <div className="file-info">
                <span className="file-name">{file.name}</span>
                <span className="file-size">({formatFileSize(file.size)})</span>
                <span className="file-type">{type}</span>
              </div>
              <button className="remove-btn" onClick={() => removeFile(type)}>
                <X size={16} />
              </button>
            </div>
          )
        })}
      </div>

      {/* Upload Progress */}
      {uploading && (
        <div className="upload-progress">
          <div className="progress-bar">
            <div 
              className="progress-fill" 
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
          <span>{uploadProgress}%</span>
        </div>
      )}

      {/* Upload Button */}
      <div className="upload-actions">
        <button
          className="btn btn-primary"
          onClick={uploadFiles}
          disabled={!files.R1 || !files.R2 || !files.barcode || uploading}
        >
          {uploading ? 'Uploading...' : 'Upload Files'}
        </button>
        
        <div className="file-status">
          <span className={files.R1 ? 'ready' : 'missing'}>
            R1: {files.R1 ? '✓' : '✗'}
          </span>
          <span className={files.R2 ? 'ready' : 'missing'}>
            R2: {files.R2 ? '✓' : '✗'}
          </span>
          <span className={files.barcode ? 'ready' : 'missing'}>
            Barcode: {files.barcode ? '✓' : '✗'}
          </span>
        </div>
      </div>
    </div>
  )
}

export default FileUpload