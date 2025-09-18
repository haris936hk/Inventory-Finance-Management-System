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

// @desc    Import items from Excel
// @route   POST /api/import/excel
// @access  Private
const importFromExcel = asyncHandler(async (req, res) => {
  if (!req.file) {
    res.status(400);
    throw new Error('No file uploaded');
  }

  // Validate file first
  const validation = await importExportService.validateExcelFile(req.file.buffer);
  
  if (!validation.valid) {
    res.status(400).json({
      success: false,
      message: 'Validation failed',
      validation
    });
    return;
  }

  // Import data
  const results = await importExportService.importFromExcel(req.file.buffer, req.user.id);

  res.json({
    success: true,
    data: results
  });
});

// @desc    Validate Excel file
// @route   POST /api/import/validate
// @access  Private
const validateExcel = asyncHandler(async (req, res) => {
  if (!req.file) {
    res.status(400);
    throw new Error('No file uploaded');
  }

  const validation = await importExportService.validateExcelFile(req.file.buffer);

  res.json({
    success: true,
    data: validation
  });
});

// @desc    Download import template
// @route   GET /api/import/template
// @access  Private
const downloadTemplate = asyncHandler(async (req, res) => {
  const template = await importExportService.exportTemplate();

  res.json({
    success: true,
    data: template
  });
});

module.exports = {
  upload,
  importFromExcel,
  validateExcel,
  downloadTemplate
};