// src/components/DockerCheckPanel.jsx
import { useEffect, useState } from 'react'
import { api } from '../services/api'
import '../styles/components/DockerCheckPanel.css'

const DockerCheckPanel = ({ onDockerReady }) => {
    const [checking, setChecking] = useState(true)
    const [dockerStatus, setDockerStatus] = useState(null)
    const [showInstructions, setShowInstructions] = useState(false)

    useEffect(() => {
        checkDockerEnvironment()
    }, [])

    const checkDockerEnvironment = async () => {
        setChecking(true)
        try {
            const response = await api.docker.checkEnvironment()
            setDockerStatus(response.data)
            setChecking(false)
        } catch (error) {
            console.error('Docker check failed:', error)
            setDockerStatus({
                success: false,
                checks: {
                    dockerInstalled: false,
                    dockerRunning: false,
                    imageAvailable: false
                },
                message: error.response?.data?.message || 'Failed to check Docker environment'
            })
            setChecking(false)
        }
    }

    const getStatusText = (status) => {
        if (status === true) return 'Ready'
        if (status === false) return 'Not Ready'
        return 'Checking...'
    }

    const handleNext = () => {
        if (dockerStatus?.success) {
            onDockerReady()
        }
    }

    const renderInstructions = () => {
        const { checks } = dockerStatus

        if (!checks.dockerInstalled) {
            return (
                <div className="instructions-content">
                    <h3>Docker Not Installed</h3>
                    <p>Please download and install Docker Desktop for your operating system:</p>

                    <div className="download-links">
                        <a
                            href="https://desktop.docker.com/win/main/amd64/Docker%20Desktop%20Installer.exe"
                            className="download-button windows"
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801" />
                            </svg>
                            Windows
                        </a>

                        <a
                            href="https://desktop.docker.com/mac/main/amd64/Docker.dmg"
                            className="download-button mac"
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
                            </svg>
                            macOS (Intel)
                        </a>

                        <a
                            href="https://desktop.docker.com/mac/main/arm64/Docker.dmg"
                            className="download-button mac"
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
                            </svg>
                            macOS (Apple Silicon)
                        </a>
                    </div>

                    <div className="instruction-steps">
                        <h4>Installation Steps:</h4>
                        <ol>
                            <li>Download Docker Desktop for your operating system</li>
                            <li>Run the installer and follow the installation wizard</li>
                            <li>After installation, launch Docker Desktop</li>
                            <li>Wait for Docker to start (the icon in the system tray will turn green)</li>
                            <li>Click the "Recheck" button below</li>
                        </ol>
                    </div>
                </div>
            )
        }

        if (!checks.dockerRunning) {
            return (
                <div className="instructions-content">
                    <h3>Docker Not Running</h3>
                    <p>Docker is installed but not running. Please start Docker:</p>

                    <div className="instruction-steps">
                        <h4>Windows / macOS:</h4>
                        <ol>
                            <li>Open the Docker Desktop application</li>
                            <li>Wait for Docker to start (usually takes 10-30 seconds)</li>
                            <li>Confirm the Docker icon in the system tray shows green</li>
                            <li>Click the "Recheck" button below</li>
                        </ol>

                        <h4>Linux:</h4>
                        <ol>
                            <li>Open a terminal</li>
                            <li>Run: <code>sudo systemctl start docker</code></li>
                            <li>Check Docker status: <code>sudo systemctl status docker</code></li>
                            <li>Click the "Recheck" button below</li>
                        </ol>
                    </div>
                </div>
            )
        }

        if (!checks.imageAvailable) {
            return (
                <div className="instructions-content">
                    <h3>Downloading Docker Image</h3>
                    <p>The system is downloading the required Docker image. This may take a few minutes...</p>
                    <p className="note">Note: First-time setup requires downloading approximately 1-2 GB of data. Please ensure a stable internet connection.</p>
                </div>
            )
        }

        return null
    }

    return (
        <div className="docker-check-panel">
            <div className="panel-header">
                <div className="docker-icon">
                    <svg xmlns="http://www.w3.org/2000/svg" class="ionicon" viewBox="0 0 512 512"><path d="M507 211.16c-1.42-1.19-14.25-10.94-41.79-10.94a132.55 132.55 0 00-21.61 1.9c-5.22-36.4-35.38-54-36.57-55l-7.36-4.28-4.75 6.9a101.65 101.65 0 00-13.06 30.45c-5 20.7-1.9 40.2 8.55 56.85-12.59 7.14-33 8.8-37.28 9H15.94A15.93 15.93 0 000 262.07a241.25 241.25 0 0014.75 86.83C26.39 379.35 43.72 402 66 415.74 91.22 431.2 132.3 440 178.6 440a344.23 344.23 0 0062.45-5.71 257.44 257.44 0 0081.69-29.73 223.55 223.55 0 0055.57-45.67c26.83-30.21 42.74-64 54.38-94h4.75c29.21 0 47.26-11.66 57.23-21.65a63.31 63.31 0 0015.2-22.36l2.14-6.18z" /><path d="M47.29 236.37H92.4a4 4 0 004-4v-40.48a4 4 0 00-4-4H47.29a4 4 0 00-4 4v40.44a4.16 4.16 0 004 4M109.5 236.37h45.12a4 4 0 004-4v-40.48a4 4 0 00-4-4H109.5a4 4 0 00-4 4v40.44a4.16 4.16 0 004 4M172.9 236.37H218a4 4 0 004-4v-40.48a4 4 0 00-4-4h-45.1a4 4 0 00-4 4v40.44a3.87 3.87 0 004 4M235.36 236.37h45.12a4 4 0 004-4v-40.48a4 4 0 00-4-4h-45.12a4 4 0 00-4 4v40.44a4 4 0 004 4M109.5 178.57h45.12a4.16 4.16 0 004-4v-40.48a4 4 0 00-4-4H109.5a4 4 0 00-4 4v40.44a4.34 4.34 0 004 4M172.9 178.57H218a4.16 4.16 0 004-4v-40.48a4 4 0 00-4-4h-45.1a4 4 0 00-4 4v40.44a4 4 0 004 4M235.36 178.57h45.12a4.16 4.16 0 004-4v-40.48a4.16 4.16 0 00-4-4h-45.12a4 4 0 00-4 4v40.44a4.16 4.16 0 004 4M235.36 120.53h45.12a4 4 0 004-4V76a4.16 4.16 0 00-4-4h-45.12a4 4 0 00-4 4v40.44a4.17 4.17 0 004 4M298.28 236.37h45.12a4 4 0 004-4v-40.48a4 4 0 00-4-4h-45.12a4 4 0 00-4 4v40.44a4.16 4.16 0 004 4" /></svg>
                </div>
                <h2>Docker Environment Check</h2>
                <p>This tool requires Docker to run the analysis</p>
            </div>

            <div className="check-status">
                {checking ? (
                    <div className="checking-spinner">
                        <div className="spinner"></div>
                        <p>Checking Docker environment...</p>
                    </div>
                ) : (
                    <>
                        <div className="status-list">
                            <div className={`status-item ${dockerStatus?.checks.dockerInstalled ? 'success' : 'error'}`}>
                                <span className="status-label">Docker Installation</span>
                                <span className="status-value">{getStatusText(dockerStatus?.checks.dockerInstalled)}</span>
                            </div>

                            <div className={`status-item ${dockerStatus?.checks.dockerRunning ? 'success' : 'error'}`}>
                                <span className="status-label">Docker Service</span>
                                <span className="status-value">{getStatusText(dockerStatus?.checks.dockerRunning)}</span>
                            </div>

                            <div className={`status-item ${dockerStatus?.checks.imageAvailable ? 'success' : 'warning'}`}>
                                <span className="status-label">Analysis Image</span>
                                <span className="status-value">{getStatusText(dockerStatus?.checks.imageAvailable)}</span>
                            </div>
                        </div>

                        {!dockerStatus?.success && (
                            <button
                                className="instruction-toggle"
                                onClick={() => setShowInstructions(!showInstructions)}
                            >
                                {showInstructions ? 'Hide Instructions' : 'Show Installation Guide'}
                            </button>
                        )}

                        {showInstructions && (
                            <div className="instructions-panel">
                                {renderInstructions()}
                            </div>
                        )}
                    </>
                )}
            </div>

            <div className="panel-actions">
                <button
                    className="recheck-button"
                    onClick={checkDockerEnvironment}
                    disabled={checking}
                >
                    {checking ? 'Checking...' : 'Recheck'}
                </button>

                <button
                    className="next-button"
                    onClick={handleNext}
                    disabled={!dockerStatus?.success || checking}
                >
                    Next
                </button>
            </div>
        </div>
    )
}

export default DockerCheckPanel