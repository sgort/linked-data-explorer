# Linked Data Explorer Backend

> Node.js/Express backend service for DMN chain orchestration and execution

**Version:** 0.4.0  
**Architecture:** Hybrid (SPARQL Discovery + Operaton Execution)  
**Compliance:** Dutch Government API Design Rules (API-20, API-57)

---

## 🎯 Overview

This backend service provides REST APIs for:
- **DMN Discovery** - Query TriplyDB for available Decision Models
- **Chain Discovery** - Find relationships between DMNs based on variable matching
- **Chain Execution** - Execute sequential DMN chains via Operaton REST API
- **Variable Orchestration** - Automatic variable mapping between chain steps
- **Health Monitoring** - Comprehensive service health checks with dependency status

### Key Features

- ✅ **API Versioning** - `/v1/*` endpoints following Dutch Government API Design Rules
- ✅ **Backward Compatibility** - Legacy `/api/*` endpoints with deprecation headers
- ✅ **Version Headers** - `API-Version` header in all responses
- ✅ **Health Monitoring** - Detailed health checks for TriplyDB and Operaton
- ✅ **Production Ready** - Deployed on Azure App Service with CI/CD

### Production Reference

This service replicates the production BPMN orchestration pattern:
- Sequential DMN execution (SVB → SZW → Heusden)
- Variable flattening after each step
- Target execution time: <1000ms
- Known-good test data from production environment

---

## 🗂️ Architecture

```
Frontend (React)
       ↓ HTTP/REST
Backend (Express)
       ├→ TriplyDB (SPARQL)    - DMN discovery
       └→ Operaton (REST API)   - DMN execution
              ↓
          DMN Models
```

---

## 🌐 Live Deployments

### Backend

