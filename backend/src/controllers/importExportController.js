// ========== src/controllers/importExportController.js ==========
const asyncHandler = require('express-async-handler');
const importExportService = require('../services/importExportService');
const multer = require('multer');

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ];
    
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only Excel files are allowed.'));
    }
  }
});

// @desc    Import items from Excel (Template format)
// @route   POST /api/import/excel
// @access  Private
const importFromExcel = asyncHandler(async (req, res) => {
  if (!req.file) {
    res.status(400);
    throw new Error('No file uploaded');
  }

  const importType = req.body.importType || 'template';

  // Validate file first
  let validation;
  if (importType === 'samhan') {
    validation = await importExportService.validateSamhanFile(req.file.buffer);
  } else {
    validation = await importExportService.validateExcelFile(req.file.buffer);
  }

  if (!validation.valid) {
    res.status(400).json({
      success: false,
      message: 'Validation failed',
      validation
    });
    return;
  }

  // Create backup before import
  const backup = await importExportService.createImportBackup(req.user.id);

  try {
    // Import data
    const results = await importExportService.importFromExcel(
      req.file.buffer,
      req.user.id,
      importType
    );

    res.json({
      success: true,
      data: results,
      backup: backup
    });
  } catch (error) {
    // If import fails, we still have backup info for potential rollback
    res.status(500).json({
      success: false,
      message: error.message,
      backup: backup
    });
  }
});

// @desc    Import Samhan inventory file
// @route   POST /api/import/samhan
// @access  Private
const importSamhanFile = asyncHandler(async (req, res) => {
  if (!req.file) {
    res.status(400);
    throw new Error('No file uploaded');
  }

  // Validate Samhan file first
  const validation = await importExportService.validateSamhanFile(req.file.buffer);

  if (!validation.valid && validation.errors.length > 0) {
    res.status(400).json({
      success: false,
      message: 'Critical validation errors found',
      validation
    });
    return;
  }

  // Create backup before import
  const backup = await importExportService.createImportBackup(req.user.id);

  try {
    // Import data with Samhan format
    const results = await importExportService.importFromExcel(
      req.file.buffer,
      req.user.id,
      'samhan'
    );

    res.json({
      success: true,
      data: results,
      backup: backup,
      validation: validation
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
      backup: backup
    });
  }
});

// @desc    Rollback import
// @route   POST /api/import/rollback
// @access  Private
const rollbackImport = asyncHandler(async (req, res) => {
  const { backupId, importResults } = req.body;

  if (!backupId || !importResults) {
    res.status(400);
    throw new Error('Backup ID and import results are required');
  }

  const rollbackResult = await importExportService.rollbackImport(backupId, importResults);

  res.json({
    success: true,
    data: rollbackResult
  });
});

// @desc    Process manual review items
// @route   POST /api/import/manual-review
// @access  Private
const processManualReview = asyncHandler(async (req, res) => {
  const { reviewData } = req.body;

  if (!reviewData || !reviewData.items) {
    res.status(400);
    throw new Error('Review data is required');
  }

  const results = await importExportService.processManualReview(reviewData, req.user.id);

  res.json({
    success: true,
    data: results
  });
});

// @desc    Validate Excel file (supports both template and Samhan formats)
// @route   POST /api/import/validate
// @access  Private
const validateExcel = asyncHandler(async (req, res) => {
  if (!req.file) {
    res.status(400);
    throw new Error('No file uploaded');
  }

  const importType = req.body.importType || 'template';

  let validation;
  if (importType === 'samhan') {
    validation = await importExportService.validateSamhanFile(req.file.buffer);
  } else {
    validation = await importExportService.validateExcelFile(req.file.buffer);
  }

  res.json({
    success: true,
    data: validation,
    importType: importType
  });
});

// @desc    Download import template
// @route   GET /api/import/template
// @access  Private
const downloadTemplate = asyncHandler(async (req, res) => {
  const template = await importExportService.exportTemplate();

  // Set headers for file download
  res.setHeader('Content-Type', template.mimeType);
  res.setHeader('Content-Disposition', `attachment; filename="${template.filename}"`);
  res.setHeader('Content-Length', Buffer.from(template.buffer, 'base64').length);

  // Send the file buffer
  res.send(Buffer.from(template.buffer, 'base64'));
});

module.exports = {
  upload,
  importFromExcel,
  importSamhanFile,
  rollbackImport,
  processManualReview,
  validateExcel,
  downloadTemplate
};