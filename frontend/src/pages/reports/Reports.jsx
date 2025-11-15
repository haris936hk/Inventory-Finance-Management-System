// ========== src/pages/reports/Reports.jsx ==========
import React, { useState } from 'react';
import { Card, Tabs } from 'antd';

// Import comprehensive financial reports
import FinancialDashboard from '../../components/reports/FinancialDashboard';
import ProfitLossStatement from '../../components/reports/ProfitLossStatement';
import BalanceSheet from '../../components/reports/BalanceSheet';
import CashFlowReport from '../../components/reports/CashFlowReport';
import TrialBalanceReport from '../../components/reports/TrialBalanceReport';
import ARAgingReport from '../../components/reports/ARAgingReport';
import VendorBillsAgingReport from '../../components/reports/VendorBillsAgingReport';
import InventoryTurnoverReport from '../../components/reports/InventoryTurnoverReport';
import GrossProfitMarginReport from '../../components/reports/GrossProfitMarginReport';

const { TabPane } = Tabs;

const Reports = () => {
  const [activeTab, setActiveTab] = useState('financial-dashboard');

  return (
    <Card title="Reports & Analytics">
      <Tabs activeKey={activeTab} onChange={setActiveTab}>
        {/* Financial Dashboard - Summary Overview */}
        <TabPane tab="Financial Dashboard" key="financial-dashboard">
          <FinancialDashboard />
        </TabPane>

        {/* Core Financial Statements */}
        <TabPane tab="Profit & Loss" key="profit-loss">
          <ProfitLossStatement />
        </TabPane>

        <TabPane tab="Balance Sheet" key="balance-sheet">
          <BalanceSheet />
        </TabPane>

        <TabPane tab="Cash Flow Statement" key="cash-flow">
          <CashFlowReport />
        </TabPane>

        <TabPane tab="Trial Balance" key="trial-balance">
          <TrialBalanceReport />
        </TabPane>

        {/* Receivables & Payables */}
        <TabPane tab="Accounts Receivable Aging" key="ar-aging">
          <ARAgingReport />
        </TabPane>

        <TabPane tab="Vendor Bills Aging" key="vendor-bills-aging">
          <VendorBillsAgingReport />
        </TabPane>

        {/* Business Analytics */}
        <TabPane tab="Inventory Turnover" key="inventory-turnover">
          <InventoryTurnoverReport />
        </TabPane>

        <TabPane tab="Gross Profit Margin" key="gross-profit-margin">
          <GrossProfitMarginReport />
        </TabPane>
      </Tabs>
    </Card>
  );
};

export default Reports;