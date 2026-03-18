# ICA — Local Development Commands

> All commands assume you are inside the `coding-agent/` root directory.

---

## 1. 🐳 Docker Services (PostgreSQL, Qdrant, Redis)

### Start all services
```bash
docker-compose up -d
```

### Stop all services
```bash
docker-compose down
```

### View running containers
```bash
docker ps
```

### View logs
```bash
docker-compose logs -f            # all services
docker-compose logs -f postgres   # PostgreSQL only
docker-compose logs -f qdrant     # Qdrant only
docker-compose logs -f redis      # Redis only
```

### Services & Ports

| Service    | Container Name | Port  | Purpose              |
|------------|---------------|-------|----------------------|
| PostgreSQL | `ica_postgres` | `5432` | Users, chat history, tasks |
| Qdrant     | `ica_qdrant`   | `6333` | Vector DB for RAG    |
| Redis      | `ica_redis`    | `6380` | Celery broker / cache |

### Health Checks
```bash
# PostgreSQL
docker exec ica_postgres pg_isready -U postgres

# Qdrant
curl http://localhost:6333/health

# Redis
docker exec ica_redis redis-cli ping
```

---

## 2. ⚙️ Backend (FastAPI + Uvicorn)

### First-time setup
```bash
cd backend
python -m venv venv
venv\Scripts\activate          # Windows
# source venv/bin/activate     # Linux/Mac
pip install -e .
```

### Initialize database
```bash
cd backend
python init_db.py
```

### Run backend server
```bash
cd backend
venv\Scripts\activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Backend URLs

| URL | Description |
|-----|-------------|
| `http://localhost:8000/health` | Health check |
| `http://localhost:8000/docs` | Swagger API docs |
| `http://localhost:8000/redoc` | ReDoc API docs |

### Environment Variables (backend/.env)

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `postgresql+asyncpg://postgres:postgres@localhost:5432/ica` | PostgreSQL connection |
| `GEMINI_API_KEY` | — | Google Gemini API key |
| `GITHUB_TOKEN` | — | GitHub PAT (optional, for higher rate limits) |
| `QDRANT_HOST` | `localhost` | Qdrant vector DB host |
| `QDRANT_PORT` | `6333` | Qdrant port |
| `REDIS_URL` | `redis://localhost:6380` | Redis connection |
| `SECRET_KEY` | — | JWT signing key |

---

## 3. 🌐 Frontend (Next.js)

### First-time setup
```bash
cd frontend
npm install
```

### Run frontend dev server
```bash
cd frontend
npm run dev
```

### Build for production
```bash
cd frontend
npm run build
npm start
```

### Frontend URLs

| URL | Description |
|-----|-------------|
| `http://localhost:3000` | App home page |
| `http://localhost:3000/login` | Login page |
| `http://localhost:3000/register` | Register page |
| `http://localhost:3000/chat` | Chat interface |
| `http://localhost:3000/dashboard` | Dashboard |
| `http://localhost:3000/upload` | File upload |
| `http://localhost:3000/repository` | Repository browser |

---

## 4. 🚀 Full Stack — Quick Start (Run Everything)

```bash
# Step 1: Start Docker services
docker-compose up -d

# Step 2: Start backend (new terminal)
cd backend
venv\Scripts\activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Step 3: Start frontend (new terminal)
cd frontend
npm run dev
```

---

## 5. 🛠️ Useful Commands

### Run backend tests
```bash
cd backend
venv\Scripts\activate
pytest
```

### Run test scripts
```bash
cd backend
python test_cases/list_models.py
python test_cases/check_db_files.py
python test_cases/reindex.py
python test_cases/delete_qdrant.py
```

### Lint frontend
```bash
cd frontend
npm run lint
```

### Reset Docker volumes (⚠️ deletes all data)
```bash
docker-compose down -v
```
