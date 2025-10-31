# Use Node.js 18 LTS
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY types/package*.json ./types/

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Build the server
RUN npm run build:server

# Expose port
EXPOSE 8080

# Start the server
CMD ["npm", "start"]