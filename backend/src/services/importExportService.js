// ========== src/services/importExportService.js ==========
const XLSX = require('xlsx');
const db = require('../config/database');
const logger = require('../config/logger');
const supabaseStorage = require('../config/supabase');

class ImportExportService {
  /**
   * Import items from Excel file
   */
  async importFromExcel(fileBuffer, userId) {
    try {
      // Read workbook
      const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
      
      const results = {
        success: [],
        failed: [],
        summary: {
          totalRows: 0,
          imported: 0,
          failed: 0
        }
      };

      // Process each sheet
      for (const sheetName of workbook.SheetNames) {
        const worksheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(worksheet);
        
        logger.info(`Processing sheet: ${sheetName} with ${data.length} rows`);
        
        for (const row of data) {
          results.summary.totalRows++;
          
          try {
            const importResult = await this.processRow(row, sheetName, userId);
            results.success.push(importResult);
            results.summary.imported++;
          } catch (error) {
            results.failed.push({
              row: results.summary.totalRows,
              sheet: sheetName,
              data: row,
              error: error.message
            });
            results.summary.failed++;
          }
        }
      }

      return results;
    } catch (error) {
      logger.error('Excel import error:', error);
      throw error;
    }
  }

  async processRow(row, sheetName, userId) {
    // Determine category from sheet name or column
    const categoryName = row.Category || sheetName;
    
    // Get or create category
    let category = await db.prisma.productCategory.findFirst({
      where: { name: categoryName }
    });

    if (!category) {
      category = await db.prisma.productCategory.create({
        data: {
          name: categoryName,
          code: this.generateCategoryCode(categoryName)
        }
      });
    }

    // Get or create company
    let company = null;
    if (row.Company || row.Make) {
      const companyName = row.Company || row.Make;
      company = await db.prisma.company.findFirst({
        where: { name: companyName }
      });

      if (!company) {
        company = await db.prisma.company.create({
          data: {
            name: companyName,
            code: this.generateCompanyCode(companyName)
          }
        });
      }
    }

    // Get or create model
    let model = null;
    if (row.Model && company) {
      model = await db.prisma.productModel.findFirst({
        where: {
          name: row.Model,
          companyId: company.id
        }
      });

      if (!model) {
        model = await db.prisma.productModel.create({
          data: {
            name: row.Model,
            code: `${company.code}-${row.Model}`,
            categoryId: category.id,
            companyId: company.id
          }
        });
      }
    }

    // Process specifications
    const specifications = this.extractSpecifications(row, category.name);

    // Get or create vendor
    let vendor = null;
    if (row.Vendor || row.Supplier) {
      const vendorName = row.Vendor || row.Supplier;
      vendor = await db.prisma.vendor.findFirst({
        where: { name: vendorName }
      });

      if (!vendor) {
        vendor = await db.prisma.vendor.create({
          data: {
            name: vendorName,
            code: this.generateVendorCode(vendorName)
          }
        });
      }
    }

    // Create item
    const itemData = {
      serialNumber: row['Serial Number'] || row.SerialNumber || row.Serial,
      condition: row.Condition || 'New',
      status: this.mapStatus(row.Status),
      specifications,
      purchasePrice: this.parseNumber(row['Purchase Price'] || row.PurchasePrice || row.Price),
      inboundDate: this.parseDate(row['Inbound Date'] || row.InboundDate) || new Date(),
      categoryId: category.id,
      modelId: model?.id,
      vendorId: vendor?.id,
      createdById: userId,
      statusHistory: [{
        status: this.mapStatus(row.Status),
        date: new Date(),
        userId,
        notes: 'Imported from Excel'
      }]
    };

    // Add client details if item is sold/delivered
    if (itemData.status === 'Sold' || itemData.status === 'Delivered' || itemData.status === 'Handover') {
      itemData.clientName = row['Client Name'] || row.ClientName;
      itemData.clientCompany = row['Client Company'] || row.ClientCompany;
      itemData.clientNIC = row['Client NIC'] || row.ClientNIC || row.NIC;
      itemData.clientPhone = row['Client Phone'] || row.ClientPhone || row.Phone;
      itemData.clientEmail = row['Client Email'] || row.ClientEmail || row.Email;
      itemData.clientAddress = row['Client Address'] || row.ClientAddress || row.Address;
      itemData.outboundDate = this.parseDate(row['Outbound Date'] || row.OutboundDate) || new Date();
      itemData.sellingPrice = this.parseNumber(row['Selling Price'] || row.SellingPrice);
      
      // Handover specific
      if (itemData.status === 'Handover') {
        itemData.handoverTo = row['Handover To'] || row.HandoverTo;
        itemData.handoverDetails = row['Handover Details'] || row.HandoverDetails;
        itemData.handoverDate = this.parseDate(row['Handover Date'] || row.HandoverDate) || new Date();
      }
    }

    // Get default warehouse
    if (!itemData.warehouseId) {
      const defaultWarehouse = await db.prisma.warehouse.findFirst({
        where: { code: 'MAIN' }
      });
      itemData.warehouseId = defaultWarehouse?.id;
    }

    // Create the item
    const item = await db.prisma.item.create({
      data: itemData,
      include: {
        category: true,
        model: {
          include: {
            company: true
          }
        }
      }
    });

    return {
      serialNumber: item.serialNumber,
      status: 'imported',
      id: item.id
    };
  }

