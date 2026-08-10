# ============================================
# OUI-CRM Backend API - Dockerfile
# Multi-stage build for optimized production image
# ============================================

# ===========================================
# Stage 1: Dependencies
# ===========================================
FROM node:22-alpine AS deps

WORKDIR /app

# Install dependencies needed for native modules (bcrypt)
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Generate Prisma Client
RUN npx prisma generate

# ===========================================
# Stage 2: Builder
# ===========================================
FROM node:22-alpine AS builder

WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package*.json ./

# Copy source code
COPY . .

# Build the application
RUN npm run build

# ===========================================
# Stage 3: Production
# ===========================================
FROM node:22-alpine AS production

WORKDIR /app

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nestjs

# Install dependencies needed for bcrypt in production
RUN apk add --no-cache python3 make g++

# Copy package files
COPY --from=builder /app/package*.json ./

# Install production dependencies only
RUN npm ci --only=production

# Copy Prisma schema and generate client
COPY --from=builder /app/prisma ./prisma
RUN npx prisma generate

# Remove build dependencies to reduce image size
RUN apk del python3 make g++

# Copy built application
COPY --from=builder /app/dist ./dist

# Change ownership to non-root user
RUN chown -R nestjs:nodejs /app

# Switch to non-root user
USER nestjs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/docs || exit 1

# Start the application
CMD ["node", "dist/main.js"]
