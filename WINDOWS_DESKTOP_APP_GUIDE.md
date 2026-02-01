# mBiz Windows Desktop App Implementation Guide

## 📋 Overview

This guide provides a complete blueprint for converting mBiz into a Windows desktop application similar to WhatsApp Desktop, with full offline capabilities and automatic cloud synchronization.

### Key Features
- ✅ Native Windows application (.exe installer)
- ✅ System tray integration
- ✅ Auto-start on Windows boot
- ✅ Embedded Python backend (FastAPI)
- ✅ Local SQLite database for offline operation
- ✅ Automatic cloud sync when online
- ✅ Mode switching (Local/Cloud/Auto)
- ✅ Auto-updates
- ✅ Single-tenant per installation

---

## 🏗️ Architecture

### Current Architecture
```
Web App
├── Frontend (React + Vite) → Browser
└── Backend (FastAPI + PostgreSQL) → Cloud Server
```

### Target Architecture
```
Desktop App
├── Electron Shell
│   ├── System Tray
│   ├── Auto-updater
│   └── Window Management
├── Frontend (React) → Bundled
├── Backend (FastAPI) → Embedded Executable
│   ├── SQLite (Local)
│   └── PostgreSQL (Cloud) via Sync
└── Sync Engine → Background Process
```

### Data Flow
```
User Action
    ↓
Local SQLite (Instant Response)
    ↓
Sync Queue (If online)
    ↓
Cloud PostgreSQL (Background)
    ↓
Pull Updates (Every 5 min)
    ↓
Merge to Local SQLite
```

---

## 📦 Prerequisites

### Development Environment
```bash
# Node.js & npm
node --version  # v18+ required
npm --version

# Python
python --version  # 3.9+ required
pip --version

# Windows SDK (for building native modules)
# Download from: https://developer.microsoft.com/en-us/windows/downloads/windows-sdk/
```

### Tools to Install
```bash
# Electron Forge CLI
npm install -g @electron-forge/cli

# PyInstaller for Python bundling
pip install pyinstaller pyinstaller-hooks-contrib

# NSIS (for Windows installer)
# Download from: https://nsis.sourceforge.io/Download
```

---

## 🚀 Phase 1: Project Structure Setup

### Step 1.1: Create Desktop Directory Structure

```bash
# In your project root
mkdir -p desktop/electron
mkdir -p desktop/resources
mkdir -p desktop/icons
mkdir -p sync-engine
```

### Step 1.2: Install Electron Dependencies

```bash
cd desktop

# Initialize package.json if not exists
npm init -y

# Install Electron and related packages
npm install --save-dev electron electron-builder
npm install electron-store electron-updater
npm install node-fetch axios
```

### Step 1.3: Create `desktop/package.json`

```json
{
  "name": "mbiz-desktop",
  "version": "1.0.0",
  "description": "mBiz Point of Sale Desktop Application",
  "main": "electron/main.js",
  "author": "Your Company",
  "license": "MIT",
  "scripts": {
    "dev": "electron .",
    "build": "electron-builder",
    "build:win": "electron-builder --win --x64",
    "postinstall": "electron-builder install-app-deps"
  },
  "dependencies": {
    "electron-store": "^8.1.0",
    "electron-updater": "^6.1.7",
    "axios": "^1.6.0"
  },
  "devDependencies": {
    "electron": "^28.0.0",
    "electron-builder": "^24.9.1"
  },
  "build": {
    "appId": "com.mbiz.desktop",
    "productName": "mBiz",
    "directories": {
      "output": "dist"
    },
    "files": [
      "electron/**/*",
      "resources/**/*",
      "build/**/*"
    ],
    "win": {
      "target": "nsis",
      "icon": "icons/icon.ico"
    },
    "nsis": {
      "oneClick": false,
      "allowToChangeInstallationDirectory": true,
      "createDesktopShortcut": true,
      "createStartMenuShortcut": true,
      "shortcutName": "mBiz"
    }
  }
}
```

---

## 🔧 Phase 2: Backend Modifications for Dual-Database Support

### Step 2.1: Add SQLite Dependencies

```bash
# In backend directory
pip install aiosqlite alembic
pip freeze > requirements.txt
```

### Step 2.2: Create Database Adapter - `backend/db_adapter.py`

