# ⬡ SCORPION — IT Purchase Order Module

Full-stack web application for IT department procurement management.  
**Stack:** React + Vite + Tailwind CSS + Supabase

---

## 🚀 Setup in 5 Steps

### STEP 1 — Create Supabase Project

1. Go to [https://app.supabase.com](https://app.supabase.com)
2. Click **New Project**
3. Give it a name (e.g. `scorpion-po`), set a strong DB password, choose your region
4. Wait ~2 minutes for the project to spin up

### STEP 2 — Run the Database Schema

1. In your Supabase project, go to **SQL Editor** (left sidebar)
2. Click **New Query**
3. Copy the entire contents of `supabase_schema.sql` and paste it
4. Click **Run** (or press Ctrl+Enter)
5. You should see: `Scorpion DB Schema installed successfully!`

### STEP 3 — Get Your API Keys

1. Go to **Settings → API** in your Supabase project
2. Copy:
   - **Project URL** (looks like `https://xxxxxxxxxxxx.supabase.co`)
   - **anon / public key** (long JWT string)

### STEP 4 — Configure the App

```bash
# In the project folder, copy the env template
cp .env.example .env

# Edit .env and paste your values:
VITE_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_ANON_KEY_HERE
```

### STEP 5 — Install & Run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## 👤 Creating Users

### Method A — Supabase Dashboard (Recommended)

1. Go to **Authentication → Users → Add User**
2. Enter email and password
3. Then run this SQL to set their name and role:

```sql
UPDATE users 
SET full_name = 'Arjun Mehta', role = 'it_head'
WHERE email = 'arjun@yourcompany.com';
```

### Method B — SQL (Create multiple users at once)

```sql
-- First create auth users via Dashboard, then update roles:
UPDATE users SET role = 'it_head',     full_name = 'Arjun Mehta'   WHERE email = 'arjun@company.com';
UPDATE users SET role = 'it_staff',    full_name = 'Rahul Singh'   WHERE email = 'rahul@company.com';
UPDATE users SET role = 'branch_user', full_name = 'Anita Mehta'   WHERE email = 'anita@company.com';
UPDATE users SET role = 'finance_head',full_name = 'Priya Sharma'  WHERE email = 'priya@company.com';

-- Assign branch users to their branch
UPDATE users SET branch_id = (SELECT branch_id FROM branches WHERE branch_code = 'MUM-01')
WHERE email = 'anita@company.com';
```

### Roles Summary

| Role | What they can do |
|------|-----------------|
| `branch_user` | Raise PRs, track status |
| `it_staff` | Upload quotations, generate PO, create GRN, upload invoices, manage masters |
| `it_head` | Everything IT Staff can + approve quotations, approve invoices, all reports |
| `finance_head` | View approved invoices, approve payment, record payment reference |

---

## 🏗️ Deployment to Your Server

### Option A — Static Hosting (Nginx / Apache)

```bash
# Build the production bundle
npm run build

# The 'dist' folder contains your app — copy it to your web server
scp -r dist/ user@yourserver:/var/www/scorpion/

# Nginx config example:
server {
    listen 80;
    server_name scorpion.yourcompany.com;
    root /var/www/scorpion;
    index index.html;
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

### Option B — PM2 + Node preview server

```bash
npm run build
npm install -g serve
pm2 start "serve -s dist -l 3000" --name scorpion
pm2 save
```

### Option C — Docker

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

---

## 📧 Email Notifications (PO Dispatch)

To enable automatic PO emails to vendors:

1. Go to **Supabase → Edge Functions**
2. Create a function called `send-po-email`
3. Use the template in `supabase/functions/send-po-email/index.ts` (see below)
4. Set email secrets: `supabase secrets set SMTP_HOST=... SMTP_USER=... SMTP_PASS=...`

For now, the "Send to Vendor" button updates the PO status — plug in your SMTP in Edge Functions when ready.

---

## 📁 Project Structure

```
scorpion/
├── src/
│   ├── components/
│   │   ├── UI.jsx          # Shared components (Badge, Modal, Spinner...)
│   │   └── Sidebar.jsx     # Navigation sidebar
│   ├── hooks/
│   │   └── useAuth.jsx     # Auth context + role helpers
│   ├── lib/
│   │   └── supabase.js     # Supabase client
│   ├── pages/
│   │   ├── LoginPage.jsx
│   │   ├── DashboardPage.jsx
│   │   ├── PRPage.jsx          # Purchase Requisitions
│   │   ├── QuotationsPage.jsx  # Quotation upload & L1/L2/L3 comparison
│   │   ├── POPage.jsx          # PO generation & dispatch
│   │   ├── GRNInvoicePage.jsx  # GRN creation + Invoice workflow
│   │   ├── MasterPages.jsx     # Vendor, SKU, Asset Register
│   │   └── WorkflowPage.jsx    # Workflow map
│   ├── App.jsx             # Router + protected routes
│   ├── main.jsx
│   └── index.css
├── supabase_schema.sql     # ← Run this in Supabase SQL Editor
├── .env.example            # ← Copy to .env and fill your keys
├── package.json
├── vite.config.js
├── tailwind.config.js
└── README.md
```

---

## 🔒 Security Notes

- Row Level Security (RLS) is enabled on all 15 tables
- Branch users can only see their own PRs
- Finance Head can only see invoices after IT Head approval
- All state changes are logged to `audit_log` table
- Passwords are handled entirely by Supabase Auth (bcrypt)
- Your Supabase `service_role` key should NEVER be in the frontend

---

## 🐛 Troubleshooting

| Problem | Solution |
|---------|----------|
| Blank screen after login | Check browser console for env var errors; ensure `.env` is correct |
| "Permission denied" errors | Run the SQL schema again; check RLS policies applied |
| User role not loading | Run `SELECT * FROM users WHERE email = 'you@email.com';` in Supabase |
| PRs not showing | Check that `branch_id` is set for branch users |

---

## 📞 Support

This app was designed by the IT Department. For issues:
- Check Supabase logs: **Logs → API Logs**
- Check browser DevTools → Network tab for failed requests
