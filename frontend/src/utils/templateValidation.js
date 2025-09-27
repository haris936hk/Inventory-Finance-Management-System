// ========== Template Validation Utilities ==========

// Supported field types and their configurations
export const FIELD_TYPES = {
  number: {
    label: 'Number',
    icon: '🔢',
    description: 'Numeric input with optional units',
    supportedValidations: ['required', 'min', 'max', 'decimals'],
    defaultConfig: {
      type: 'number',
      required: false,
      validation: {
        min: 0,
        decimals: 2
      }
    }
  },
  select: {
    label: 'Select',
    icon: '📋',
    description: 'Dropdown selection from predefined options',
    supportedValidations: ['required'],
    defaultConfig: {
      type: 'select',
      required: false,
      options: ['Option 1', 'Option 2']
    }
  },
  boolean: {
    label: 'Yes/No',
    icon: '✅',
    description: 'True/false toggle switch',
    supportedValidations: ['required'],
    defaultConfig: {
      type: 'boolean',
      required: false,
      defaultValue: false
    }
  }
};

// Common units for number fields
export const COMMON_UNITS = {
  voltage: ['V', 'mV', 'kV'],
  current: ['A', 'mA', 'kA'],
  capacity: ['Ah', 'mAh', 'kAh'],
  power: ['W', 'mW', 'kW', 'MW'],
  weight: ['g', 'kg', 'lb'],
  dimension: ['mm', 'cm', 'm', 'in', 'ft'],
  temperature: ['°C', '°F', 'K'],
  frequency: ['Hz', 'kHz', 'MHz'],
  resistance: ['Ω', 'mΩ', 'kΩ', 'MΩ']
};

// Reserved field names that cannot be used
export const RESERVED_FIELD_NAMES = [
  'id', 'name', 'code', 'serialNumber', 'status', 'specifications',
  'createdAt', 'updatedAt', 'deletedAt', 'modelId', 'categoryId',
  'vendorId', 'warehouseId', 'inboundDate', 'outboundDate'
];

// Validation functions
export const validateFieldName = (name, existingFields = []) => {
  const errors = [];

  if (!name || !name.trim()) {
    errors.push('Field name is required');
    return errors;
  }

  const trimmedName = name.trim();

  // Check if it's a reserved name
  if (RESERVED_FIELD_NAMES.includes(trimmedName.toLowerCase())) {
    errors.push('This field name is reserved and cannot be used');
  }

  // Check format (camelCase or snake_case)
  if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(trimmedName)) {
    errors.push('Field name must start with a letter and contain only letters, numbers, and underscores');
  }

  // Check uniqueness
  if (existingFields.some(field => field.toLowerCase() === trimmedName.toLowerCase())) {
    errors.push('Field name already exists in this template');
  }

  // Check length
  if (trimmedName.length > 50) {
    errors.push('Field name must be 50 characters or less');
  }

  return errors;
};

export const validateFieldLabel = (label) => {
  const errors = [];

  if (!label || !label.trim()) {
    errors.push('Field label is required');
    return errors;
  }

  if (label.trim().length > 100) {
    errors.push('Field label must be 100 characters or less');
  }

  return errors;
};

export const validateSelectOptions = (options) => {
  const errors = [];

  if (!Array.isArray(options) || options.length < 2) {
    errors.push('Select fields must have at least 2 options');
    return errors;
  }

  // Check for empty options
  const emptyOptions = options.filter(opt => !opt || !opt.trim());
  if (emptyOptions.length > 0) {
    errors.push('All options must have a value');
  }

  // Check for duplicates
  const uniqueOptions = [...new Set(options.map(opt => opt.trim().toLowerCase()))];
  if (uniqueOptions.length !== options.length) {
    errors.push('Options must be unique');
  }

  // Check option length
  const longOptions = options.filter(opt => opt.trim().length > 100);
  if (longOptions.length > 0) {
    errors.push('Options must be 100 characters or less');
  }

  return errors;
};

