#!/bin/bash
set -e  # Exit on error
set -x  # Print commands

echo "==> Current directory:"
pwd

echo "==> Installing root dependencies..."
yarn install

echo "==> Installing server dependencies..."
cd server
yarn install --legacy-peer-deps
cd ..

echo "==> Building TypeScript..."
echo "Running: npx tsc --project server/tsconfig.server.json"
npx tsc --project server/tsconfig.server.json

echo "==> Checking if build output exists..."
if [ -d "server/lib" ]; then
  echo "✓ server/lib directory exists"
  ls -la server/lib/
else
  echo "✗ ERROR: server/lib directory was not created!"
  echo "Checking server directory contents:"
  ls -la server/
  exit 1
fi

echo "==> Build complete!"