```python
"""
Database adapter that supports both PostgreSQL (cloud) and SQLite (local)
"""
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import declarative_base
import os
from typing import AsyncGenerator

Base = declarative_base()

class DatabaseAdapter:
    def __init__(self, mode: str = "cloud"):
        """
        mode: 'cloud' (PostgreSQL) or 'local' (SQLite)
        """
        self.mode = mode
        self.engine = None
        self.session_maker = None
        
    def get_database_url(self) -> str:
        if self.mode == "local":
            # SQLite for local mode
            db_path = os.path.expanduser("~/.mbiz/local.db")
            os.makedirs(os.path.dirname(db_path), exist_ok=True)
            return f"sqlite+aiosqlite:///{db_path}"
        else:
            # PostgreSQL for cloud mode
            return os.getenv("DATABASE_URL_ASYNCPG")
    
    async def initialize(self):
        """Initialize database connection"""
        database_url = self.get_database_url()
        
        # Engine configuration differs for SQLite vs PostgreSQL
        if self.mode == "local":
            self.engine = create_async_engine(
                database_url,
                echo=False,
                connect_args={"check_same_thread": False}
            )
        else:
            self.engine = create_async_engine(
                database_url,
                echo=False,
                pool_size=10,
                max_overflow=20
            )
        
        self.session_maker = async_sessionmaker(
            self.engine,
            class_=AsyncSession,
            expire_on_commit=False
        )
        
        # Create tables if they don't exist
        async with self.engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
    
    async def get_session(self) -> AsyncGenerator[AsyncSession, None]:
        """Get database session"""
        async with self.session_maker() as session:
            try:
                yield session
            finally:
                await session.close()

# Global adapter instance
db_adapter = DatabaseAdapter(mode=os.getenv("DB_MODE", "cloud"))
```

### Step 2.3: Update `backend/database.py`

```python
"""
Updated database.py to use the adapter
"""
from db_adapter import db_adapter

# Use adapter's session
async def get_db():
    async for session in db_adapter.get_session():
        yield session

async def init_db():
    """Initialize database with adapter"""
    await db_adapter.initialize()
    
    # Run migrations
    from migrations.schema_migrations import run_migrations
    await run_migrations()
```

### Step 2.4: Handle Database Dialect Differences

Create `backend/query_helpers.py`:

```python
"""
Helper functions to handle SQL differences between PostgreSQL and SQLite
"""
from sqlalchemy import text
from db_adapter import db_adapter

def get_returning_clause(table_name: str):
    """
    PostgreSQL supports RETURNING, SQLite doesn't
    """
    if db_adapter.mode == "local":
        return ""
    else:
        return "RETURNING *"

def get_current_timestamp():
    """
    Different timestamp functions
    """
    if db_adapter.mode == "local":
        return "datetime('now')"
    else:
        return "NOW()"

def json_contains(column, value):
    """
    JSON operations differ between databases
    """
    if db_adapter.mode == "local":
        # SQLite: json_extract
        return text(f"json_extract({column}, '$.{value}') IS NOT NULL")
    else:
        # PostgreSQL: jsonb_exists
        return text(f"{column} ? '{value}'")
```

---

## 🔄 Phase 3: Sync Engine Implementation

### Step 3.1: Create Sync Tables Migration

Create `backend/migrations/add_sync_tables.py`:

```python
"""
Add sync infrastructure tables
"""
from sqlalchemy import text
from database import engine

async def upgrade():
    async with engine.begin() as conn:
        # Sync queue: stores pending changes to push to cloud
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS sync_queue (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tenant_id INTEGER NOT NULL,
                table_name TEXT NOT NULL,
                operation TEXT NOT NULL,  -- INSERT, UPDATE, DELETE
                record_id INTEGER,
                data TEXT,  -- JSON string
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                synced BOOLEAN DEFAULT 0,
                retry_count INTEGER DEFAULT 0,
                error TEXT
            )
        """))
        
        # Sync state: tracks last sync time per table
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS sync_state (
                tenant_id INTEGER NOT NULL,
                table_name TEXT NOT NULL,
                last_push DATETIME,
                last_pull DATETIME,
                version INTEGER DEFAULT 0,
                PRIMARY KEY (tenant_id, table_name)
            )
        """))
        
        # Sync conflicts: stores conflicts for manual resolution
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS sync_conflicts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tenant_id INTEGER NOT NULL,
                table_name TEXT NOT NULL,
                record_id INTEGER,
                local_data TEXT,
                cloud_data TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                resolved BOOLEAN DEFAULT 0
            )
        """))

async def downgrade():
    async with engine.begin() as conn:
        await conn.execute(text("DROP TABLE IF EXISTS sync_conflicts"))
        await conn.execute(text("DROP TABLE IF EXISTS sync_state"))
        await conn.execute(text("DROP TABLE IF EXISTS sync_queue"))
```