  extractSpecifications(row, categoryName) {
    const specs = {};
    
    // Category-specific specifications
    switch (categoryName) {
      case 'Lithium Battery':
        if (row.Voltage) specs.voltage = row.Voltage;
        if (row.Cells) specs.cells = parseInt(row.Cells) || row.Cells;
        if (row.BMS) specs.bms = row.BMS;
        if (row.LCD) specs.lcd = row.LCD;
        break;
      case 'Rectifier Back Plane':
        if (row.Slots) specs.slots = row.Slots;
        break;
      case 'Solar Panel':
        if (row.Watt) specs.watt = parseInt(row.Watt) || row.Watt;
        break;
    }

    // Check for any columns starting with "Spec_" for custom specifications
    Object.keys(row).forEach(key => {
      if (key.startsWith('Spec_')) {
        const specName = key.replace('Spec_', '').toLowerCase();
        specs[specName] = row[key];
      }
    });

    return Object.keys(specs).length > 0 ? specs : null;
  }

  mapStatus(status) {
    if (!status) return 'In Store';
    
    const statusMap = {
      'sold': 'Sold',
      'delivered': 'Delivered',
      'in store': 'In Store',
      'instore': 'In Store',
      'in hand': 'In Hand',
      'inhand': 'In Hand',
      'in lab': 'In Lab',
      'inlab': 'In Lab',
      'handover': 'Handover',
      'ho': 'Handover'
    };

    return statusMap[status.toLowerCase()] || 'In Store';
  }

  parseNumber(value) {
    if (!value) return null;
    const parsed = parseFloat(value.toString().replace(/[^0-9.-]/g, ''));
    return isNaN(parsed) ? null : parsed;
  }

  parseDate(value) {
    if (!value) return null;
    
    // If it's already a date object
    if (value instanceof Date) return value;
    
    // Try to parse string date
    const parsed = new Date(value);
    return isNaN(parsed.getTime()) ? null : parsed;
  }

  generateCategoryCode(name) {
    return name.split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .substring(0, 3);
  }

  generateCompanyCode(name) {
    return name.substring(0, 3).toUpperCase();
  }

  generateVendorCode(name) {
    return 'V' + name.substring(0, 3).toUpperCase();
  }

  /**
   * Export data to Excel template
   */
  async exportTemplate() {
    const workbook = XLSX.utils.book_new();

    // Create sheets for each category
    const categories = [
      'Lithium Battery',
      'Rectifier Back Plane',
      'Rectifier Module',
      'Solar Panel',
      'Solar Controller',
      'Solar Inverter'
    ];

    categories.forEach(category => {
      const headers = this.getHeadersForCategory(category);
      const worksheet = XLSX.utils.aoa_to_sheet([headers]);
      
      // Add sample row
      const sampleRow = this.getSampleRow(category);
      XLSX.utils.sheet_add_json(worksheet, [sampleRow], { 
        skipHeader: true, 
        origin: 'A2' 
      });

      // Set column widths
      const colWidths = headers.map(() => ({ wch: 15 }));
      worksheet['!cols'] = colWidths;

      XLSX.utils.book_append_sheet(workbook, worksheet, category);
    });

    // Convert to buffer
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    // Return buffer directly instead of uploading to Supabase
    const filename = `import_template_${Date.now()}.xlsx`;
    
    return { 
      filename, 
      buffer: buffer.toString('base64'),
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    };
  }

