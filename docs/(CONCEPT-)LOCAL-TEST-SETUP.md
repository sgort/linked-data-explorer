# Local Testing Setup Guide

**Purpose:** Test shared backend changes safely before deploying to ACC/Production  
**Applies to:** CPSV Editor + Linked Data Explorer + Shared Backend  
**Last Updated:** January 17, 2026

---

## 🎯 When to Use This Guide

Use this local testing setup when making changes to:

- ✅ Backend API endpoints (new routes, modifications)
- ✅ Backend services (SPARQL, TriplyDB, Operaton integration)
- ✅ Shared infrastructure that both applications depend on
- ✅ CORS configuration
- ✅ API versioning or deprecation

**⚠️ Critical:** The backend serves both CPSV Editor and Linked Data Explorer. Breaking one breaks production workflows for government service management.

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│  Local Development Environment                          │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  CPSV Editor Frontend         Linked Data Explorer      │
│  http://localhost:3000   ←→   http://localhost:5174     │
│  (React App)                   (React + Vite)           │
│           │                            │                │
│           └────────────┬───────────────┘                │
│                        ↓                                │
│               Shared Backend                            │
│            http://localhost:3001                        │
│         (Node.js + Express + TypeScript)                │
│                        │                                │
│                        ↓                                │
│         External Services (Remote)                      │
│  ┌──────────────────────────────────────┐               │
│  │ • TriplyDB (api.open-regels.triply.cc)│              │
│  │ • Operaton (operaton.open-regels.nl)  │              │
│  └──────────────────────────────────────┘               │
└─────────────────────────────────────────────────────────┘
```

---

## 📋 Prerequisites

### Required Software

- **Node.js:** 20.x or higher
- **npm:** 10.x or higher
- **Git:** Latest version
- **Terminal:** bash, zsh, or PowerShell

### Repository Access

You need access to **three repositories**:

1. **CPSV Editor:** `github.com/your-org/cpsv-editor`
2. **Linked Data Explorer:** `github.com/your-org/linked-data-explorer`
3. **Shared Backend:** Located in `linked-data-explorer/packages/backend`

### Environment Setup

Create a dedicated workspace directory:

```bash
mkdir ~/govtech-workspace
cd ~/govtech-workspace
```

---

## 🚀 Step-by-Step Setup

### Step 1: Clone Both Repositories

```bash
cd ~/govtech-workspace

# Clone CPSV Editor
git clone git@github.com:your-org/cpsv-editor.git
cd cpsv-editor
npm install
cd ..

# Clone Linked Data Explorer (includes backend)
git clone git@github.com:your-org/linked-data-explorer.git
cd linked-data-explorer
npm install  # Install workspace dependencies
cd ..
```

### Step 2: Configure CPSV Editor for Local Backend

```bash
cd ~/govtech-workspace/cpsv-editor

# Create/verify .env.development
cat > .env.development << 'EOF'
# CPSV Editor - Development Environment Configuration
# Local development with local backend

# Backend API URL - local development
REACT_APP_BACKEND_URL=http://localhost:3001

# Environment indicator
REACT_APP_ENV=development
EOF

echo "✅ CPSV Editor configured for local backend"
```

### Step 3: Configure Linked Data Explorer for Local Backend

```bash
cd ~/govtech-workspace/linked-data-explorer/packages/frontend

# Verify .env.development exists
cat .env.development

# Expected output:
# VITE_API_BASE_URL=http://localhost:3001
# VITE_OPERATON_BASE_URL=https://operaton.open-regels.nl/engine-rest

echo "✅ Linked Data Explorer frontend configured"
```

### Step 4: Configure Backend for Local Development

```bash
cd ~/govtech-workspace/linked-data-explorer/packages/backend

# Copy environment template
cp .env.example .env

# Edit .env file
cat > .env << 'EOF'
# Server Configuration
NODE_ENV=development
PORT=3001
HOST=localhost

# CORS Configuration - IMPORTANT: Include both frontend ports
CORS_ORIGIN=http://localhost:3000,http://localhost:5173

# TriplyDB Configuration
TRIPLYDB_ENDPOINT=https://api.open-regels.triply.cc/datasets/stevengort/DMN-discovery/services/DMN-discovery/sparql
TRIPLYDB_TIMEOUT=30000

# Operaton Configuration
OPERATON_BASE_URL=https://operaton.open-regels.nl/engine-rest
OPERATON_TIMEOUT=10000

# Logging Configuration
LOG_LEVEL=debug
LOG_FORMAT=json

# Performance Configuration
CHAIN_EXECUTION_TIMEOUT=5000
MAX_CHAIN_DEPTH=10
ENABLE_CACHING=false
EOF

