# Use Node 20 slim as base image
FROM node:20-slim

# Install system dependencies, LibreOffice (headless), and font config utilities
# Using --no-install-recommends to keep the image slim
RUN apt-get update && apt-get install -y --no-install-recommends \
    libreoffice-writer \
    libreoffice-calc \
    libreoffice-impress \
    fontconfig \
    fonts-noto \
    fonts-noto-core \
    fonts-noto-extra \
    fonts-kacst \
    fonts-hosny-amiri \
    fonts-liberation \
    fonts-liberation2 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Set environment variables for headless LibreOffice
ENV HOME=/tmp
ENV LIBREOFFICE_PATH=/usr/bin/libreoffice
ENV RUNNING_IN_DOCKER=true

# Create app directory
WORKDIR /usr/src/app

# Create custom font directories
RUN mkdir -p /usr/share/fonts/truetype/custom \
    && mkdir -p /usr/lib/libreoffice/share/fonts/truetype

# Copy all gathered local fonts into the system and LibreOffice font folders
COPY ./fonts/* /usr/share/fonts/truetype/custom/
RUN cp /usr/share/fonts/truetype/custom/* /usr/lib/libreoffice/share/fonts/truetype/ 2>/dev/null || true

# Refresh system and LibreOffice font caches
RUN fc-cache -fv

# Copy package configuration files and install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy application source code (ignoring paths in .dockerignore)
COPY . .

# Create necessary directories for runtime
RUN mkdir -p downloads output logs

# Expose port (default in ecosystem.config.js is 5100, read from PORT env)
EXPOSE 5100

# Start the application
CMD [ "node", "app.js" ]