### Step 3.2: Create Sync Service - `sync-engine/sync_service.py`

```python
"""
Sync service that handles bidirectional sync between local and cloud
"""
import asyncio
import aiohttp
import json
from datetime import datetime
from typing import List, Dict, Any
from sqlalchemy import text
from db_adapter import db_adapter

class SyncService:
    def __init__(self, tenant_id: int, cloud_api_url: str, api_token: str):
        self.tenant_id = tenant_id
        self.cloud_api_url = cloud_api_url
        self.api_token = api_token
        self.tables_to_sync = [
            'products', 'categories', 'sales', 'sale_items',
            'users', 'inventory', 'expenses', 'customers'
        ]
    
    async def push_changes(self):
        """Push local changes to cloud"""
        async for session in db_adapter.get_session():
            # Get pending changes from sync queue
            result = await session.execute(text("""
                SELECT * FROM sync_queue 
                WHERE tenant_id = :tenant_id 
                AND synced = 0 
                ORDER BY timestamp ASC
                LIMIT 100
            """), {"tenant_id": self.tenant_id})
            
            pending_changes = result.fetchall()
            
            for change in pending_changes:
                try:
                    await self._push_single_change(change)
                    
                    # Mark as synced
                    await session.execute(text("""
                        UPDATE sync_queue 
                        SET synced = 1 
                        WHERE id = :id
                    """), {"id": change.id})
                    
                except Exception as e:
                    # Update retry count and error
                    await session.execute(text("""
                        UPDATE sync_queue 
                        SET retry_count = retry_count + 1,
                            error = :error
                        WHERE id = :id
                    """), {"id": change.id, "error": str(e)})
                
            await session.commit()
    
    async def _push_single_change(self, change):
        """Push a single change to cloud API"""
        async with aiohttp.ClientSession() as session:
            headers = {
                "Authorization": f"Bearer {self.api_token}",
                "Content-Type": "application/json"
            }
            
            url = f"{self.cloud_api_url}/sync/{change.table_name}"
            
            data = {
                "operation": change.operation,
                "record_id": change.record_id,
                "data": json.loads(change.data) if change.data else None,
                "timestamp": change.timestamp.isoformat()
            }
            
            async with session.post(url, json=data, headers=headers) as resp:
                if resp.status not in [200, 201]:
                    raise Exception(f"Sync failed: {await resp.text()}")
    
    async def pull_changes(self):
        """Pull changes from cloud to local"""
        for table in self.tables_to_sync:
            await self._pull_table_changes(table)
    
    async def _pull_table_changes(self, table_name: str):
        """Pull changes for a specific table"""
        async for session in db_adapter.get_session():
            # Get last pull timestamp
            result = await session.execute(text("""
                SELECT last_pull FROM sync_state 
                WHERE tenant_id = :tenant_id 
                AND table_name = :table_name
            """), {"tenant_id": self.tenant_id, "table_name": table_name})
            
            row = result.fetchone()
            last_pull = row.last_pull if row else None
            
            # Fetch changes from cloud
            changes = await self._fetch_cloud_changes(table_name, last_pull)
            
            # Apply changes to local database
            for change in changes:
                await self._apply_change(session, table_name, change)
            
            # Update last pull timestamp
            await session.execute(text("""
                INSERT INTO sync_state (tenant_id, table_name, last_pull)
                VALUES (:tenant_id, :table_name, :timestamp)
                ON CONFLICT (tenant_id, table_name) 
                DO UPDATE SET last_pull = :timestamp
            """), {
                "tenant_id": self.tenant_id,
                "table_name": table_name,
                "timestamp": datetime.now()
            })
            
            await session.commit()
    
    async def _fetch_cloud_changes(self, table_name: str, since: datetime = None):
        """Fetch changes from cloud API"""
        async with aiohttp.ClientSession() as session:
            headers = {"Authorization": f"Bearer {self.api_token}"}
            
            params = {"tenant_id": self.tenant_id}
            if since:
                params["since"] = since.isoformat()
            
            url = f"{self.cloud_api_url}/sync/{table_name}/changes"
            
            async with session.get(url, params=params, headers=headers) as resp:
                if resp.status == 200:
                    return await resp.json()
                else:
                    raise Exception(f"Failed to fetch changes: {await resp.text()}")
    
    async def _apply_change(self, session, table_name: str, change: Dict[str, Any]):
        """Apply a single change to local database"""
        operation = change['operation']
        data = change['data']
        record_id = change.get('record_id')
        
        if operation == 'INSERT':
            # Insert new record
            columns = ', '.join(data.keys())
            placeholders = ', '.join([f":{k}" for k in data.keys()])
            query = f"INSERT INTO {table_name} ({columns}) VALUES ({placeholders})"
            await session.execute(text(query), data)
        
        elif operation == 'UPDATE':
            # Update existing record
            set_clause = ', '.join([f"{k} = :{k}" for k in data.keys()])
            query = f"UPDATE {table_name} SET {set_clause} WHERE id = :id"
            data['id'] = record_id
            await session.execute(text(query), data)
        
        elif operation == 'DELETE':
            # Delete record
            query = f"DELETE FROM {table_name} WHERE id = :id"
            await session.execute(text(query), {"id": record_id})
    
    async def start_background_sync(self, interval: int = 300):
        """Start background sync every `interval` seconds"""
        while True:
            try:
                # Check if online
                if await self.is_online():
                    await self.push_changes()
                    await self.pull_changes()
            except Exception as e:
                print(f"Sync error: {e}")
            
            await asyncio.sleep(interval)
    
    async def is_online(self) -> bool:
        """Check if connected to internet and cloud API is reachable"""
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(f"{self.cloud_api_url}/health", timeout=5) as resp:
                    return resp.status == 200
        except:
            return False
```