echo "✅ Backend configured for local development"
```

---

## 🎬 Starting the Applications

### Terminal 1: Start Backend (First!)

```bash
cd ~/govtech-workspace/linked-data-explorer/packages/backend

# Install dependencies if not done yet
npm install

# Start backend with verbose logging
npm run dev

# Expected output:
# [INFO] Server started
# [INFO] environment: development
# [INFO] host: localhost
# [INFO] port: 3001
# [INFO] corsOrigin: http://localhost:3000,http://localhost:5173
# [INFO] API available at: http://localhost:3001/v1
# [INFO] Health check: http://localhost:3001/v1/health
```

**✅ Backend is ready when you see:** `API available at: http://localhost:3001/v1`

### Terminal 2: Start CPSV Editor

```bash
cd ~/govtech-workspace/cpsv-editor

# Install dependencies if not done yet
npm install

# Start CPSV Editor
npm start

# Expected output:
# Compiled successfully!
# You can now view cpsv-editor in the browser.
# Local: http://localhost:3000
```

**✅ CPSV Editor is ready when browser opens automatically**

### Terminal 3: Start Linked Data Explorer

```bash
cd ~/govtech-workspace/linked-data-explorer/packages/frontend

# Install dependencies if not done yet
npm install

# Start Linked Data Explorer
npm run dev

# Expected output:
# VITE v5.x.x ready in XXX ms
# ➜ Local: http://localhost:5173/
# ➜ Network: use --host to expose
```

**✅ Linked Data Explorer is ready at:** `http://localhost:5173`

---

## ✅ Verification Tests

### Test 1: Backend Health Check

```bash
# In a new terminal
curl http://localhost:3001/v1/health | jq '.'

# Expected output:
# {
#   "name": "Linked Data Explorer Backend",
#   "version": "0.x.x",
#   "environment": "development",
#   "status": "healthy",
#   "uptime": 123.456,
#   "services": {
#     "triplydb": { "status": "up", "latency": 150 },
#     "operaton": { "status": "up", "latency": 120 }
#   }
# }
```

**✅ Pass:** Status is "healthy" and both services are "up"  
**❌ Fail:** Status is "degraded" or services are "down" - check external connectivity

### Test 2: CPSV Editor - Publish Functionality

1. Open `http://localhost:3000` in browser
2. Fill in required service fields
3. Click **"Publish to TriplyDB"** button
4. Verify success message appears
5. Check backend terminal for log entries:
   ```
   [INFO] [TriplyDB Routes] Service update request received
   [INFO] [TriplyDB Routes] Service update successful
   ```

