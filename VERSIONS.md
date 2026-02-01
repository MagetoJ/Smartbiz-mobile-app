# Library Versions

## Backend (Python)

| Package | Version | Purpose |
|---------|---------|---------|
| fastapi | 0.115.5 | Modern Python web framework |
| uvicorn[standard] | 0.32.1 | ASGI server |
| sqlalchemy | 2.0.36 | SQL toolkit and ORM |
| asyncpg | 0.30.0 | PostgreSQL async driver |
| python-jose[cryptography] | 3.3.0 | JWT token handling |
| passlib[bcrypt] | 1.7.4 | Password hashing |
| python-multipart | 0.0.17 | Form data parsing |
| pydantic | 2.10.3 | Data validation |
| pydantic-settings | 2.6.1 | Settings management |
| python-dateutil | 2.9.0.post0 | Date utilities |

## Frontend (JavaScript/TypeScript)

### Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| react | 18.3.1 | UI library |
| react-dom | 18.3.1 | React DOM bindings |
| react-router-dom | 6.28.0 | Routing |
| recharts | 2.15.0 | Charts and graphs |
| lucide-react | 0.468.0 | Icon library |

### Dev Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| typescript | 5.6.3 | Type safety |
| vite | 5.4.11 | Build tool |
| @vitejs/plugin-react | 4.3.4 | React plugin for Vite |
| @types/react | 18.3.12 | React type definitions |
| @types/react-dom | 18.3.1 | React DOM type definitions |
| @types/node | 22.10.2 | Node.js type definitions |
| tailwindcss | 3.4.17 | CSS framework |
| postcss | 8.5.6 | CSS processor |
| autoprefixer | 10.4.20 | CSS vendor prefixes |
| clsx | 2.1.1 | Class name utility |
| tailwind-merge | 2.6.0 | Tailwind class merging |
| vite-plugin-pwa | 0.20.5 | PWA support |

## System Requirements

- **Python**: 3.12+
- **Node.js**: 20+
- **PostgreSQL**: 18+
- **Yarn**: 1.22+

## Installation Commands

### Backend
```bash
pip install -r requirements.txt
```

### Frontend
```bash
yarn install
```

## Notes

- All versions are the latest stable releases as of December 2025
- Backend uses async/await patterns with asyncpg for PostgreSQL
- Frontend uses Vite for fast development and optimized production builds
- PWA support via vite-plugin-pwa with workbox
- Type safety ensured with TypeScript and Pydantic