### Step 3.3: Add Sync Triggers to Models

Update your SQLAlchemy models to automatically add changes to sync queue:

```python
"""
Add to backend/models.py - example for Product model
"""
from sqlalchemy import event
from sqlalchemy.orm import Session
import json

@event.listens_for(Product, 'after_insert')
def product_after_insert(mapper, connection, target):
    """Add INSERT to sync queue"""
    if db_adapter.mode == "local":
        data = {
            "name": target.name,
            "sku": target.sku,
            "price": float(target.price),
            # ... other fields
        }
        connection.execute(text("""
            INSERT INTO sync_queue (tenant_id, table_name, operation, record_id, data)
            VALUES (:tenant_id, 'products', 'INSERT', :record_id, :data)
        """), {
            "tenant_id": target.tenant_id,
            "record_id": target.id,
            "data": json.dumps(data)
        })

@event.listens_for(Product, 'after_update')
def product_after_update(mapper, connection, target):
    """Add UPDATE to sync queue"""
    if db_adapter.mode == "local":
        # Similar to insert
        pass

@event.listens_for(Product, 'after_delete')
def product_after_delete(mapper, connection, target):
    """Add DELETE to sync queue"""
    if db_adapter.mode == "local":
        connection.execute(text("""
            INSERT INTO sync_queue (tenant_id, table_name, operation, record_id)
            VALUES (:tenant_id, 'products', 'DELETE', :record_id)
        """), {
            "tenant_id": target.tenant_id,
            "record_id": target.id
        })
```

---

## 🖥️ Phase 4: Electron Application

### Step 4.1: Create Main Process - `desktop/electron/main.js`

