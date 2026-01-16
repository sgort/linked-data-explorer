# Linked Data Explorer

> A React-based SPARQL visualization and query tool for exploring Dutch Government Data (Regels Overheid)

[![Deployed on Azure Static Web Apps](https://img.shields.io/badge/Azure-Static_Web_Apps-blue?logo=microsoft-azure)](https://linkeddata.open-regels.nl)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue?logo=typescript)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19.2-61dafb?logo=react)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-6.2-646cff?logo=vite)](https://vitejs.dev/)
[![Node.js](https://img.shields.io/badge/Node.js-22-339933?logo=node.js)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-4.18-000000?logo=express)](https://expressjs.com/)
![License](https://img.shields.io/badge/License-EUPL-yellow.svg)

---

## 📋 Table of Contents

- [Architecture Overview](#-architecture-overview)
- [Overview](#-overview)
- [Features](#-features)
- [Live Deployments](#-live-deployments)
- [Technology Stack](#-technology-stack)
- [Project Structure](#-project-structure)
- [Getting Started](#-getting-started)
- [Development](#-development)
- [Code Quality](#-code-quality)
- [Deployment](#-deployment)
- [Usage Guide](#-usage-guide)
- [Contributing](#-contributing)
- [License](#-license)

---

## 🏗️ Architecture Overview

### Flow

User Question  
↓  
Chatbot (clarify intent)  
↓  
Question Analysis → Select relevant DMNs  
↓  
BPMN Orchestration Engine (Operaton)  
↓  
Sequential DMN Execution (gather inputs → execute → pass outputs)  
↓  
Legal Decision + Explanation

### Current Stack

```
Frontend (React + TypeScript)
         ↓ HTTPS/REST
Backend (Node.js + Express)
         ├→ TriplyDB (SPARQL)     - DMN discovery & metadata
         └→ Operaton (REST API)    - DMN execution engine
                  ↓
            DMN Models (Decision Models)
```

![Architecture Overview](./static/img/architecture-overview.png)

## 🎯 Overview

**Linked Data Explorer** is a web application for visualizing and querying SPARQL endpoints, with specialized support for DMN (Decision Model and Notation) orchestration. Built as part of the **Regels Overheid Nederland (RONL)** initiative, it enables discovery and exploration of government decision models using Linked Data principles.

### Key Capabilities

- 🔍 **SPARQL Query Editor** - Execute and visualize SPARQL queries with interactive graph visualization
- 🔗 **DMN Discovery** - Automatically discover Decision Models from TriplyDB using CPRMV vocabulary
- 🎯 **Chain Builder** - Visual drag-and-drop interface for creating DMN execution chains
- ⚡ **Real-Time Execution** - Execute DMN chains via Operaton with automatic variable mapping
- 📊 **Results Visualization** - View execution results with detailed step-by-step breakdown
- 📖 **Version Tracking** - Built-in changelog documenting features and improvements
- ⚙️ **Configurable Endpoints** - Connect to multiple SPARQL endpoints and DMN engines

---

## ✨ Features

### 1. SPARQL Query Editor

<details>
<summary>View Features</summary>

- **Syntax Support** - SPARQL 1.1 query execution
- **Sample Query Library** - Pre-built queries for DMN discovery and testing
- **Multiple Endpoints** - Switch between TriplyDB, local, and custom endpoints
- **Results Table** - Formatted display with column headers and data types
- **Graph Visualization** - Interactive D3.js force-directed graphs for RDF triples
- **CORS Proxy** - Automatic fallback for public endpoints

</details>

### 2. DMN Discovery

<details>
<summary>View Features</summary>

- **Automatic Discovery** - Query TriplyDB for available DMN models using CPRMV vocabulary
- **Search & Filter** - Real-time search across DMN names and identifiers
- **Variable Inspection** - View input variables (blue) and output variables (green) with types
- **Type Support** - Integer, String, Boolean, Date variable types
- **Chain Detection** - Automatically identify DMN relationships based on variable matching
- **Three-Panel Layout** - DMN list, chain composer, and configuration panels

</details>

### 3. DMN Orchestration Backend

<details>
<summary>View Features</summary>

- **REST API** - Express-based backend with `/api/dmns`, `/api/chains`, `/api/health` endpoints
- **Chain Discovery** - Advanced algorithms for finding DMN relationships
- **Operaton Integration** - Direct integration with Operaton DMN execution engine
- **Variable Orchestration** - Automatic variable mapping and flattening between chain steps
- **Performance Optimized** - Target execution time <1000ms for typical 3-DMN chains
- **Health Monitoring** - Built-in health checks for TriplyDB and Operaton connectivity
- **Structured Logging** - Winston-based JSON logging for production monitoring

</details>

### 4. Chain Builder UI

<details>
<summary>View Features</summary>

- **Drag-and-Drop Interface** - Intuitive chain building with visual DMN cards
- **Real-Time Validation** - Instant feedback on required inputs and chain validity
- **Smart Input Forms** - Dynamic form generation based on DMN input variables
- **Test Data Filling** - One-click test data insertion for rapid testing
- **Execution Engine** - Execute chains directly from the UI with live progress tracking
- **Results Display** - View final outputs, intermediate results, and execution timing
- **Chain Configuration** - Configure and reorder DMNs with visual feedback

**Working Example:**
- **SVB** → Calculates age eligibility and provides dates
- **SZW** → Checks social benefits (bijstandsnorm) eligibility  
- **Heusden** → Determines municipal benefit eligibility (Heusdenpas, Kindpakket)
- **Execution Time:** ~1100ms for complete 3-DMN chain

</details>

### 5. Chain Export ✨ NEW

<details>
<summary>View Features</summary>

- **Export Formats**: JSON and BPMN 2.0
- **Filename Customization**: Edit filename before export via modal dialog
- **Format Selection**: Choose between JSON (chain configuration) or BPMN (process diagram)
- **Validation**: Export only enabled for valid chains
- **Operaton Integration**: BPMN exports use Operaton namespace (open-source Camunda fork)
- **Metadata Preservation**: DMN IDs, titles, and descriptions included in exports
- **BPMN 2.0 Compliance**: Proper extensionElements structure, no warnings in modelers
- **Timestamped Files**: Automatic timestamp addition to prevent overwrites

</details>

### 6. Tutorial System

<details>
<summary>View Features</summary>

- **In-app tutorial system** - 5 comprehensive guides (36 total steps)
- **Quick Start** - Heusdenpas Chain Demo - Step-by-step first execution (10 steps)
- **Building Chains Manually** - Drag-and-drop workflow guide (7 steps)
- **Understanding DMN Models** - Decision model concepts explained (6 steps)
- **Advanced Features** - SPARQL, graphs, performance monitoring (7 steps)
- **Troubleshooting Guide** - Common issues and solutions (6 steps)
- **Accordion navigation** - only one tutorial open at a time
- **Auto-scroll behavior** - tutorials automatically position at top when opened

</details>

### 7. Changelog

<details>
<summary>View Features</summary>

- **Version Tracking** - Complete history of features and improvements
- **JSON-Configurable** - Update `changelog.json` without code changes
- **Collapsible Sections** - Organized by version with expandable details
- **Visual Status Badges** - Color-coded release types

</details>

### 8. Settings & Configuration

<details>
<summary>View Features</summary>

- **Endpoint Management** - Add, remove, and switch between SPARQL endpoints
- **Session-Based** - Configuration resets on browser refresh (no persistent storage)
- **Preset Endpoints** - Pre-configured access to:
  - TriplyDB datasets
  - Regels Overheid SPARQL endpoint
  - Local development endpoints

</details>

---

## 🌐 Live Deployments

### Frontend

| Environment | URL | Branch | CI/CD | Purpose |
|-------------|-----|--------|-------|---------|
| **Production** | [linkeddata.open-regels.nl](https://linkeddata.open-regels.nl) | `main` | GitHub Actions ✅ | Stable release |
| **Acceptance** | [acc.linkeddata.open-regels.nl](https://acc.linkeddata.open-regels.nl) | `acc` | GitHub Actions ✅ | Testing environment |

**Platform:** Azure Static Web Apps  
**Deployment:** Automated via GitHub Actions on push  
**Build Command:** `npm run build:prod` (production) / `npm run build:acc` (acceptance)

### Backend

| Environment | URL | Branch | CI/CD | Purpose |
|-------------|-----|--------|-------|---------|
| **Production** | [backend.linkeddata.open-regels.nl](https://backend.linkeddata.open-regels.nl) | `main` | GitHub Actions ✅ | API & orchestration |
| **Acceptance** | [acc.backend.linkeddata.open-regels.nl](https://acc.backend.linkeddata.open-regels.nl) | `acc` | GitHub Actions ✅ | Testing environment |

**Platform:** Azure App Service (Linux, Node.js 22)  
**Deployment:** Automated via GitHub Actions with manual approval for production  
**Build Process:** TypeScript compilation, dependency installation, automated health checks

---


## 🛠️ Technology Stack

### Frontend

| Technology         | Version | Purpose                    |
| ------------------ | ------- | -------------------------- |
| **React**          | 19.2.3  | UI framework               |
| **TypeScript**     | 5.8.2   | Type-safe JavaScript       |
| **Vite**           | 6.2.0   | Build tool & dev server    |
| **D3.js**          | 7.9.0   | Graph visualization        |
| **Tailwind CSS**   | 3.x     | Utility-first styling      |
| **Lucide React**   | 0.561.0 | Icon library               |

### Backend

| Technology              | Version | Purpose                     |
| ----------------------- | ------- | --------------------------- |
| **Node.js**             | 22 LTS  | Runtime environment         |
| **Express**             | 4.18.2  | Web framework               |
| **TypeScript**          | 5.8.2   | Type-safe JavaScript        |
| **Axios**               | 1.6.5   | HTTP client                 |
| **sparql-http-client**  | 2.4.1   | SPARQL query execution      |
| **Winston**             | 3.11.0  | Structured logging          |
| **Helmet**              | 7.1.0   | Security headers            |

### Development Tools

| Tool                 | Version | Purpose                |
| -------------------- | ------- | ---------------------- |
| **ESLint**           | 9.39.2  | Code linting (flat config) |
| **Prettier**         | 3.7.4   | Code formatting        |
| **Husky**            | 9.1.7   | Git hooks              |
| **lint-staged**      | 16.2.7  | Pre-commit linting     |
| **TypeScript ESLint**| 8.52.0  | TS-specific linting    |


### Vocabularies & Standards

- **CPSV** (Core Public Service Vocabulary) - Service descriptions
- **CPRMV** (CPSV Rule Model Vocabulary) - Decision model metadata
- **SPARQL 1.1** - Query language for semantic web
- **RDF/Turtle** - Data serialization format
- **DMN 1.3** - Decision Model and Notation standard

### External Services

- **TriplyDB** - SPARQL endpoint hosting DMN metadata
- **Operaton** - DMN execution engine (production deployment)
- **Azure Static Web Apps** - Frontend hosting
- **Azure App Service** - Backend API hosting

---

### 📁 Project Monorepo Structure

```bash
linked-data-explorer/
│
├── packages/
│   ├── frontend/                             # React TypeScript SPA
│   │   ├── src/
│   │   │   ├── components/
│   │   │   │   ├── ChainBuilder/
│   │   │   │   │   ├── ChainBuilder.tsx      # Main orchestration component
│   │   │   │   │   ├── ChainComposer.tsx     # Drag-drop chain builder
│   │   │   │   │   ├── ChainConfig.tsx       # Configuration panel
│   │   │   │   │   ├── ChainResults.tsx      # Execution results display
│   │   │   │   │   ├── DmnCard.tsx           # DMN card component
│   │   │   │   │   ├── DmnList.tsx           # Available DMNs list
│   │   │   │   │   ├── ExecutionProgress.tsx # Progress indicator
│   │   │   │   │   ├── InputForm.tsx         # Dynamic input form
│   │   │   │   │   └── ExportChain.tsx       # Export modal & logic
│   │   │   │   ├── Tutorial/                 # In-app tutorial
│   │   │   │   ├── Changelog.tsx             # Version history
│   │   │   │   ├── GraphView.tsx             # D3.js visualization
│   │   │   │   └── ResultsTable.tsx          # SPARQL results table
│   │   │   ├── services/
│   │   │   │   ├── sparqlService.ts          # SPARQL query execution
│   │   │   │   └── templateService.ts        # Chain templates
│   │   │   ├── utils/
│   │   │   │   ├── exportService.ts          # Export logic (JSON/BPMN)
│   │   │   │   ├── exportFormats.ts          # Export format definitions
│   │   │   │   └── constants.ts              # Sample queries, endpoints
│   │   │   ├── types/
│   │   │   │   ├── index.ts                  # Core types
│   │   │   │   ├── chainBuilder.types.ts     # Chain builder types
│   │   │   │   └── export.types.ts           # Export types
│   │   │   └── changelog.json                # Version history
│   │   ├── .env.development                  # Local config
│   │   ├── .env.acceptance                   # ACC config
│   │   ├── .env.production                   # Production config
│   │   └── package.json
│   │
│   └── backend/                              # Node.js/Express API
│       ├── src/
│       │   ├── routes/
│       │   │   ├── dmn.routes.ts             # /api/dmns
│       │   │   ├── chain.routes.ts           # /api/chains
│       │   │   └── health.routes.ts          # /api/health
│       │   ├── services/
│       │   │   ├── sparql.service.ts         # SPARQL queries
│       │   │   ├── operaton.service.ts       # Operaton DMN engine
│       │   │   └── orchestration.service.ts  # Chain execution
│       │   ├── types/
│       │   ├── middleware/
│       │   ├── utils/                        # Logger, config
│       │   └── index.ts
│       ├── .env.example
│       └── package.json
│
├── examples/ttl/                             # Test data (6 DMN models)
│
├── .github/workflows/                        # CI/CD pipelines
│   ├── azure-frontend-production.yml         # Frontend prod deployment
│   ├── azure-frontend-acc.yml                # Frontend ACC deployment
│   ├── azure-backend-production.yml          # Backend prod (with approval)
│   └── azure-backend-acc.yml                 # Backend ACC (auto)
│
├── package.json                              # Workspace configuration
└── README.md                                 # This file
```

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** 20.0.0 or higher ([Download](https://nodejs.org/))
- **npm** 10.0.0 or higher (comes with Node.js)
- **Git** ([Download](https://git-scm.com/))

### Installation

```bash
# 1. Clone repository
git clone https://github.com/sgort/linked-data-explorer.git
cd linked-data-explorer

# 2. Install dependencies (all packages)
npm install

# 3. Navigate to frontend
cd packages/frontend

# 4. Start development server
npm run dev

# Frontend runs at: http://localhost:3000
```

### Backend Setup (Optional - for local development)

```bash
# 1. Navigate to backend
cd packages/backend

# 2. Copy environment template
cp .env.example .env

# 3. Edit .env with your configuration
# Set TRIPLYDB_ENDPOINT and OPERATON_BASE_URL

# 4. Start development server
npm run dev

# Backend runs at: http://localhost:3001
```

---

## 💻 Development

### Frontend Development

```bash
cd packages/frontend

# Start dev server with hot reload
npm run dev

# Build for specific environment
npm run build              # Production (default)
npm run build:prod         # Production (explicit)
npm run build:acc          # Acceptance

# Preview production build
npm run preview

# Code quality
npm run lint
npm run lint:fix
npm run format
npm run check-format
```

### Backend Development

```bash
cd packages/backend

# Start dev server with auto-reload
npm run dev

# Build TypeScript
npm run build

# Start production server
npm start

# Testing
npm test
npm run test:watch
npm run test:coverage

# Code quality
npm run lint
npm run lint:fix
npm run format
npm run format:check
```

---

## ✅ Code Quality

### Linting

**ESLint 9** with flat config format:
- TypeScript-specific rules
- React best practices
- Import sorting
- Prettier integration

```bash
npm run lint          # Check for issues
npm run lint:fix      # Auto-fix issues
```

### Formatting

**Prettier 3.7** configuration:
- Semi-colons: Yes
- Single quotes: Yes
- Trailing commas: ES5
- Print width: 100
- Tab width: 2

```bash
npm run format           # Format all files
npm run check-format     # Check if formatted
```

### Git Hooks

**Pre-commit** (Husky):
- ✅ Runs Prettier on staged files
- ✅ Runs ESLint with auto-fix
- ✅ Prevents commits with errors

```bash
# Skip hooks if needed (not recommended)
git commit --no-verify -m "message"
```

### TypeScript

**Strict mode enabled:**
- No implicit any
- Strict null checks
- No unused variables (warnings)

```bash
# Type checking
npx tsc --noEmit
```

---

## 🚀 CI/CD & Deployment

### Deployment Architecture

```
Push to Branch → GitHub Actions → Build → Lint → Test → Deploy → Health Check → ✅
```

### GitHub Actions Workflows

#### Frontend Workflows

**`.github/workflows/azure-frontend-production.yml`**
- **Trigger:** Push to `main` with changes in `packages/frontend/**`
- **Build Command:** `npm run build:prod`
- **Environment:** `.env.production` → `https://backend.linkeddata.open-regels.nl`
- **Platform:** Azure Static Web Apps
- **URL:** https://linkeddata.open-regels.nl
- **Approval:** ❌ Not required (auto-deploy)

**`.github/workflows/azure-frontend-acc.yml`**
- **Trigger:** Push to `acc` with changes in `packages/frontend/**`
- **Build Command:** `npm run build:acc`
- **Environment:** `.env.acceptance` → `https://acc.backend.linkeddata.open-regels.nl`
- **Platform:** Azure Static Web Apps
- **URL:** https://acc.linkeddata.open-regels.nl
- **Approval:** ❌ Not required (auto-deploy)

#### Backend Workflows

**`.github/workflows/azure-backend-production.yml`**
- **Trigger:** Push to `main` with changes in `packages/backend/**` (or manual)
- **Build Steps:**
  1. Install dependencies (`npm ci`)
  2. Run linter (`npm run lint`)
  3. Build TypeScript (`npm run build`)
  4. Install production dependencies
  5. Package for deployment
- **Approval:** ✅ **Manual approval required** (GitHub environment protection)
- **Health Check:** Automatic verification with retries (5 attempts, 10s intervals)
- **Platform:** Azure App Service (Node.js 22)
- **URL:** https://backend.linkeddata.open-regels.nl

**`.github/workflows/azure-backend-acc.yml`**
- **Trigger:** Push to `acc` with changes in `packages/backend/**` (or manual)
- **Build Steps:** Same as production
- **Approval:** ❌ Not required (auto-deploy)
- **Health Check:** Automatic verification with retries
- **Platform:** Azure App Service (Node.js 22)
- **URL:** https://acc.backend.linkeddata.open-regels.nl

### Deployment Process

#### Production Deployment (main branch)

```bash
# 1. Make changes
git checkout main
# ... make changes ...

# 2. Commit and push
git add .
git commit -m "feat: add new feature"
git push origin main

# 3. GitHub Actions runs automatically
# - Frontend: Builds and deploys immediately
# - Backend: Builds, waits for approval, then deploys

# 4. Approve backend deployment (if needed)
# Go to: https://github.com/ictu/linked-data-explorer/actions
# Click on the running workflow
# Click "Review deployments" → Select "production" → "Approve and deploy"

# 5. Verify deployment
curl https://backend.linkeddata.open-regels.nl/api/health
```

#### Acceptance Deployment (acc branch)

```bash
# 1. Make changes
git checkout acc
# ... make changes ...

# 2. Commit and push
git add .
git commit -m "feat: test new feature"
git push origin acc

# 3. GitHub Actions deploys automatically (no approval needed)

# 4. Verify deployment
curl https://acc.backend.linkeddata.open-regels.nl/api/health
```

### Health Check Verification

All backend deployments include automatic health checks:

```bash
# Production
curl https://backend.linkeddata.open-regels.nl/api/health

# Acceptance
curl https://acc.backend.linkeddata.open-regels.nl/api/health

# Expected response:
{
  "name": "Linked Data Explorer Backend",
  "version": "0.1.0",
  "status": "running",
  "environment": "production",  # or "acceptance"
  "documentation": "/api"
}
```

### Monitoring & Rollback

**View workflow runs:**
```
https://github.com/ictu/linked-data-explorer/actions
```

**Rollback options:**
1. Revert commit and push
2. Redeploy previous version via Azure Portal
3. Re-run previous successful GitHub Actions workflow

---

## ⚙️ Environment Configuration

### Frontend Environment Files

The frontend uses Vite's environment system with three configurations:

**`.env.development`** (Local)
```env
VITE_API_BASE_URL=http://localhost:3001
```

**`.env.acceptance`** (ACC)
```env
VITE_API_BASE_URL=https://acc.backend.linkeddata.open-regels.nl
```

**`.env.production`** (Production)
```env
VITE_API_BASE_URL=https://backend.linkeddata.open-regels.nl
```

### Backend Environment Variables

**Azure App Service Settings:**

```bash
# Core settings
NODE_ENV=production                    # or "acceptance"
PORT=8080
HOST=0.0.0.0

# CORS configuration
CORS_ORIGIN=https://linkeddata.open-regels.nl,https://backend.linkeddata.open-regels.nl

# External services
TRIPLYDB_ENDPOINT=https://api.open-regels.triply.cc/datasets/stevengort/DMN-discovery/services/DMN-discovery/sparql
OPERATON_BASE_URL=https://operaton.open-regels.nl/engine-rest

# Logging
LOG_LEVEL=info                         # info (production), debug (development)

# Deployment
SCM_DO_BUILD_DURING_DEPLOYMENT=false   # We build in GitHub Actions
```

### Setting Environment Variables

```bash
# Backend ACC
az webapp config appsettings set \
  --name ronl-linkeddata-backend-acc \
  --resource-group RONL-Preproduction \
  --settings \
    NODE_ENV=acceptance \
    PORT=8080 \
    CORS_ORIGIN="https://acc.linkeddata.open-regels.nl,https://acc.backend.linkeddata.open-regels.nl"

# Backend Production
az webapp config appsettings set \
  --name ronl-linkeddata-backend-prod \
  --resource-group RONL-Preproduction \
  --settings \
    NODE_ENV=production \
    PORT=8080 \
    CORS_ORIGIN="https://linkeddata.open-regels.nl,https://backend.linkeddata.open-regels.nl"
```

---

## 🔧 Configuration

### Adding Sample Queries

Edit `constants.ts`:

```typescript
export const SAMPLE_QUERIES = [
  {
    name: 'Your Query Name',
    sparql: `
      PREFIX your: <http://example.org/>
      SELECT * WHERE {
        ?s ?p ?o
      }
      LIMIT 100
    `,
  },
  // ... more queries
];
```

### Adding Default Endpoints

Edit `constants.ts`:

```typescript
export const PRESET_ENDPOINTS = [
  {
    name: 'Your Endpoint Name',
    url: 'https://your-sparql-endpoint.com/sparql',
  },
  // ... more endpoints
];
```

### Updating Changelog

Edit `changelog.json`:

```json
{
  "versions": [
    {
      "version": "0.2.0",
      "status": "New Features",
      "statusColor": "purple",
      "borderColor": "purple",
      "date": "January 15, 2026",
      "sections": [
        {
          "title": "Features",
          "icon": "✨",
          "iconColor": "emerald",
          "items": ["Added new feature X", "Improved feature Y"]
        }
      ]
    }
  ]
}
```

---

## 🧪 Testing

### Running Tests

```bash
# Frontend tests (when implemented)
cd packages/frontend
npm test

# Backend tests
cd packages/backend
npm test
npm run test:watch    # Watch mode
npm run test:coverage # Coverage report
```

### Manual Testing

**Frontend:**
1. Navigate to https://acc.linkeddata.open-regels.nl
2. Go to "DMN Orchestration" tab
3. Verify 6 DMNs load in left panel
4. Drag SVB → SZW → Heusden to chain
5. Fill test data and execute
6. Verify results display correctly

**Backend API:**
```bash
# Health check
curl https://acc.backend.linkeddata.open-regels.nl/api/health

# List DMNs
curl https://acc.backend.linkeddata.open-regels.nl/api/dmns

# Execute chain
curl -X POST https://acc.backend.linkeddata.open-regels.nl/api/chains/execute \
  -H "Content-Type: application/json" \
  -d '{"dmnIds": [...], "inputs": {...}}'
```

---

## 🗺️ Roadmap
### ✅ Phase A - Foundation (Complete)
- [x] SPARQL query editor with syntax support
- [x] D3.js force-directed graph visualization
- [x] Multiple endpoint support
- [x] Results table with formatted display
- [x] Changelog component
- [x] Azure Static Web Apps deployment

### ✅ Phase B.1 - DMN Discovery (Complete)
- [x] CPRMV vocabulary integration
- [x] DMN list view with search/filter
- [x] Input/output variable display
- [x] Automatic chain detection
- [x] Three-panel orchestration interface
- [x] Type support (Integer, String, Boolean, Date)

### ✅ Phase B.2 - Backend Orchestration (Complete)
- [x] Node.js/Express REST API
- [x] `/api/dmns`, `/api/chains`, `/api/health` endpoints
- [x] TriplyDB SPARQL integration
- [x] Operaton DMN execution integration
- [x] Variable mapping and orchestration
- [x] Azure App Service deployment (ACC + Production)
- [x] Structured logging with Winston
- [x] CORS configuration

### ✅ Phase B.3 - Chain Builder UI (Complete)
- [x] Drag-and-drop chain builder interface
- [x] Real-time validation
- [x] Dynamic form generation
- [x] Incremental test data filling
- [x] Chain execution with progress tracking
- [x] Results display with timing
- [x] Frontend-backend integration
- [x] In-app tutorial system (36 steps)
- [x] Deployment metadata display

### ✅ Phase C.1 - CI/CD Automation (Complete)
- [x] GitHub Actions workflows for frontend (production + ACC)
- [x] GitHub Actions workflows for backend (production + ACC)
- [x] Environment-specific builds (`.env` files)
- [x] Automated health checks post-deployment
- [x] Manual approval for production backend
- [x] Deployment history and rollback capabilities

### 🔄 Phase C.2 - Advanced Orchestration (In Progress)
- [ ] Chain templates and presets
- [ ] Chain export (JSON, BPMN)
- [ ] Advanced chain validation and scoring
- [ ] Cycle detection in complex chains
- [ ] Performance optimization (<800ms for 3-DMN chains)
- [ ] Caching layer for frequently used chains

### 📅 Phase D - User Experience (Planned)
- [ ] User authentication and profiles
- [ ] Saved chains and favorites
- [ ] Collaborative chain building
- [ ] Chain version history
- [ ] Mobile-responsive design
- [ ] Accessibility (WCAG 2.1 AA)

### 🚀 Phase E - Production Features (Future)
- [ ] BPMN process modeling integration
- [ ] Multi-step input gathering workflows
- [ ] Legal decision explanations (XAI)
- [ ] Audit trail and compliance logging
- [ ] API rate limiting and quotas
- [ ] Batch execution capabilities
- [ ] Webhook support for async execution


---

## 🤝 Contributing

Contributions are welcome! Please follow these guidelines:

### Getting Started

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Make your changes
4. Ensure all tests pass (`npm run lint`)
5. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
6. Push to the branch (`git push origin feature/AmazingFeature`)
7. Open a Pull Request

### Code Style

- Follow existing code patterns
- Use TypeScript for all new code
- Add types for all functions and variables
- Write meaningful commit messages
- Keep functions small and focused
- Comment complex logic

### Pull Request Process

1. Update README.md with any new features
2. Update changelog.json with your changes
3. Ensure all linting passes
4. Request review from maintainers
5. Address any feedback
6. Squash commits before merge (if requested)

---

## 📝 License

EUPL v. 1.2 License - See [LICENSE](./LICENSE) file for details

---

## 📞 Support & Contact

- **Issues**: [Gitlab Issues](https://git.open-regels.nl/hosting/linked-data-explorer/-/issues)
- **Project**: [Regels Overheid](https://regels.overheid.nl/)
- **Maintainer**: RONL Development Team

---

## 🎯 Current Status (January 2026)

### What's New in 0.4.0
- **Automated Deployments** - Both frontend and backend deploy automatically via GitHub Actions
- **Environment Separation** - Distinct `.env` files for development, acceptance, and production
- **Production Ready** - Full production deployment with health monitoring
- **Approval Workflow** - Manual approval required for production backend changes
- **Enhanced UX** - Deployment metadata, incremental test data, improved tutorials

### Next Steps
- 🔄 Chain templates and presets
- 🔄 Performance optimization (<800ms for 3-DMN chains)
- 🔄 Advanced chain validation
- 🔄 Chain export capabilities (JSON, BPMN)

---

**Built with ❤️ for Dutch Government Services **

[⬆ Back to top](#linked-data-explorer)
