# Use Node.js 18 LTS
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy root package files
COPY package*.json ./

# Install root dependencies
RUN npm install

# Copy server package files
COPY server/package*.json ./server/

# Install server dependencies
RUN cd server && npm install

# Copy types
COPY types ./types

# Copy server source code
COPY server ./server

# Build the server
RUN npm run build

# Expose port
EXPOSE 8080

# Start the server
CMD ["npm", "start"]