**✅ Pass:** Upload succeeds, service updates, no errors in console  
**❌ Fail:** See [Troubleshooting](#troubleshooting) section

### Test 3: Linked Data Explorer - Query Editor

1. Open `http://localhost:5173` in browser
2. Verify you see "Linked Data Explorer" header
3. Click Configuration panel (gear icon)
4. Verify multiple endpoints listed
5. Click "Run Query" button (blue button, top right)
6. Verify results appear in table

**✅ Pass:** Query executes, results displayed, no CORS errors  
**❌ Fail:** CORS errors mean backend CORS_ORIGIN is misconfigured

### Test 4: Linked Data Explorer - Orchestration View

1. In `http://localhost:5173`
2. Click Orchestration icon (GitBranch, left sidebar)
3. Verify "Available DMNs" list loads (left panel)
4. Check backend terminal for:
   ```
   [INFO] DMN list request
   [INFO] Found X DMN records
   ```
5. Drag a DMN card to the middle panel
6. Verify chain validation appears

**✅ Pass:** DMNs load, drag-drop works, validation shows  
**❌ Fail:** No DMNs or errors - check TRIPLYDB_ENDPOINT in backend .env

### Test 5: Cross-Application CORS Test

Open browser console (F12) for both applications and verify **no CORS errors**:

**CPSV Editor Console (`http://localhost:3000`):**
```
✅ No errors like: "Access to fetch at 'http://localhost:3001/...' blocked by CORS"
```

**Linked Data Explorer Console (`http://localhost:5173`):**
```
✅ No errors like: "Access to fetch at 'http://localhost:3001/...' blocked by CORS"
```

**❌ If you see CORS errors:** Check backend `.env` file - `CORS_ORIGIN` must include both `http://localhost:3000` and `http://localhost:5173`

---

## 🧪 Testing New Backend Changes

When testing new backend functionality (like the new `/v1/triplydb/query` endpoint):

### Step 1: Apply Backend Changes

```bash
cd ~/govtech-workspace/linked-data-explorer/packages/backend

# Copy new files to src/ directories
cp ~/path/to/triplydb.routes.ts src/routes/
cp ~/path/to/triplydb.service.ts src/services/
cp ~/path/to/routes_index.ts src/routes/index.ts

# Backend will auto-reload (nodemon watches for changes)
```

**Watch backend terminal for:**
```
[INFO] Changes detected, restarting...
[INFO] Server started
```

### Step 2: Test New Endpoint Directly

```bash
# Test the new query endpoint
curl -X POST http://localhost:3001/v1/triplydb/query \
  -H "Content-Type: application/json" \
  -d '{
    "endpoint": "https://api.open-regels.triply.cc/datasets/stevengort/DMN-discovery/services/DMN-discovery/sparql",
    "query": "SELECT ?s ?p ?o WHERE { ?s ?p ?o } LIMIT 5"
  }' | jq '.success'

# Expected: true
```

### Step 3: Apply Frontend Changes

```bash
# For Linked Data Explorer
cd ~/govtech-workspace/linked-data-explorer/packages/frontend

# Copy updated files
cp ~/path/to/ChainBuilder.tsx src/components/ChainBuilder/
# Apply App.tsx changes manually

# Vite will hot-reload automatically
```

**Watch frontend terminal for:**
```
[vite] hmr update /src/components/ChainBuilder/ChainBuilder.tsx
```

### Step 4: Regression Testing

Run through **all verification tests** again to ensure nothing broke:

- [ ] Test 1: Backend health ✅
- [ ] Test 2: CPSV Editor publish ✅
- [ ] Test 3: Query Editor ✅
- [ ] Test 4: Orchestration view ✅
- [ ] Test 5: No CORS errors ✅

**Only deploy if all tests pass!**

---

## 🐛 Troubleshooting

### Issue: "Cannot connect to backend"

**Symptoms:**
- CPSV Editor shows "Network error"
- Linked Data Explorer shows connection failures
- Browser console: `Failed to fetch` errors

**Solutions:**

1. **Check backend is running:**
   ```bash
   curl http://localhost:3001/v1/health
   ```
   If no response → Backend not started

2. **Check port 3001 is free:**
   ```bash
   lsof -i :3001
   # Should show node process
   ```

3. **Check CORS configuration:**
   ```bash
   cd ~/govtech-workspace/linked-data-explorer/packages/backend
   grep CORS_ORIGIN .env
   # Must include: http://localhost:3000,http://localhost:5173
   ```

4. **Restart backend:**
   ```bash
   # In backend terminal: Ctrl+C to stop
   npm run dev  # Restart
   ```

---

### Issue: "CORS policy blocked"

**Symptoms:**
- Browser console shows: `Access to fetch at '...' blocked by CORS policy`
- Red CORS error in Network tab

**Solution:**

```bash
cd ~/govtech-workspace/linked-data-explorer/packages/backend

# Check CORS_ORIGIN in .env
cat .env | grep CORS_ORIGIN

# Should be:
# CORS_ORIGIN=http://localhost:3000,http://localhost:5173

# If missing ports, add them:
echo "CORS_ORIGIN=http://localhost:3000,http://localhost:5173" >> .env

# Restart backend (Ctrl+C in backend terminal, then):
npm run dev
```

---

### Issue: "DMN-discovery endpoint works but Facts endpoint doesn't"

**Symptoms:**
- Orchestration view loads DMNs from DMN-discovery
- Switching to Facts endpoint shows no DMNs or errors

**Solutions:**

1. **Verify Facts endpoint exists in TriplyDB:**
   ```bash
   curl 'https://api.open-regels.triply.cc/datasets/stevengort/Facts/services/facts-jena/sparql' \
     -X POST \
     -H 'Content-Type: application/sparql-query' \
     -d 'SELECT ?s WHERE { ?s ?p ?o } LIMIT 1'
   ```

2. **Check if Facts dataset has DMN data:**
   ```bash
   curl 'https://api.open-regels.triply.cc/datasets/stevengort/Facts/services/facts-jena/sparql' \
     -X POST \
     -H 'Content-Type: application/sparql-query' \
     -d 'PREFIX cprmv: <https://cprmv.open-regels.nl/0.3.0/>
         SELECT (COUNT(?dmn) as ?count) WHERE { ?dmn a cprmv:DecisionModel }'
   ```

3. **Verify you published DMNs to Facts dataset:**
   - Use CPSV Editor to publish a DMN
   - Wait 10 seconds for indexing
   - Try Facts endpoint again

---

### Issue: "Port 3000 already in use"

**Symptoms:**
```
Something is already running on port 3000
```

**Solutions:**

```bash
# Find what's using port 3000
lsof -i :3000

# Kill the process
kill -9 <PID>

# OR use a different port for CPSV Editor
PORT=3002 npm start

# Then update backend CORS:
# In backend .env, add: http://localhost:3002
```

---

### Issue: "Port 5173 already in use"

**Symptoms:**
```
Port 5173 is in use, trying another one...
```

**Solution:**

```bash
# Vite usually picks next available port automatically
# It will show: Local: http://localhost:5174/

# Update backend CORS if needed:
cd ~/govtech-workspace/linked-data-explorer/packages/backend
echo "CORS_ORIGIN=http://localhost:3000,http://localhost:5173,http://localhost:5174" > .env
```

---

### Issue: "Changes not appearing"

**Symptoms:**
- Made changes to code but nothing updates
- Browser still shows old version

**Solutions:**

1. **Hard refresh browser:**
   - Chrome/Firefox: `Ctrl+Shift+R` (Windows/Linux) or `Cmd+Shift+R` (Mac)
   - Clear browser cache if needed

2. **Check if dev server detected changes:**
   - **Backend:** Look for `[INFO] Changes detected, restarting...`
   - **Frontend (Vite):** Look for `[vite] hmr update ...`
   - **Frontend (React):** Look for `Compiled successfully!`

3. **Manually restart dev servers:**
   ```bash
   # In each terminal: Ctrl+C to stop, then:
   npm run dev  # or npm start for CPSV Editor
   ```

---

## 📊 Monitoring & Logs

### Backend Logs

The backend uses Winston for structured logging:

```bash
# Watch backend logs in real-time
cd ~/govtech-workspace/linked-data-explorer/packages/backend
tail -f logs/combined.log  # If file logging configured

# Or watch terminal output (default)
# Logs show in the terminal where you ran 'npm run dev'
```

**Log Levels:**
- `debug` - Detailed information (only in development)
- `info` - General operations
- `warn` - Warning conditions
- `error` - Error conditions

### Browser DevTools

**Network Tab:**
- Monitor API requests
- Check request/response headers
- Verify CORS headers present
- Inspect response payloads

**Console Tab:**
- JavaScript errors
- React warnings
- API error messages
- Network failures

---

## 🚢 Ready to Deploy?

Before pushing to ACC, complete this checklist:

### Pre-Deployment Checklist

- [ ] All verification tests pass locally
- [ ] Both CPSV Editor and Linked Data Explorer work
- [ ] No CORS errors in browser console
- [ ] Backend logs show no errors
- [ ] New features work as expected
- [ ] Existing features still work (no regression)
- [ ] Code reviewed (if working in team)
- [ ] Git commit messages are clear

### Deployment Commands

```bash
# 1. Commit your changes
cd ~/govtech-workspace/linked-data-explorer
git add packages/backend/src/
git add packages/frontend/src/
git commit -m "feat: Add dynamic TriplyDB endpoint support"

# 2. Push to ACC branch
git push origin acc

# 3. Monitor GitHub Actions
# Visit: https://github.com/your-org/linked-data-explorer/actions

# 4. Verify ACC deployment
curl https://acc.backend.linkeddata.open-regels.nl/v1/health

# 5. Test in ACC environment
# Visit: https://acc.linkeddata.open-regels.nl
# Visit: https://acc.cpsv-editor.open-regels.nl
```

---

## 📞 Getting Help

### Common Questions

**Q: Do I need to test both applications for every change?**  
A: Yes, if you're changing shared backend code. Frontend-only changes can be tested in isolation.

**Q: Can I run just one application?**  
A: Yes, but you won't catch regressions. For safety, always test both.

**Q: What if I don't have TriplyDB credentials?**  
A: The backend connects to TriplyDB for you. No credentials needed locally.

**Q: Do external services need to be running?**  
A: No. TriplyDB and Operaton are remote services that are always available.

### Support Contacts

- **Technical Issues:** Create issue in repository
- **Access Problems:** Contact repository administrator
- **Questions:** Check existing issues or documentation

---

## 📚 Related Documentation

- [CPSV Editor README](../cpsv-editor/README.md)
- [Linked Data Explorer README](../linked-data-explorer/README.md)
- [Backend API Documentation](../linked-data-explorer/packages/backend/README.md)
- [Implementation Guide](IMPLEMENTATION_GUIDE.md)

---

## 📝 Version History

| Date | Version | Changes |
|------|---------|---------|
| 2026-01-17 | 1.0.0 | Initial version for dynamic endpoint feature |

---

**🎉 Happy Testing!**

Remember: Testing both applications locally protects production and saves time debugging ACC issues.
