#!/bin/bash
set -e

echo "==> Installing root dependencies..."
yarn install

echo "==> Installing server dependencies..."
cd server
yarn install --legacy-peer-deps

echo "==> Building TypeScript..."
cd ..
npx tsc --project server/tsconfig.server.json

echo "==> Checking build output..."
ls -la server/lib/

echo "==> Build complete!"
