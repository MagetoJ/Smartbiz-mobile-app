# StatBricks Retail Intelligence System

A comprehensive hotel management system for handling orders, billing, and financial reporting. Built with FastAPI, PostgreSQL, React, and configured as a Progressive Web Application (PWA).

## Features

- 🔐 **User Authentication** - Secure JWT-based authentication
- 🍽️ **Order Management** - Create and manage customer orders with a modern POS interface
- 💳 **Billing & Payments** - Process payments (Cash, Card, M-Pesa) and generate receipts
- 📊 **Dashboard** - Visual analytics with charts showing revenue trends and top items
- 📄 **Receipt Printing** - Print-friendly receipt generation
- 📱 **PWA Support** - Install as a mobile/desktop app
- 🎨 **Modern UI** - Built with Tailwind CSS and Shadcn components

## Tech Stack

### Backend
- **FastAPI** 0.115.5 - Modern Python web framework
- **PostgreSQL** - Database (via asyncpg 0.30.0)
- **SQLAlchemy** 2.0.36 - Async ORM
- **Pydantic** 2.10.3 - Data validation
- **JWT** - Authentication (python-jose 3.3.0)
- **Bcrypt** - Password hashing (passlib 1.7.4)

### Frontend
- **React** 18.3.1 - UI library
- **TypeScript** 5.6.3 - Type safety
- **Vite** 5.4.11 - Build tool
- **React Router** 6.28.0 - Navigation
- **Tailwind CSS** 3.4.17 - Styling
- **Recharts** 2.15.0 - Charts and graphs
- **Lucide React** 0.468.0 - Icons
- **Vite PWA** 0.20.5 - PWA support

## Prerequisites

- Python 3.12+
- Node.js 20+
- PostgreSQL 18+
- Yarn 1.22+

## Installation & Setup

### 1. Database Setup

Create the PostgreSQL database and user:

```bash
# Login to PostgreSQL
sudo -u postgres psql

# Create database and user
CREATE DATABASE chef_db;
CREATE USER chef_user WITH PASSWORD 'chef_user';
GRANT ALL PRIVILEGES ON DATABASE chef_db TO chef_user;

# Connect to the database and grant schema permissions
\c chef_db
GRANT ALL ON SCHEMA public TO chef_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO chef_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO chef_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO chef_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO chef_user;

# Exit PostgreSQL
\q
```

### 2. Backend Setup

```bash
# Navigate to backend directory
cd backend

# Create virtual environment
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# The application will automatically:
# - Create all database tables on startup
# - Create a default admin user (username: admin, password: admin123)

# Optional: Add sample menu items
python seed_data.py
```

### 3. Frontend Setup

```bash
# Navigate to frontend directory
cd frontend

# Install dependencies
yarn install
```

## Running the Application

### Start the Backend (Terminal 1)

```bash
cd backend
source venv/bin/activate  # Activate virtual environment
python main.py
```

The API will be available at: `http://localhost:8000`
API documentation: `http://localhost:8000/docs`

### Start the Frontend (Terminal 2)

```bash
cd frontend
yarn dev
```

The application will be available at: `http://localhost:5173`

## Default Credentials

- **Username:** admin
- **Password:** admin123

## Project Structure

```
Chef/
├── backend/
│   ├── main.py              # FastAPI application & routes
│   ├── database.py          # Database configuration
│   ├── models.py            # SQLAlchemy models
│   ├── schemas.py           # Pydantic schemas
│   ├── auth.py              # Authentication logic
│   ├── seed_data.py         # Sample data script
│   └── requirements.txt     # Python dependencies
│
└── frontend/
    ├── src/
    │   ├── components/      # Reusable UI components
    │   │   ├── ui/          # Base UI components (Button, Card, Input)
    │   │   └── Layout.tsx   # Main layout wrapper
    │   ├── contexts/        # React contexts
    │   │   └── AuthContext.tsx
    │   ├── lib/             # Utilities
    │   │   ├── api.ts       # API client
    │   │   └── utils.ts     # Helper functions
    │   ├── pages/           # Application pages
    │   │   ├── Login.tsx
    │   │   ├── Dashboard.tsx
    │   │   ├── Orders.tsx
    │   │   └── Billing.tsx
    │   ├── App.tsx          # Main app component
    │   ├── main.tsx         # Entry point
    │   └── index.css        # Global styles
    ├── index.html
    ├── package.json
    ├── vite.config.ts
    ├── tailwind.config.js
    └── tsconfig.json
```

## Usage Guide

### Creating an Order

1. Navigate to **New Order** page
2. Browse menu items by category
3. Click **+** to add items to cart
4. Fill in customer details (optional)
5. Click **Create Order**

### Processing Payment

1. Navigate to **Billing** page
2. Select a pending order from the list
3. Review order details
4. Choose payment method (Cash, Card, or M-Pesa)
5. Print the receipt

### Viewing Reports

1. Navigate to **Dashboard**
2. View key metrics: Total Revenue, Orders, Pending Orders
3. Analyze charts:
   - Revenue trend over last 7 days
   - Revenue by category (pie chart)
   - Top selling items (bar chart)

## API Endpoints

### Authentication
- `POST /auth/login` - User login
- `GET /auth/me` - Get current user
- `POST /auth/register` - Register new user (admin only)

### Menu
- `GET /menu` - Get all menu items
- `POST /menu` - Create menu item
- `PUT /menu/{id}` - Update menu item
- `DELETE /menu/{id}` - Delete menu item

### Orders
- `GET /orders` - Get all orders
- `GET /orders/{id}` - Get specific order
- `POST /orders` - Create new order
- `PATCH /orders/{id}` - Update order

### Payments
- `POST /orders/{id}/pay` - Process payment
- `GET /receipts/{id}` - Get receipt

### Reports
- `GET /dashboard/stats` - Get dashboard statistics
- `GET /reports/financial` - Get financial report

## Development Notes

- All SQL schema is integrated in Python using SQLAlchemy ORM (no separate .sql files)
- The system uses async/await for database operations
- Tax rate is set to 16% (VAT)
- Currency is displayed in KES (Kenyan Shilling)
- Receipt printing uses browser's native print dialog

## Security Notes

- Change the SECRET_KEY in `backend/auth.py` for production
- Update default admin credentials after first login
- Use environment variables for sensitive configuration in production
- Enable HTTPS in production environments

## License

MIT License - feel free to use for your projects!

## Support

For issues or questions, please create an issue in the repository.
