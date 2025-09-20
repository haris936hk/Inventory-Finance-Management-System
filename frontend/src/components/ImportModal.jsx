// ========== src/components/ImportModal.jsx ==========
import React, { useState } from 'react';
import { Modal, Upload, Button, Alert, Steps, message, Table, Tag } from 'antd';
import { InboxOutlined, DownloadOutlined } from '@ant-design/icons';
import axios from 'axios';

const { Step } = Steps;
const { Dragger } = Upload;

const ImportModal = ({ visible, onClose }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [file, setFile] = useState(null);
  const [validationResult, setValidationResult] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleFileSelect = (file) => {
    setFile(file);
    return false; // Prevent auto upload
  };

  const handleValidate = async () => {
    if (!file) {
      message.error('Please select a file');
      return;
    }

    setLoading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await axios.post('/import/validate', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      
      setValidationResult(response.data.data);
      if (response.data.data.valid) {
        setCurrentStep(1);
      }
    } catch (error) {
      message.error('Validation failed');
    }
    
    setLoading(false);
  };

  const handleImport = async () => {
    setLoading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await axios.post('/import/excel', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      
      setImportResult(response.data.data);
      setCurrentStep(2);
      message.success('Import completed');
    } catch (error) {
      message.error('Import failed');
    }
    
    setLoading(false);
  };

  const handleDownloadTemplate = async () => {
    try {
      const response = await axios.get('/import/template', {
        responseType: 'blob'
      });
      
      // Create blob URL and trigger download
      const blob = new Blob([response.data], { 
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `import_template_${Date.now()}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      message.success('Template downloaded successfully');
    } catch (error) {
      console.error('Download error:', error);
      message.error('Failed to download template');
    }
  };

  const resetModal = () => {
    setCurrentStep(0);
    setFile(null);
    setValidationResult(null);
    setImportResult(null);
  };

  const steps = [
    {
      title: 'Upload File',
      content: (
        <>
          <Alert
            message="Import Instructions"
            description="Upload an Excel file with your inventory data. Download the template to see the required format."
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
          />
          
          <Dragger
            accept=".xlsx,.xls"
            beforeUpload={handleFileSelect}
            maxCount={1}
            fileList={file ? [file] : []}
            onRemove={() => setFile(null)}
          >
            <p className="ant-upload-drag-icon">
              <InboxOutlined style={{ fontSize: 48, color: '#1890ff' }} />
            </p>
            <p className="ant-upload-text">Click or drag Excel file here</p>
            <p className="ant-upload-hint">Support for .xlsx and .xls files</p>
          </Dragger>

          <div style={{ marginTop: 16, textAlign: 'center' }}>
            <Button icon={<DownloadOutlined />} onClick={handleDownloadTemplate}>
              Download Template
            </Button>
          </div>
        </>
      )
    },
    {
      title: 'Validation',
      content: (
        <>
          {validationResult && (
            <>
              <Alert
                message={validationResult.valid ? 'Validation Passed' : 'Validation Failed'}
                type={validationResult.valid ? 'success' : 'error'}
                showIcon
                style={{ marginBottom: 16 }}
              />
              
              {validationResult.errors.length > 0 && (
                <div>
                  <h4>Errors:</h4>
                  <ul>
                    {validationResult.errors.map((error, index) => (
                      <li key={index} style={{ color: '#ff4d4f' }}>{error}</li>
                    ))}
                  </ul>
                </div>
              )}
              
              {validationResult.warnings.length > 0 && (
                <div>
                  <h4>Warnings:</h4>
                  <ul>
                    {validationResult.warnings.map((warning, index) => (
                      <li key={index} style={{ color: '#faad14' }}>{warning}</li>
                    ))}
                  </ul>
                </div>
              )}

              {validationResult.sheets.map(sheet => (
                <div key={sheet.name}>
                  <h4>{sheet.name} - {sheet.rowCount} rows</h4>
                </div>
              ))}
            </>
          )}
        </>
      )
    },
    {
      title: 'Results',
      content: (
        <>
          {importResult && (
            <>
              <Alert
                message="Import Summary"
                description={`Successfully imported: ${importResult.summary.imported} | Failed: ${importResult.summary.failed}`}
                type={importResult.summary.failed > 0 ? 'warning' : 'success'}
                showIcon
                style={{ marginBottom: 16 }}
              />
              
              {importResult.failed.length > 0 && (
                <Table
                  dataSource={importResult.failed}
                  columns={[
                    { title: 'Row', dataIndex: 'row', key: 'row', width: 80 },
                    { title: 'Sheet', dataIndex: 'sheet', key: 'sheet' },
                    { title: 'Error', dataIndex: 'error', key: 'error' }
                  ]}
                  size="small"
                  pagination={false}
                  scroll={{ y: 300 }}
                />
              )}
            </>
          )}
        </>
      )
    }
  ];

  return (
    <Modal
      title="Import Data from Excel"
      open={visible}
      onCancel={() => {
        resetModal();
        onClose();
      }}
      width={700}
      footer={
        currentStep === 0 ? (
          <Button type="primary" onClick={handleValidate} loading={loading}>
            Validate File
          </Button>
        ) : currentStep === 1 ? (
          <Button type="primary" onClick={handleImport} loading={loading}>
            Import Data
          </Button>
        ) : (
          <Button type="primary" onClick={() => {
            resetModal();
            onClose();
          }}>
            Close
          </Button>
        )
      }
    >
      <Steps current={currentStep} style={{ marginBottom: 24 }}>
        {steps.map(item => (
          <Step key={item.title} title={item.title} />
        ))}
      </Steps>
      
      <div>{steps[currentStep].content}</div>
    </Modal>
  );
};

export default ImportModal;