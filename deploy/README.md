# ICA production deployment (single VM)

Recommended for <=10 users:

- **Frontend:** Vercel Hobby (free)
- **Backend + Docker workspaces:** Oracle Cloud Always Free ARM (2 OCPU / 12 GB) or a small VPS
- **PostgreSQL, Redis, Qdrant:** same VM, bound to `127.0.0.1`
- **TLS:** Caddy + DuckDNS (or a cheap domain)

This assumes the backend runs as a host service so it can use the host Docker socket and reach
published workspace ports on `127.0.0.1`.

## 1. Provision

Create Ubuntu 24.04 (ARM is fine), 2 OCPU / 12 GB, 100 GB boot volume. Open only
**22, 80, 443** in the cloud firewall.

```bash
sudo apt update
sudo apt install -y git python3.12-venv python3-pip caddy ufw
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker "$USER"
sudo ufw allow 22,80,443/tcp
sudo ufw enable
```

Log out/in so the Docker group applies.

## 2. Clone and configure

```bash
sudo mkdir -p /opt/ica && sudo chown "$USER":"$USER" /opt/ica
git clone <your-repo> /opt/ica
cd /opt/ica
cp backend/.env.example .env
# edit .env: SECRET_KEY, GEMINI_API_KEY, CORS_ORIGINS, ADMIN_EMAIL
```

Production values:

```dotenv
DEBUG=false
ENVIRONMENT=production
CORS_ORIGINS=https://your-frontend.vercel.app
PREVIEW_BIND_HOST=127.0.0.1
PREVIEW_CONNECT_HOST=127.0.0.1
MAX_WORKSPACES_PER_USER=1
MAX_WORKSPACES_GLOBAL=2
WORKSPACE_MEMORY_LIMIT=384m
WORKSPACE_CPU_QUOTA=25000
ALLOW_ADMIN_BOOTSTRAP=true   # only for the first admin registration
```

Generate a secret:

```bash
openssl rand -hex 32
```

## 3. Start infrastructure and migrate

```bash
cd /opt/ica
docker compose up -d
cd backend
python3 -m venv venv
./venv/bin/pip install -e .
./venv/bin/python -m alembic upgrade head
```

If the database already exists from `init_db.py`:

```bash
./venv/bin/python -m alembic stamp head
```

## 4. Run the backend

```bash
sudo cp deploy/ica-backend.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now ica-backend
```

The unit assumes the repo is at `/opt/ica`, the venv at `/opt/ica/backend/venv`, and the env
file at `/opt/ica/.env`. Adjust paths if needed.

## 5. TLS and reverse proxy

Point a DuckDNS/domain name at the VM, then:

```bash
sudo cp deploy/Caddyfile /etc/caddy/Caddyfile
sudo sed -i 's/api.example.com/api.yourdomain.duckdns.org/' /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

Caddy handles HTTPS and WebSocket upgrades.

## 6. Frontend

Deploy `frontend/` to Vercel with:

```dotenv
NEXT_PUBLIC_API_URL=https://api.yourdomain.duckdns.org/api/v1
NEXT_PUBLIC_WS_URL=wss://api.yourdomain.duckdns.org
```

Set the backend `CORS_ORIGINS` to the exact Vercel production URL.

## 7. First admin + shutdown of bootstrap

1. Register with `ADMIN_EMAIL`.
2. Log in and confirm the admin panel.
3. Set `ALLOW_ADMIN_BOOTSTRAP=false` in `/opt/ica/.env`.
4. `sudo systemctl restart ica-backend`.

## 8. Scheduled maintenance

```bash
sudo cp deploy/reap-workspaces.service deploy/reap-workspaces.timer /etc/systemd/system/
sudo systemctl enable --now reap-workspaces.timer

sudo cp deploy/backup.sh /usr/local/bin/ica-backup
sudo chmod +x /usr/local/bin/ica-backup
# add to root crontab: 15 3 * * * /usr/local/bin/ica-backup
```

The reaper stops workspaces idle for 45+ minutes. The backup script keeps 7 days of PostgreSQL
dumps.

## 9. Verify

```bash
curl -fsS https://api.yourdomain.duckdns.org/health
```

Expected: `database`, `redis`, `qdrant`, and `docker` are `ok`. Then test login, repo import,
workspace creation, terminal, and preview.

## Hardening notes

- The backend has Docker-socket access and is therefore root-equivalent on this VM. Keep the VM
  dedicated to ICA.
- Never expose 5432, 6379, or 6333 publicly.
- Keep `DEBUG=false`; debug mode permits all CORS origins.
- The free Oracle tier may reclaim an idle instance. Keeping the app healthy and used avoids it.
- Gemini free-tier quotas are volatile; budget a small paid quota for a demo with 10 users.
- Remote preview uses proxy mode. The local **Direct** preview button relies on loopback ports and
  is not available to remote browsers. Remote HMR needs a wildcard preview subdomain.
