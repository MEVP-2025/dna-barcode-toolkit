# Dockerfile - 創建包含所有依賴的Docker鏡像
FROM ubuntu:24.04

# 避免安裝過程中的交互提示
ENV DEBIAN_FRONTEND=noninteractive

# 安裝基本工具和Node.js
RUN apt-get update && apt-get install -y \
    python3.12 \
    ncbi-blast+ \
    mafft \
    wget \
    curl \
    bzip2 \
    # 添加Node.js相關
    nodejs \
    npm \
    && rm -rf /var/lib/apt/lists/*

# 創建python命令鏈接
RUN ln -sf /usr/bin/python3.12 /usr/bin/python

# 安裝Miniconda（用於生物信息學工具）
RUN ARCH=$(uname -m) && \
    if [ "$ARCH" = "x86_64" ]; then \
    CONDA_URL="https://repo.anaconda.com/miniconda/Miniconda3-latest-Linux-x86_64.sh"; \
    elif [ "$ARCH" = "aarch64" ] || [ "$ARCH" = "arm64" ]; then \
    CONDA_URL="https://repo.anaconda.com/miniconda/Miniconda3-latest-Linux-aarch64.sh"; \
    else \
    echo "Unsupported architecture: $ARCH" && exit 1; \
    fi && \
    wget $CONDA_URL -O miniconda.sh && \
    bash miniconda.sh -b -p /opt/conda && \
    rm miniconda.sh

# 添加conda到PATH
ENV PATH="/opt/conda/bin:$PATH"

# 安裝PEAR
RUN conda config --add channels bioconda && \
    conda config --add channels conda-forge && \
    conda config --add channels defaults && \
    conda install -y pear && \
    conda clean -a

# 設置工作目錄
WORKDIR /app

# 複製後端代碼並安裝依賴
COPY backend/package*.json ./backend/
RUN cd backend && npm install --production

# 複製所有後端文件
COPY backend/ ./backend/

# 複製Python腳本
COPY backend/python_scripts/ ./backend/python_scripts/

# 創建必要的目錄
RUN mkdir -p /app/uploads /app/outputs /app/backend/logs

# 暴露端口
EXPOSE 3001

# 設置環境變量
ENV NODE_ENV=production
ENV PORT=3001

# 啟動命令
CMD ["node", "/app/backend/src/server.js"]