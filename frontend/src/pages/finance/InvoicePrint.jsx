import React, { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button, Spin, Alert } from 'antd';
import { PrinterOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import { useQuery } from 'react-query';
import axios from 'axios';
import dayjs from 'dayjs';
import { formatPKR } from '../../config/constants';
import './InvoicePrint.css';

const InvoicePrint = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  // Fetch invoice details
  const { data: invoice, isLoading: invoiceLoading, error: invoiceError } = useQuery(
    ['invoice-print', id],
    async () => {
      const response = await axios.get(`/finance/invoices/${id}`);
      return response.data.data;
    }
  );

  // Fetch company settings
  const { data: companySettings, isLoading: settingsLoading } = useQuery(
    'company-settings',
    async () => {
      const response = await axios.get('/settings');
      return response.data.data?.general || response.data.data;
    }
  );

  // Auto-trigger print dialog when data is loaded
  useEffect(() => {
    if (invoice && companySettings && !invoiceLoading && !settingsLoading) {
      // Small delay to ensure DOM is fully rendered
      const timer = setTimeout(() => {
        window.print();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [invoice, companySettings, invoiceLoading, settingsLoading]);

  const handlePrint = () => {
    window.print();
  };

  const handleBack = () => {
    navigate(-1);
  };

  if (invoiceLoading || settingsLoading) {
    return (
      <div className="print-loading">
        <Spin size="large" />
        <p>Loading invoice details...</p>
      </div>
    );
  }

  if (invoiceError || !invoice) {
    return (
      <div className="print-error">
        <Alert
          message="Invoice Not Found"
          description="The invoice you're trying to print doesn't exist or has been removed."
          type="error"
          action={
            <Button onClick={handleBack}>
              Go Back
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="invoice-print-page">
      {/* Print Controls - Only visible on screen */}
      <div className="print-controls">
        <Button 
          icon={<ArrowLeftOutlined />} 
          onClick={handleBack}
          style={{ marginRight: 8 }}
        >
          Back
        </Button>
        <Button 
          type="primary" 
          icon={<PrinterOutlined />} 
          onClick={handlePrint}
        >
          Print Invoice
        </Button>
      </div>

      {/* Printable Content */}
      <div className="print-container">
        {/* Company Header */}
        <div className="company-header">
          <div className="company-name">
            {companySettings?.companyName || 'Your Company Name'}
          </div>
          <div className="company-details">
            {companySettings?.companyAddress && (
              <div className="company-address">{companySettings.companyAddress}</div>
            )}
            <div className="company-contact">
              {companySettings?.companyEmail && <span>Email: {companySettings.companyEmail}</span>}
              {companySettings?.companyPhone && <span>Phone: {companySettings.companyPhone}</span>}
            </div>
            {companySettings?.companyFBR && (
              <div className="company-fbr">FBR Registration: {companySettings.companyFBR}</div>
            )}
          </div>
        </div>

        {/* Invoice Title */}
        <div className="invoice-title">
          <h1>INVOICE</h1>
        </div>

        {/* Customer and Invoice Details */}
        <div className="invoice-details-section">
          <div className="customer-details">
            <h3>Bill To:</h3>
            <div className="customer-info">
              <div className="customer-name">{invoice.customer?.name}</div>
              {invoice.customer?.company && (
                <div className="customer-company">{invoice.customer.company}</div>
              )}
              {invoice.customer?.address && (
                <div className="customer-address">{invoice.customer.address}</div>
              )}
              {invoice.customer?.phone && (
                <div className="customer-contact">Phone: {invoice.customer.phone}</div>
              )}
              {invoice.customer?.email && (
                <div className="customer-contact">Email: {invoice.customer.email}</div>
              )}
            </div>
          </div>

          <div className="invoice-info">
            <div className="invoice-detail-row">
              <span className="label">Invoice Number:</span>
              <span className="value">{invoice.invoiceNumber}</span>
            </div>
            <div className="invoice-detail-row">
              <span className="label">Invoice Date:</span>
              <span className="value">{dayjs(invoice.invoiceDate).format('DD/MM/YYYY')}</span>
            </div>
            <div className="invoice-detail-row">
              <span className="label">Due Date:</span>
              <span className="value">{dayjs(invoice.dueDate).format('DD/MM/YYYY')}</span>
            </div>
            <div className="invoice-detail-row">
              <span className="label">Status:</span>
              <span className="value status">{invoice.status}</span>
            </div>
          </div>
        </div>

        {/* Line Items */}
        <div className="line-items-section">
          <table className="line-items-table">
            <thead>
              <tr>
                <th className="item-description">Description</th>
                <th className="item-serial">Serial Number</th>
                <th className="item-quantity">Qty</th>
                <th className="item-rate">Rate</th>
                <th className="item-amount">Amount</th>
              </tr>
            </thead>
            <tbody>
              {invoice.items?.map((item, index) => (
                <tr key={index}>
                  <td className="item-description">
                    {item.description}
                  </td>
                  <td className="item-serial">
                    {item.item?.serialNumber || '-'}
                  </td>
                  <td className="item-quantity">
                    {item.quantity}
                  </td>
                  <td className="item-rate">
                    {formatPKR(item.unitPrice)}
                  </td>
                  <td className="item-amount">
                    {formatPKR(item.total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer Section */}
        <div className="invoice-footer">
          {/* Payment Terms */}
          <div className="payment-terms">
            <h4>Payment Terms:</h4>
            <p>Payment due within 30 days. All payment inquiries should be directed to zuhranyousaf12345@gmail.com</p>
            
            {invoice.notes && (
              <>
                <h4>Notes:</h4>
                <p>{invoice.notes}</p>
              </>
            )}
          </div>

          {/* Totals */}
          <div className="totals-section">
            <table className="totals-table">
              <tbody>
                <tr>
                  <td className="total-label">Subtotal:</td>
                  <td className="total-amount">{formatPKR(invoice.subtotal)}</td>
                </tr>
                {invoice.discountAmount > 0 && (
                  <tr>
                    <td className="total-label">
                      Discount {invoice.discountType === 'percentage' ? `(${invoice.discountValue}%)` : ''}:
                    </td>
                    <td className="total-amount discount">-{formatPKR(invoice.discountAmount)}</td>
                  </tr>
                )}
                {invoice.taxAmount > 0 && (
                  <tr>
                    <td className="total-label">Tax ({invoice.taxRate}%):</td>
                    <td className="total-amount">{formatPKR(invoice.taxAmount)}</td>
                  </tr>
                )}
                <tr className="total-row">
                  <td className="total-label"><strong>Total:</strong></td>
                  <td className="total-amount"><strong>{formatPKR(invoice.total)}</strong></td>
                </tr>
                {invoice.paidAmount > 0 && (
                  <>
                    <tr>
                      <td className="total-label">Paid Amount:</td>
                      <td className="total-amount paid">{formatPKR(invoice.paidAmount)}</td>
                    </tr>
                    <tr className="outstanding-row">
                      <td className="total-label"><strong>Outstanding:</strong></td>
                      <td className="total-amount"><strong>{formatPKR(invoice.total - invoice.paidAmount)}</strong></td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Signature Section */}
        <div className="signature-section">
          <div className="signature-box">
            <div className="signature-line"></div>
            <div className="signature-label">Authorized Signature</div>
          </div>
          <div className="signature-box">
            <div className="signature-line"></div>
            <div className="signature-label">Customer Signature</div>
          </div>
        </div>

        {/* Page Footer */}
        <div className="page-footer">
          <div className="footer-text">
            Thank you for your business!
          </div>
          <div className="print-date">
            Printed on: {dayjs().format('DD/MM/YYYY HH:mm')}
          </div>
        </div>
      </div>
    </div>
  );
};

export default InvoicePrint;