  getHeadersForCategory(category) {
    const baseHeaders = [
      'Serial Number',
      'Company',
      'Model',
      'Status',
      'Condition',
      'Purchase Price',
      'Inbound Date',
      'Vendor'
    ];

    const categorySpecificHeaders = {
      'Lithium Battery': ['Voltage', 'Cells', 'BMS', 'LCD'],
      'Rectifier Back Plane': ['Slots'],
      'Solar Panel': ['Watt'],
      'Rectifier Module': [],
      'Solar Controller': [],
      'Solar Inverter': []
    };

    const clientHeaders = [
      'Client Name',
      'Client Company',
      'Client NIC',
      'Client Phone',
      'Client Email',
      'Client Address',
      'Outbound Date',
      'Selling Price',
      'Handover To',
      'Handover Details'
    ];

    return [...baseHeaders, ...(categorySpecificHeaders[category] || []), ...clientHeaders];
  }

  getSampleRow(category) {
    const baseRow = {
      'Serial Number': 'SAMPLE-001',
      'Company': 'Vision',
      'Model': 'Model-X',
      'Status': 'In Store',
      'Condition': 'New',
      'Purchase Price': '50000',
      'Inbound Date': new Date().toISOString().split('T')[0],
      'Vendor': 'Vendor ABC'
    };

    const categorySpecificData = {
      'Lithium Battery': {
        'Voltage': '48V',
        'Cells': '16',
        'BMS': 'Supported',
        'LCD': 'Yes'
      },
      'Rectifier Back Plane': {
        'Slots': '5 Slots'
      },
      'Solar Panel': {
        'Watt': '585'
      }
    };

    return { ...baseRow, ...(categorySpecificData[category] || {}) };
  }

  /**
   * Validate Excel file before import
   */
  async validateExcelFile(fileBuffer) {
    try {
      const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
      const validation = {
        valid: true,
        errors: [],
        warnings: [],
        sheets: []
      };

      for (const sheetName of workbook.SheetNames) {
        const worksheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(worksheet);
        
        const sheetValidation = {
          name: sheetName,
          rowCount: data.length,
          errors: [],
          warnings: []
        };

        // Check for required columns
        if (data.length > 0) {
          const firstRow = data[0];
          
          if (!firstRow['Serial Number'] && !firstRow.SerialNumber && !firstRow.Serial) {
            sheetValidation.errors.push('Missing Serial Number column');
          }
        }

        // Check for duplicate serial numbers
        const serials = data.map(row => 
          row['Serial Number'] || row.SerialNumber || row.Serial
        ).filter(Boolean);
        
        const duplicates = serials.filter((serial, index) => 
          serials.indexOf(serial) !== index
        );
        
        if (duplicates.length > 0) {
          sheetValidation.warnings.push(`Duplicate serial numbers found: ${duplicates.join(', ')}`);
        }

        // Check existing serial numbers in database
        const existingSerials = await db.prisma.item.findMany({
          where: {
            serialNumber: { in: serials }
          },
          select: { serialNumber: true }
        });

        if (existingSerials.length > 0) {
          sheetValidation.errors.push(
            `Serial numbers already exist in database: ${existingSerials.map(i => i.serialNumber).join(', ')}`
          );
        }

        if (sheetValidation.errors.length > 0) {
          validation.valid = false;
          validation.errors.push(...sheetValidation.errors);
        }

        validation.sheets.push(sheetValidation);
      }

      return validation;
    } catch (error) {
      return {
        valid: false,
        errors: [`Failed to read Excel file: ${error.message}`],
        warnings: [],
        sheets: []
      };
    }
  }
}

module.exports = new ImportExportService();