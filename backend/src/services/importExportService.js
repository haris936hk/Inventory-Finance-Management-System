// ========== src/services/importExportService.js ==========
const XLSX = require('xlsx');
const db = require('../config/database');
const logger = require('../config/logger');
const supabaseStorage = require('../config/supabase');

class ImportExportService {
  /**
   * Import items from Excel file with enhanced Samhan format support
   */
  async importFromExcel(fileBuffer, userId, importType = 'template') {
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
            let importResult;
            if (importType === 'samhan') {
              importResult = await this.processSamhanRow(row, sheetName, userId);
            } else {
              importResult = await this.processRow(row, sheetName, userId);
            }

            if (importResult.status === 'review_required') {
              results.failed.push({
                row: results.summary.totalRows,
                sheet: sheetName,
                data: row,
                error: importResult.reason,
                reviewRequired: true
              });
              results.summary.failed++;
            } else {
              results.success.push(importResult);
              results.summary.imported++;
            }
          } catch (error) {
            results.failed.push({
              row: results.summary.totalRows,
              sheet: sheetName,
              data: row,
              error: error.message,
              reviewRequired: false
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

  /**
   * Process Samhan-specific row format
   */
  async processSamhanRow(row, sheetName, userId) {
    try {
      // Handle undefined/empty values
      if (this.isRowEmpty(row)) {
        return {
          status: 'review_required',
          reason: 'Empty or incomplete row data'
        };
      }

      // Map Samhan sheet names to categories
      const categoryMapping = {
        'Vision': 'Lithium Battery',
        'Sacred Sun': 'Lithium Battery',
        'R&R ION': 'Lithium Battery',
        'RBPlane': 'Rectifier Back Plane',
        'RModule': 'Rectifier Module',
        'SController': 'Solar Controller',
        'SPanel': 'Solar Panel',
        'SInverter': 'Solar Inverter'
      };

      const categoryName = categoryMapping[sheetName] || row.Product || sheetName;

      // Validate required fields for Samhan format
      const validationResult = this.validateSamhanRow(row, sheetName);
      if (!validationResult.valid) {
        return {
          status: 'review_required',
          reason: validationResult.errors.join(', ')
        };
      }

      // Get or create category
      let category = await db.prisma.productCategory.findFirst({
        where: { name: categoryName }
      });

      if (!category) {
        category = await db.prisma.productCategory.create({
          data: {
            name: categoryName,
            code: this.generateCategoryCode(categoryName),
            isActive: true
          }
        });
      }

      // Get or create company
      let company = null;
      const companyName = row.Make;
      if (companyName && companyName !== 'undefined') {
        company = await db.prisma.company.findFirst({
          where: { name: companyName }
        });

        if (!company) {
          company = await db.prisma.company.create({
            data: {
              name: companyName,
              code: this.generateCompanyCode(companyName),
              isActive: true
            }
          });
        }
      }

      // Get or create model
      let model = null;
      const modelName = row.Model;
      if (modelName && modelName !== 'undefined' && company) {
        model = await db.prisma.productModel.findFirst({
          where: {
            name: modelName,
            companyId: company.id
          }
        });

        if (!model) {
          model = await db.prisma.productModel.create({
            data: {
              name: modelName,
              code: `${company.code}-${modelName}`,
              categoryId: category.id,
              companyId: company.id,
              isActive: true
            }
          });
        }
      }

      // Process Samhan specifications
      const specifications = this.extractSamhanSpecifications(row, categoryName);

      // Get default warehouse
      let warehouse = await db.prisma.warehouse.findFirst({
        where: { code: 'MAIN' }
      });

      if (!warehouse) {
        warehouse = await db.prisma.warehouse.create({
          data: {
            name: 'Main Warehouse',
            code: 'MAIN'
          }
        });
      }

      // Convert Excel date format
      const inboundDate = this.convertExcelDate(row['Inbound Date']) || new Date();
      const outboundDate = this.convertExcelDate(row['Outbound Date']);

      // Create item data
      const itemData = {
        serialNumber: row.Serial || `SAMHAN-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        condition: 'New', // Default for Samhan data
        status: this.mapSamhanStatus(row.Status),
        specifications,
        inboundDate,
        categoryId: category.id,
        modelId: model?.id,
        warehouseId: warehouse.id,
        createdById: userId,
        statusHistory: [{
          status: this.mapSamhanStatus(row.Status),
          date: inboundDate,
          userId,
          notes: `Imported from Samhan inventory (${sheetName})`
        }]
      };

      // Add client details if item is sold/delivered/handover
      if (['Sold', 'Delivered', 'Handover'].includes(itemData.status)) {
        itemData.clientName = row.Client;
        itemData.clientNIC = row.NIC;
        itemData.clientPhone = row.CELL;
        itemData.outboundDate = outboundDate || new Date();

        if (itemData.status === 'Handover') {
          itemData.handoverTo = row['Hand over To'];
          itemData.handoverBy = row['Handover By'];
          itemData.handoverDetails = row['HO Details'];
          itemData.handoverDate = outboundDate || new Date();
        }
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
        id: item.id,
        sheet: sheetName,
        category: categoryName
      };

    } catch (error) {
      logger.error('Samhan row processing error:', error);
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
          code: this.generateCategoryCode(categoryName),
          isActive: true
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
            code: this.generateCompanyCode(companyName),
            isActive: true
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
            companyId: company.id,
            isActive: true
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
   * Validation methods for Samhan format
   */
  isRowEmpty(row) {
    const requiredFields = ['Serial', 'Make', 'Status'];
    return requiredFields.every(field =>
      !row[field] || row[field] === 'undefined' || row[field] === ''
    );
  }

  validateSamhanRow(row, sheetName) {
    const errors = [];

    // Check for missing serial number
    if (!row.Serial || row.Serial === 'undefined' || row.Serial === 'NA') {
      errors.push('Missing or invalid serial number');
    }

    // Check for undefined values in critical fields
    if (row.Make === 'undefined') {
      errors.push('Make/Company is undefined');
    }

    if (row.Model === 'undefined') {
      errors.push('Model is undefined');
    }

    if (row.Status === 'undefined') {
      errors.push('Status is undefined');
    }

    // Sheet-specific validation
    if (sheetName === 'SController' || sheetName === 'SInverter') {
      // These sheets have many undefined values, require manual review
      if (Object.values(row).filter(val => val === 'undefined').length > 5) {
        errors.push(`Too many undefined values in ${sheetName} sheet`);
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  mapSamhanStatus(status) {
    if (!status || status === 'undefined') return 'In Store';

    const statusMap = {
      'sold': 'Sold',
      'delivered': 'Delivered',
      'in store': 'In Store',
      'in lab': 'In Lab',
      'handover': 'Handover'
    };

    return statusMap[status.toLowerCase()] || 'In Store';
  }

  convertExcelDate(excelDate) {
    if (!excelDate || excelDate === 'undefined') return null;

    // If it's already a valid date
    if (excelDate instanceof Date) return excelDate;

    // Convert Excel serial date (e.g., 45842) to JavaScript Date
    if (typeof excelDate === 'number' && excelDate > 40000) {
      // Excel epoch starts from 1900-01-01, but JavaScript from 1970-01-01
      // Excel has a leap year bug for 1900, so we subtract 2 days
      const millisecondsPerDay = 24 * 60 * 60 * 1000;
      const excelEpoch = new Date(1899, 11, 30); // December 30, 1899
      return new Date(excelEpoch.getTime() + (excelDate * millisecondsPerDay));
    }

    // Try to parse as regular date string
    const parsed = new Date(excelDate);
    return isNaN(parsed.getTime()) ? null : parsed;
  }

  extractSamhanSpecifications(row, categoryName) {
    const specs = {};

    // Battery-specific specifications
    if (categoryName === 'Lithium Battery') {
      if (row.Voltage && row.Voltage !== 'undefined') {
        specs.voltage = row.Voltage.toString().replace(' Volt', 'V');
      }
      if (row.Cells && row.Cells !== 'undefined') {
        specs.cells = parseInt(row.Cells) || row.Cells;
      }
      if (row.BMS && row.BMS !== 'undefined') {
        specs.bms = row.BMS;
      }
      if (row.LCD && row.LCD !== 'undefined') {
        specs.lcd = row.LCD;
      }
    }

    // Rectifier Back Plane specifications
    if (categoryName === 'Rectifier Back Plane') {
      if (row.Slots && row.Slots !== 'undefined') {
        specs.slots = row.Slots;
      }
    }

    // Solar Panel specifications
    if (categoryName === 'Solar Panel') {
      if (row.Watt && row.Watt !== 'undefined') {
        const wattValue = row.Watt.toString().replace(' Watt', '');
        specs.watt = parseInt(wattValue) || wattValue;
      }
    }

    return Object.keys(specs).length > 0 ? specs : null;
  }

  /**
   * Create backup before import for rollback capability
   */
  async createImportBackup(userId) {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupId = `backup_${timestamp}_${userId}`;

      // Get current counts for verification
      const counts = await db.prisma.$transaction([
        db.prisma.item.count(),
        db.prisma.productCategory.count(),
        db.prisma.company.count(),
        db.prisma.productModel.count(),
        db.prisma.warehouse.count()
      ]);

      const backup = {
        id: backupId,
        timestamp: new Date(),
        userId,
        preCounts: {
          items: counts[0],
          categories: counts[1],
          companies: counts[2],
          models: counts[3],
          warehouses: counts[4]
        }
      };

      logger.info(`Created import backup: ${backupId}`, backup);
      return backup;
    } catch (error) {
      logger.error('Failed to create backup:', error);
      throw error;
    }
  }

  /**
   * Rollback import using backup information
   */
  async rollbackImport(backupId, importResults) {
    try {
      logger.info(`Starting rollback for backup: ${backupId}`);

      // Delete imported items
      if (importResults.success && importResults.success.length > 0) {
        const itemIds = importResults.success.map(item => item.id).filter(Boolean);

        if (itemIds.length > 0) {
          await db.prisma.item.deleteMany({
            where: { id: { in: itemIds } }
          });
          logger.info(`Deleted ${itemIds.length} imported items`);
        }
      }

      // Note: We don't delete categories, companies, or models as they might be reused
      // This prevents accidental deletion of existing data

      logger.info(`Rollback completed for backup: ${backupId}`);
      return { success: true, message: 'Import rolled back successfully' };
    } catch (error) {
      logger.error('Rollback failed:', error);
      throw error;
    }
  }

  /**
   * Manual review workflow for problematic records
   */
  async processManualReview(reviewData, userId) {
    const results = {
      processed: [],
      failed: []
    };

    for (const item of reviewData.items) {
      try {
        // User has reviewed and corrected the data
        const correctedRow = item.correctedData || item.originalData;
        const importResult = await this.processSamhanRow(correctedRow, item.sheet, userId);

        if (importResult.status === 'imported') {
          results.processed.push(importResult);
        } else {
          results.failed.push({
            ...item,
            error: importResult.reason
          });
        }
      } catch (error) {
        results.failed.push({
          ...item,
          error: error.message
        });
      }
    }

    return results;
  }

  /**
   * Validate Samhan file before import
   */
  async validateSamhanFile(fileBuffer) {
    try {
      const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
      const validation = {
        valid: true,
        errors: [],
        warnings: [],
        sheets: [],
        summary: {
          totalRows: 0,
          validRows: 0,
          reviewRequired: 0,
          duplicateSerials: []
        }
      };

      const allSerials = [];

      for (const sheetName of workbook.SheetNames) {
        const worksheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(worksheet);

        const sheetValidation = {
          name: sheetName,
          rowCount: data.length,
          validRows: 0,
          reviewRequired: 0,
          errors: [],
          warnings: []
        };

        for (const row of data) {
          validation.summary.totalRows++;

          // Validate each row
          const rowValidation = this.validateSamhanRow(row, sheetName);

          if (rowValidation.valid) {
            sheetValidation.validRows++;
            validation.summary.validRows++;
          } else {
            sheetValidation.reviewRequired++;
            validation.summary.reviewRequired++;
            sheetValidation.warnings.push(`Row with serial ${row.Serial}: ${rowValidation.errors.join(', ')}`);
          }

          // Collect serial numbers for duplicate check (only valid strings)
          if (row.Serial &&
              row.Serial !== 'undefined' &&
              row.Serial !== 'NA' &&
              typeof row.Serial === 'string' &&
              row.Serial.trim() !== '') {
            allSerials.push(row.Serial);
          }
        }

        // Check for duplicates within file
        const sheetSerials = data.map(row => row.Serial).filter(serial =>
          serial && serial !== 'undefined' && serial !== 'NA' && typeof serial === 'string' && serial.trim() !== ''
        );
        const duplicates = sheetSerials.filter((serial, index) =>
          sheetSerials.indexOf(serial) !== index
        );

        if (duplicates.length > 0) {
          sheetValidation.warnings.push(`Duplicate serials in sheet: ${[...new Set(duplicates)].join(', ')}`);
        }

        validation.sheets.push(sheetValidation);
      }

      // Check for duplicates across all sheets
      const globalDuplicates = allSerials.filter((serial, index) =>
        allSerials.indexOf(serial) !== index
      );
      validation.summary.duplicateSerials = [...new Set(globalDuplicates)];

      // Check existing serial numbers in database
      if (allSerials.length > 0) {
        const existingSerials = await db.prisma.item.findMany({
          where: { serialNumber: { in: allSerials } },
          select: { serialNumber: true }
        });

        if (existingSerials.length > 0) {
          validation.errors.push(
            `Serial numbers already exist in database: ${existingSerials.map(i => i.serialNumber).join(', ')}`
          );
          validation.valid = false;
        }
      }

      return validation;
    } catch (error) {
      return {
        valid: false,
        errors: [`Failed to validate Samhan file: ${error.message}`],
        warnings: [],
        sheets: [],
        summary: { totalRows: 0, validRows: 0, reviewRequired: 0, duplicateSerials: [] }
      };
    }
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