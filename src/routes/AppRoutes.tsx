import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { DashboardLayout } from '../layouts/DashboardLayout';
import { DashboardPage } from '../pages/DashboardPage';
import { InvoicesPage } from '../pages/InvoicesPage';
import { InvoiceDetailsPage } from '../pages/InvoiceDetailsPage';
import { UploadInvoicePage } from '../pages/UploadInvoicePage';
import { ExceptionsPage } from '../pages/ExceptionsPage';
import { POMatchingPage } from '../pages/POMatchingPage';
import { SuppliersPage } from '../pages/SuppliersPage';
import { SupplierDetailsPage } from '../pages/SupplierDetailsPage';
import { PaymentsPage } from '../pages/PaymentsPage';
import { CopilotPage } from '../pages/CopilotPage';
import { ReportsPage } from '../pages/ReportsPage';
import { MonitoringPage } from '../pages/MonitoringPage';
import { SettingsPage } from '../pages/SettingsPage';
import { LandingPage } from '../pages/LandingPage';
import { LoginPage } from '../pages/LoginPage';
import { RegisterPage } from '../pages/RegisterPage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { ProtectedRoute } from '../components/auth/ProtectedRoute';

export const AppRoutes: React.FC = () => {
  return (
    <Routes>
      {/* Public Marketing & Auth Pages */}
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      {/* Protected Multi-Tenant Workspace Routes */}
      <Route
        path="/app"
        element={
          <ProtectedRoute>
            <DashboardLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="invoices" element={<InvoicesPage />} />
        <Route path="invoices/:invoiceId" element={<InvoiceDetailsPage />} />
        <Route path="upload" element={<UploadInvoicePage />} />
        <Route path="exceptions" element={<ExceptionsPage />} />
        <Route path="po-matching" element={<POMatchingPage />} />
        <Route path="suppliers" element={<SuppliersPage />} />
        <Route path="suppliers/:supplierId" element={<SupplierDetailsPage />} />
        <Route path="payments" element={<PaymentsPage />} />
        <Route path="copilot" element={<CopilotPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="monitoring" element={<MonitoringPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>

      {/* Fallback 404 Route */}
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
};
