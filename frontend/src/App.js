// ========== src/App.js ==========
import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from 'react-query';
import { ConfigProvider, message } from 'antd';
import { useAuthStore } from './stores/authStore';

// Layouts
import PublicLayout from './layouts/PublicLayout';
import PrivateLayout from './layouts/PrivateLayout';

// Auth Pages
import LoginPage from './pages/LoginPage';

// Dashboard
import Dashboard from './pages/Dashboard';

// Inventory Pages
import InventoryList from './pages/inventory/InventoryList';
import AddItem from './pages/inventory/AddItem';
import BulkAddItems from './pages/inventory/BulkAddItems';
import ItemDetails from './pages/inventory/ItemDetails';
import Categories from './pages/inventory/Categories';
import Companies from './pages/inventory/Companies';
import Models from './pages/inventory/Models';
import Vendors from './pages/inventory/Vendors';

// Finance Pages
import Customers from './pages/finance/Customers';
import Invoices from './pages/finance/Invoices';
import CreateInvoice from './pages/finance/CreateInvoice';
import InvoiceDetails from './pages/finance/InvoiceDetails';
import Payments from './pages/finance/Payments';
import RecordPayment from './pages/finance/RecordPayment';
import PurchaseOrders from './pages/finance/PurchaseOrders';
import PurchaseOrderDetails from './pages/finance/PurchaseOrderDetails';
import PurchaseOrderPrint from './pages/finance/PurchaseOrderPrint';
import VendorBills from './pages/finance/VendorBills';
import VendorBillDetails from './pages/finance/VendorBillDetails';
import VendorPayments from './pages/finance/VendorPayments';
import RecordVendorPayment from './pages/finance/RecordVendorPayment';

// Reports
import Reports from './pages/reports/Reports';

// Settings
import Users from './pages/settings/Users';
import Settings from './pages/settings/Settings';
import Profile from './pages/settings/Profile';

// Styles
import 'antd/dist/reset.css';
import './App.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 5 * 60 * 1000, // 5 minutes
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
              </Route>

              {/* Finance Routes */}
              <Route path="finance">
                <Route index element={<Navigate to="/app/finance/invoices" />} />
                <Route path="customers" element={<Customers />} />
                <Route path="invoices" element={<Invoices />} />
                <Route path="invoices/create" element={<CreateInvoice />} />
                <Route path="invoices/:id" element={<InvoiceDetails />} />
                <Route path="payments" element={<Payments />} />
                <Route path="payments/record" element={<RecordPayment />} />
                <Route path="purchase-orders" element={<PurchaseOrders />} />
                <Route path="purchase-orders/:id" element={<PurchaseOrderDetails />} />
                <Route path="vendor-bills" element={<VendorBills />} />
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

            {/* Standalone Print Routes (No Layout) */}
            <Route path="/print/purchase-orders/:id" element={<PurchaseOrderPrint />} />

            {/* Catch all */}
            <Route path="*" element={<Navigate to="/app/dashboard" />} />
          </Routes>
        </BrowserRouter>
      </QueryClientProvider>
    </ConfigProvider>
  );
}

export default App;