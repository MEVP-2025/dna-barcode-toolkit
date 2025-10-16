# DNA Barcode Toolkit

A Docker-powered toolkit and web UI for end-to-end DNA barcode analysis: pre-processing of paired-end reads, species assignment, multiple sequence alignment, haplotype identification, and location × haplotype table generation.

This repository contains a React frontend (Vite) and a Node/Express backend that orchestrates Python-based bioinformatics pipelines inside Docker containers. The containerized pipeline runs tools such as PEAR, MAFFT and BLAST and exports per-species outputs for downstream analysis.

--

## Quick overview — what this project does

- Accepts paired-end sequencing reads (R1/R2), a barcode file and a reference FASTA (NCBI-like) via a web interface.
- Runs an integrated pipeline (in Docker) that merges reads, filters by length/quality, assigns species with BLAST, aligns sequences per species with MAFFT, identifies haplotypes and produces location × haplotype tables.
- Streams pipeline progress to the frontend (SSE) and stores results under the `outputs/` folder for browsing and download.

## Repository layout

- `backend/` — Express API, upload middleware, pipeline orchestration and Python scripts under `backend/python_scripts/`.
  - `backend/src/server.js` — main Express app and routes mounting
  - `backend/src/routes/` — `files.js`, `analysis.js`, `docker.js`, `outputs.js`, `index.js` (API routes)
  - `backend/src/services/` — `dockerService.js`, `pythonExecutor.js` (docker & pipeline runner)
  - `backend/python_scripts/` — Python pipeline scripts (species detection, Steps 1..6)
- `frontend/` — Vite + React web UI
  - `frontend/src/App.jsx` — app flow: Docker check → file upload → analysis → results
  - `frontend/src/components/DockerCheckPanel.jsx` — Docker environment checks and installer guidance
- `outputs/` — pipeline output files (separated per-species, tables, alignments, etc.)
- `uploads/` — uploaded FASTQ/FASTA and related files (runtime)

## Key design points

- Docker-first: actual bioinformatics tools run inside a Docker image (pulled by the backend). Host paths are mounted into the container as `/app/data` for reproducible runs.
- Single-analysis-at-a-time model: the backend tracks a `currentAnalysis` and exposes start/stop endpoints. Progress is broadcast to clients via Server-Sent Events (SSE).
- Friendly error handling for Docker-related failures (daemon not running, image not found, permission, resource issues).

## Requirements

- Node.js (16+ recommended) and npm/yarn
- Docker Desktop (macOS/Windows) or Docker Engine (Linux)
- ~2GB+ free disk space to pull the pipeline image (image size varies; expect ~1–2 GB on first pull)

## Quickstart — run locally (development)

1. Backend

```bash
cd backend
npm ci
# development (nodemon watches files):
npm run dev
# or production start:
npm start
```

Set environment variables in `.env` if needed (e.g. `PORT`, `FRONTEND_URL`, `NODE_ENV`).

2. Frontend

```bash
cd frontend
npm ci
npm run dev
```

Open the frontend (Vite) in your browser — default `http://localhost:5173` — the UI will first run a Docker environment check and (if needed) pull the pipeline image.

3. Typical user flow

- Use the UI to check Docker (or call `/api/docker/check`).
- Upload paired-end files via the UI (backed by `/api/files/upload/paired`).
- Start the integrated pipeline from the UI (calls `/api/analysis/pipeline/start`).
- Monitor progress via SSE (`/api/analysis/pipeline/progress`).
- Download results from the Outputs view or call `/api/outputs/list` and `/api/outputs/download/...`.

## Important API endpoints

- `GET /api/docker/check` — check Docker installation, daemon and image availability
- `POST /api/files/upload/paired` — upload R1, R2 and barcode files (multipart)
- `POST /api/analysis/pipeline/start` — start integrated pipeline (JSON body: `r1File`, `r2File`, `barcodeFile`, `ncbiReferenceFile`, `minLength`, `identity`, `copyNumber`, optional `qualityConfig`)
- `POST /api/analysis/pipeline/stop` — attempt graceful stop of running analysis
- `GET /api/analysis/pipeline/progress` — SSE endpoint for realtime progress messages
- `GET /api/outputs/list` — list outputs under `outputs/separated` and `outputs/table`
- `GET /api/outputs/download/:category/:species/:filename` — download a particular output file

## Example: start pipeline (request body)

```json
{
  "r1File": "uploaded-R1.fastq",
  "r2File": "uploaded-R2.fastq",
  "barcodeFile": "barcodes.csv",
  "ncbiReferenceFile": "Zp-NCBI.fasta",
  "minLength": 200,
  "identity": 98,
  "copyNumber": 2
}
```

Note: The backend expects the uploaded filenames to be present in the `uploads/` directory (the upload route returns the stored filenames to the frontend).

## Troubleshooting

- Docker not installed: install Docker Desktop (macOS/Windows) or Docker Engine (Linux). The frontend offers download links in the Docker check panel.
- Docker daemon not running: start Docker Desktop or run `sudo systemctl start docker` on Linux.
- Image pull failure: check network and Docker Hub credentials (if the image is private). You can manually pull the image used by the backend (example):

```bash
docker pull uiskskkekekk/mevp-2025:latest
```

- Permission errors when running docker: ensure your user can access docker (on Linux add to `docker` group) and that the backend process has permission to read `uploads/` and write `outputs/`.
- Out of memory / storage: free disk space or increase Docker resource limits in Docker Desktop settings.

## Development notes

- Linting and tests are configured in `backend/package.json` and `frontend/package.json`.
  - Backend: `npm run lint` and `npm test` (Jest)
  - Frontend: `npm run lint`
- Backend runs the pipeline by spawning `docker run` processes in `backend/src/services/dockerService.js` and `backend/src/services/pythonExecutor.js`.

## Where pipeline logic lives

- `backend/python_scripts/` — Python scripts implement the analysis steps (species detection, assembly, filtering, alignment, haplotype detection, table generation). The Node backend invokes these via Docker and interprets tagged JSON output from the scripts.

## Contributing

- Please open issues for bugs or feature requests.
- For code contributions, fork the repo, create a feature branch, add tests for new behavior, and open a pull request.

## License

This project is licensed under the MIT License (see `backend/package.json` for author/license metadata).
