// ========== Template Builder Component ==========

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Card, Button, Space, Alert, Typography, Row, Col, Empty, List, Tooltip,
  Popconfirm, Tag, Input, Select, Switch, Form, Divider, Badge, Menu, Dropdown,
  message, Modal, InputNumber
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, DragOutlined, EyeOutlined,
  CopyOutlined, ImportOutlined, ExportOutlined, SettingOutlined,
  CheckCircleOutlined, ExclamationCircleOutlined, OrderedListOutlined,
  BulbOutlined, SaveOutlined, ReloadOutlined
} from '@ant-design/icons';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';
import FieldConfigurationModal from './FieldConfigurationModal';
import {
  FIELD_TYPES, validateTemplate, sanitizeTemplate,
  getFieldTypeInfo, createEmptyField
} from '../utils/templateValidation';

const { Title, Text, Paragraph } = Typography;
const { Option } = Select;

// Template presets for common use cases
const TEMPLATE_PRESETS = {
  battery: {
    name: 'Battery Specifications',
    description: 'Common specifications for battery products',
    template: {
      voltage: {
        type: 'number',
        label: 'Voltage',
        required: true,
        unit: 'V',
        validation: { min: 0, max: 1000, decimals: 1 },
        order: 1
      },
      capacity: {
        type: 'number',
        label: 'Capacity',
        required: true,
        unit: 'Ah',
        validation: { min: 0, decimals: 2 },
        order: 2
      },
      chemistry: {
        type: 'select',
        label: 'Chemistry Type',
        required: true,
        options: ['LiFePO4', 'Li-ion', 'Lead Acid', 'NiMH'],
        order: 3
      },
      cycleLife: {
        type: 'number',
        label: 'Cycle Life',
        required: false,
        validation: { min: 1 },
        helpText: 'Expected number of charge/discharge cycles',
        order: 4
      }
    }
  },
  cable: {
    name: 'Cable Specifications',
    description: 'Common specifications for cable products',
    template: {
      length: {
        type: 'number',
        label: 'Length',
        required: true,
        unit: 'm',
        validation: { min: 0, decimals: 2 },
        order: 1
      },
      gauge: {
        type: 'select',
        label: 'Wire Gauge',
        required: true,
        options: ['12 AWG', '14 AWG', '16 AWG', '18 AWG', '20 AWG'],
        order: 2
      },
      connectorType: {
        type: 'select',
        label: 'Connector Type',
        required: true,
        options: ['MC4', 'Anderson', 'Ring Terminal', 'Spade', 'Custom'],
        order: 3
      },
      shielded: {
        type: 'boolean',
        label: 'Shielded',
        required: false,
        defaultValue: false,
        order: 4
      }
    }
  },
  module: {
    name: 'Module Specifications',
    description: 'Common specifications for electronic modules',
    template: {
      inputVoltage: {
        type: 'select',
        label: 'Input Voltage Range',
        required: true,
        options: ['12V DC', '24V DC', '36-72V DC', '48V DC', '110-240V AC'],
        order: 1
      },
      outputVoltage: {
        type: 'select',
        label: 'Output Voltage',
        required: true,
        options: ['12V DC', '24V DC', '48V DC', '54.4V DC'],
        order: 2
      },
      powerRating: {
        type: 'number',
        label: 'Power Rating',
        required: true,
        unit: 'W',
        validation: { min: 0 },
        order: 3
      },
      efficiency: {
        type: 'number',
        label: 'Efficiency',
        required: false,
        unit: '%',
        validation: { min: 0, max: 100, decimals: 1 },
        order: 4
      }
    }
  }
};

