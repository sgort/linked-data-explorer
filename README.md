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

### 5. Tutorial System ✨ NEW

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

### 6. Changelog

<details>
<summary>View Features</summary>

- **Version Tracking** - Complete history of features and improvements
- **JSON-Configurable** - Update `changelog.json` without code changes
- **Collapsible Sections** - Organized by version with expandable details
- **Visual Status Badges** - Color-coded release types

</details>

### 7. Settings & Configuration

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

| Environment    | URL                                                                    | Branch | Purpose             |
| -------------- | ---------------------------------------------------------------------- | ------ | ------------------- |
| **Production** | [linkeddata.open-regels.nl](https://linkeddata.open-regels.nl)         | `main` | Stable release      |
| **Acceptance** | [acc.linkeddata.open-regels.nl](https://acc.linkeddata.open-regels.nl) | `acc`  | Testing environment |

**Platform:** Azure Static Web Apps  
**CI/CD:** GitHub Actions (automated on push)

### Backend

| Environment    | URL                                                                                      | Branch | Purpose             |
| -------------- | ---------------------------------------------------------------------------------------- | ------ | ------------------- |
| **Acceptance** | [acc.backend.linkeddata.open-regels.nl](https://acc.backend.linkeddata.open-regels.nl) | `acc`  | API & orchestration |

**Platform:** Azure App Service (Linux, Node.js 22)  
**CI/CD:** Manual deployment → GitHub Actions (planned)  
**Health Check:** `/api/health` - Returns TriplyDB and Operaton connectivity status

---

## 🛠️ Technology Stack

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
├── packages/
│   ├── frontend/                    # React application
│   │   ├── src/
│   │   │   ├── components/          # React components
│   │   │   │   ├── ChainBuilder/    # Phase B.3 - Chain Builder UI
│   │   │   │   ├── GraphView/       # D3.js graph visualization
│   │   │   │   ├── QueryEditor/     # SPARQL query interface
│   │   │   │   └── Changelog/       # Version tracking
│   │   │   ├── types/               # TypeScript definitions
│   │   │   ├── constants.ts         # Sample queries, endpoints
│   │   │   └── changelog.json       # Version history
│   │   ├── .env.production          # Backend API URL configuration
│   │   └── package.json
│   │
│   └── backend/                     # Node.js/Express API
│       ├── src/
│       │   ├── routes/              # API endpoints
│       │   │   ├── dmn.routes.ts    # /api/dmns - DMN discovery
│       │   │   ├── chain.routes.ts  # /api/chains - Chain execution
│       │   │   └── health.routes.ts # /api/health - Health check
│       │   ├── services/
│       │   │   ├── sparql.service.ts      # TriplyDB queries
│       │   │   ├── operaton.service.ts    # DMN execution
│       │   │   └── orchestration.service.ts # Chain orchestration
│       │   ├── types/               # TypeScript definitions
│       │   ├── middleware/          # Express middleware
│       │   ├── utils/               # Utilities (logger, config)
│       │   └── index.ts             # Entry point
│       ├── .env.example             # Environment template
│       └── package.json
│
├── examples/                        # Test data
│   └── ttl/                         # Turtle files with 6 DMN models
│
├── .github/workflows/               # CI/CD pipelines
│   ├── azure-static-web-apps-*.yml  # Frontend deployment
│   └── [backend workflow - planned]
│
├── package.json                     # Workspace configuration
└── README.md                        # This file
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

# Frontend runs at: http://localhost:5173
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

# Build for production
npm run build

# Preview production build
npm run preview

# Linting
npm run lint
npm run lint:fix

# Formatting
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

# Run tests
npm test
npm run test:watch
npm run test:coverage

# Linting & formatting
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

## 🚢 Deployment

### Frontend Deployment

**Azure Static Web Apps** - Automatic via GitHub Actions

```yaml
# .github/workflows/azure-static-web-apps-*.yml
on:
  push:
    branches: [main, acc]

jobs:
  build_and_deploy:
    - app_location: '/packages/frontend'
    - output_location: 'dist'
```

**Manual deployment:**
```bash
cd packages/frontend
npm run build
# Deploy via Azure CLI or portal
```

### Backend Deployment

**Azure App Service** - Manual deployment (GitHub Actions planned)

**Current ACC deployment:**
```bash
# 1. Build locally
cd packages/backend
npm install
npm run build

# 2. Set environment variables in Azure Portal
# - NODE_ENV=production
# - PORT=8080
# - CORS_ORIGIN=https://acc.linkeddata.open-regels.nl,...
# - TRIPLYDB_ENDPOINT=...
# - OPERATON_BASE_URL=...

# 3. Deploy via Azure CLI
az webapp up \
  --resource-group RONL-Preproduction \
  --name ronl-linkeddata-backend-acc \
  --runtime "NODE:22-lts"
```

**Environment Variables (Azure):**
- `NODE_ENV` - production
- `PORT` - 8080
- `HOST` - 0.0.0.0
- `CORS_ORIGIN` - Comma-separated frontend URLs
- `TRIPLYDB_ENDPOINT` - SPARQL endpoint URL
- `OPERATON_BASE_URL` - Operaton REST API URL
- `LOG_LEVEL` - info (production), debug (development)

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

## 🗺️ Roadmap

### ✅ Phase A - Foundation (Complete)
- [x] SPARQL query editor with syntax support
- [x] D3.js force-directed graph visualization
- [x] Multiple endpoint support (TriplyDB, local, custom)
- [x] Results table with formatted display
- [x] Changelog component with version tracking
- [x] Azure Static Web Apps deployment pipeline

### ✅ Phase B.1 - DMN Discovery (Complete)
- [x] CPRMV vocabulary integration for DMN metadata
- [x] DMN list view with search and filter capabilities
- [x] Input/output variable display with type tags
- [x] Automatic chain detection based on variable matching
- [x] Three-panel orchestration interface
- [x] Support for Integer, String, Boolean, Date types

### ✅ Phase B.2 - Backend Orchestration Service (Complete)
- [x] Node.js/Express REST API backend
- [x] `/api/dmns` - DMN discovery endpoint
- [x] `/api/chains` - Chain execution endpoint  
- [x] `/api/health` - Service health monitoring
- [x] TriplyDB SPARQL integration
- [x] Operaton DMN execution integration
- [x] Variable mapping and orchestration logic
- [x] Azure App Service deployment (ACC environment)
- [x] Structured logging with Winston
- [x] CORS configuration for frontend integration

**Deployment:**
- ACC: `https://acc.backend.linkeddata.open-regels.nl`
- Production: Planned

### ✅ Phase B.3 - Chain Builder UI (Complete)
- [x] Visual drag-and-drop chain builder interface
- [x] Real-time chain validation with input requirements
- [x] Dynamic form generation for DMN inputs
- [x] Test data filling for rapid testing
- [x] Chain execution with progress tracking
- [x] Results display with execution timing
- [x] Step-by-step execution breakdown
- [x] Frontend-backend integration via REST API

**Working Example:**
```
SVB_Leeftijdsinformatie (age calculation)
    ↓
SZW_Bijstandsnorminformatie (benefits eligibility)
    ↓  
RONL_HeusdenPasEindresultaat (municipal benefits)
```
- Execution time: ~1100ms
- Full variable passing between steps
- Comprehensive output display

### 🔄 Phase C - Advanced Orchestration (In Progress)

**Goals:**
- [ ] GitHub Actions deployment for backend
- [ ] Production backend deployment
- [ ] Chain templates and presets
- [ ] Chain export (JSON, BPMN)
- [ ] Advanced chain validation and scoring
- [ ] Cycle detection in complex chains
- [ ] Performance optimization (<800ms for 3-DMN chains)

### 📅 Phase D - User Experience Enhancements (Planned)

**Goals:**
- [ ] User authentication and profiles
- [ ] Saved chains and favorites
- [ ] Collaborative chain building
- [ ] Chain version history
- [ ] Mobile-responsive design improvements
- [ ] Accessibility (WCAG 2.1 AA compliance)

### 🚀 Phase E - Production Features (Future)

**Goals:**
- [ ] BPMN process modeling integration
- [ ] Multi-step input gathering workflows
- [ ] Legal decision explanations (XAI)
- [ ] Audit trail and compliance logging
- [ ] API rate limiting and quotas
- [ ] Caching layer for frequently used chains
- [ ] Batch execution capabilities
- [ ] Webhook support for async execution

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

**Backend:**
```bash
# Health check
curl https://acc.backend.linkeddata.open-regels.nl/api/health

# List DMNs
curl https://acc.backend.linkeddata.open-regels.nl/api/dmns

# Execute chain (requires POST with chain configuration)
curl -X POST https://acc.backend.linkeddata.open-regels.nl/api/chains/execute \
  -H "Content-Type: application/json" \
  -d '{"chain": [...], "inputs": {...}}'
```

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

**Version:** 0.3.0  
**Phase:** B.3 Complete, C.1 In Progress  
**Deployment:** ACC environment fully operational

**Recent Milestones:**
- ✅ Chain Builder UI launched with drag-and-drop
- ✅ Backend deployed to Azure App Service
- ✅ Full frontend-backend integration
- ✅ End-to-end DMN chain execution working
- ✅ Production-ready architecture in place

**Next Steps:**
- 🔄 Production backend deployment
- 🔄 GitHub Actions automation for backend
- 🔄 Performance optimization
- 🔄 Chain templates and presets

---

**Built with ❤️ for Dutch Government Services**

[⬆ Back to top](#linked-data-explorer)