export const validateNumberValidation = (validation) => {
  const errors = [];
  const { min, max, decimals } = validation || {};

  if (min !== undefined && max !== undefined && Number(min) >= Number(max)) {
    errors.push('Minimum value must be less than maximum value');
  }

  if (decimals !== undefined && (decimals < 0 || decimals > 10)) {
    errors.push('Decimal places must be between 0 and 10');
  }

  return errors;
};


export const validateField = (field, existingFields = []) => {
  const errors = [];

  // Validate field name
  const nameErrors = validateFieldName(field.fieldName, existingFields);
  errors.push(...nameErrors);

  // Validate field label
  const labelErrors = validateFieldLabel(field.label);
  errors.push(...labelErrors);

  // Type-specific validation
  switch (field.type) {
    case 'select':
      const optionErrors = validateSelectOptions(field.options);
      errors.push(...optionErrors);
      break;

    case 'number':
      const numberErrors = validateNumberValidation(field.validation);
      errors.push(...numberErrors);
      break;
  }

  return errors;
};

export const validateTemplate = (template) => {
  const errors = [];
  const warnings = [];

  if (!template || typeof template !== 'object') {
    errors.push('Invalid template format');
    return { errors, warnings };
  }

  const fields = Object.keys(template);

  // Check template size
  if (fields.length === 0) {
    warnings.push('Template has no fields defined');
  }

  if (fields.length > 50) {
    errors.push('Template cannot have more than 50 fields');
  }

  // Validate each field
  fields.forEach(fieldName => {
    const field = template[fieldName];
    const fieldErrors = validateField({
      fieldName,
      ...field
    }, fields.filter(f => f !== fieldName));

    fieldErrors.forEach(error => {
      errors.push(`Field "${fieldName}": ${error}`);
    });
  });

  // Check for circular dependencies (if we implement field dependencies later)
  // This is a placeholder for future enhancement

  return { errors, warnings };
};

export const generateFieldName = (label) => {
  if (!label) return '';

  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-zA-Z0-9\s]/g, '') // Remove special characters
    .replace(/\s+/g, '_') // Replace spaces with underscores
    .replace(/^_+|_+$/g, '') // Remove leading/trailing underscores
    .slice(0, 50); // Limit length
};

export const getFieldTypeInfo = (type) => {
  return FIELD_TYPES[type] || FIELD_TYPES.select;
};

export const createEmptyField = (type = 'number') => {
  const typeInfo = getFieldTypeInfo(type);
  return {
    ...typeInfo.defaultConfig,
    fieldName: '',
    label: '',
    helpText: '',
    order: 0
  };
};

export const sanitizeTemplate = (template) => {
  const sanitized = {};

  Object.keys(template).forEach(fieldName => {
    const field = template[fieldName];
    const typeInfo = getFieldTypeInfo(field.type);

    // Only include supported properties for this field type
    sanitized[fieldName] = {
      type: field.type,
      label: field.label || fieldName,
      required: Boolean(field.required),
      helpText: field.helpText || '',
      order: Number(field.order) || 0
    };

    // Add type-specific properties
    if (field.type === 'select' && Array.isArray(field.options)) {
      sanitized[fieldName].options = field.options.filter(opt => opt && opt.trim());
    }

    if (field.type === 'number') {
      if (field.unit) sanitized[fieldName].unit = field.unit;
      if (field.validation) {
        sanitized[fieldName].validation = {};
        if (field.validation.min !== undefined) sanitized[fieldName].validation.min = Number(field.validation.min);
        if (field.validation.max !== undefined) sanitized[fieldName].validation.max = Number(field.validation.max);
        if (field.validation.decimals !== undefined) sanitized[fieldName].validation.decimals = Number(field.validation.decimals);
      }
    }


    if (field.defaultValue !== undefined) {
      sanitized[fieldName].defaultValue = field.defaultValue;
    }

    if (field.placeholder) {
      sanitized[fieldName].placeholder = field.placeholder;
    }
  });

  return sanitized;
};