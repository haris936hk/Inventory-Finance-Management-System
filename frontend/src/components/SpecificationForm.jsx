import React, { useState, useEffect } from 'react';
import {
  Form, Input, InputNumber, Select, Switch, Space, Button, Row, Col,
  Typography, Tag, Tooltip, Alert, Divider, Card
} from 'antd';
import { InfoCircleOutlined, BulbOutlined } from '@ant-design/icons';

const { Text } = Typography;
const { Option } = Select;
const { TextArea } = Input;

const SpecificationForm = ({
  template = {},
  initialValues = {},
  onValuesChange,
  showNotes = true,
  layout = 'vertical'
}) => {
  const [form] = Form.useForm();
  const [specifications, setSpecifications] = useState(initialValues.specifications || {});
  const [notes, setNotes] = useState(initialValues.notes || '');

  // Parse template fields and sort by order
  const templateFields = Object.entries(template)
    .map(([fieldName, field]) => ({
      fieldName,
      ...field
    }))
    .sort((a, b) => (a.order || 0) - (b.order || 0));

  useEffect(() => {
    // Initialize form values with existing specifications
    const formValues = {};
    templateFields.forEach(field => {
      formValues[field.fieldName] = specifications[field.fieldName] || field.defaultValue || '';
    });
    form.setFieldsValue(formValues);
  }, [template, specifications]);

  const handleFieldChange = (fieldName, value) => {
    const updatedSpecs = { ...specifications, [fieldName]: value };
    setSpecifications(updatedSpecs);

    if (onValuesChange) {
      onValuesChange({
        specifications: updatedSpecs,
        notes
      });
    }
  };

  const handleNotesChange = (e) => {
    const newNotes = e.target.value;
    setNotes(newNotes);

    if (onValuesChange) {
      onValuesChange({
        specifications,
        notes: newNotes
      });
    }
  };

  const renderField = (field) => {
    const { fieldName, type, label, required, unit, validation, options, placeholder, helpText } = field;
    const value = specifications[fieldName];

    const fieldLabel = (
      <Space>
        <Text strong>{label}</Text>
        {unit && <Tag size="small">{unit}</Tag>}
        {required && <Tag color="red" size="small">Required</Tag>}
        {helpText && (
          <Tooltip title={helpText}>
            <InfoCircleOutlined style={{ color: '#1890ff' }} />
          </Tooltip>
        )}
      </Space>
    );

    const rules = [];
    if (required) {
      rules.push({ required: true, message: `${label} is required` });
    }
    if (validation?.min !== undefined) {
      rules.push({ min: validation.min, type: 'number', message: `Minimum value is ${validation.min}` });
    }
    if (validation?.max !== undefined) {
      rules.push({ max: validation.max, type: 'number', message: `Maximum value is ${validation.max}` });
    }

    switch (type) {
      case 'number':
        return (
          <Form.Item
            key={fieldName}
            name={fieldName}
            label={fieldLabel}
            rules={rules}
          >
            <InputNumber
              style={{ width: '100%' }}
              placeholder={placeholder || `Enter ${label}`}
              addonAfter={unit}
              min={validation?.min}
              max={validation?.max}
              precision={validation?.decimals}
              onChange={(val) => handleFieldChange(fieldName, val)}
            />
          </Form.Item>
        );

      case 'select':
        return (
          <Form.Item
            key={fieldName}
            name={fieldName}
            label={fieldLabel}
            rules={rules}
          >
            <Select
              placeholder={placeholder || `Select ${label}`}
              allowClear
              showSearch
              optionFilterProp="children"
              onChange={(val) => handleFieldChange(fieldName, val)}
            >
              {(options || []).map((option, index) => (
                <Option key={index} value={option}>
                  {option}
                </Option>
              ))}
            </Select>
          </Form.Item>
        );

      case 'boolean':
        return (
          <Form.Item
            key={fieldName}
            name={fieldName}
            label={fieldLabel}
            valuePropName="checked"
          >
            <Switch
              checkedChildren="Yes"
              unCheckedChildren="No"
              onChange={(checked) => handleFieldChange(fieldName, checked)}
            />
          </Form.Item>
        );

      default:
        return (
          <Form.Item
            key={fieldName}
            name={fieldName}
            label={fieldLabel}
          >
            <Input
              placeholder={`Unsupported field type: ${type}`}
              disabled
            />
          </Form.Item>
        );
    }
  };

  if (!template || Object.keys(template).length === 0) {
    return (
      <div>
        <Alert
          type="info"
          icon={<BulbOutlined />}
          message="No Specification Template"
          description="This category doesn't have a specification template defined. You can add custom specifications in the notes section below."
          style={{ marginBottom: 16 }}
        />

        {showNotes && (
          <>
            <Text strong>Notes:</Text>
            <TextArea
              rows={3}
              placeholder="Add custom specifications or notes..."
              value={notes}
              onChange={handleNotesChange}
              style={{ marginTop: 4 }}
            />
          </>
        )}
      </div>
    );
  }

  return (
    <div>
      <Form
        form={form}
        layout={layout}
        onValuesChange={(changedValues, allValues) => {
          // Handle form-level changes
          Object.keys(changedValues).forEach(fieldName => {
            handleFieldChange(fieldName, changedValues[fieldName]);
          });
        }}
      >
        <Row gutter={16}>
          {templateFields.map((field, index) => (
            <Col
              key={field.fieldName}
              xs={24}
              sm={field.type === 'boolean' ? 12 : (templateFields.length > 4 ? 12 : 24)}
            >
              {renderField(field)}
            </Col>
          ))}
        </Row>
      </Form>

      {showNotes && (
        <>
          <Divider />
          <div>
            <Text strong>Additional Notes:</Text>
            <TextArea
              rows={3}
              placeholder="Add any additional specifications or notes..."
              value={notes}
              onChange={handleNotesChange}
              style={{ marginTop: 8 }}
            />
          </div>
        </>
      )}
    </div>
  );
};

export default SpecificationForm;