```javascript
const { app, BrowserWindow, Tray, Menu, ipcMain, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const Store = require('electron-store');
const { autoUpdater } = require('electron-updater');

// Configuration store
const store = new Store({
  defaults: {
    mode: 'local',
    tenantId: null,
    cloudApiUrl: 'https://your-api.com',
    apiToken: null,
    syncEnabled: true,
    syncInterval: 300000, // 5 minutes
    autoStart: false,
    minimizeToTray: true,
    windowBounds: { width: 1200, height: 800 }
  }
});

let mainWindow;
let tray;
let backendProcess;

// Backend management
class BackendManager {
  constructor() {
    this.process = null;
    this.port = 8000;
  }

  start() {
    // Path to bundled Python executable
    const backendPath = path.join(
      process.resourcesPath,
      'backend',
      'mbiz-backend.exe'
    );

    // Set environment variables
    const env = {
      ...process.env,
      DB_MODE: store.get('mode'),
      TENANT_ID: store.get('tenantId'),
      PORT: this.port.toString()
    };

    // Spawn backend process
    this.process = spawn(backendPath, [], { env });

    this.process.stdout.on('data', (data) => {
      console.log(`Backend: ${data}`);
    });

    this.process.stderr.on('data', (data) => {
      console.error(`Backend Error: ${data}`);
    });

    this.process.on('close', (code) => {
      console.log(`Backend process exited with code ${code}`);
    });

    // Wait for backend to be ready
    return new Promise((resolve) => {
      setTimeout(resolve, 3000);
    });
  }

  stop() {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
  }
}

const backendManager = new BackendManager();

// Create main window
function createWindow() {
  const bounds = store.get('windowBounds');

  mainWindow = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    icon: path.join(__dirname, '../icons/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    },
    // Custom title bar (optional)
    frame: true,
    titleBarStyle: 'default'
  });

  // Load frontend
  if (app.isPackaged) {
    // Production: load built files
    mainWindow.loadFile(path.join(__dirname, '../build/index.html'));
  } else {
    // Development: load from Vite dev server
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  }

  // Save window bounds on close
  mainWindow.on('close', (event) => {
    const bounds = mainWindow.getBounds();
    store.set('windowBounds', bounds);

    // Minimize to tray instead of closing
    if (store.get('minimizeToTray') && !app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Create system tray
function createTray() {
  tray = new Tray(path.join(__dirname, '../icons/tray-icon.png'));

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show mBiz',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    },
    { type: 'separator' },
    {
      label: `Mode: ${store.get('mode')}`,
      enabled: false
    },
    {
      label: 'Sync Now',
      click: () => {
        mainWindow.webContents.send('trigger-sync');
      }
    },
    { type: 'separator' },
    {
      label: 'Settings',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.webContents.send('navigate-to-settings');
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);
  tray.setToolTip('mBiz - Point of Sale');

  tray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

// Auto-start configuration
function configureAutoStart(enable) {
  app.setLoginItemSettings({
    openAtLogin: enable,
    openAsHidden: true
  });
}

// Auto-updater
autoUpdater.on('update-available', () => {
  dialog.showMessageBox({
    type: 'info',
    title: 'Update Available',
    message: 'A new version is available. Downloading now...'
  });
});

autoUpdater.on('update-downloaded', () => {
  dialog.showMessageBox({
    type: 'info',
    title: 'Update Ready',
    message: 'Update downloaded. The application will restart to apply the update.',
    buttons: ['Restart', 'Later']
  }).then((result) => {
    if (result.response === 0) {
      autoUpdater.quitAndInstall();
    }
  });
});

// IPC handlers
ipcMain.handle('get-config', () => {
  return store.store;
});

ipcMain.handle('set-config', (event, key, value) => {
  store.set(key, value);
  
  // Handle special cases
  if (key === 'autoStart') {
    configureAutoStart(value);
  }
  
  return true;
});

ipcMain.handle('restart-backend', async () => {
  backendManager.stop();
  await backendManager.start();
  return true;
});

// App lifecycle
app.whenReady().then(async () => {
  // Start backend first
  try {
    await backendManager.start();
  } catch (error) {
    console.error('Failed to start backend:', error);
    dialog.showErrorBox('Startup Error', 'Failed to start application backend.');
    app.quit();
    return;
  }

  // Create window and tray
  createWindow();
  createTray();

  // Configure auto-start if enabled
  if (store.get('autoStart')) {
    configureAutoStart(true);
  }

  // Check for updates
  autoUpdater.checkForUpdatesAndNotify();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('before-quit', () => {
  app.isQuitting = true;
  backendManager.stop();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
```

### Step 4.2: Create Preload Script - `desktop/electron/preload.js`

```javascript
const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods to renderer
contextBridge.exposeInMainWorld('electron', {
  // Config management
  getConfig: () => ipcRenderer.invoke('get-config'),
  setConfig: (key, value) => ipcRenderer.invoke('set-config', key, value),
  
  // Backend control
  restartBackend: () => ipcRenderer.invoke('restart-backend'),
  
  // Event listeners
  onTriggerSync: (callback) => ipcRenderer.on('trigger-sync', callback),
  onNavigate: (callback) => ipcRenderer.on('navigate-to-settings', callback),
  
  // Platform info
  platform: process.platform,
  isDesktop: true
});
```

---

## 🔨 Phase 5: Bundle Python Backend

### Step 5.1: Create PyInstaller Spec File - `backend/mbiz-backend.spec`

```python
# -*- mode: python ; coding: utf-8 -*-

block_cipher = None

a = Analysis(
    ['main.py'],
    pathex=[],
    binaries=[],
    datas=[
        ('migrations', 'migrations'),
        ('.env.template', '.'),
    ],
    hiddenimports=[
        'uvicorn.logging',
        'uvicorn.loops',
        'uvicorn.loops.auto',
        'uvicorn.protocols',
        'uvicorn.protocols.http',
        'uvicorn.protocols.http.auto',
        'uvicorn.protocols.websockets',
        'uvicorn.protocols.websockets.auto',
        'uvicorn.lifespan',
        'uvicorn.lifespan.on',
        'sqlalchemy.ext.asyncio',
        'aiosqlite',
        'asyncpg',
        'httpx',
        'weasyprint',
        'PIL',
        'litellm'
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='mbiz-backend',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,  # Set to False to hide console window
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon='../desktop/icons/icon.ico'
)
```

