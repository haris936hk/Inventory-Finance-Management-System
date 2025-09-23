// ========== Field Configuration Modal Component ==========

import React, { useState, useEffect, useMemo } from 'react';
import {
  Modal, Form, Input, Select, Switch, InputNumber, Button, Space, Alert,
  Card, Divider, Typography, Tag, Tooltip, Row, Col, List, Badge
} from 'antd';
import {
  InfoCircleOutlined, PlusOutlined, DeleteOutlined, DragOutlined,
  EyeOutlined, CheckCircleOutlined, ExclamationCircleOutlined
} from '@ant-design/icons';
import {
  FIELD_TYPES, COMMON_UNITS, validateField, generateFieldName,
  createEmptyField, getFieldTypeInfo
} from '../utils/templateValidation';

const { Title, Text, Paragraph } = Typography;
const { Option } = Select;
const { TextArea } = Input;

const FieldConfigurationModal = ({
  visible,
  onCancel,
  onSave,
  field = null,
  existingFields = [],
  mode = 'create' // 'create' or 'edit'
}) => {
  const [form] = Form.useForm();
  const [fieldType, setFieldType] = useState('text');
  const [options, setOptions] = useState(['']);
  const [newOption, setNewOption] = useState('');
  const [validationErrors, setValidationErrors] = useState([]);
  const [previewValue, setPreviewValue] = useState('');

  // Initialize form when modal opens
  useEffect(() => {
    if (visible) {
      if (field && mode === 'edit') {
        // Editing existing field
        form.setFieldsValue({
          fieldName: field.fieldName,
          label: field.label,
          type: field.type,
          required: field.required,
          helpText: field.helpText,
          placeholder: field.placeholder,
          defaultValue: field.defaultValue,
          unit: field.unit,
          ...field.validation
        });
        setFieldType(field.type);
        setOptions(field.options || ['']);
      } else {
        // Creating new field
        const emptyField = createEmptyField(fieldType);
        form.setFieldsValue(emptyField);
        setOptions(['']);
      }
    }
  }, [visible, field, mode, fieldType, form]);

  // Auto-generate field name from label
  const handleLabelChange = (e) => {
    const label = e.target.value;
    if (mode === 'create') {
      const generatedName = generateFieldName(label);
      form.setFieldValue('fieldName', generatedName);
    }
  };

  // Real-time validation
  const currentFieldData = useMemo(() => {
    const values = form.getFieldsValue();
    return {
      fieldName: values.fieldName,
      label: values.label,
      type: fieldType,
      required: values.required,
      helpText: values.helpText,
      placeholder: values.placeholder,
      defaultValue: values.defaultValue,
      unit: values.unit,
      options: fieldType === 'select' ? options.filter(opt => opt.trim()) : undefined,
      validation: {
        min: values.min,
        max: values.max,
        decimals: values.decimals,
        minLength: values.minLength,
        maxLength: values.maxLength,
        pattern: values.pattern
      }
    };
  }, [form.getFieldsValue(), fieldType, options]);

  useEffect(() => {
    const existingFieldNames = existingFields.filter(f => f !== field?.fieldName);
    const errors = validateField(currentFieldData, existingFieldNames);
    setValidationErrors(errors);
  }, [currentFieldData, existingFields, field]);

  // Handle field type change
  const handleTypeChange = (type) => {
    setFieldType(type);
    const typeInfo = getFieldTypeInfo(type);
    form.setFieldsValue(typeInfo.defaultConfig);

    if (type === 'select') {
      setOptions(['Option 1', 'Option 2']);
    }
  };

  // Handle select options
  const addOption = () => {
    if (newOption.trim()) {
      setOptions([...options.filter(opt => opt.trim()), newOption.trim()]);
      setNewOption('');
    }
  };

  const removeOption = (index) => {
    setOptions(options.filter((_, i) => i !== index));
  };

  const updateOption = (index, value) => {
    const newOptions = [...options];
    newOptions[index] = value;
    setOptions(newOptions);
  };

  // Handle save
  const handleSave = () => {
    form.validateFields().then(values => {
      if (validationErrors.length > 0) {
        return;
      }

      const fieldData = {
        ...values,
        type: fieldType,
        options: fieldType === 'select' ? options.filter(opt => opt.trim()) : undefined,
        validation: fieldType === 'number' || fieldType === 'text' ? {
          ...(values.min !== undefined && { min: values.min }),
          ...(values.max !== undefined && { max: values.max }),
          ...(values.decimals !== undefined && { decimals: values.decimals }),
          ...(values.minLength !== undefined && { minLength: values.minLength }),
          ...(values.maxLength !== undefined && { maxLength: values.maxLength }),
          ...(values.pattern && { pattern: values.pattern })
        } : undefined
      };

      onSave(fieldData);
      onCancel();
    });
  };

  // Render field preview
  const renderFieldPreview = () => {
    const typeInfo = getFieldTypeInfo(fieldType);

    switch (fieldType) {
      case 'text':
        return (
          <Input
            placeholder={currentFieldData.placeholder || `Enter ${currentFieldData.label || 'value'}`}
            value={previewValue}
            onChange={(e) => setPreviewValue(e.target.value)}
          />
        );

      case 'number':
        return (
          <InputNumber
            placeholder={currentFieldData.placeholder || `Enter ${currentFieldData.label || 'number'}`}
            style={{ width: '100%' }}
            addonAfter={currentFieldData.unit}
            min={currentFieldData.validation?.min}
            max={currentFieldData.validation?.max}
            precision={currentFieldData.validation?.decimals}
            value={previewValue}
            onChange={setPreviewValue}
          />
        );

      case 'select':
        const selectOptions = options.filter(opt => opt.trim());
        return (
          <Select
            placeholder={currentFieldData.placeholder || `Select ${currentFieldData.label || 'option'}`}
            style={{ width: '100%' }}
            value={previewValue}
            onChange={setPreviewValue}
          >
            {selectOptions.map((option, index) => (
              <Option key={index} value={option}>{option}</Option>
            ))}
          </Select>
        );

      case 'boolean':
        return (
          <Switch
            checked={previewValue}
            onChange={setPreviewValue}
            checkedChildren="Yes"
            unCheckedChildren="No"
          />
        );

      case 'date':
        return (
          <Input
            type="date"
            value={previewValue}
            onChange={(e) => setPreviewValue(e.target.value)}
          />
        );

      default:
        return <Input placeholder="Preview not available" disabled />;
    }
  };

  const typeInfo = getFieldTypeInfo(fieldType);
  const hasErrors = validationErrors.length > 0;

  return (
    <Modal
      title={
        <Space>
          <span>{mode === 'edit' ? 'Edit' : 'Add'} Field</span>
          <Tag color={hasErrors ? 'red' : 'green'}>
            {hasErrors ? `${validationErrors.length} Error${validationErrors.length > 1 ? 's' : ''}` : 'Valid'}
          </Tag>
        </Space>
      }
      open={visible}
      onCancel={onCancel}
      width={800}
      footer={[
        <Button key="cancel" onClick={onCancel}>
          Cancel
        </Button>,
        <Button
          key="save"
          type="primary"
          onClick={handleSave}
          disabled={hasErrors}
          icon={<CheckCircleOutlined />}
        >
          {mode === 'edit' ? 'Update' : 'Add'} Field
        </Button>
      ]}
    >
      <Row gutter={16}>
        <Col span={14}>
          <Form form={form} layout="vertical">
            {/* Field Type Selector */}
            <Card size="small" title="Field Type" style={{ marginBottom: 16 }}>
              <Select
                value={fieldType}
                onChange={handleTypeChange}
                style={{ width: '100%' }}
                size="large"
              >
                {Object.entries(FIELD_TYPES).map(([key, type]) => (
                  <Option key={key} value={key}>
                    <Space>
                      <span style={{ fontSize: '16px' }}>{type.icon}</span>
                      <div>
                        <div><strong>{type.label}</strong></div>
                        <div style={{ fontSize: '12px', color: '#666' }}>{type.description}</div>
                      </div>
                    </Space>
                  </Option>
                ))}
              </Select>
            </Card>

            {/* Basic Configuration */}
            <Card size="small" title="Basic Configuration" style={{ marginBottom: 16 }}>
              <Form.Item
                label="Field Label"
                name="label"
                rules={[{ required: true, message: 'Label is required' }]}
              >
                <Input
                  placeholder="e.g., Battery Voltage"
                  onChange={handleLabelChange}
                />
              </Form.Item>

              <Form.Item
                label={
                  <Space>
                    Field Name
                    <Tooltip title="Used internally for data storage. Auto-generated from label.">
                      <InfoCircleOutlined />
                    </Tooltip>
                  </Space>
                }
                name="fieldName"
                rules={[
                  { required: true, message: 'Field name is required' },
                  { pattern: /^[a-zA-Z][a-zA-Z0-9_]*$/, message: 'Invalid field name format' }
                ]}
              >
                <Input
                  placeholder="e.g., batteryVoltage"
                  disabled={mode === 'edit'}
                />
              </Form.Item>

              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item
                    label="Required Field"
                    name="required"
                    valuePropName="checked"
                  >
                    <Switch checkedChildren="Yes" unCheckedChildren="No" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  {fieldType === 'number' && (
                    <Form.Item label="Unit" name="unit">
                      <Select placeholder="Select unit" allowClear>
                        {Object.entries(COMMON_UNITS).map(([category, units]) => (
                          <Select.OptGroup key={category} label={category.charAt(0).toUpperCase() + category.slice(1)}>
                            {units.map(unit => (
                              <Option key={unit} value={unit}>{unit}</Option>
                            ))}
                          </Select.OptGroup>
                        ))}
                      </Select>
                    </Form.Item>
                  )}
                </Col>
              </Row>

              <Form.Item label="Help Text" name="helpText">
                <TextArea
                  rows={2}
                  placeholder="Optional help text for users"
                  maxLength={200}
                  showCount
                />
              </Form.Item>

              <Form.Item label="Placeholder" name="placeholder">
                <Input placeholder="Placeholder text for the input field" />
              </Form.Item>
            </Card>

            {/* Type-specific Configuration */}
            {fieldType === 'select' && (
              <Card size="small" title="Options Configuration" style={{ marginBottom: 16 }}>
                <div style={{ marginBottom: 12 }}>
                  <Space style={{ width: '100%' }}>
                    <Input
                      placeholder="Add new option"
                      value={newOption}
                      onChange={(e) => setNewOption(e.target.value)}
                      onPressEnter={addOption}
                      style={{ flex: 1 }}
                    />
                    <Button
                      icon={<PlusOutlined />}
                      onClick={addOption}
                      disabled={!newOption.trim()}
                    >
                      Add
                    </Button>
                  </Space>
                </div>

                <List
                  size="small"
                  dataSource={options.filter(opt => opt.trim())}
                  renderItem={(option, index) => (
                    <List.Item
                      actions={[
                        <Button
                          size="small"
                          danger
                          icon={<DeleteOutlined />}
                          onClick={() => removeOption(index)}
                        />
                      ]}
                    >
                      <Input
                        value={option}
                        onChange={(e) => updateOption(index, e.target.value)}
                        style={{ flex: 1 }}
                      />
                    </List.Item>
                  )}
                />
              </Card>
            )}

            {fieldType === 'number' && (
              <Card size="small" title="Number Validation" style={{ marginBottom: 16 }}>
                <Row gutter={16}>
                  <Col span={8}>
                    <Form.Item label="Minimum" name="min">
                      <InputNumber style={{ width: '100%' }} placeholder="Min" />
                    </Form.Item>
                  </Col>
                  <Col span={8}>
                    <Form.Item label="Maximum" name="max">
                      <InputNumber style={{ width: '100%' }} placeholder="Max" />
                    </Form.Item>
                  </Col>
                  <Col span={8}>
                    <Form.Item label="Decimals" name="decimals">
                      <InputNumber min={0} max={10} style={{ width: '100%' }} />
                    </Form.Item>
                  </Col>
                </Row>
              </Card>
            )}

            {fieldType === 'text' && (
              <Card size="small" title="Text Validation" style={{ marginBottom: 16 }}>
                <Row gutter={16}>
                  <Col span={12}>
                    <Form.Item label="Min Length" name="minLength">
                      <InputNumber min={0} style={{ width: '100%' }} />
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item label="Max Length" name="maxLength">
                      <InputNumber min={1} style={{ width: '100%' }} />
                    </Form.Item>
                  </Col>
                </Row>

                <Form.Item label="Pattern (RegEx)" name="pattern">
                  <Input placeholder="^[A-Z0-9]+$ (optional)" />
                </Form.Item>
              </Card>
            )}
          </Form>
        </Col>

        <Col span={10}>
          {/* Preview Panel */}
          <Card
            size="small"
            title={
              <Space>
                <EyeOutlined />
                Live Preview
              </Space>
            }
            style={{ marginBottom: 16 }}
          >
            <Form.Item
              label={currentFieldData.label || 'Field Label'}
              required={currentFieldData.required}
              help={currentFieldData.helpText}
            >
              {renderFieldPreview()}
            </Form.Item>
          </Card>

          {/* Validation Status */}
          <Card
            size="small"
            title={
              <Space>
                {hasErrors ? <ExclamationCircleOutlined style={{ color: '#ff4d4f' }} /> : <CheckCircleOutlined style={{ color: '#52c41a' }} />}
                Validation Status
              </Space>
            }
          >
            {hasErrors ? (
              <Alert
                type="error"
                showIcon
                message={`${validationErrors.length} Error${validationErrors.length > 1 ? 's' : ''} Found`}
                description={
                  <ul style={{ margin: 0, paddingLeft: 20 }}>
                    {validationErrors.map((error, index) => (
                      <li key={index}>{error}</li>
                    ))}
                  </ul>
                }
              />
            ) : (
              <Alert
                type="success"
                showIcon
                message="Field Configuration Valid"
                description="All validation checks passed successfully."
              />
            )}
          </Card>

          {/* Field Summary */}
          <Card size="small" title="Field Summary" style={{ marginTop: 16 }}>
            <Space direction="vertical" style={{ width: '100%' }}>
              <div><Text strong>Type:</Text> {typeInfo.label} {typeInfo.icon}</div>
              <div><Text strong>Required:</Text> {currentFieldData.required ? 'Yes' : 'No'}</div>
              {currentFieldData.unit && <div><Text strong>Unit:</Text> {currentFieldData.unit}</div>}
              {fieldType === 'select' && (
                <div>
                  <Text strong>Options:</Text> {options.filter(opt => opt.trim()).length} defined
                </div>
              )}
            </Space>
          </Card>
        </Col>
      </Row>
    </Modal>
  );
};

export default FieldConfigurationModal;