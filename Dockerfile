# ============================================================
# Multi-stage Dockerfile for Outbox Email Scheduler
# Stage 1: Build frontend (Vite)
# Stage 2: Build backend (TypeScript + Prisma)
# Stage 3: Runtime (serves both frontend + backend on one port)
# ============================================================

# ── Stage 1: Build the frontend ──────────────────────────────
FROM node:20-alpine AS frontend-builder

WORKDIR /app/frontend

# Install dependencies first (better layer caching)
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install --legacy-peer-deps

# Copy source and build
COPY frontend/ .
# Build without VITE_API_URL so the app defaults to same-origin (window.location.origin)
RUN npm run build


# ── Stage 2: Build the backend ───────────────────────────────
FROM node:20-alpine AS backend-builder

WORKDIR /app/backend

# Install dependencies
COPY backend/package.json backend/package-lock.json* ./
RUN npm install --legacy-peer-deps

# Copy source, generate Prisma client, and compile TypeScript
COPY backend/ .
RUN npx prisma generate
RUN npx tsc


# ── Stage 3: Production runtime ──────────────────────────────
FROM node:20-alpine AS runtime

# Install necessary tools
RUN apk add --no-cache curl

WORKDIR /app

# Copy production dependencies
COPY backend/package.json ./
RUN npm install --production --legacy-peer-deps

# Copy Prisma schema and generate client in production deps
COPY backend/prisma ./prisma
RUN npx prisma generate

# Copy compiled backend
COPY --from=backend-builder /app/backend/dist ./dist

# Copy frontend build output to serve as static files
COPY --from=frontend-builder /app/frontend/dist ./public

# Copy startup script
COPY deploy-start.sh ./
RUN chmod +x deploy-start.sh

ENV NODE_ENV=production
ENV PORT=4000

EXPOSE 4000

# The startup script runs Prisma migrations then starts the server
CMD ["sh", "./deploy-start.sh"]