const TemplateBuilder = ({
  value = {},
  onChange,
  readOnly = false,
  showPreview = true
}) => {
  const [template, setTemplate] = useState(value);
  const [fieldModalVisible, setFieldModalVisible] = useState(false);
  const [editingField, setEditingField] = useState(null);
  const [presetModalVisible, setPresetModalVisible] = useState(false);
  const [importModalVisible, setImportModalVisible] = useState(false);
  const [importText, setImportText] = useState('');
  const [autoSave, setAutoSave] = useState(true);
  const [lastSaved, setLastSaved] = useState(null);

  // Auto-save functionality
  useEffect(() => {
    if (autoSave && template !== value) {
      const saveTimer = setTimeout(() => {
        onChange?.(template);
        setLastSaved(new Date());
      }, 1000); // 1 second debounce

      return () => clearTimeout(saveTimer);
    }
  }, [template, value, onChange, autoSave]);

  // Validation
  const validation = useMemo(() => {
    return validateTemplate(template);
  }, [template]);

  const fields = useMemo(() => {
    return Object.entries(template)
      .map(([fieldName, field]) => ({
        fieldName,
        ...field,
        id: fieldName // for drag and drop
      }))
      .sort((a, b) => (a.order || 0) - (b.order || 0));
  }, [template]);

  // Handlers
  const handleAddField = () => {
    setEditingField(null);
    setFieldModalVisible(true);
  };

  const handleEditField = (fieldName) => {
    setEditingField({
      fieldName,
      ...template[fieldName]
    });
    setFieldModalVisible(true);
  };

  const handleSaveField = useCallback((fieldData) => {
    const { fieldName, ...fieldConfig } = fieldData;
    const newTemplate = { ...template };

    // Remove old field if name changed
    if (editingField && editingField.fieldName !== fieldName) {
      delete newTemplate[editingField.fieldName];
    }

    newTemplate[fieldName] = fieldConfig;
    setTemplate(newTemplate);
    setFieldModalVisible(false);
    setEditingField(null);
  }, [template, editingField]);

  const handleDeleteField = (fieldName) => {
    const newTemplate = { ...template };
    delete newTemplate[fieldName];
    setTemplate(newTemplate);
  };

  const handleDuplicateField = (fieldName) => {
    const field = template[fieldName];
    const newFieldName = `${fieldName}_copy`;
    let counter = 1;
    let finalName = newFieldName;

    while (template[finalName]) {
      finalName = `${newFieldName}_${counter}`;
      counter++;
    }

    const newTemplate = {
      ...template,
      [finalName]: {
        ...field,
        label: `${field.label} (Copy)`,
        order: Math.max(...Object.values(template).map(f => f.order || 0)) + 1
      }
    };
    setTemplate(newTemplate);
  };

  // Drag and drop
  const handleDragEnd = (result) => {
    if (!result.destination) return;

    const reorderedFields = Array.from(fields);
    const [reorderedItem] = reorderedFields.splice(result.source.index, 1);
    reorderedFields.splice(result.destination.index, 0, reorderedItem);

    const newTemplate = {};
    reorderedFields.forEach((field, index) => {
      newTemplate[field.fieldName] = {
        ...template[field.fieldName],
        order: index
      };
    });

    setTemplate(newTemplate);
  };

  // Template operations
  const handleApplyPreset = (presetKey) => {
    const preset = TEMPLATE_PRESETS[presetKey];
    setTemplate(preset.template);
    setPresetModalVisible(false);
    message.success(`Applied ${preset.name} template`);
  };

  const handleExportTemplate = () => {
    const sanitized = sanitizeTemplate(template);
    const dataStr = JSON.stringify(sanitized, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'template.json';
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleImportTemplate = () => {
    try {
      const imported = JSON.parse(importText);
      const validation = validateTemplate(imported);

      if (validation.errors.length > 0) {
        message.error(`Invalid template: ${validation.errors[0]}`);
        return;
      }

      setTemplate(imported);
      setImportModalVisible(false);
      setImportText('');
      message.success('Template imported successfully');
    } catch (error) {
      message.error('Invalid JSON format');
    }
  };

  const handleClearTemplate = () => {
    setTemplate({});
  };

  const handleManualSave = () => {
    onChange?.(template);
    setLastSaved(new Date());
    message.success('Template saved');
  };

  // Render field actions menu
  const getFieldActions = (field) => (
    <Menu>
      <Menu.Item key="edit" icon={<EditOutlined />} onClick={() => handleEditField(field.fieldName)}>
        Edit Field
      </Menu.Item>
      <Menu.Item key="duplicate" icon={<CopyOutlined />} onClick={() => handleDuplicateField(field.fieldName)}>
        Duplicate Field
      </Menu.Item>
      <Menu.Divider />
      <Menu.Item key="delete" danger icon={<DeleteOutlined />}>
        <Popconfirm
          title="Delete this field?"
          description="This action cannot be undone."
          onConfirm={() => handleDeleteField(field.fieldName)}
          okText="Delete"
          cancelText="Cancel"
        >
          Delete Field
        </Popconfirm>
      </Menu.Item>
    </Menu>
  );

  const fieldCount = fields.length;
  const hasErrors = validation.errors.length > 0;
  const hasWarnings = validation.warnings.length > 0;

  return (
    <div>
      {/* Header */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col flex="auto">
          <Space size="middle">
            <Badge count={fieldCount} showZero color="#1890ff">
              <Title level={4} style={{ margin: 0 }}>Specification Template</Title>
            </Badge>

            {hasErrors && (
              <Badge count={validation.errors.length} color="#ff4d4f">
                <Tag color="error" icon={<ExclamationCircleOutlined />}>
                  Errors
                </Tag>
              </Badge>
            )}

            {hasWarnings && (
              <Badge count={validation.warnings.length} color="#faad14">
                <Tag color="warning" icon={<ExclamationCircleOutlined />}>
                  Warnings
                </Tag>
              </Badge>
            )}

            {!hasErrors && !hasWarnings && fieldCount > 0 && (
              <Tag color="success" icon={<CheckCircleOutlined />}>
                Valid
              </Tag>
            )}
          </Space>
        </Col>

        <Col>
          <Space>
            {/* Auto-save toggle */}
            <Tooltip title="Auto-save changes">
              <Space size="small">
                <Text type="secondary">Auto-save</Text>
                <Switch
                  size="small"
                  checked={autoSave}
                  onChange={setAutoSave}
                />
              </Space>
            </Tooltip>

            {/* Last saved indicator */}
            {lastSaved && (
              <Text type="secondary" style={{ fontSize: '12px' }}>
                Saved {lastSaved.toLocaleTimeString()}
              </Text>
            )}

            {/* Manual save button */}
            {!autoSave && (
              <Button
                icon={<SaveOutlined />}
                onClick={handleManualSave}
                type="primary"
                size="small"
              >
                Save
              </Button>
            )}

            {/* Template operations */}
            <Dropdown
              overlay={
                <Menu>
                  <Menu.Item key="presets" icon={<BulbOutlined />} onClick={() => setPresetModalVisible(true)}>
                    Load Preset
                  </Menu.Item>
                  <Menu.Item key="import" icon={<ImportOutlined />} onClick={() => setImportModalVisible(true)}>
                    Import Template
                  </Menu.Item>
                  <Menu.Item key="export" icon={<ExportOutlined />} onClick={handleExportTemplate} disabled={fieldCount === 0}>
                    Export Template
                  </Menu.Item>
                  <Menu.Divider />
                  <Menu.Item key="clear" danger icon={<DeleteOutlined />}>
                    <Popconfirm
                      title="Clear all fields?"
                      description="This will remove all template fields."
                      onConfirm={handleClearTemplate}
                      okText="Clear"
                      cancelText="Cancel"
                    >
                      Clear Template
                    </Popconfirm>
                  </Menu.Item>
                </Menu>
              }
              trigger={['click']}
            >
              <Button icon={<SettingOutlined />}>Template</Button>
            </Dropdown>
          </Space>
        </Col>
      </Row>

      {/* Validation alerts */}
      {hasErrors && (
        <Alert
          type="error"
          showIcon
          message={`${validation.errors.length} Error${validation.errors.length > 1 ? 's' : ''} Found`}
          description={
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              {validation.errors.slice(0, 3).map((error, index) => (
                <li key={index}>{error}</li>
              ))}
              {validation.errors.length > 3 && (
                <li>... and {validation.errors.length - 3} more</li>
              )}
            </ul>
          }
          style={{ marginBottom: 16 }}
        />
      )}

      {hasWarnings && (
        <Alert
          type="warning"
          showIcon
          message={`${validation.warnings.length} Warning${validation.warnings.length > 1 ? 's' : ''}`}
          description={
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              {validation.warnings.map((warning, index) => (
                <li key={index}>{warning}</li>
              ))}
            </ul>
          }
          style={{ marginBottom: 16 }}
        />
      )}

      {/* Template Fields */}
      <Row gutter={16}>
        <Col span={showPreview ? 14 : 24}>
          <Card
            title={
              <Space>
                <OrderedListOutlined />
                Template Fields
                <Badge count={fieldCount} showZero />
              </Space>
            }
            extra={
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={handleAddField}
                disabled={readOnly}
              >
                Add Field
              </Button>
            }
          >
            {fieldCount === 0 ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                  <div>
                    <Paragraph>No specification fields defined</Paragraph>
                    <Button
                      type="primary"
                      icon={<PlusOutlined />}
                      onClick={handleAddField}
                      disabled={readOnly}
                    >
                      Add Your First Field
                    </Button>
                  </div>
                }
              />
            ) : (
              <DragDropContext onDragEnd={handleDragEnd}>
                <Droppable droppableId="template-fields">
                  {(provided) => (
                    <div {...provided.droppableProps} ref={provided.innerRef}>
                      {fields.map((field, index) => {
                        const typeInfo = getFieldTypeInfo(field.type);

                        return (
                          <Draggable key={field.fieldName} draggableId={field.fieldName} index={index}>
                            {(provided, snapshot) => (
                              <Card
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                size="small"
                                style={{
                                  marginBottom: 8,
                                  backgroundColor: snapshot.isDragging ? '#f0f2f5' : undefined,
                                  ...provided.draggableProps.style
                                }}
                                bodyStyle={{ padding: '12px 16px' }}
                              >
                                <Row align="middle">
                                  <Col flex="none" style={{ marginRight: 12 }}>
                                    <div
                                      {...provided.dragHandleProps}
                                      style={{ cursor: 'grab' }}
                                    >
                                      <DragOutlined style={{ color: '#d9d9d9' }} />
                                    </div>
                                  </Col>

                                  <Col flex="none" style={{ marginRight: 12 }}>
                                    <span style={{ fontSize: '16px' }}>{typeInfo.icon}</span>
                                  </Col>

                                  <Col flex="auto">
                                    <div>
                                      <Space>
                                        <Text strong>{field.label}</Text>
                                        {field.required && <Tag color="red" size="small">Required</Tag>}
                                        {field.unit && <Tag size="small">{field.unit}</Tag>}
                                      </Space>
                                      <div>
                                        <Text type="secondary" style={{ fontSize: '12px' }}>
                                          {field.fieldName} • {typeInfo.label}
                                          {field.type === 'select' && field.options && ` • ${field.options.length} options`}
                                        </Text>
                                      </div>
                                    </div>
                                  </Col>

                                  <Col flex="none">
                                    <Dropdown overlay={getFieldActions(field)} trigger={['click']}>
                                      <Button type="text" icon={<SettingOutlined />} />
                                    </Dropdown>
                                  </Col>
                                </Row>
                              </Card>
                            )}
                          </Draggable>
                        );
                      })}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </DragDropContext>
            )}
          </Card>
        </Col>

        {/* Preview Panel */}
        {showPreview && (
          <Col span={10}>
            <TemplatePreview template={template} />
          </Col>
        )}
      </Row>

      {/* Field Configuration Modal */}
      <FieldConfigurationModal
        visible={fieldModalVisible}
        onCancel={() => {
          setFieldModalVisible(false);
          setEditingField(null);
        }}
        onSave={handleSaveField}
        field={editingField}
        existingFields={Object.keys(template)}
        mode={editingField ? 'edit' : 'create'}
      />

      {/* Preset Selection Modal */}
      <Modal
        title="Load Template Preset"
        open={presetModalVisible}
        onCancel={() => setPresetModalVisible(false)}
        footer={null}
        width={600}
      >
        <List
          dataSource={Object.entries(TEMPLATE_PRESETS)}
          renderItem={([key, preset]) => (
            <List.Item
              actions={[
                <Button
                  type="primary"
                  onClick={() => handleApplyPreset(key)}
                >
                  Apply
                </Button>
              ]}
            >
              <List.Item.Meta
                title={preset.name}
                description={preset.description}
              />
              <div>
                <Text type="secondary">
                  {Object.keys(preset.template).length} fields
                </Text>
              </div>
            </List.Item>
          )}
        />
      </Modal>

      {/* Import Template Modal */}
      <Modal
        title="Import Template"
        open={importModalVisible}
        onCancel={() => {
          setImportModalVisible(false);
          setImportText('');
        }}
        onOk={handleImportTemplate}
        okButtonProps={{ disabled: !importText.trim() }}
      >
        <div style={{ marginBottom: 16 }}>
          <Text>Paste your template JSON below:</Text>
        </div>
        <Input.TextArea
          rows={10}
          value={importText}
          onChange={(e) => setImportText(e.target.value)}
          placeholder="Paste template JSON here..."
        />
      </Modal>
    </div>
  );
};

// Template Preview Component
const TemplatePreview = ({ template }) => {
  const [previewData, setPreviewData] = useState({});

  const fields = useMemo(() => {
    return Object.entries(template)
      .map(([fieldName, field]) => ({ fieldName, ...field }))
      .sort((a, b) => (a.order || 0) - (b.order || 0));
  }, [template]);

  const renderPreviewField = (field) => {
    const typeInfo = getFieldTypeInfo(field.type);
    const value = previewData[field.fieldName];

    switch (field.type) {
      case 'number':
        return (
          <InputNumber
            placeholder={field.placeholder || `Enter ${field.label}`}
            style={{ width: '100%' }}
            addonAfter={field.unit}
            min={field.validation?.min}
            max={field.validation?.max}
            precision={field.validation?.decimals}
            value={value}
            onChange={(val) => setPreviewData(prev => ({
              ...prev,
              [field.fieldName]: val
            }))}
          />
        );

      case 'select':
        return (
          <Select
            placeholder={field.placeholder || `Select ${field.label}`}
            style={{ width: '100%' }}
            value={value}
            onChange={(val) => setPreviewData(prev => ({
              ...prev,
              [field.fieldName]: val
            }))}
          >
            {(field.options || []).map((option, index) => (
              <Option key={index} value={option}>{option}</Option>
            ))}
          </Select>
        );

      case 'boolean':
        return (
          <Switch
            checked={value || false}
            onChange={(checked) => setPreviewData(prev => ({
              ...prev,
              [field.fieldName]: checked
            }))}
            checkedChildren="Yes"
            unCheckedChildren="No"
          />
        );

      default:
        return <Input placeholder="Unsupported field type" disabled />;
    }
  };

  return (
    <Card
      title={
        <Space>
          <EyeOutlined />
          Live Preview
          <Badge count={fields.length} showZero />
        </Space>
      }
      extra={
        <Button
          size="small"
          icon={<ReloadOutlined />}
          onClick={() => setPreviewData({})}
        >
          Reset
        </Button>
      }
    >
      {fields.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="Add fields to see preview"
        />
      ) : (
        <Form layout="vertical">
          {fields.map((field) => (
            <Form.Item
              key={field.fieldName}
              label={field.label}
              required={field.required}
              help={field.helpText}
            >
              {renderPreviewField(field)}
            </Form.Item>
          ))}
        </Form>
      )}
    </Card>
  );
};

export default TemplateBuilder;