### Step 5.2: Build Backend Executable

```bash
cd backend

# Build backend executable
pyinstaller mbiz-backend.spec

# Output will be in backend/dist/mbiz-backend.exe

# Copy to desktop resources
mkdir -p ../desktop/resources/backend
cp dist/mbiz-backend.exe ../desktop/resources/backend/
```

### Step 5.3: Create Build Script - `build-desktop.sh`

```bash
#!/bin/bash

echo "🔨 Building mBiz Desktop App..."

# Step 1: Build frontend
echo "📦 Building frontend..."
cd frontend
npm run build
cp -r dist ../desktop/build/
cd ..

# Step 2: Build backend
echo "🐍 Building Python backend..."
cd backend
pyinstaller mbiz-backend.spec
mkdir -p ../desktop/resources/backend
cp dist/mbiz-backend.exe ../desktop/resources/backend/
cd ..

# Step 3: Build Electron app
echo "⚡ Building Electron app..."
cd desktop
npm run build:win

echo "✅ Build complete! Installer is in desktop/dist/"
```

---

## 🎨 Phase 6: Frontend Integration

### Step 6.1: Add Electron Detection - `frontend/src/lib/electron.ts`

```typescript
/**
 * Electron API interface
 */
interface ElectronAPI {
  getConfig: () => Promise<any>;
  setConfig: (key: string, value: any) => Promise<boolean>;
  restartBackend: () => Promise<boolean>;
  onTriggerSync: (callback: () => void) => void;
  onNavigate: (callback: () => void) => void;
  platform: string;
  isDesktop: boolean;
}

declare global {
  interface Window {
    electron?: ElectronAPI;
  }
}

export const isElectron = (): boolean => {
  return window.electron?.isDesktop === true;
};

export const getElectronConfig = async () => {
  if (!isElectron()) return null;
  return await window.electron!.getConfig();
};

export const setElectronConfig = async (key: string, value: any) => {
  if (!isElectron()) return false;
  return await window.electron!.setConfig(key, value);
};

export const restartBackend = async () => {
  if (!isElectron()) return false;
  return await window.electron!.restartBackend();
};
```

### Step 6.2: Update API Client - `frontend/src/lib/api.ts`

```typescript
import { isElectron, getElectronConfig } from './electron';

// Determine API base URL
const getApiUrl = async (): Promise<string> => {
  if (isElectron()) {
    // In Electron, use local backend
    return 'http://localhost:8000';
  } else {
    // In browser, use environment variable
    return import.meta.env.VITE_API_URL || 'http://localhost:8000';
  }
};

// Wrap fetch with API URL resolution
export const apiFetch = async (endpoint: string, options?: RequestInit) => {
  const apiUrl = await getApiUrl();
  const url = `${apiUrl}${endpoint}`;
  
  return fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
};
```

### Step 6.3: Add Settings Page for Desktop - `frontend/src/pages/DesktopSettings.tsx`

```tsx
import React, { useState, useEffect } from 'react';
import { isElectron, getElectronConfig, setElectronConfig, restartBackend } from '@/lib/electron';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

export const DesktopSettings: React.FC = () => {
  const [config, setConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    if (isElectron()) {
      const cfg = await getElectronConfig();
      setConfig(cfg);
      setLoading(false);
    }
  };

  const updateConfig = async (key: string, value: any) => {
    await setElectronConfig(key, value);
    setConfig({ ...config, [key]: value });
  };

  const handleRestartBackend = async () => {
    if (confirm('Restart backend? This will temporarily interrupt service.')) {
      await restartBackend();
      alert('Backend restarted successfully!');
    }
  };

  if (!isElectron()) {
    return <div>Desktop settings only available in desktop app.</div>;
  }

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Desktop Settings</h1>

      <Card className="p-6">
        <h2 className="text-xl font-semibold mb-4">Application Mode</h2>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Database Mode</label>
            <select
              value={config.mode}
              onChange={(e) => updateConfig('mode', e.target.value)}
              className="w-full p-2 border rounded"
            >
              <option value="local">Local (Offline)</option>
              <option value="cloud">Cloud (Online)</option>
              <option value="auto">Auto (Sync when available)</option>
            </select>
          </div>

          <div>
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={config.syncEnabled}
                onChange={(e) => updateConfig('syncEnabled', e.target.checked)}
              />
              <span>Enable automatic sync</span>
            </label>
          </div>

          {config.syncEnabled && (
            <div>
              <label className="block text-sm font-medium mb-2">
                Sync Interval (minutes)
              </label>
              <input
                type="number"
                value={config.syncInterval / 60000}
                onChange={(e) => updateConfig('syncInterval', parseInt(e.target.value) * 60000)}
                className="w-full p-2 border rounded"
                min="1"
                max="60"
              />
            </div>
          )}
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="text-xl font-semibold mb-4">Startup Options</h2>
        
        <div className="space-y-4">
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={config.autoStart}
              onChange={(e) => updateConfig('autoStart', e.target.checked)}
            />
            <span>Start mBiz on Windows startup</span>
          </label>

          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={config.minimizeToTray}
              onChange={(e) => updateConfig('minimizeToTray', e.target.checked)}
            />
            <span>Minimize to system tray on close</span>
          </label>
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="text-xl font-semibold mb-4">Cloud Configuration</h2>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Cloud API URL</label>
            <input
              type="text"
              value={config.cloudApiUrl}
              onChange={(e) => updateConfig('cloudApiUrl', e.target.value)}
              className="w-full p-2 border rounded"
              placeholder="https://your-api.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Tenant ID</label>
            <input
              type="number"
              value={config.tenantId || ''}
              onChange={(e) => updateConfig('tenantId', parseInt(e.target.value))}
              className="w-full p-2 border rounded"
              placeholder="Your tenant ID"
            />
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="text-xl font-semibold mb-4">Maintenance</h2>
        
        <Button onClick={handleRestartBackend} variant="destructive">
          Restart Backend
        </Button>
      </Card>
    </div>
  );
};
```

