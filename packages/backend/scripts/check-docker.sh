#!/usr/bin/env bash
set -euo pipefail

RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m'

REQUIRED_CONTAINERS=("ronl-postgres")

echo ""
echo "Checking Docker services..."
echo ""

# Check Docker daemon
if ! docker info > /dev/null 2>&1; then
  echo -e "${RED}✗ Docker is not running.${NC}"
  echo "  Start Docker Desktop (or the Docker daemon) and try again."
  echo ""
  exit 1
fi

# Check each required container
ALL_OK=true
for CONTAINER in "${REQUIRED_CONTAINERS[@]}"; do
  STATUS=$(docker inspect --format='{{.State.Status}}' "$CONTAINER" 2>/dev/null || echo "missing")
  HEALTH=$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$CONTAINER" 2>/dev/null || echo "missing")

  if [ "$STATUS" != "running" ]; then
    echo -e "${RED}✗ $CONTAINER${NC} — not running (status: $STATUS)"
    ALL_OK=false
  elif [ "$HEALTH" != "healthy" ] && [ "$HEALTH" != "none" ]; then
    echo -e "${YELLOW}⚠ $CONTAINER${NC} — running but not yet healthy (health: $HEALTH)"
    ALL_OK=false
  else
    echo -e "${GREEN}✓ $CONTAINER${NC}"
  fi
done

echo ""

if [ "$ALL_OK" = false ]; then
  echo -e "${RED}Docker services are not ready.${NC} Start the postgres container:"
  echo ""
  echo "  docker start ronl-postgres"
  echo ""
  echo "Or if it doesn't exist yet, create it (see .env.example for credentials):"
  echo ""
  echo "  docker run -d --name ronl-postgres -p 5432:5432 \\"
  echo "    -e POSTGRES_PASSWORD=postgres postgres:15"
  echo ""
  exit 1
fi

echo -e "${GREEN}All Docker services are running. Starting dev server...${NC}"
echo ""