import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Spin, Result, Button } from 'antd';
import { PrinterOutlined, CloseOutlined } from '@ant-design/icons';
import { useQuery } from 'react-query';
import axios from 'axios';
import { formatPKR } from '../../config/constants';
import './PurchaseOrderPrint.css';

const PurchaseOrderPrint = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [autoPrint, setAutoPrint] = useState(true);

  // Fetch Purchase Order details
  const { data: purchaseOrder, isLoading: poLoading, error: poError } = useQuery(
    ['purchase-order-print', id],
    async () => {
      const response = await axios.get(`/finance/purchase-orders/${id}`);
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
    if (purchaseOrder && settings && autoPrint) {
      // Small delay to ensure rendering is complete
      const timer = setTimeout(() => {
        window.print();
        setAutoPrint(false); // Prevent re-triggering
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [purchaseOrder, settings, autoPrint]);

  const handlePrint = () => {
    window.print();
  };

  const handleClose = () => {
    window.close();
    // Fallback if window.close() doesn't work
    setTimeout(() => {
      navigate('/app/finance/purchase-orders');
    }, 100);
  };

  // Format date to DD/MM/YYYY
  const formatDate = (date) => {
    if (!date) return '';
    return new Date(date).toLocaleDateString('en-GB');
  };

  if (poLoading || settingsLoading) {
    return (
      <div className="print-loading">
        <Spin size="large" tip="Loading Purchase Order..." />
      </div>
    );
  }

  if (poError || !purchaseOrder) {
    return (
      <div className="print-loading">
        <Result
          status="error"
          title="Failed to Load Purchase Order"
          subTitle="The purchase order could not be found or loaded."
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
  const vendor = purchaseOrder.vendor || {};

  return (
    <div className="print-page">
      {/* Print Controls - Hidden when printing */}
      <div className="print-controls no-print">
        <Button icon={<PrinterOutlined />} type="primary" onClick={handlePrint}>
          Print
        </Button>
        <Button icon={<CloseOutlined />} onClick={handleClose}>
          Close
        </Button>
      </div>

      {/* Printable Content */}
      <div className="print-container">
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

        {/* Purchase Order Title */}
        <div className="po-title">
          <h2>Purchase Order</h2>
        </div>

        {/* Vendor and PO Details Section */}
        <div className="po-details-section">
          <div className="vendor-section">
            <div className="section-label">VENDOR</div>
            <div className="vendor-info">
              <div className="vendor-name">{vendor.name || 'N/A'}</div>
              {vendor.address && <div>{vendor.address}</div>}
              {vendor.contactPerson && <div>Contact: {vendor.contactPerson}</div>}
              {vendor.phone && <div>Phone: {vendor.phone}</div>}
              {vendor.email && <div>Email: {vendor.email}</div>}
            </div>
          </div>
          <div className="po-info-section">
            <table className="po-info-table">
              <tbody>
                <tr>
                  <td className="label">P.O.</td>
                  <td className="value">{purchaseOrder.poNumber}</td>
                </tr>
                <tr>
                  <td className="label">DATE</td>
                  <td className="value">{formatDate(purchaseOrder.orderDate)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Line Items Table */}
        <table className="line-items-table">
          <thead>
            <tr>
              <th className="col-product">PRODUCT / SERVICE</th>
              <th className="col-description">DESCRIPTION</th>
              <th className="col-qty">QTY</th>
              <th className="col-rate">RATE</th>
              <th className="col-amount">AMOUNT</th>
            </tr>
          </thead>
          <tbody>
            {purchaseOrder.lineItems && purchaseOrder.lineItems.length > 0 ? (
              purchaseOrder.lineItems.map((item, index) => (
                <tr key={index}>
                  <td className="col-product">
                    {item.productModel?.name || 'Product'}
                  </td>
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
              <tr>
                <td colSpan="5" className="text-center">No line items</td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Payment Terms and Totals Section */}
        <div className="footer-section">
          <div className="payment-terms">
            <div className="terms-label">Payment Terms:</div>
            <div className="terms-text">
              All general requests regarding payment must be addressed to{' '}
              <strong>{companyInfo.companyEmail || 'company email'}</strong>
            </div>
          </div>

          <div className="totals-section">
            <table className="totals-table">
              <tbody>
                <tr>
                  <td className="totals-label">SUBTOTAL</td>
                  <td className="totals-value">
                    {Number(purchaseOrder.subtotal).toLocaleString('en-PK', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2
                    })}
                  </td>
                </tr>
                <tr>
                  <td className="totals-label">TAX</td>
                  <td className="totals-value">
                    {Number(purchaseOrder.taxAmount || 0).toLocaleString('en-PK', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2
                    })}
                  </td>
                </tr>
                <tr className="total-row">
                  <td className="totals-label">TOTAL</td>
                  <td className="totals-value">
                    PKR {Number(purchaseOrder.total).toLocaleString('en-PK', {
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
            <div className="signature-label">Approved By</div>
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

export default PurchaseOrderPrint;
