# TVR Logistics Portal

A comprehensive **SaaS (Software as a Service)** platform designed for tracking deliveries, managing supplier operations, and handling logistics workloads securely and efficiently across multiple tenants.

## 🚀 Tech Stack

- **Frontend:** React 19, TypeScript, Vite
- **Backend & Database:** Firebase (Firestore, Auth, Functions)
- **Styling:** Vanilla CSS with custom properties
- **Key Features:** 
  - **Multi-Tenant SaaS Architecture:** Complete data isolation per tenant (`tenantId`).
  - **Role-Based Access Control (RBAC):** Dynamic UI and permissions for Drivers, Suppliers, Backoffice, and Admins.
  - **Real-Time Operations:** Live tracking of loads, pick-ups, and warehouse inventory.
  - **Integrated Tools:** In-browser QR Code scanning (`html5-qrcode`) and automated PDF Reporting (`jspdf`).

## 📁 Project Structure

- `src/components/`: UI components organized by feature (e.g., SupplierDashboard, DeliveryForm, LoadingTab).
- `src/contexts/`: React Contexts for global state management (`AuthContext`, `ThemeContext`).
- `src/firebase.ts`: Firebase configuration and initialization.
- `functions/`: Firebase Cloud Functions for backend logic and secure operations.

## 🛠️ Setup & Installation

1. **Install dependencies:**
   ```bash
   npm install
   ```
2. **Environment Variables:**
   Ensure your `.env.development.local` and `.env.production.local` are set up.
   > [!CAUTION]
   > Never commit `.env` files to the repository. They contain sensitive Firebase API keys.

3. **Start the development server:**
   ```bash
   npm run dev
   ```

## 🔒 Security Best Practices

- **Firestore Rules:** All database interactions are protected by `firestore.rules`.
- **Role-Based Access Control (RBAC):** UI renders dynamically based on the authenticated user's role (Driver, Supplier, Backoffice, Admin).
- **Tenant Isolation:** Data is strictly isolated by `tenantId` to prevent cross-tenant data leaks.

## 🏗️ Architecture & Development Notes
- **State Management:** Uses React Context (`AuthContext`, `ThemeContext`) for global state.
- **Component Design:** Feature-based organization in `src/components/`. Keep components modular and single-purpose.
- **TypeScript:** Enforce strict typing. Define global interfaces in `src/types/index.ts`.
- **Audit Logging:** Critical actions are logged using `logAction` in `src/utils/audit.ts`.