---

## 🎯 Phase 7: Testing & Quality Assurance

### Step 7.1: Testing Checklist

#### Local Mode Testing:
- [ ] App launches successfully
- [ ] Backend starts and connects to SQLite
- [ ] Can create/read/update/delete records
- [ ] Data persists across app restarts
- [ ] Works completely offline

#### Sync Testing:
- [ ] Changes queue in sync_queue table
- [ ] Push sync sends changes to cloud
- [ ] Pull sync retrieves cloud changes
- [ ] Background sync runs automatically
- [ ] Conflict detection works

#### Windows Features:
- [ ] System tray icon appears
- [ ] Right-click tray menu works
- [ ] Minimize to tray functions
- [ ] Auto-start on boot works
- [ ] Window position persists

#### Updates:
- [ ] Update check runs on startup
- [ ] Update download works
- [ ] Installation prompt appears
- [ ] App restarts with new version

### Step 7.2: Performance Testing

```bash
# Monitor backend memory usage
# Task Manager → mBiz Backend

# Monitor database size
# Check ~/.mbiz/local.db file size

# Test with 1000+ products
# Verify UI remains responsive

# Test sync with poor network
# Use Network Link Conditioner or similar
```

---

## 📦 Phase 8: Building & Distribution

### Step 8.1: Build Final Installer

```bash
# Make sure everything is built
chmod +x build-desktop.sh
./build-desktop.sh

# Output: desktop/dist/mBiz Setup 1.0.0.exe
```

### Step 8.2: Code Signing (Optional but Recommended)

```bash
# Get code signing certificate from:
# - Sectigo, DigiCert, or other CA
# - Microsoft Store partner center

# Sign with signtool
signtool sign /f certificate.pfx /p password /t http://timestamp.digicert.com desktop/dist/mBiz Setup 1.0.0.exe
```

### Step 8.3: Setup Auto-Update Server

Create update server to host new versions:

```javascript
// updates-server.js
const express = require('express');
const app = express();

app.get('/update/win32/x64/:version', (req, res) => {
  const currentVersion = req.params.version;
  const latestVersion = '1.0.1'; // From database or file

  if (currentVersion < latestVersion) {
    res.json({
      url: `https://your-server.com/downloads/mBiz-Setup-${latestVersion}.exe`,
      name: `v${latestVersion}`,
      notes: 'Bug fixes and improvements',
      pub_date: new Date().toISOString()
    });
  } else {
    res.status(204).end();
  }
});

app.listen(3000);
```

---

## 📚 Phase 9: Documentation

### Step 9.1: User Guide

Create `desktop/USER_GUIDE.md`:

```markdown
# mBiz Desktop User Guide

## Installation

1. Download `mBiz Setup.exe`
2. Run the installer
3. Follow installation wizard
4. Launch mBiz from Desktop or Start Menu

## First-Time Setup

1. Enter your tenant ID
2. Choose your mode:
   - **Local**: Work offline, sync manually
   - **Cloud**: Always use cloud database
   - **Auto**: Use local, sync automatically
