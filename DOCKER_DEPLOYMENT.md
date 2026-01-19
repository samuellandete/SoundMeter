# Docker Deployment Guide

## Prerequisites

### Windows
1. Install Docker Desktop for Windows: https://www.docker.com/products/docker-desktop
2. Enable WSL 2 backend (recommended for better performance)
3. Ensure Docker Desktop is running

### Mac/Linux
1. Install Docker: https://docs.docker.com/get-docker/
2. Install Docker Compose (usually included with Docker Desktop)

## Quick Start

### Option 1: Using Docker Compose (Recommended)

**Step 1: Navigate to project directory**

```bash
cd /path/to/SoundMeter
```

On Windows:
```cmd
cd C:\SoundMeter
```

**Step 2: Build and start the container**

```bash
docker-compose up -d
```

This will:
- Build the Docker image
- Start the container in detached mode
- Expose port 5000
- Create a `data` folder for database persistence

**Step 3: Check status**

```bash
docker-compose ps
```

**Step 4: View logs**

```bash
docker-compose logs -f
```

**Step 5: Find your server IP**

Windows:
```cmd
ipconfig
```

Mac/Linux:
```bash
ipconfig getifaddr en0
```

**Step 6: Access from iPad**

Open Safari and go to: `http://YOUR_SERVER_IP:5000`

### Option 2: Using Docker Commands

**Build the image:**

```bash
docker build -t soundmeter .
```

**Run the container:**

```bash
docker run -d \
  --name soundmeter \
  -p 5000:5000 \
  -v $(pwd)/data:/app/backend/data \
  --restart unless-stopped \
  soundmeter
```

On Windows CMD:
```cmd
docker run -d ^
  --name soundmeter ^
  -p 5000:5000 ^
  -v %cd%\data:/app/backend/data ^
  --restart unless-stopped ^
  soundmeter
```

On Windows PowerShell:
```powershell
docker run -d `
  --name soundmeter `
  -p 5000:5000 `
  -v ${PWD}/data:/app/backend/data `
  --restart unless-stopped `
  soundmeter
```

## Management Commands

### Stop the container
```bash
docker-compose stop
```

### Start the container
```bash
docker-compose start
```

### Restart the container
```bash
docker-compose restart
```

### Stop and remove container
```bash
docker-compose down
```

### View logs
```bash
docker-compose logs -f soundmeter
```

### Access container shell
```bash
docker-compose exec soundmeter /bin/bash
```

### Rebuild after code changes
```bash
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

## Database Persistence

The database is stored in the `data` folder on your host machine:
- Location: `./data/soundmeter.db`
- Persists even if container is deleted
- Backup: Just copy the `data` folder

### Backup Database

```bash
# Stop container
docker-compose stop

# Copy data folder
cp -r data data_backup_$(date +%Y%m%d)

# Restart container
docker-compose start
```

On Windows:
```cmd
docker-compose stop
xcopy data data_backup_%date:~-4,4%%date:~-10,2%%date:~-7,2% /E /I
docker-compose start
```

## Firewall Configuration

### Windows Firewall

Allow port 5000:

```powershell
# Run PowerShell as Administrator
New-NetFirewallRule -DisplayName "Sound Meter Docker" -Direction Inbound -Protocol TCP -LocalPort 5000 -Action Allow
```

### Linux (ufw)

```bash
sudo ufw allow 5000/tcp
```

## Troubleshooting

### Container won't start

Check logs:
```bash
docker-compose logs soundmeter
```

### Can't access from iPad

1. Check container is running: `docker-compose ps`
2. Check firewall allows port 5000
3. Verify iPad and server are on same WiFi network
4. Try accessing from server browser first: `http://localhost:5000`

### Database issues

Reset database:
```bash
docker-compose down
rm -rf data
docker-compose up -d
```

### Port already in use

Change port in `docker-compose.yml`:
```yaml
ports:
  - "8080:5000"  # Use 8080 instead of 5000
```

## Production Recommendations

1. **Use HTTPS**: Add a reverse proxy (nginx, Traefik) with SSL certificates
2. **Regular backups**: Schedule automatic database backups
3. **Update regularly**: Rebuild image when updating code
4. **Monitor logs**: Set up log rotation and monitoring
5. **Resource limits**: Add memory/CPU limits in docker-compose.yml:

```yaml
services:
  soundmeter:
    # ... other settings ...
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 1G
```

## Auto-start on Windows Boot

Docker Desktop → Settings → General → Enable "Start Docker Desktop when you log in"

Then your container will auto-start because of `restart: unless-stopped` in docker-compose.yml.

## Updating the Application

```bash
# Pull latest code
git pull

# Rebuild and restart
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```
