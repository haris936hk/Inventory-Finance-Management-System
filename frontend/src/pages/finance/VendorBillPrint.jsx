import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Spin, Result, Button } from 'antd';
import { PrinterOutlined, CloseOutlined } from '@ant-design/icons';
import { useQuery } from 'react-query';
import axios from 'axios';
import { formatPKR } from '../../config/constants';
import './VendorBillPrint.css';

const VendorBillPrint = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [autoPrint, setAutoPrint] = useState(true);

  // Fetch Vendor Bill details
  const { data: vendorBill, isLoading: billLoading, error: billError } = useQuery(
    ['vendor-bill-print', id],
    async () => {
      const response = await axios.get(`/finance/vendor-bills/${id}`);
      return response.data.data;
    },
    {
      enabled: !!id
    }
  );

  // Fetch Company Settings
  const { data: settings, isLoading: settingsLoading } = useQuery(
    'settings-print',
    async () => {
      const response = await axios.get('/settings');
      return response.data.data;
    }
  );

  // Auto-trigger print dialog when data is loaded
  useEffect(() => {
    if (vendorBill && settings && autoPrint) {
      // Small delay to ensure rendering is complete
      const timer = setTimeout(() => {
        window.print();
        setAutoPrint(false); // Prevent re-triggering
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [vendorBill, settings, autoPrint]);

  const handlePrint = () => {
    window.print();
  };

  const handleClose = () => {
    window.close();
    // Fallback if window.close() doesn't work
    setTimeout(() => {
      navigate('/app/finance/vendor-bills');
    }, 100);
  };

  // Format date to DD/MM/YYYY
  const formatDate = (date) => {
    if (!date) return '';
    return new Date(date).toLocaleDateString('en-GB');
  };

  if (billLoading || settingsLoading) {
    return (
      <div className="bill-print-loading">
        <Spin size="large" tip="Loading Vendor Bill..." />
      </div>
    );
  }

  if (billError || !vendorBill) {
    return (
      <div className="bill-print-loading">
        <Result
          status="error"
          title="Failed to Load Vendor Bill"
          subTitle="The vendor bill could not be found or loaded."
          extra={
            <Button type="primary" onClick={handleClose}>
              Go Back
            </Button>
          }
        />
      </div>
    );
  }

  const companyInfo = settings?.general || {};
  const vendor = vendorBill.vendor || {};
  const purchaseOrder = vendorBill.purchaseOrder || null;

  return (
    <div className="bill-print-page">
      {/* Print Controls - Hidden when printing */}
      <div className="bill-print-controls no-print">
        <Button icon={<PrinterOutlined />} type="primary" onClick={handlePrint}>
          Print
        </Button>
        <Button icon={<CloseOutlined />} onClick={handleClose}>
          Close
        </Button>
      </div>

      {/* Printable Content */}
      <div className="bill-print-container">
        {/* Company Header */}
        <div className="company-header">
          <div className="company-info">
            <h1 className="company-name">{companyInfo.companyName || 'Company Name'}</h1>
            <div className="company-details">
              {companyInfo.companyAddress && <div>{companyInfo.companyAddress}</div>}
              <div>
                {companyInfo.companyEmail && <span>{companyInfo.companyEmail}</span>}
                {companyInfo.companyEmail && companyInfo.companyPhone && <span> | </span>}
                {companyInfo.companyPhone && <span>{companyInfo.companyPhone}</span>}
              </div>
              {companyInfo.companyFBR && (
                <div>FBR Registration No.: {companyInfo.companyFBR}</div>
              )}
            </div>
          </div>
        </div>

        {/* Vendor Bill Title */}
        <div className="bill-title">
          <h2>Vendor Bill</h2>
        </div>

        {/* Vendor and Bill Details Section */}
        <div className="bill-details-section">
          <div className="vendor-section">
            <div className="section-label">BILL TO</div>
            <div className="vendor-info">
              <div className="vendor-name">{vendor.name || 'N/A'}</div>
              {vendor.address && <div>{vendor.address}</div>}
              {vendor.contactPerson && <div>Contact: {vendor.contactPerson}</div>}
              {vendor.phone && <div>Phone: {vendor.phone}</div>}
              {vendor.email && <div>Email: {vendor.email}</div>}
            </div>
          </div>
          <div className="bill-info-section">
            <table className="bill-info-table">
              <tbody>
                <tr>
                  <td className="label">BILL #</td>
                  <td className="value">{vendorBill.billNumber}</td>
                </tr>
                <tr>
                  <td className="label">DATE</td>
                  <td className="value">{formatDate(vendorBill.billDate)}</td>
                </tr>
                <tr>
                  <td className="label">DUE DATE</td>
                  <td className="value">{formatDate(vendorBill.dueDate)}</td>
                </tr>
                {purchaseOrder && (
                  <tr>
                    <td className="label">P.O. REF</td>
                    <td className="value">{purchaseOrder.poNumber}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Line Items Table */}
        <table className="line-items-table">
          <thead>
            <tr>
              <th className="col-description">DESCRIPTION</th>
              <th className="col-qty">QTY</th>
              <th className="col-rate">RATE</th>
              <th className="col-amount">AMOUNT</th>
            </tr>
          </thead>
          <tbody>
            {purchaseOrder && purchaseOrder.lineItems && purchaseOrder.lineItems.length > 0 ? (
              // If linked to PO, show detailed line items
              purchaseOrder.lineItems.map((item, index) => (
                <tr key={index}>
                  <td className="col-description">{item.description || '-'}</td>
                  <td className="col-qty text-center">{item.quantity}</td>
                  <td className="col-rate text-right">
                    {Number(item.unitPrice).toLocaleString('en-PK', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2
                    })}
                  </td>
                  <td className="col-amount text-right">
                    {Number(item.totalPrice).toLocaleString('en-PK', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2
                    })}
                  </td>
                </tr>
              ))
            ) : (
              // If not linked to PO, show bill description as single line item
              <tr>
                <td className="col-description">
                  {vendorBill.description || 'Services/Products as per agreement'}
                </td>
                <td className="col-qty text-center">1</td>
                <td className="col-rate text-right">
                  {Number(vendorBill.subtotal || 0).toLocaleString('en-PK', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                  })}
                </td>
                <td className="col-amount text-right">
                  {Number(vendorBill.subtotal || 0).toLocaleString('en-PK', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                  })}
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Payment Terms and Totals Section */}
        <div className="footer-section">
          <div className="payment-terms">
            <div className="terms-label">Payment Terms:</div>
            <div className="terms-text">
              Payment due within 30 days. All payment inquiries should be directed to{' '}
              <strong>{companyInfo.companyEmail || 'company email'}</strong>
            </div>
          </div>

          <div className="totals-section">
            <table className="totals-table">
              <tbody>
                <tr>
                  <td className="totals-label">SUBTOTAL</td>
                  <td className="totals-value">
                    {Number(vendorBill.subtotal || 0).toLocaleString('en-PK', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2
                    })}
                  </td>
                </tr>
                <tr>
                  <td className="totals-label">TAX</td>
                  <td className="totals-value">
                    {Number(vendorBill.taxAmount || 0).toLocaleString('en-PK', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2
                    })}
                  </td>
                </tr>
                <tr className="total-row">
                  <td className="totals-label">TOTAL</td>
                  <td className="totals-value">
                    PKR {Number(vendorBill.total || 0).toLocaleString('en-PK', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2
                    })}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Signature Section */}
        <div className="signature-section">
          <div className="signature-line">
            <div className="signature-label">Authorized Signature</div>
            <div className="signature-box"></div>
          </div>
          <div className="signature-line">
            <div className="signature-label">Date</div>
            <div className="signature-box"></div>
          </div>
        </div>

        {/* Page Footer */}
        <div className="page-footer">
          <div className="page-number">Page 1 of 1</div>
        </div>
      </div>
    </div>
  );
};

export default VendorBillPrint;