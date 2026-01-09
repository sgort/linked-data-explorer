# Linked Data Explorer Backend

> Node.js/Express backend service for DMN chain orchestration and execution

**Version:** 0.1.0  
**Phase:** B.2 - Orchestration Service  
**Architecture:** Hybrid (SPARQL Discovery + Operaton Execution)

---

## 🎯 Overview

This backend service provides REST APIs for:
- **DMN Discovery** - Query TriplyDB for available Decision Models
- **Chain Discovery** - Find relationships between DMNs based on variable matching
- **Chain Execution** - Execute sequential DMN chains via Operaton REST API
- **Variable Orchestration** - Automatic variable mapping between chain steps

### Production Reference

This service replicates the production BPMN orchestration pattern:
- Sequential DMN execution (SVB → SZW → Heusden)
- Variable flattening after each step
- Target execution time: <1000ms
- Known-good test data from production environment

---

## 🏗️ Architecture

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
PORT=3001
HOST=localhost

# TriplyDB
TRIPLYDB_ENDPOINT=https://api.open-regels.triply.cc/datasets/...

# Operaton
OPERATON_BASE_URL=https://operaton.open-regels.nl/engine-rest
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
```

---

## 📡 API Endpoints

### Health & Info

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api` | API information |
| GET | `/api/health` | Health check (all services) |
| GET | `/api/health/ready` | Readiness probe |
| GET | `/api/health/live` | Liveness probe |

### DMN Operations

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/dmns` | List all DMNs |
| GET | `/api/dmns/:identifier` | Get DMN details |

### Chain Operations

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/chains` | Discover all chains |
| POST | `/api/chains/execute` | Execute a chain |
| POST | `/api/chains/execute/heusdenpas` | Execute Heusdenpas chain |

---

## 🔌 API Usage Examples

### Execute Heusdenpas Chain

```bash
POST /api/chains/execute/heusdenpas
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
    "steps": [...]
  },
  "timestamp": "2026-01-09T..."
}
```

### Execute Custom Chain

```bash
POST /api/chains/execute
Content-Type: application/json

{
  "dmnIds": ["SVB_LeeftijdsInformatie", "SZW_BijstandsnormInformatie"],
  "inputs": {
    "geboortedatumAanvrager": "1980-01-23",
    "dagVanAanvraag": "2025-12-24",
    "aanvragerAlleenstaand": true,
    "aanvragerHeeftKinderen": true
  }
}
```

### List All DMNs

```bash
GET /api/dmns

Response:
{
  "success": true,
  "data": {
    "total": 6,
    "dmns": [
      {
        "id": "...",
        "identifier": "SVB_LeeftijdsInformatie",
        "title": "SVB Leeftijdsinformatie Berekening",
        "inputs": [...],
        "outputs": [...]
      },
      ...
    ]
  }
}
```

### Discover Chains

```bash
GET /api/chains

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
            "variable": "aanvragerIs181920",
            "variableType": "Boolean"
          },
          ...
        ]
      },
      ...
    ]
  }
}
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

### Health Check

```bash
curl http://localhost:3001/api/health
```

---

## 📊 Performance

**Targets:**
- Chain execution: <1000ms
- Health check response: <100ms
- DMN list query: <500ms

**Production Baseline:**
- Heusdenpas chain: 827ms (3 DMNs + 2 flattening steps)

---

## 🔒 Security

- **Helmet** - Security headers
- **CORS** - Configured origins only
- **Input validation** - Type checking and sanitization
- **Error handling** - No sensitive data in production errors

---

## 📝 Development

### Code Structure

```
src/
├── routes/          # API endpoints
├── services/        # Business logic
├── types/           # TypeScript definitions
├── middleware/      # Express middleware
├── utils/           # Utilities (logger, config)
└── index.ts         # Entry point
```

### Code Quality

```bash
# Linting
npm run lint
npm run lint:fix

# Formatting
npm run format
npm run format:check
```

---

## 🚢 Deployment

### Azure App Service

**Planned deployment:**
- ACC: `https://acc-backend.linkeddata.open-regels.nl`
- Production: `https://backend.linkeddata.open-regels.nl`

### Environment Variables (Azure)

Configure these in Azure App Service → Configuration:

```
NODE_ENV=production
PORT=8080
TRIPLYDB_ENDPOINT=...
OPERATON_BASE_URL=...
CORS_ORIGIN=https://linkeddata.open-regels.nl
LOG_LEVEL=info
```

---

## 📄 License

**EUPL-1.2** (European Union Public License 1.2)

---

## 🤝 Contributing

This service is part of the ICTU Regels Overheid Nederland (RONL) initiative.

**Contact:** [RONL Team]