| Environment | URL | Branch | CI/CD | Purpose |
|-------------|-----|--------|-------|---------|
| **Production** | [backend.linkeddata.open-regels.nl](https://backend.linkeddata.open-regels.nl) | `main` | GitHub Actions ✅ | API & orchestration |
| **Acceptance** | [acc.backend.linkeddata.open-regels.nl](https://acc.backend.linkeddata.open-regels.nl) | `acc` | GitHub Actions ✅ | Testing environment |

**Platform:** Azure App Service (Linux, Node.js 22)  
**Deployment:** Automated via GitHub Actions with manual approval for production  
**Build Process:** TypeScript compilation, dependency installation, automated health checks

---

## 🚀 Getting Started

### Prerequisites

- Node.js >= 20.0.0
- npm >= 10.0.0
- Access to TriplyDB endpoint
- Access to Operaton REST API

### Installation

```bash
# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit .env with your configuration
```

### Configuration

Edit `.env` file:

```env
# Server
NODE_ENV=development
PORT=3001
HOST=localhost

# CORS
CORS_ORIGIN=http://localhost:5173,https://linkeddata.open-regels.nl

# TriplyDB
TRIPLYDB_ENDPOINT=https://api.open-regels.triply.cc/datasets/...

# Operaton
OPERATON_BASE_URL=https://operaton.open-regels.nl/engine-rest

# Logging
LOG_LEVEL=info
```

### Running

```bash
# Development (with auto-reload)
npm run dev

# Build for production
npm run build

# Production
npm start

# Tests
npm test
npm run test:watch
npm run test:coverage
```

---

## 📡 API Endpoints

### API Versioning

This API follows Dutch Government API Design Rules with version-specific endpoints:

- **Current Version:** `/v1/*` (recommended)
- **Legacy Version:** `/api/*` (deprecated, backward compatible)

All endpoints return an `API-Version` header with the current version.

### Root & Health Endpoints

| Method | Endpoint | Description | Version |
|--------|----------|-------------|---------|
| GET | `/` | API information | - |
| GET | `/v1/health` | Health check with app metadata | v1 |
| GET | `/api/health` | Health check (deprecated) | legacy |

**Root Endpoint Response:**

```json
{
  "name": "Linked Data Explorer Backend",
  "version": "0.4.0",
  "status": "running",
  "environment": "production",
  "documentation": "/api",
  "health": "/api/health"
}
```

**Health Endpoint Response:**

```json
{
  "name": "Linked Data Explorer Backend",
  "version": "0.4.0",
  "environment": "production",
  "status": "healthy",
  "uptime": 123.456,
  "timestamp": "2026-01-13T19:44:14.971Z",
  "services": {
    "triplydb": {
      "status": "up",
      "latency": 165,
      "lastCheck": "2026-01-13T19:44:15.401Z"
    },
    "operaton": {
      "status": "up",
      "latency": 119,
      "lastCheck": "2026-01-13T19:44:15.401Z"
    }
  },
  "documentation": "/v1/openapi.json"
}
```

**Response Headers:**

```http
HTTP/1.1 200 OK
API-Version: 0.4.0
Content-Type: application/json
```

**Health Status Values:**
- `healthy` - All services operational (HTTP 200)
- `degraded` - One or more services down (HTTP 503)
- `unhealthy` - Health check failed (HTTP 503)

### DMN Operations

| Method | Endpoint | Description | Version |
|--------|----------|-------------|---------|
| GET | `/v1/dmns` | List all DMNs | v1 |
| GET | `/v1/dmns/:identifier` | Get DMN details | v1 |
| GET | `/api/dmns` | List all DMNs (deprecated) | legacy |
| GET | `/api/dmns/:identifier` | Get DMN details (deprecated) | legacy |

### Chain Operations

| Method | Endpoint | Description | Version |
|--------|----------|-------------|---------|
| GET | `/v1/chains` | Discover all chains | v1 |
| POST | `/v1/chains/execute` | Execute a chain | v1 |
| POST | `/v1/chains/execute/heusdenpas` | Execute Heusdenpas chain | v1 |
| GET | `/api/chains` | Discover all chains (deprecated) | legacy |
| POST | `/api/chains/execute` | Execute a chain (deprecated) | legacy |
| POST | `/api/chains/execute/heusdenpas` | Execute Heusdenpas (deprecated) | legacy |

### Deprecated Endpoints

Legacy `/api/*` endpoints are **deprecated** and will be removed in v2.0.0.

**Deprecation Headers:**

```http
HTTP/1.1 200 OK
API-Version: 0.4.0
Deprecation: true
Link: </v1/health>; rel="successor-version"
```

**Migration:** Replace `/api/*` with `/v1/*` in all API calls.

---

## 📌 API Usage Examples

### Execute Heusdenpas Chain (v1)

```bash
POST /v1/chains/execute/heusdenpas
Content-Type: application/json

{
  "inputs": {
    "geboortedatumAanvrager": "1980-01-23",
    "geboortedatumPartner": null,
    "dagVanAanvraag": "2025-12-24",
    "aanvragerAlleenstaand": true,
    "aanvragerHeeftKinderen": true,
    "aanvragerHeeftKind4Tm17": true,
    "aanvragerInwonerHeusden": true,
    "maandelijksBrutoInkomenAanvrager": 1500,
    "aanvragerUitkeringBaanbrekers": false,
    "aanvragerVoedselbankpasDenBosch": false,
    "aanvragerKwijtscheldingGemeentelijkeBelastingen": false,
    "aanvragerSchuldhulptrajectKredietbankNederland": false,
    "aanvragerDitKalenderjaarAlAangevraagd": false,
    "aanvragerAanmerkingStudieFinanciering": false
  },
  "options": {
    "includeIntermediateSteps": true
  }
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "success": true,
    "chainId": "SVB_LeeftijdsInformatie->SZW_BijstandsnormInformatie->RONL_HeusdenpasEindresultaat",
    "executionTime": 827,
    "finalOutputs": {
      "aanmerkingHeusdenPas": true,
      "aanmerkingKindPakket": true
    },
    "steps": [
      {
        "dmnId": "SVB_LeeftijdsInformatie",
        "dmnTitle": "SVB Leeftijdsinformatie Berekening",
        "inputs": {
          "geboortedatumAanvrager": "1980-01-23",
          "dagVanAanvraag": "2025-12-24"
        },
        "outputs": {
          "aanvragerLeeftijd": 45,
          "aanvragerIs18": true,
          "aanvragerIs65": false
        },
        "executionTime": 234
      },
      {
        "dmnId": "SZW_BijstandsnormInformatie",
        "dmnTitle": "SZW Bijstandsnorm Informatie",
        "inputs": {
          "aanvragerAlleenstaand": true,
          "aanvragerHeeftKinderen": true,
          "aanvragerIs18": true
        },
        "outputs": {
          "bijstandsNorm": 1234.56,
          "toepasselijkeNorm": "alleenstaandeOuder"
        },
        "executionTime": 178
      },
      {
        "dmnId": "RONL_HeusdenpasEindresultaat",
        "dmnTitle": "Heusden Pas Eindresultaat",
        "inputs": {
          "maandelijksBrutoInkomenAanvrager": 1500,
          "bijstandsNorm": 1234.56,
          "aanvragerInwonerHeusden": true
        },
        "outputs": {
          "aanmerkingHeusdenPas": true,
          "aanmerkingKindPakket": true
        },
        "executionTime": 156
      }
    ]
  },
  "timestamp": "2026-01-13T19:44:15.401Z"
}
```

**Response Headers:**

```http
HTTP/1.1 200 OK
API-Version: 0.4.0
Content-Type: application/json
Access-Control-Allow-Origin: *
```

### Execute Custom Chain (v1)

```bash
POST /v1/chains/execute
Content-Type: application/json

{
  "dmnIds": ["SVB_LeeftijdsInformatie", "SZW_BijstandsnormInformatie"],
  "inputs": {
    "geboortedatumAanvrager": "1980-01-23",
    "dagVanAanvraag": "2025-12-24",
    "aanvragerAlleenstaand": true,
    "aanvragerHeeftKinderen": true
  },
  "options": {
    "includeIntermediateSteps": true
  }
}
```

### List All DMNs (v1)

```bash
GET /v1/dmns

Response:
{
  "success": true,
  "data": {
    "total": 6,
    "dmns": [
      {
        "id": "https://identifier.overheid.nl/tooi/id/beslismodel/...",
        "identifier": "SVB_LeeftijdsInformatie",
        "title": "SVB Leeftijdsinformatie Berekening",
        "description": "Berekent leeftijd op basis van geboortedatum",
        "inputs": [
          {
            "name": "geboortedatumAanvrager",
            "type": "Date",
            "label": "Geboortedatum Aanvrager"
          },
          {
            "name": "dagVanAanvraag",
            "type": "Date",
            "label": "Dag van Aanvraag"
          }
        ],
        "outputs": [
          {
            "name": "aanvragerLeeftijd",
            "type": "Integer",
            "label": "Leeftijd Aanvrager"
          },
          {
            "name": "aanvragerIs18",
            "type": "Boolean",
            "label": "Aanvrager is 18+"
          }
        ]
      },
      {
        "id": "https://identifier.overheid.nl/tooi/id/beslismodel/...",
        "identifier": "SZW_BijstandsnormInformatie",
        "title": "SZW Bijstandsnorm Informatie",
        "description": "Bepaalt toepasselijke bijstandsnorm",
        "inputs": [...],
        "outputs": [...]
      }
    ]
  }
}
```

### Discover Chains (v1)

```bash
GET /v1/chains

Response:
{
  "success": true,
  "data": {
    "total": 5,
    "chains": [
      {
        "from": "SVB_LeeftijdsInformatie",
        "connections": [
          {
            "to": "SZW_BijstandsnormInformatie",
            "variable": "aanvragerIs18",
            "variableType": "Boolean"
          },
          {
            "to": "RONL_HeusdenpasEindresultaat",
            "variable": "aanvragerLeeftijd",
            "variableType": "Integer"
          }
        ]
      },
      {
        "from": "SZW_BijstandsnormInformatie",
        "connections": [
          {
            "to": "RONL_HeusdenpasEindresultaat",
            "variable": "bijstandsNorm",
            "variableType": "Number"
          }
        ]
      }
    ]
  }
}
```

### Check Health (v1)

```bash
# Detailed health with service status
curl http://localhost:3001/v1/health

# Check response headers
curl -I http://localhost:3001/v1/health

Response Headers:
HTTP/1.1 200 OK
API-Version: 0.4.0
Content-Type: application/json
Access-Control-Allow-Origin: *
```

---

## 🧪 Testing

### Production Test Data

Use this test case to validate the Heusdenpas chain:

```json
{
  "geboortedatumAanvrager": "1980-01-23",
  "dagVanAanvraag": "2025-12-24",
  "aanvragerAlleenstaand": true,
  "aanvragerHeeftKinderen": true,
  "aanvragerHeeftKind4Tm17": true,
  "aanvragerInwonerHeusden": true,
  "maandelijksBrutoInkomenAanvrager": 1500,
  "aanvragerUitkeringBaanbrekers": false,
  "aanvragerVoedselbankpasDenBosch": false,
  "aanvragerKwijtscheldingGemeentelijkeBelastingen": false,
  "aanvragerSchuldhulptrajectKredietbankNederland": false,
  "aanvragerDitKalenderjaarAlAangevraagd": false,
  "aanvragerAanmerkingStudieFinanciering": false,
  "geboortedatumPartner": null
}
```

**Expected Result:**
- `aanmerkingHeusdenPas`: true
- `aanmerkingKindPakket`: true
- Execution time: ~800-900ms

### Local Testing

```bash
# Start development server
npm run dev

# Test v1 endpoints
curl http://localhost:3001/v1/health | jq
curl http://localhost:3001/v1/dmns | jq

# Test legacy endpoints (with deprecation headers)
curl -I http://localhost:3001/api/health | grep -E "API-Version|Deprecation"

# Test chain execution
curl -X POST http://localhost:3001/v1/chains/execute/heusdenpas \
  -H "Content-Type: application/json" \
  -d @test-data.json | jq
```

### Acceptance Testing

```bash
# Test ACC environment
curl https://acc.backend.linkeddata.open-regels.nl/v1/health | jq
curl https://acc.backend.linkeddata.open-regels.nl/v1/dmns | jq
```

### Production Testing

```bash
# Test production environment
curl https://backend.linkeddata.open-regels.nl/v1/health | jq
curl https://backend.linkeddata.open-regels.nl/v1/dmns | jq
```

---

## 📊 Performance

**Targets:**
- Chain execution: <1000ms
- Health check response: <100ms
- DMN list query: <500ms
- API response time: <200ms (95th percentile)

**Production Baseline:**
- Heusdenpas chain: ~827ms (3 DMNs + variable orchestration)
- Health check: ~180ms (includes TriplyDB + Operaton checks)
- DMN discovery: ~350ms (SPARQL query + parsing)

**Service Dependencies:**
- TriplyDB latency: ~150-200ms
- Operaton latency: ~80-120ms per DMN execution

---

## 🔒 Security

### Security Headers

- **Helmet** - Comprehensive security headers
- **CORS** - Configured origins only
- **Content-Type** - Explicit content type headers
- **API-Version** - Version information in responses

### Input Validation

- Type checking for all inputs
- Variable name validation
- DMN identifier validation
- Request body size limits (10MB)

### Error Handling

- No sensitive data in error responses
- Structured error format
- Appropriate HTTP status codes
- Production error logging (Winston)

### Environment Variables

Sensitive configuration stored in environment variables:
- TriplyDB endpoint URLs
- Operaton API URLs
- CORS origins
- API keys (when applicable)

---

## 🏛️ Dutch Government API Design Rules Compliance

This API follows the Dutch Government API Design Rules for interoperability and standardization.

### Implemented Rules

| Rule | Description | Implementation |
|------|-------------|----------------|
| **API-20** | Major version in URI | `/v1/*` endpoints |
| **API-57** | Version header in responses | `API-Version: 0.4.0` header |
| **API-05** | Use nouns for resources | `dmns`, `chains`, `health` |
| **API-54** | Plural/singular naming | Correct usage throughout |
| **API-48** | No trailing slashes | Enforced in routing |
| **API-53** | Hide implementation details | Clean abstractions |

### Language Considerations (API-04)

- **Technical endpoints** (health, version): English (international standards)
- **Business resources** (DMNs, chains): Variable names follow source data
- **Documentation**: English for technical audience

### Future Enhancements

- **API-16** & **API-51**: OpenAPI 3.0 documentation at `/v1/openapi.json`
- **API-02**: Standard error responses
- **API-10**: Resource collections with pagination

---

## 📁 Development

### Code Structure

```
packages/backend/
├── src/
│   ├── routes/              # API endpoints
│   │   ├── index.ts         # Route configuration
│   │   ├── health.routes.ts # Health check
│   │   ├── dmn.routes.ts    # DMN discovery
│   │   └── chain.routes.ts  # Chain execution
│   ├── services/            # Business logic
│   │   ├── sparql.service.ts      # TriplyDB queries
│   │   ├── operaton.service.ts    # DMN execution
│   │   └── orchestration.service.ts # Chain orchestration
│   ├── types/               # TypeScript definitions
│   ├── middleware/          # Express middleware
│   │   ├── error.middleware.ts    # Error handling
│   │   └── version.middleware.ts  # API versioning
│   ├── utils/               # Utilities
│   │   ├── logger.ts        # Winston logger
│   │   └── config.ts        # Configuration
│   └── index.ts             # Entry point
├── .env.example             # Environment template
├── .env.development         # Dev environment
├── .env.acceptance          # ACC environment
├── .env.production          # Production environment
├── package.json             # Dependencies
├── tsconfig.json            # TypeScript config
└── README.md                # This file
```

### Code Quality

```bash
# Linting (ESLint 9 flat config)
npm run lint
npm run lint:fix

# Formatting (Prettier)
npm run format
npm run format:check

# Type checking
npx tsc --noEmit

# All quality checks
npm run lint && npm run format:check && npm test
```

### Git Hooks

Pre-commit hooks via Husky:
- ✅ Prettier formatting on staged files
- ✅ ESLint with auto-fix
- ✅ TypeScript type checking
- ✅ Test execution

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NODE_ENV` | Yes | development | Environment (development/production) |
| `PORT` | No | 3001 | Server port |
| `HOST` | No | localhost | Server host |
| `CORS_ORIGIN` | Yes | - | Allowed origins (comma-separated) |
| `TRIPLYDB_ENDPOINT` | Yes | - | TriplyDB SPARQL endpoint |
| `OPERATON_BASE_URL` | Yes | - | Operaton REST API base URL |
| `LOG_LEVEL` | No | info | Winston log level |

---

## 🚢 Deployment

### GitHub Actions Workflow

Automated deployment via GitHub Actions:

```yaml
# .github/workflows/azure-backend-deploy.yml
name: Deploy Backend
on:
  push:
    branches: [main, acc]

jobs:
  build-and-deploy:
    steps:
      - Checkout code
      - Setup Node.js 22
      - Install dependencies
      - Run linting
      - Run tests
      - Build TypeScript
      - Deploy to Azure App Service
      - Run health checks
```

### Manual Deployment (ACC)

```bash
# 1. Build locally
cd packages/backend
npm install
npm run build

# 2. Configure Azure App Service environment variables
# - NODE_ENV=production
# - PORT=8080
# - CORS_ORIGIN=https://acc.linkeddata.open-regels.nl
# - TRIPLYDB_ENDPOINT=...
# - OPERATON_BASE_URL=...

# 3. Deploy via Azure CLI
az webapp up \
  --resource-group RONL-Preproduction \
  --name ronl-linkeddata-backend-acc \
  --runtime "NODE:22-lts"

# 4. Verify deployment
curl https://acc.backend.linkeddata.open-regels.nl/v1/health
```

### Manual Deployment (Production)

```bash
# Same as ACC but with production settings
# Requires manual approval in GitHub Actions
```

---

## 🗺️ Roadmap

### v0.4.0 (Current)
- ✅ API versioning (/v1/*)
- ✅ Health monitoring with app metadata
- ✅ Dutch Government API compliance (API-20, API-57)
- ✅ Backward compatibility (/api/*)
- ✅ Version headers in responses

### v0.5.0 (Q1 2026)
- [ ] OpenAPI 3.0 documentation
- [ ] Request/response validation
- [ ] Rate limiting
- [ ] Caching layer

### v1.0.0 (Q2 2026)
- [ ] Full Dutch Government API compliance
- [ ] Production-grade monitoring
- [ ] Performance optimizations (<800ms chains)
- [ ] Comprehensive error handling

### v2.0.0 (Future)
- [ ] Remove /api/* endpoints
- [ ] Consider Dutch naming for business resources
- [ ] Enhanced orchestration features
- [ ] Batch execution support

---

## 📝 License

**EUPL-1.2** (European Union Public License 1.2)

This project is licensed under the European Union Public License v1.2 or later.

---

## 🤝 Contributing

This service is part of the **Regels Overheid Nederland (RONL)** initiative.

### Development Guidelines

1. Follow existing code patterns
2. Use TypeScript for all new code
3. Add types for all functions
4. Write tests for new features
5. Update documentation
6. Follow Dutch Government API Design Rules

### Pull Request Process

1. Create feature branch from `acc`
2. Make changes with tests
3. Run linting and formatting
4. Update README if needed
5. Submit PR to `acc` branch
6. After testing, merge to `main`

---

## 📞 Support & Contact

**Issues:** [GitHub Issues](https://github.com/sgort/linked-data-explorer/issues)  
**Project:** [Regels Overheid Nederland](https://regels.overheid.nl/)  
**Maintainer:** RONL Development Team

---

## 🔗 Related Resources

- [Frontend Application](../frontend/README.md)
- [Dutch Government API Design Rules](https://publicatie.centrumvoorstandaarden.nl/api/adr/)
- [OpenAPI Specification](https://spec.openapis.org/oas/latest.html)
- [TriplyDB Documentation](https://triply.cc/docs/)
- [Operaton Documentation](https://docs.operaton.org/)

---

**Version:** 0.4.0  
**Last Updated:** January 13, 2026  
**Built with ❤️ for Dutch Government Services**
