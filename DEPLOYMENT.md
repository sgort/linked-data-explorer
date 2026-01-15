# Deployment Guide - Linked Data Explorer

This guide covers deployment procedures for both frontend and backend to Azure environments (Acceptance and Production).

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Environments](#environments)
3. [Prerequisites](#prerequisites)
4. [Build Process](#build-process)
5. [Frontend Deployment](#frontend-deployment)
6. [Backend Deployment](#backend-deployment)
7. [Environment Configuration](#environment-configuration)
8. [Health Checks & Verification](#health-checks--verification)
9. [Troubleshooting](#troubleshooting)
10. [Rollback Procedures](#rollback-procedures)

---

## 🎯 Overview

The Linked Data Explorer uses a monorepo structure with automated CI/CD pipelines via GitHub Actions. Both frontend and backend are independently deployable to Azure.

**Architecture:**
```
Frontend (React + Vite) → Azure Static Web Apps
Backend (Node.js 22 + Express) → Azure App Service
```

**Deployment Strategy:**
- **Acceptance (ACC):** Auto-deploy on push to `acc` branch
- **Production (PROD):** Auto-deploy on push to `main` branch (backend requires manual approval)

---

## 🌍 Environments

### Acceptance Environment

| Component | URL | Platform | Auto-Deploy |
|-----------|-----|----------|-------------|
| **Frontend** | https://acc.linkeddata.open-regels.nl | Azure Static Web Apps | ✅ Yes |
| **Backend** | https://acc.backend.linkeddata.open-regels.nl | Azure App Service | ✅ Yes |

- Branch: `acc`
- Purpose: Testing, validation, stakeholder review
- Approval: Not required

### Production Environment

| Component | URL | Platform | Auto-Deploy |
|-----------|-----|----------|-------------|
| **Frontend** | https://linkeddata.open-regels.nl | Azure Static Web Apps | ✅ Yes |
| **Backend** | https://backend.linkeddata.open-regels.nl | Azure App Service | ⚠️ Manual approval required |

- Branch: `main`
- Purpose: Live production system
- Approval: Required for backend only (GitHub environment protection)

---

## 🔑 Prerequisites

### Required Tools

```bash
# Git
git --version  # 2.x+

# Node.js & npm
node --version  # 22.x
npm --version   # 10.x+

# Azure CLI (for manual deployments)
az --version    # 2.x+
az login
```

### Required Secrets

GitHub repository secrets (already configured):

**Frontend:**
- `AZURE_STATIC_WEB_APPS_API_TOKEN_WITTY_BEACH_0A7CFA203` (Production)
- `AZURE_STATIC_WEB_APPS_API_TOKEN_BRAVE_BAY_04F351E03` (Acceptance)

**Backend:**
- `AZURE_WEBAPP_PUBLISH_PROFILE_PROD` (Production)
- `AZURE_WEBAPP_PUBLISH_PROFILE_ACC` (Acceptance)

---

## 🔨 Build Process

### Frontend Build

The frontend uses Vite with environment-specific builds:

```bash
cd packages/frontend

# Development (local)
npm run dev

# Acceptance build
npm run build:acc
# Uses .env.acceptance → https://acc.backend.linkeddata.open-regels.nl

# Production build
npm run build:prod
# Uses .env.production → https://backend.linkeddata.open-regels.nl
```

**Build Output:**
- Location: `packages/frontend/dist/`
- Assets: Static HTML, CSS, JS, images
- Size: ~2-3 MB

### Backend Build

The backend uses TypeScript compilation with additional asset handling:

```bash
cd packages/backend

# Install dependencies
npm ci

# Lint
npm run lint

# Build
npm run build
# Compiles TypeScript: src/ → dist/
# TypeScript automatically includes testData.json in build
```

**Build Output:**
- Location: `packages/backend/dist/`
- Includes: Compiled JavaScript, testData.json
- Size: ~1-2 MB

**Test Data Handling:**

The backend includes `testData.json` for DMN chain templates:

```
packages/backend/
├── src/
│   ├── testData.json              ← Source file
│   └── services/
│       └── template.service.ts    → imports '../testData.json'
└── dist/                           ← After build
    ├── testData.json              ← Auto-included by TypeScript
    └── services/
        └── template.service.js
```

**Important:** TypeScript's `resolveJsonModule` setting ensures `testData.json` is copied during build. No additional build steps required.

---

## 🎨 Frontend Deployment

### Automated Deployment (Recommended)

**Acceptance:**
```bash
# 1. Switch to acc branch
git checkout acc

# 2. Make changes
# ... edit files ...

# 3. Commit and push
git add .
git commit -m "feat: add new feature"
git push origin acc

# 4. GitHub Actions automatically:
#    - Installs dependencies
#    - Runs npm run build:acc
#    - Deploys to Azure Static Web Apps

# 5. Verify deployment
curl https://acc.linkeddata.open-regels.nl
```

**Production:**
```bash
# 1. Switch to main branch
git checkout main

# 2. Merge from acc
git merge acc

# 3. Push
git push origin main

# 4. GitHub Actions automatically deploys

# 5. Verify
curl https://linkeddata.open-regels.nl
```

### Manual Deployment (Emergency Only)

If GitHub Actions fails, deploy manually:

```bash
cd packages/frontend

# Build
npm run build:prod  # or build:acc

# Deploy via Azure CLI
az staticwebapp deploy \
  --name linked-data-explorer-prod \
  --resource-group RONL-Preproduction \
  --app-location dist
```

### Frontend Workflow Details

**File:** `.github/workflows/azure-frontend-acc.yml`

```yaml
trigger: push to 'acc' branch
steps:
  1. Checkout code
  2. Setup Node.js 20
  3. Build with npm run build:acc
  4. Deploy to Azure Static Web Apps
```

**File:** `.github/workflows/azure-frontend-production.yml`

```yaml
trigger: push to 'main' branch
steps:
  1. Checkout code
  2. Setup Node.js 20
  3. Build with npm run build:prod
  4. Deploy to Azure Static Web Apps
```

---

## ⚙️ Backend Deployment

### Automated Deployment (Recommended)

**Acceptance:**
```bash
# 1. Switch to acc branch
git checkout acc

# 2. Make changes
# ... edit files ...

# 3. Commit and push
git add .
git commit -m "feat: add new feature"
git push origin acc

# 4. GitHub Actions automatically:
#    - Installs dependencies (npm ci)
#    - Runs linter (npm run lint)
#    - Builds TypeScript (npm run build)
#    - Copies testData.json to dist/
#    - Installs production dependencies
#    - Deploys to Azure App Service
#    - Runs health checks (5 retries, 10s intervals)

# 5. Verify deployment
curl https://acc.backend.linkeddata.open-regels.nl/api/health
```

**Production:**
```bash
# 1. Switch to main branch
git checkout main

# 2. Merge from acc
git merge acc

# 3. Push
git push origin main

# 4. GitHub Actions builds and waits for approval

# 5. Approve deployment:
#    - Go to: https://github.com/ictu/linked-data-explorer/actions
#    - Click on the running workflow
#    - Click "Review deployments"
#    - Select "production"
#    - Click "Approve and deploy"

# 6. Deployment continues automatically
#    - Health checks run
#    - Verification endpoints tested

# 7. Verify
curl https://backend.linkeddata.open-regels.nl/api/health
```

### Manual Deployment (Emergency Only)

If GitHub Actions fails:

```bash
cd packages/backend

# 1. Build locally
npm ci
npm run lint
npm run build

# 2. Verify testData.json is in dist/
ls -la dist/testData.json  # Should exist!

# 3. Deploy via Azure CLI
az webapp up \
  --resource-group RONL-Preproduction \
  --name ronl-linkeddata-backend-acc \
  --runtime "NODE:22-lts"

# Or for production:
az webapp up \
  --resource-group RONL-Preproduction \
  --name ronl-linkeddata-backend-prod \
  --runtime "NODE:22-lts"
```

### Backend Workflow Details

**File:** `.github/workflows/azure-backend-acc.yml`

```yaml
trigger: 
  - push to 'acc' branch
  - changes in packages/backend/**
  - manual dispatch

steps:
  1. Checkout code
  2. Setup Node.js 22
  3. Install dependencies (npm ci)
  4. Run linter (npm run lint)
  5. Build TypeScript (npm run build)
  6. Verify build output:
     - Check dist/ folder exists
     - Check v1/health routes present
     - Check sparqlService imported
  7. Prepare deployment package:
     - Create deploy/ folder
     - Copy ENTIRE dist/ folder (preserve structure!)
     - Copy package.json to deploy root
     - Install production dependencies
     - Create .deployment file (disable Azure build)
  8. Deploy to Azure Web App
  9. Wait 20 seconds
  10. Health check (5 retries, 10s intervals)
  11. Verify v1 endpoints
```

**File:** `.github/workflows/azure-backend-production.yml`

Same as ACC workflow but:
- Requires manual approval (GitHub environment protection)
- Deploys to production URL
- Additional verification steps

---

## 🔐 Environment Configuration

### Frontend Environment Files

**Location:** `packages/frontend/.env.*`

**`.env.development`** (Local)
```env
VITE_API_BASE_URL=http://localhost:3001
```

**`.env.acceptance`**
```env
VITE_API_BASE_URL=https://acc.backend.linkeddata.open-regels.nl
```

**`.env.production`**
```env
VITE_API_BASE_URL=https://backend.linkeddata.open-regels.nl
```

### Backend Environment Variables

**Set via Azure App Service Configuration:**

**Core Settings:**
```bash
NODE_ENV=production              # or "acceptance"
PORT=8080
HOST=0.0.0.0
```

**CORS Configuration:**
```bash
# Acceptance
CORS_ORIGIN=https://acc.linkeddata.open-regels.nl,https://acc.backend.linkeddata.open-regels.nl

# Production
CORS_ORIGIN=https://linkeddata.open-regels.nl,https://backend.linkeddata.open-regels.nl
```

**External Services:**
```bash
TRIPLYDB_ENDPOINT=https://api.open-regels.triply.cc/datasets/stevengort/DMN-discovery/services/DMN-discovery/sparql
OPERATON_BASE_URL=https://operaton.open-regels.nl/engine-rest
```

**Logging:**
```bash
LOG_LEVEL=info                   # info (production), debug (development)
```

**Deployment:**
```bash
SCM_DO_BUILD_DURING_DEPLOYMENT=false   # We build in GitHub Actions
```

### Setting Environment Variables via Azure CLI

```bash
# Backend ACC
az webapp config appsettings set \
  --name ronl-linkeddata-backend-acc \
  --resource-group RONL-Preproduction \
  --settings \
    NODE_ENV=acceptance \
    PORT=8080 \
    CORS_ORIGIN="https://acc.linkeddata.open-regels.nl,https://acc.backend.linkeddata.open-regels.nl" \
    LOG_LEVEL=info

# Backend Production
az webapp config appsettings set \
  --name ronl-linkeddata-backend-prod \
  --resource-group RONL-Preproduction \
  --settings \
    NODE_ENV=production \
    PORT=8080 \
    CORS_ORIGIN="https://linkeddata.open-regels.nl,https://backend.linkeddata.open-regels.nl" \
    LOG_LEVEL=info
```

---

## ✅ Health Checks & Verification

### Backend Health Endpoints

**Primary Health Check:**
```bash
# Acceptance
curl https://acc.backend.linkeddata.open-regels.nl/api/health

# Production
curl https://backend.linkeddata.open-regels.nl/api/health

# Expected response (HTTP 200):
{
  "name": "Linked Data Explorer Backend",
  "version": "0.1.0",
  "status": "running",
  "environment": "production",  # or "acceptance"
  "uptime": 12345,
  "timestamp": "2026-01-15T16:00:00.000Z",
  "services": {
    "triplydb": {
      "status": "up",
      "latency": 45
    },
    "operaton": {
      "status": "up",
      "latency": 89
    }
  },
  "documentation": "/api"
}
```

**Versioned Health Check:**
```bash
curl https://backend.linkeddata.open-regels.nl/v1/health
# Same response format
```

### Frontend Health Check

```bash
# Acceptance
curl -I https://acc.linkeddata.open-regels.nl
# Expected: HTTP 200

# Production
curl -I https://linkeddata.open-regels.nl
# Expected: HTTP 200
```

### Automated Health Checks

GitHub Actions workflows include automatic health checks:

```yaml
- name: Health check
  run: |
    for i in {1..5}; do
      response=$(curl -s -o /dev/null -w "%{http_code}" $URL/api/health)
      if [ "$response" = "200" ]; then
        echo "✅ Health check passed!"
        exit 0
      fi
      echo "Attempt $i: Got HTTP $response, retrying in 10 seconds..."
      sleep 10
    done
    echo "❌ Health check failed after 5 attempts"
    exit 1
```

### Manual Verification Checklist

After deployment, verify:

**Backend:**
- [ ] Health endpoint returns HTTP 200
- [ ] TriplyDB service status is "up"
- [ ] Operaton service status is "up"
- [ ] `/v1/dmns` returns DMN list
- [ ] `/api/chains/templates` returns templates
- [ ] Template data includes `dagVanAanvraag` with current date
- [ ] No 404 errors in logs

**Frontend:**
- [ ] Homepage loads successfully
- [ ] DMN list displays correctly
- [ ] Chain builder drag-and-drop works
- [ ] "Fill with test data" button populates forms
- [ ] Template loading works
- [ ] Chain execution returns results
- [ ] No console errors

---

## 🔧 Troubleshooting

### Common Issues

#### Issue 1: Backend Returns 404 for `/v1/*` Endpoints

**Symptoms:**
- `/v1/health` → HTTP 404
- `/v1/dmns` → HTTP 404
- `/api/health` works fine

**Cause:** Deployment folder structure flattened, breaking module paths.

**Solution:**
1. Check `.github/workflows/azure-backend-*.yml`
2. Ensure deployment uses `cp -r dist deploy/` (NOT `cp -r dist/* deploy/`)
3. Redeploy

**Verification:**
```bash
# SSH into App Service
az webapp ssh --name ronl-linkeddata-backend-acc --resource-group RONL-Preproduction

# Check structure
ls -la /home/site/wwwroot/
# Should see: dist/, package.json, node_modules/

ls -la /home/site/wwwroot/dist/
# Should see: index.js, routes/, services/, etc.
```

---

#### Issue 2: Container Crashes with Exit Code 1

**Symptoms:**
- Backend starts, then crashes after ~1 minute
- Azure logs show: "Container has finished running with exit code: 1"
- No application error logs

**Cause:** Missing `testData.json` in deployment.

**Solution:**
1. Verify `testData.json` exists in `packages/backend/src/`
2. Ensure `tsconfig.json` has `"resolveJsonModule": true`
3. Build locally and check: `ls packages/backend/dist/testData.json`
4. If missing, TypeScript isn't including it - check import path
5. Redeploy

**Verification:**
```bash
# After deployment
az webapp log tail --name ronl-linkeddata-backend-acc --resource-group RONL-Preproduction

# Should see successful startup logs, not crash
```

---

#### Issue 3: CORS Errors in Frontend

**Symptoms:**
- Frontend loads, but API calls fail
- Browser console: "CORS policy: No 'Access-Control-Allow-Origin' header"

**Cause:** `CORS_ORIGIN` environment variable not set or incorrect.

**Solution:**
```bash
# Check current settings
az webapp config appsettings list \
  --name ronl-linkeddata-backend-acc \
  --resource-group RONL-Preproduction \
  | jq '.[] | select(.name=="CORS_ORIGIN")'

# Update if needed
az webapp config appsettings set \
  --name ronl-linkeddata-backend-acc \
  --resource-group RONL-Preproduction \
  --settings CORS_ORIGIN="https://acc.linkeddata.open-regels.nl,https://acc.backend.linkeddata.open-regels.nl"

# Restart
az webapp restart --name ronl-linkeddata-backend-acc --resource-group RONL-Preproduction
```

---

#### Issue 4: Test Data Shows Old Values

**Symptoms:**
- Templates load with static dates (not today)
- Manual chain building shows different data than templates

**Cause:** Old version of `template.service.ts` without dynamic date fix.

**Solution:**
Ensure `template.service.ts` has:

```typescript
defaultInputs: {
  ...typedTestData.chainTemplates['template-id'].testInputs,
  dagVanAanvraag: new Date().toISOString().split('T')[0], // Always today
}
```

---

#### Issue 5: GitHub Actions Deployment Fails

**Symptoms:**
- Workflow runs but deployment step fails
- Error: "Publish profile authentication failed"

**Cause:** Azure publish profile expired or incorrect.

**Solution:**
1. Download new publish profile from Azure Portal
2. Update GitHub secret
3. Retry deployment

```bash
# Download publish profile
az webapp deployment list-publishing-profiles \
  --name ronl-linkeddata-backend-acc \
  --resource-group RONL-Preproduction \
  --xml

# Copy output and update GitHub secret AZURE_WEBAPP_PUBLISH_PROFILE_ACC
```

---

### Monitoring & Logs

**View Deployment Logs:**
```bash
# In GitHub
https://github.com/ictu/linked-data-explorer/actions

# Via Azure CLI
az webapp log deployment show \
  --name ronl-linkeddata-backend-acc \
  --resource-group RONL-Preproduction
```

**View Application Logs:**
```bash
# Real-time logs
az webapp log tail \
  --name ronl-linkeddata-backend-acc \
  --resource-group RONL-Preproduction

# Download logs
az webapp log download \
  --name ronl-linkeddata-backend-acc \
  --resource-group RONL-Preproduction \
  --log-file backend-logs.zip
```

**View Container Logs:**
```bash
# Docker container logs
az webapp log tail \
  --name ronl-linkeddata-backend-acc \
  --resource-group RONL-Preproduction \
  --level error
```

---

## 🔄 Rollback Procedures

### Option 1: Git Revert (Recommended)

```bash
# 1. Find the commit to revert
git log --oneline

# 2. Revert the problematic commit
git revert <commit-hash>

# 3. Push (triggers automatic redeploy)
git push origin acc  # or main
```

### Option 2: Redeploy Previous Version

```bash
# 1. Go to GitHub Actions
https://github.com/ictu/linked-data-explorer/actions

# 2. Find the last successful deployment

# 3. Click "Re-run all jobs"
```

### Option 3: Azure Portal Rollback

```bash
# 1. Go to Azure Portal
# 2. Navigate to App Service
# 3. Deployment Center → Deployment History
# 4. Click on previous successful deployment
# 5. Click "Redeploy"
```

### Option 4: Manual Rollback

```bash
# 1. Checkout previous working commit
git checkout <previous-commit-hash>

# 2. Create rollback branch
git checkout -b rollback-<issue>

# 3. Push to trigger deployment
git push origin rollback-<issue>

# 4. Merge to acc/main after verification
```

---

## 📊 Deployment Checklist

### Pre-Deployment

- [ ] Code reviewed and approved
- [ ] Tests passing locally
- [ ] Linter passes
- [ ] Changes documented in changelog
- [ ] Environment variables verified
- [ ] `testData.json` synchronized (if updated)
- [ ] Build tested locally

### During Deployment

- [ ] GitHub Actions workflow triggered
- [ ] Build step completes successfully
- [ ] Linting passes
- [ ] Deployment package created correctly
- [ ] Azure deployment succeeds
- [ ] Health checks pass (5 retries)

### Post-Deployment

- [ ] Health endpoint returns HTTP 200
- [ ] Frontend loads without errors
- [ ] Backend API endpoints respond correctly
- [ ] Test data loads with current date
- [ ] No console errors in frontend
- [ ] No error logs in backend
- [ ] Stakeholders notified (if production)

---

## 📝 Summary

**Key Points:**

1. **Automated Deployment:** Push to `acc` or `main` triggers automatic deployment
2. **Manual Approval:** Production backend requires approval via GitHub
3. **Health Checks:** Automatic verification with 5 retries after each deployment
4. **Test Data:** `testData.json` automatically included in builds via TypeScript
5. **Structure:** Preserve `dist/` folder structure in deployment
6. **Monitoring:** Use Azure CLI and GitHub Actions for logs
7. **Rollback:** Multiple options available (Git revert, re-run workflow, Azure Portal)

**URLs Quick Reference:**

| Environment | Frontend | Backend |
|-------------|----------|---------|
| **ACC** | https://acc.linkeddata.open-regels.nl | https://acc.backend.linkeddata.open-regels.nl |
| **PROD** | https://linkeddata.open-regels.nl | https://backend.linkeddata.open-regels.nl |

**Support:**
- GitHub Actions: https://github.com/ictu/linked-data-explorer/actions
- Azure Portal: https://portal.azure.com → RONL-Preproduction
- Documentation: See README.md files in root and packages/

---

## 📚 Related Documentation

- [Root README.md](../README.md) - Project overview
- [Backend README.md](../packages/backend/README.md) - Backend specifics
- [Frontend README.md](../packages/frontend/README.md) - Frontend specifics
- [Test Data Guide](./DUAL_TESTDATA_SETUP.md) - Test data management
- [Changelog](../packages/frontend/src/changelog.json) - Version history
