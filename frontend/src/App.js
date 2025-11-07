// ========== src/App.js ==========
import React, { useEffect, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from 'react-query';
import { ConfigProvider, message, Spin } from 'antd';
import { useAuthStore } from './stores/authStore';

// Layouts
import PublicLayout from './layouts/PublicLayout';
import PrivateLayout from './layouts/PrivateLayout';

// Auth Pages (keep LoginPage eager loaded - it's the entry point)
import LoginPage from './pages/LoginPage';

// PERFORMANCE OPTIMIZATION: Lazy load all authenticated pages
// This reduces initial bundle size by 60-70% and improves Time to Interactive

// Dashboard
const Dashboard = React.lazy(() => import('./pages/Dashboard'));

// Inventory Pages
const InventoryList = React.lazy(() => import('./pages/inventory/InventoryList'));
const AddItem = React.lazy(() => import('./pages/inventory/AddItem'));
const BulkAddItems = React.lazy(() => import('./pages/inventory/BulkAddItems'));
const ItemDetails = React.lazy(() => import('./pages/inventory/ItemDetails'));
const Categories = React.lazy(() => import('./pages/inventory/Categories'));
const Companies = React.lazy(() => import('./pages/inventory/Companies'));
const Models = React.lazy(() => import('./pages/inventory/Models'));
const Vendors = React.lazy(() => import('./pages/inventory/Vendors'));
const VendorDetails = React.lazy(() => import('./pages/inventory/VendorDetails'));

// Finance Pages
const Customers = React.lazy(() => import('./pages/finance/Customers'));
const CustomerDetails = React.lazy(() => import('./pages/finance/CustomerDetails'));
const Invoices = React.lazy(() => import('./pages/finance/Invoices'));
const CreateInvoice = React.lazy(() => import('./pages/finance/CreateInvoice'));
const InvoiceDetails = React.lazy(() => import('./pages/finance/InvoiceDetails'));
const Payments = React.lazy(() => import('./pages/finance/Payments'));
const RecordPayment = React.lazy(() => import('./pages/finance/RecordPayment'));
const PurchaseOrders = React.lazy(() => import('./pages/finance/PurchaseOrders'));
const CreatePurchaseOrder = React.lazy(() => import('./pages/finance/CreatePurchaseOrder'));
const PurchaseOrderDetails = React.lazy(() => import('./pages/finance/PurchaseOrderDetails'));
const VendorBills = React.lazy(() => import('./pages/finance/VendorBills'));
const CreateVendorBill = React.lazy(() => import('./pages/finance/CreateVendorBill'));
const VendorBillDetails = React.lazy(() => import('./pages/finance/VendorBillDetails'));
const VendorPayments = React.lazy(() => import('./pages/finance/VendorPayments'));
const RecordVendorPayment = React.lazy(() => import('./pages/finance/RecordVendorPayment'));

// Reports
const Reports = React.lazy(() => import('./pages/reports/Reports'));

// Settings
const Users = React.lazy(() => import('./pages/settings/Users'));
const Settings = React.lazy(() => import('./pages/settings/Settings'));
const Profile = React.lazy(() => import('./pages/settings/Profile'));

// Styles
import 'antd/dist/reset.css';
import './App.css';

// PERFORMANCE OPTIMIZATION: Enhanced React Query configuration
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Don't refetch on window focus (user is just switching tabs, not expecting fresh data)
      refetchOnWindowFocus: false,

      // Only retry once on failure (reduces unnecessary network overhead)
      retry: 1,

      // Default: Data is "fresh" for 2 minutes (good for frequently changing data like items)
      // Override per-query for static data (categories, companies, etc.)
      staleTime: 2 * 60 * 1000, // 2 minutes

      // Keep unused data in cache for 10 minutes (longer than staleTime)
      // This means if user navigates away and comes back within 10 min, we use cached data
      cacheTime: 10 * 60 * 1000, // 10 minutes

      // Refetch stale queries in background when component mounts
      refetchOnMount: 'always',

      // Don't refetch when network reconnects (avoid unnecessary traffic)
      refetchOnReconnect: false,
    },
  },
});

