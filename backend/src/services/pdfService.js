// ========== src/services/pdfService.js ==========
const PDFDocument = require('pdfkit');
const supabaseStorage = require('../config/supabase');

class PDFService {
  async generateInvoice(invoice) {
    return new Promise(async (resolve, reject) => {
      try {
        const doc = new PDFDocument({ margin: 50 });
        const chunks = [];

        // Collect PDF data
        doc.on('data', chunk => chunks.push(chunk));
        doc.on('end', async () => {
          const pdfBuffer = Buffer.concat(chunks);
          
          // Upload to Supabase
          const filename = `invoice_${invoice.invoiceNumber}.pdf`;
          await supabaseStorage.upload(
            supabaseStorage.buckets.invoices,
            filename,
            pdfBuffer,
            { contentType: 'application/pdf' }
          );

          const url = await supabaseStorage.createSignedUrl(
            supabaseStorage.buckets.invoices,
            filename,
            3600
          );

          resolve({ filename, url, buffer: pdfBuffer });
        });

        // Company header
        doc.fontSize(20)
           .text('YOUR COMPANY NAME', { align: 'center' })
           .fontSize(10)
           .text('Address: Your Company Address', { align: 'center' })
           .text('Phone: +92-XXX-XXXXXXX | Email: info@company.com', { align: 'center' })
           .moveDown(2);

        // Invoice title
        doc.fontSize(16)
           .text('INVOICE', { align: 'center', underline: true })
           .moveDown();

        // Invoice details
        doc.fontSize(10);
        const startY = doc.y;
        
        // Left column - Invoice info
        doc.text(`Invoice #: ${invoice.invoiceNumber}`, 50, startY);
        doc.text(`Date: ${new Date(invoice.invoiceDate).toLocaleDateString()}`, 50, startY + 15);
        doc.text(`Due Date: ${new Date(invoice.dueDate).toLocaleDateString()}`, 50, startY + 30);
        doc.text(`Status: ${invoice.status}`, 50, startY + 45);

        // Right column - Customer info
        doc.text('Bill To:', 300, startY, { underline: true });
        doc.text(invoice.customer.name, 300, startY + 15);
        if (invoice.customer.company) {
          doc.text(invoice.customer.company, 300, startY + 30);
        }
        doc.text(invoice.customer.phone, 300, startY + 45);
        if (invoice.customer.address) {
          doc.text(invoice.customer.address, 300, startY + 60, { width: 200 });
        }

        doc.moveDown(4);

        // Items table header
        const tableTop = doc.y;
        doc.rect(50, tableTop, 500, 20).fill('#f0f0f0').stroke();
        doc.fillColor('black');
        
        doc.fontSize(10)
           .text('S.No', 55, tableTop + 5)
           .text('Serial Number', 90, tableTop + 5)
           .text('Description', 200, tableTop + 5)
           .text('Qty', 350, tableTop + 5)
           .text('Rate', 390, tableTop + 5)
           .text('Amount', 450, tableTop + 5);

        // Items
        let currentY = tableTop + 25;
        invoice.items.forEach((item, index) => {
          // Draw row background for alternating rows
          if (index % 2 === 0) {
            doc.rect(50, currentY - 5, 500, 20).fill('#fafafa').stroke();
            doc.fillColor('black');
          }

          const description = `${item.item.category.name} - ${item.item.model.company.name} ${item.item.model.name}`;
          
          doc.fontSize(9)
             .text(index + 1, 55, currentY)
             .text(item.item.serialNumber, 90, currentY)
             .text(description, 200, currentY, { width: 140 })
             .text(item.quantity, 350, currentY)
             .text(`PKR ${item.unitPrice}`, 390, currentY)
             .text(`PKR ${item.total}`, 450, currentY);

          currentY += 25;

          // Add specifications if available
          if (item.item.specifications) {
            doc.fontSize(8)
               .fillColor('#666')
               .text(`   Specs: ${JSON.stringify(item.item.specifications)}`, 90, currentY, { width: 250 });
            doc.fillColor('black');
            currentY += 15;
          }
        });

        // Draw bottom line
        doc.moveTo(50, currentY).lineTo(550, currentY).stroke();
        currentY += 10;

        // Totals
        doc.fontSize(10);
        const totalsX = 400;
        
        doc.text('Subtotal:', totalsX, currentY)
           .text(`PKR ${invoice.subtotal}`, totalsX + 80, currentY);
        currentY += 15;

        if (invoice.discountValue > 0) {
          const discountText = invoice.discountType === 'Percentage' 
            ? `Discount (${invoice.discountValue}%):`
            : 'Discount:';
          const discountAmount = invoice.discountType === 'Percentage'
            ? (invoice.subtotal * invoice.discountValue / 100)
            : invoice.discountValue;
          
          doc.text(discountText, totalsX, currentY)
             .text(`- PKR ${discountAmount}`, totalsX + 80, currentY);
          currentY += 15;
        }

        if (invoice.taxAmount > 0) {
          doc.text(`Tax (${invoice.taxRate}%):`, totalsX, currentY)
             .text(`PKR ${invoice.taxAmount}`, totalsX + 80, currentY);
          currentY += 15;
        }

        // Total
        doc.fontSize(12)
           .fillColor('#000')
           .text('Total:', totalsX, currentY, { underline: true })
           .text(`PKR ${invoice.total}`, totalsX + 80, currentY, { underline: true });
        currentY += 20;

        if (invoice.paidAmount > 0) {
          doc.fontSize(10)
             .text('Paid:', totalsX, currentY)
             .text(`PKR ${invoice.paidAmount}`, totalsX + 80, currentY);
          currentY += 15;
          
          const balance = invoice.total - invoice.paidAmount;
          doc.text('Balance:', totalsX, currentY)
             .text(`PKR ${balance}`, totalsX + 80, currentY);
        }

        // Terms and notes
        if (invoice.terms || invoice.notes) {
          doc.moveDown(2);
          
          if (invoice.terms) {
            doc.fontSize(10)
               .text('Terms & Conditions:', 50, doc.y, { underline: true })
               .fontSize(9)
               .text(invoice.terms, 50, doc.y + 15, { width: 500 });
          }

          if (invoice.notes) {
            doc.moveDown()
               .fontSize(10)
               .text('Notes:', 50, doc.y, { underline: true })
               .fontSize(9)
               .text(invoice.notes, 50, doc.y + 15, { width: 500 });
          }
        }

        // Footer
        doc.fontSize(8)
           .fillColor('#666')
           .text('Thank you for your business!', 50, doc.page.height - 50, { 
             align: 'center', 
             width: 500 
           });

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  async generateReceipt(payment, invoice) {
    return new Promise(async (resolve, reject) => {
      try {
        const doc = new PDFDocument({ size: 'A5', margin: 30 });
        const chunks = [];

        doc.on('data', chunk => chunks.push(chunk));
        doc.on('end', async () => {
          const pdfBuffer = Buffer.concat(chunks);
          
          const filename = `receipt_${payment.paymentNumber}.pdf`;
          await supabaseStorage.upload(
            supabaseStorage.buckets.receipts,
            filename,
            pdfBuffer,
            { contentType: 'application/pdf' }
          );

          const url = await supabaseStorage.createSignedUrl(
            supabaseStorage.buckets.receipts,
            filename,
            3600
          );

          resolve({ filename, url, buffer: pdfBuffer });
        });

        // Header
        doc.fontSize(16)
           .text('PAYMENT RECEIPT', { align: 'center' })
           .moveDown();

        doc.fontSize(10)
           .text('YOUR COMPANY NAME', { align: 'center' })
           .text('Your Company Address', { align: 'center' })
           .text('Phone: +92-XXX-XXXXXXX', { align: 'center' })
           .moveDown(2);

        // Receipt details
        doc.fontSize(10);
        doc.text(`Receipt #: ${payment.paymentNumber}`);
        doc.text(`Date: ${new Date(payment.paymentDate).toLocaleDateString()}`);
        doc.text(`Payment Method: ${payment.method}`);
        if (payment.reference) {
          doc.text(`Reference: ${payment.reference}`);
        }
        doc.moveDown();

        // Customer details
        doc.text('Received From:', { underline: true });
        doc.text(payment.customer.name);
        if (payment.customer.company) {
          doc.text(payment.customer.company);
        }
        doc.text(payment.customer.phone);
        doc.moveDown();

        // Payment details
        doc.text('Payment Details:', { underline: true });
        if (invoice) {
          doc.text(`Invoice #: ${invoice.invoiceNumber}`);
          doc.text(`Invoice Amount: PKR ${invoice.total}`);
        }
        doc.moveDown();

        // Amount
        doc.fontSize(12)
           .text(`Amount Received: PKR ${payment.amount}`, { underline: true })
           .moveDown();

        // Notes
        if (payment.notes) {
          doc.fontSize(10)
             .text('Notes:', { underline: true })
             .text(payment.notes);
        }

        // Signature line
        doc.moveDown(3);
        doc.fontSize(10)
           .text('_____________________', { align: 'right' })
           .text('Authorized Signature', { align: 'right' });

        // Footer
        doc.fontSize(8)
           .fillColor('#666')
           .text('This is a computer generated receipt', 30, doc.page.height - 30);

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  async generateHandoverReceipt(item) {
    return new Promise(async (resolve, reject) => {
      try {
        const doc = new PDFDocument({ size: 'A5', margin: 30 });
        const chunks = [];

        doc.on('data', chunk => chunks.push(chunk));
        doc.on('end', async () => {
          const pdfBuffer = Buffer.concat(chunks);
          
          const filename = `handover_${item.serialNumber}_${Date.now()}.pdf`;
          await supabaseStorage.upload(
            supabaseStorage.buckets.receipts,
            filename,
            pdfBuffer,
            { contentType: 'application/pdf' }
          );

          const url = await supabaseStorage.createSignedUrl(
            supabaseStorage.buckets.receipts,
            filename,
            3600
          );

          resolve({ filename, url, buffer: pdfBuffer });
        });

        // Header
        doc.fontSize(16)
           .text('HANDOVER RECEIPT', { align: 'center' })
           .moveDown();

        doc.fontSize(10)
           .text('YOUR COMPANY NAME', { align: 'center' })
           .moveDown(2);

        // Date
        doc.text(`Date: ${new Date(item.handoverDate).toLocaleDateString()}`);
        doc.moveDown();

        // Item details
        doc.text('Item Details:', { underline: true });
        doc.text(`Serial Number: ${item.serialNumber}`);
        doc.text(`Category: ${item.category.name}`);
        doc.text(`Model: ${item.model.company.name} ${item.model.name}`);
        
        if (item.specifications) {
          doc.text(`Specifications: ${JSON.stringify(item.specifications)}`);
        }
        doc.moveDown();

        // Handover details
        doc.text('Handover Details:', { underline: true });
        doc.text(`Handed Over To: ${item.handoverTo}`);
        doc.text(`Handed Over By: ${item.handoverByUser.fullName}`);
        
        if (item.handoverDetails) {
          doc.text(`Details: ${item.handoverDetails}`);
        }
        doc.moveDown();

        // Customer details if available
        if (item.customer) {
          doc.text('Customer Details:', { underline: true });
          doc.text(`Name: ${item.customer.name}`);
          if (item.customer.company) doc.text(`Company: ${item.customer.company}`);
          if (item.customer.nic) doc.text(`NIC: ${item.customer.nic}`);
          if (item.customer.phone) doc.text(`Phone: ${item.customer.phone}`);
          if (item.customer.email) doc.text(`Email: ${item.customer.email}`);
          if (item.customer.address) doc.text(`Address: ${item.customer.address}`);
          doc.moveDown();
        }

        // Signatures
        doc.moveDown(3);
        const signatureY = doc.y;
        
        doc.text('_____________________', 30, signatureY);
        doc.text('Handed Over By', 30, signatureY + 15);
        
        doc.text('_____________________', 250, signatureY);
        doc.text('Received By', 250, signatureY + 15);

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }
}

module.exports = new PDFService();