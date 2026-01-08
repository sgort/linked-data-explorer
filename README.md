# Linked Data Explorer

> A React-based SPARQL visualization and query tool for exploring Dutch Government Data (Regels Overheid)

[![Deployed on Azure Static Web Apps](https://img.shields.io/badge/Azure-Static_Web_Apps-blue?logo=microsoft-azure)](https://linkeddata.open-regels.nl)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue?logo=typescript)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19.2-61dafb?logo=react)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-6.2-646cff?logo=vite)](https://vitejs.dev/)
![License](https://img.shields.io/badge/License-EUPL-yellow.svg)

---

## 📋 Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Live Deployments](#live-deployments)
- [Technology Stack](#technology-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Development](#development)
- [Code Quality](#code-quality)
- [Deployment](#deployment)
- [Usage Guide](#usage-guide)
- [Contributing](#contributing)
- [License](#license)

---

## 🎯 Overview

**Linked Data Explorer** is a modern web application for visualizing and querying SPARQL endpoints, with a focus on Dutch Government Data from the **Regels Overheid** project. Built with React and TypeScript, it provides an intuitive interface for exploring RDF triples through interactive graph visualizations and a powerful query editor.

### Key Capabilities

- 🔍 **SPARQL Query Editor** - Write and execute SPARQL queries with a clean, intuitive interface
- 📊 **Interactive Graph Visualization** - Explore RDF triples using D3.js force-directed graphs
- 📖 **Version History** - Track features and changes through a built-in changelog
- ⚙️ **Configurable Endpoints** - Connect to multiple SPARQL endpoints including TriplyDB
- 🎨 **Modern UI** - Clean, responsive design with Tailwind CSS

---

## ✨ Features

### 1. SPARQL Query Editor

<details>
<summary>View Features</summary>

- **Syntax Support** - Built-in SPARQL query editor
- **Sample Query Library** - Pre-built queries for quick testing
- **Multiple Endpoints** - Switch between different SPARQL endpoints
- **Results Table** - View query results in a formatted table
- **Export Functionality** - Download results as CSV (coming soon)
- **CORS Proxy Support** - Access public endpoints with automatic proxy handling

</details>

### 2. Graph Visualization

<details>
<summary>View Features</summary>

- **Force-Directed Layout** - D3.js powered visualization of RDF triples
- **Interactive Nodes** - Drag, zoom, and pan to explore relationships
- **Color-Coded Types**:
  - 🔵 **Blue** - Subjects (URIs)
  - 🟡 **Amber** - Objects (URIs)
  - 🟢 **Green** - Literals (text values)
- **Edge Labels** - Predicates displayed on relationships
- **Responsive Canvas** - Adapts to window size automatically
- **Auto-Detection** - Automatically visualizes `?s ?p ?o` query patterns

</details>

### 3. Changelog

<details>
<summary>View Features</summary>

- **Version Tracking** - Complete history of features and improvements
- **JSON-Configurable** - Easy to update without code changes
- **Collapsible Sections** - Organized by version with expandable details
- **Color-Coded Badges** - Visual status indicators
- **Section Icons** - Emoji-based categorization (✨ Features, 🐛 Fixes, etc.)

</details>

### 4. Settings & Configuration

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

---

## 🛠️ Technology Stack

### Core Framework

- **React 19.2** - UI library with latest features
- **TypeScript 5.8** - Type-safe JavaScript
- **Vite 6.2** - Lightning-fast build tool

### UI & Styling

- **Tailwind CSS** - Utility-first CSS framework (via CDN)
- **Lucide React 0.561** - Beautiful icon library
- **Inter Font** - Modern, readable typography

### Data Visualization

- **D3.js 7.9** - Force-directed graph rendering
- **@types/d3 7.4** - TypeScript definitions for D3

### Code Quality

- **ESLint 9** - Modern flat config format
- **Prettier 3.7** - Code formatting
- **Husky 9.1** - Git hooks
- **lint-staged 16.2** - Pre-commit linting
- **TypeScript ESLint 8.52** - TypeScript-specific linting rules

### Development Tools

- **@vitejs/plugin-react 5.0** - Vite React plugin
- **@types/node 22.14** - Node.js type definitions

---

## 📁 Project Structure

```
linked-data-explorer/
├── .github/
│   └── workflows/
│       ├── azure-static-web-apps-witty-beach-*.yml    # Production deployment
│       └── azure-static-web-apps-brave-bay-*.yml      # ACC deployment
├── components/
│   ├── Changelog.tsx            # Version history component
│   ├── GraphView.tsx            # D3.js graph visualization
│   └── ResultsTable.tsx         # SPARQL results display
├── services/
│   ├── sparqlService.ts         # SPARQL query execution
│   └── storage.ts               # (Deprecated)
├── App.tsx                      # Main application component
├── types.ts                     # TypeScript type definitions
├── constants.ts                 # SPARQL queries and endpoints
├── index.tsx                    # React app entry point
├── index.html                   # HTML template
├── index.css                    # Global styles
├── changelog.json               # Version history data
├── package.json                 # Dependencies and scripts
├── vite.config.ts               # Vite configuration
├── tsconfig.json                # TypeScript configuration
├── eslint.config.js             # ESLint flat config
├── .prettierrc.json             # Prettier config
└── README.md                    # This file
```

---

## 🚀 Getting Started

### Prerequisites

- **Node.js 20+** - [Download](https://nodejs.org/)
- **npm** (comes with Node.js)
- **Git** - [Download](https://git-scm.com/)

### Installation

1. **Clone the repository**

```bash
git clone https://github.com/yourorg/linked-data-explorer.git
cd linked-data-explorer
```

2. **Install dependencies**

```bash
npm install
```

3. **Start development server**

```bash
npm run dev
```

4. **Open in browser**

Navigate to [http://localhost:5173](http://localhost:5173)

---

## 💻 Development

### Available Scripts

| Command                | Description                               |
| ---------------------- | ----------------------------------------- |
| `npm run dev`          | Start development server with HMR         |
| `npm run build`        | Build for production (outputs to `dist/`) |
| `npm run preview`      | Preview production build locally          |
| `npm run lint`         | Check code for errors                     |
| `npm run lint:fix`     | Auto-fix linting errors                   |
| `npm run format`       | Format all files with Prettier            |
| `npm run check-format` | Check formatting (CI)                     |
| `npm run prepare`      | Install Husky hooks (automatic)           |

### Development Workflow

1. **Create a feature branch**

   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make changes**
   - Code is automatically linted and formatted on commit (via Husky)
   - TypeScript errors will prevent commits

3. **Test locally**

   ```bash
   npm run dev
   ```

4. **Build and verify**

   ```bash
   npm run build
   npm run preview
   ```

5. **Push and create PR**
   ```bash
   git push origin feature/your-feature-name
   ```

---

## ✅ Code Quality

### Linting & Formatting

This project uses **ESLint 9** with modern flat config format and **Prettier** for code formatting.

#### ESLint Configuration

Located in `eslint.config.js`:

- Modern flat config format
- TypeScript-specific rules
- React best practices
- Import sorting with `eslint-plugin-simple-import-sort`
- Zero warnings on build

#### Prettier Configuration

Located in `.prettierrc.json`:

```json
{
  "semi": true,
  "trailingComma": "es5",
  "singleQuote": true,
  "printWidth": 100,
  "tabWidth": 2,
  "endOfLine": "lf"
}
```

#### Git Hooks

**Pre-commit** (via Husky + lint-staged):

- Runs Prettier on staged files
- Runs ESLint with auto-fix
- Prevents commits with unfixable errors

**Pre-push** (via Husky):

- Runs full lint check
- Runs full format check
- Prevents pushes with any errors

#### Skip Hooks (when needed)

```bash
git commit --no-verify
git push --no-verify
```

---

## 🚢 Deployment

### Azure Static Web Apps

The application is deployed to **Azure Static Web Apps** with two environments:

#### Production Environment

- **URL**: https://linkeddata.open-regels.nl
- **Branch**: `main`
- **Workflow**: `.github/workflows/azure-static-web-apps-witty-beach-*.yml`
- **Trigger**: Push to `main` or PR to `main`

#### Acceptance Environment

- **URL**: https://acc.linkeddata.open-regels.nl
- **Branch**: `acc`
- **Workflow**: `.github/workflows/azure-static-web-apps-brave-bay-*.yml`
- **Trigger**: Push to `acc` or PR to `acc`

### Deployment Process

1. **Push to branch** - Automatic deployment via GitHub Actions
2. **Build process**:
   - Install dependencies
   - Run Vite build
   - Output to `dist/` directory
3. **Deploy to Azure** - Automatic upload to Static Web Apps
4. **Live in ~2-5 minutes** - GitHub Actions status shows progress

### Manual Deployment

```bash
# Build locally
npm run build

# Preview build
npm run preview

# Deploy to production (via git)
git push origin main

# Deploy to acceptance
git push origin acc
```

---

## 📖 Usage Guide

### 1. Running a SPARQL Query

1. **Open the Query Editor** - Click the `</>` icon in the sidebar
2. **Select or write a query**:
   - Choose from Library (bottom panel)
   - Or write custom SPARQL query
3. **Select endpoint** - Choose from dropdown or enter custom URL
4. **Click "Run Query"** - Results appear in the right panel

### 2. Visualizing Graph Data

1. **Run a query** with `?s ?p ?o` pattern
2. **Graph View activates automatically**
3. **Interact with graph**:
   - **Drag nodes** - Click and drag to reposition
   - **Zoom** - Mouse wheel or pinch
   - **Pan** - Click and drag background
4. **Legend** - Bottom-right shows node types

### 3. Viewing Changelog

1. **Click the 📖 icon** in the sidebar
2. **Browse versions** - Click version headers to expand/collapse
3. **Read details** - View features, bug fixes, and improvements by section

### 4. Managing Endpoints

1. **Click Settings icon** (⚙️) at bottom of sidebar
2. **Add endpoint**:
   - Enter display name
   - Enter SPARQL endpoint URL
   - Click `+` button
3. **Switch endpoints** - Click on any endpoint in the list
4. **Remove endpoint** - Hover and click trash icon
5. **Reset to defaults** - Click "Reset Defaults" link

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

## 🗺️ Roadmap

### Phase B.1 (In Progress)

- [ ] DMN Discovery via SPARQL
- [ ] Orchestration View with 3-panel layout
- [ ] DMN Chain Visualization

### Phase B.2 (Planned)

- [ ] Backend Service (Node.js + Express)
- [ ] Advanced Chain Discovery Algorithms
- [ ] TriplyDB Authentication

### Phase B.3 (Future)

- [ ] Visual Chain Builder
- [ ] Drag-and-Drop Composition
- [ ] Chain Validation

### Phase B.4 (Future)

- [ ] BPMN Generation
- [ ] Operaton Integration
- [ ] Deployment Automation

---

## 📊 Project Status

- ✅ **SPARQL Query Editor** - Complete
- ✅ **Graph Visualization** - Complete
- ✅ **Changelog Feature** - Complete
- ✅ **Code Quality Setup** - Complete (ESLint 9 + Prettier)
- ✅ **Deployment Pipeline** - Complete (Azure Static Web Apps)
- 🚧 **DMN Orchestration** - In Progress (Phase B.1)

---

**Built with ❤️ for Dutch Government Services**

[⬆ Back to top](#linked-data-explorer)