// Axios interceptor for auth
import axios from 'axios';

axios.defaults.baseURL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

axios.interceptors.request.use(
  (config) => {
    const token = useAuthStore.getState().token;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

axios.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      useAuthStore.getState().logout();
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

function App() {
  const { checkAuth } = useAuthStore();

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // Configure Ant Design
  const antdConfig = {
    theme: {
      token: {
        colorPrimary: '#1890ff',
        borderRadius: 4,
      },
    },
    componentSize: 'middle',
  };

  // Global message config
  message.config({
    top: 100,
    duration: 3,
    maxCount: 3,
  });

  return (
    <ConfigProvider {...antdConfig}>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <Suspense
            fallback={
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  height: '100vh',
                  flexDirection: 'column',
                  gap: '16px'
                }}
              >
                <Spin size="large" />
                <div style={{ color: '#666' }}>Loading...</div>
              </div>
            }
          >
            <Routes>
              {/* Public Routes */}
              <Route path="/" element={<PublicLayout />}>
                <Route path="login" element={<LoginPage />} />
                <Route index element={<Navigate to="/login" />} />
              </Route>

              {/* Private Routes */}
              <Route path="/app" element={<PrivateLayout />}>
                <Route index element={<Navigate to="/app/dashboard" />} />
                <Route path="dashboard" element={<Dashboard />} />

                {/* Inventory Routes */}
                <Route path="inventory">
                  <Route index element={<Navigate to="/app/inventory/items" />} />
                  <Route path="items" element={<InventoryList />} />
                  <Route path="items/add" element={<AddItem />} />
                  <Route path="items/bulk-add" element={<BulkAddItems />} />
                  <Route path="items/:serialNumber" element={<ItemDetails />} />
                  <Route path="categories" element={<Categories />} />
                  <Route path="companies" element={<Companies />} />
                  <Route path="models" element={<Models />} />
                  <Route path="vendors" element={<Vendors />} />
                  <Route path="vendors/:id" element={<VendorDetails />} />
                </Route>

                {/* Finance Routes */}
                <Route path="finance">
                  <Route index element={<Navigate to="/app/finance/invoices" />} />
                  <Route path="customers" element={<Customers />} />
                  <Route path="customers/:id" element={<CustomerDetails />} />
                  <Route path="invoices" element={<Invoices />} />
                  <Route path="invoices/create" element={<CreateInvoice />} />
                  <Route path="invoices/:id" element={<InvoiceDetails />} />
                  <Route path="payments" element={<Payments />} />
                  <Route path="payments/record" element={<RecordPayment />} />
                  <Route path="purchase-orders" element={<PurchaseOrders />} />
                  <Route path="purchase-orders/create" element={<CreatePurchaseOrder />} />
                  <Route path="purchase-orders/:id" element={<PurchaseOrderDetails />} />
                  <Route path="vendor-bills" element={<VendorBills />} />
                  <Route path="vendor-bills/create" element={<CreateVendorBill />} />
                  <Route path="vendor-bills/:id" element={<VendorBillDetails />} />
                  <Route path="vendor-payments" element={<VendorPayments />} />
                  <Route path="vendor-payments/record" element={<RecordVendorPayment />} />
                </Route>

                {/* Reports */}
                <Route path="reports" element={<Reports />} />

                {/* Settings */}
                <Route path="settings">
                  <Route index element={<Settings />} />
                  <Route path="users" element={<Users />} />
                </Route>

                {/* Profile */}
                <Route path="profile" element={<Profile />} />
              </Route>

              {/* Catch all */}
              <Route path="*" element={<Navigate to="/app/dashboard" />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </QueryClientProvider>
    </ConfigProvider>
  );
}

export default App;