# Linked Data Explorer

> A React-based SPARQL visualization and query tool for exploring Dutch Government Data (Regels Overheid)

[![Deployed on Azure Static Web Apps](https://img.shields.io/badge/Azure-Static_Web_Apps-blue?logo=microsoft-azure)](https://linkeddata.open-regels.nl)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue?logo=typescript)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19.2-61dafb?logo=react)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-6.2-646cff?logo=vite)](https://vitejs.dev/)
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

### Stack

![Architecture Overview](./static/img/architecture-overview.png)

## 🎯 Overview

**Linked Data Explorer** is a web application for visualizing and querying SPARQL endpoints, with specialized support for DMN (Decision Model and Notation) orchestration. Built as part of the **Regels Overheid Nederland (RONL)** initiative, it enables discovery and exploration of government decision models using Linked Data principles.

### Key Capabilities

- 🔍 **SPARQL Query Editor** - Execute and visualize SPARQL queries with an intuitive interface
- 📊 **Interactive Graph Visualization** - Explore RDF triples using D3.js force-directed graphs
- 🔗 **DMN Orchestration** - Discover Decision Models and visualize input/output relationships
- 📖 **Version History** - Built-in changelog tracking features and improvements
- ⚙️ **Configurable Endpoints** - Connect to multiple SPARQL endpoints including TriplyDB
- 🎨 **Modern UI** - Clean, responsive design with Tailwind CSS

---

## ✨ Features

### 1. SPARQL Query Editor

<details>
<summary>View Features</summary>

- **Syntax Support** - SPARQL 1.1 query execution
- **Sample Query Library** - Pre-built queries for quick testing
- **Multiple Endpoints** - Switch between TriplyDB, local, and custom endpoints
- **Results Table** - Formatted display with column headers and data types
- **CORS Proxy** - Automatic fallback for public endpoints

</details>

### 2. Graph Visualization

<details>
<summary>View Features</summary>

- **Force-Directed Layout** - D3.js v7 powered visualization
- **Interactive Exploration** - Drag nodes, zoom, and pan
- **Color-Coded Nodes**:
  - 🔵 **Blue** - Subjects (URIs)
  - 🟡 **Amber** - Objects (URIs)  
  - 🟢 **Green** - Literals (text values)
- **Edge Labels** - Predicates shown on relationships
- **Auto-Detection** - Recognizes `?s ?p ?o` patterns

</details>

### 3. DMN Orchestration ✨ NEW

- **DMN Discovery** - SPARQL-based discovery using CPRMV vocabulary
- **Three-Panel Layout**:
  - Left: DMN list with search/filter
  - Center: Chain builder (Phase B.3 placeholder)
  - Right: DMN details with inputs/outputs
- **Variable Display** - Type-tagged inputs (blue) and outputs (green)
- **Search & Filter** - Real-time filtering by DMN name/identifier
- **Chain Detection** - Identifies where DMN outputs match other DMN inputs

### 4. Changelog

<details>
<summary>View Features</summary>

- **Version Tracking** - Complete history of features and improvements
- **JSON-Configurable** - Update `changelog.json` without code changes
- **Collapsible Sections** - Organized by version with expandable details
- **Visual Status Badges** - Color-coded release types

</details>

### 5. Settings & Configuration

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

| Environment    | URL                                                                    | Branch | Purpose             |
| -------------- | ---------------------------------------------------------------------- | ------ | ------------------- |
| **Production** | [linkeddata.open-regels.nl](https://linkeddata.open-regels.nl)         | `main` | Stable release      |
| **Acceptance** | [acc.linkeddata.open-regels.nl](https://acc.linkeddata.open-regels.nl) | `acc`  | Testing environment |

**Deployment Platform:** Azure Static Web Apps  
**CI/CD:** GitHub Actions (automated on push) 

---

## 🛠️ Technology Stack

### Frontend

| Technology | Version | Purpose |
|------------|---------|---------|
| **React** | 19.2.3 | UI framework |
| **TypeScript** | 5.8.2 | Type-safe JavaScript |
| **Vite** | 6.2.0 | Build tool & dev server |
| **D3.js** | 7.9.0 | Graph visualization |
| **Tailwind CSS** | 3.x (CDN) | Utility-first styling |
| **Lucide React** | 0.561.0 | Icon library |

### Development Tools

| Tool | Version | Purpose |
|------|---------|---------|
| **ESLint** | 9.39.2 | Code linting (flat config) |
| **Prettier** | 3.7.4 | Code formatting |
| **Husky** | 9.1.7 | Git hooks |
| **lint-staged** | 16.2.7 | Pre-commit linting |
| **TypeScript ESLint** | 8.52.0 | TS-specific linting |

### Vocabularies & Standards

- **CPSV** (Core Public Service Vocabulary) - Service descriptions
- **CPRMV** (CPSV Rule Model Vocabulary) - Decision model metadata
- **SPARQL 1.1** - Query language
- **RDF/Turtle** - Data format

---

### 📁 Project Monorepo Structure

```
linked-data-explorer/
├── packages/
│   ├── frontend/              # React application
│   │   └── src/               # Source code
│   └── backend/               # Phase B.2 (planned)
├── examples/                  # TTL test data (3 DMN models)
├── .github/workflows/         # CI/CD pipelines
└── [workspace config]         # Root package.json, etc.
```

---

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** 20.0.0 or higher ([Download](https://nodejs.org/))
- **npm** 10.0.0 or higher (comes with Node.js)
- **Git** ([Download](https://git-scm.com/))

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/sgort/linked-data-explorer.git
cd linked-data-explorer

# 2. Install dependencies (from root)
npm install

# 3. Start development server
npm run dev

# 4. Open browser
# Navigate to http://localhost:3000
```

### Quick Start Commands

```bash
# Development
npm run dev              # Start dev server (port 3000)
npm run build            # Build for production
npm run preview          # Preview production build

# Code Quality
npm run lint             # Run ESLint
npm run lint:fix         # Fix linting issues
npm run format           # Format with Prettier
npm run check-format     # Check formatting

# Workspace Commands (from root)
npm run dev --workspace=@linked-data-explorer/frontend
npm run build --workspace=@linked-data-explorer/frontend
```

---

## 👨‍💻 Development

### Local Development

```bash
cd packages/frontend
npm run dev
```

**The app will open at:** http://localhost:3000

**Features:**
- ✅ Hot module replacement (HMR)
- ✅ Fast refresh for React components
- ✅ TypeScript type checking
- ✅ Automatic linting on save

### Project Conventions

**File Structure:**
- Components: `src/components/*.tsx`
- Services: `src/services/*.ts`
- Types: `src/types/index.ts`
- Utils: `src/utils/*.ts`

**Naming:**
- Components: PascalCase (`OrchestrationView.tsx`)
- Files: camelCase (`sparqlService.ts`)
- Constants: UPPER_SNAKE_CASE (`DEFAULT_ENDPOINT`)

**Imports:**
- Absolute imports: Use `@/` alias (configured in tsconfig)
- Relative imports: Prefer `../` for sibling directories
- Sort order: External → Internal → Types → Styles

### Adding New Features

1. **Create branch:**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make changes:**
   - Add/modify files in `src/`
   - Update `changelog.json` if user-facing
   - Add TypeScript types in `types/index.ts`

3. **Test locally:**
   ```bash
   npm run dev        # Test in browser
   npm run lint       # Check for errors
   npm run build      # Verify build works
   ```

4. **Commit & push:**
   ```bash
   git add .
   git commit -m "feat: your feature description"
   git push origin feature/your-feature-name
   ```

5. **Create Pull Request** to `acc` branch

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

### Automatic Deployment

**Trigger:** Push to `main` or `acc` branch  
**Platform:** Azure Static Web Apps  
**Process:**

1. GitHub Actions workflow triggers
2. Installs dependencies (`npm install`)
3. Builds frontend (`npm run build`)
4. Deploys to Azure
5. Live in 2-3 minutes

### Manual Deployment

```bash
# 1. Build locally
npm run build

# 2. Test build
npm run preview

# 3. Deploy via git
git push origin main      # Production
git push origin acc       # Acceptance
```

### Environment Variables

**Currently:** None required (Tailwind via CDN)  
**Future (Phase B.2):** API endpoint configuration

### Monitoring

- **Status:** Check GitHub Actions tab
- **Logs:** Available in Azure Portal
- **Errors:** Check browser console + Azure logs

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
- [x] SPARQL query editor
- [x] Graph visualization with D3.js
- [x] Multiple endpoint support
- [x] Results table display
- [x] Changelog component
- [x] Azure deployment pipeline

### ✅ Phase B.1 - DMN Discovery (Complete)
- [x] CPRMV vocabulary support
- [x] DMN list with search/filter
- [x] Input/output variable display
- [x] Basic chain detection
- [x] Three-panel orchestration view
- [x] Type-tagged variables (Integer, String, Boolean)

### 🔄 Phase B.2 - Backend Service (In Progress)

**Goals:**
- [ ] Node.js/Express backend service
- [ ] Advanced chain discovery algorithms
- [ ] REST API for DMN operations
- [ ] Semantic variable matching
- [ ] Cycle detection
- [ ] Chain validation & scoring
- [ ] Azure App Service deployment

**Architecture:**
```
Frontend → REST API → Backend Service → TriplyDB
                           ↓
                   DMN Orchestration Logic
```

### 📅 Phase B.3 - Chain Builder (Planned)

**Goals:**
- [ ] Visual drag-and-drop chain builder
- [ ] Real-time chain validation
- [ ] Chain execution simulation
- [ ] Export chains as BPMN
- [ ] Chain templates library

### 🚀 Phase C - Execution Engine (Future)

**Goals:**
- [ ] BPMN orchestration integration
- [ ] DMN execution via Operaton
- [ ] Input gathering workflows
- [ ] Legal decision explanations
- [ ] Audit trail generation

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
- **Maintainer**: ICTU Development Team

---

**Built with ❤️ for Dutch Government Services**

[⬆ Back to top](#linked-data-explorer)