3. Click "Start"

## Using the App

### Offline Mode
- All data stored locally
- Works without internet
- Sync when you're ready

### Sync Data
- Right-click system tray icon
- Select "Sync Now"
- Or wait for automatic sync

### Settings
- Open Settings page
- Navigate to "Desktop Settings" tab
- Configure your preferences

## Troubleshooting

### App Won't Start
- Check if backend port 8000 is available
- Check logs in `%APPDATA%/mBiz/logs`

### Sync Issues
- Verify internet connection
- Check tenant ID is correct
- Check API URL in settings

### Database Issues
- Delete `%USERPROFILE%/.mbiz/local.db`
- Restart app (will re-download from cloud)
```

### Step 9.2: Developer Guide

Create `desktop/DEVELOPER_GUIDE.md`:

```markdown
# mBiz Desktop Developer Guide

## Development Setup

1. Clone repository
2. Install dependencies:
   ```bash
   cd frontend && npm install
   cd ../backend && pip install -r requirements.txt
   cd ../desktop && npm install
   ```

## Running in Development

### Terminal 1: Backend
```bash
cd backend
DB_MODE=local python main.py
```

### Terminal 2: Frontend
```bash
cd frontend
npm run dev
```

### Terminal 3: Electron
```bash
cd desktop
npm run dev
```

## Building

```bash
./build-desktop.sh
```

## Project Structure

- `frontend/`: React app
- `backend/`: FastAPI backend
- `desktop/`: Electron wrapper
- `sync-engine/`: Sync logic

## Adding New Features

1. Modify backend API
2. Update frontend components
3. Test in browser mode
4. Test in Electron mode
5. Rebuild and test installer
```

---

## 🚀 Phase 10: Deployment Checklist

### Pre-Release Checklist

- [ ] All features working
- [ ] No console errors
- [ ] Database migrations tested
- [ ] Sync thoroughly tested
- [ ] Performance acceptable
- [ ] Icons and branding correct
- [ ] User guide written
- [ ] Version number updated

### Release Process

1. **Build installer**:
   ```bash
   ./build-desktop.sh
   ```

2. **Test installer**:
   - Install on clean Windows VM
   - Test all features
   - Uninstall and verify cleanup

3. **Sign code** (if applicable)

4. **Upload to distribution**:
   - Upload to website/CDN
   - Update version in update server
   - Announce to users

5. **Monitor**:
   - Watch for bug reports
   - Monitor update adoption
   - Check sync server logs

---

## 🔧 Maintenance & Updates

### Updating the App

1. Make changes to code
2. Increment version in `desktop/package.json`
3. Build new installer
4. Upload to update server
5. Existing installs will auto-update

### Database Migrations

```python
# Create new migration
# backend/migrations/add_new_feature.py

async def upgrade():
    # Add new column/table
    pass

async def downgrade():
    # Rollback changes
    pass
```

### Debugging

```javascript
// Enable debug logging in main.js
const log = require('electron-log');
log.transports.file.level = 'debug';
log.info('App started');
```

---

## 📊 Monitoring & Analytics

### Recommended Tracking

1. **Usage Statistics**:
   - Daily active users
   - Feature usage
   - Error rates

2. **Sync Metrics**:
   - Sync success rate
   - Average sync time
   - Conflicts per day

3. **Performance**:
   - App startup time
   - Memory usage
   - Database size

### Implementation

```python
# backend/analytics.py
async def track_event(event_name: str, properties: dict):
    """Send analytics event to your service"""
    # Use Mixpanel, Amplitude, or custom solution
    pass
```

---

## 🎉 Conclusion

You now have a complete blueprint for building the mBiz Windows desktop application!

### Key Achievements

✅ **Native Windows app** with installer
✅ **Offline-first** with local SQLite database
✅ **Automatic sync** to cloud when online
✅ **System tray** integration
✅ **Auto-start** capability
✅ **Auto-updates** for easy maintenance
✅ **Single-tenant** isolation
✅ **Professional** user experience

### Next Steps

1. Follow this guide phase by phase
2. Test thoroughly at each step
3. Iterate based on user feedback
4. Monitor and improve over time

### Support & Resources

- Electron Docs: https://www.electronjs.org/docs
- Electron Builder: https://www.electron.build/
- PyInstaller: https://pyinstaller.org/
- SQLite: https://www.sqlite.org/

### Estimated Development Time

- **Basic app (no sync)**: 1-2 weeks
- **With sync engine**: 3-4 weeks
- **Polished production**: 5-6 weeks

---

**Happy Building! 🚀**

Made with ❤️ for mBiz
