// ========== src/components/BarcodeScanner.jsx ==========
import React, { useEffect, useRef } from 'react';
import { Modal, Alert, Spin } from 'antd';
import Quagga from '@ericblade/quagga2';

const BarcodeScanner = ({ visible, onClose, onScan }) => {
  const scannerRef = useRef(null);

  useEffect(() => {
    if (visible) {
      startScanner();
    } else {
      stopScanner();
    }

    return () => {
      stopScanner();
    };
  }, [visible]);

  const startScanner = () => {
    Quagga.init({
      inputStream: {
        type: 'LiveStream',
        target: scannerRef.current,
        constraints: {
          width: 640,
          height: 480,
          facingMode: 'environment'
        }
      },
      locator: {
        patchSize: 'medium',
        halfSample: true
      },
      decoder: {
        readers: [
          'code_128_reader',
          'ean_reader',
          'ean_8_reader',
          'code_39_reader',
          'code_39_vin_reader',
          'codabar_reader',
          'upc_reader',
          'upc_e_reader',
          'i2of5_reader'
        ]
      },
      locate: true
    }, (err) => {
      if (err) {
        console.error('Failed to initialize barcode scanner:', err);
        return;
      }
      Quagga.start();
    });

    Quagga.onDetected((result) => {
      const code = result.codeResult.code;
      onScan(code);
      stopScanner();
    });
  };

  const stopScanner = () => {
    Quagga.stop();
    Quagga.offDetected();
  };

  return (
    <Modal
      title="Scan Barcode"
      open={visible}
      onCancel={onClose}
      footer={null}
      width={700}
    >
      <Alert
        message="Position the barcode within the camera view"
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
      />
      
      <div
        ref={scannerRef}
        style={{
          width: '100%',
          height: 400,
          backgroundColor: '#000',
          position: 'relative'
        }}
      >
        {visible && (
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: 1
          }}>
            <Spin size="large" tip="Initializing camera..." />
          </div>
        )}
      </div>
    </Modal>
  );
};

export default BarcodeScanner;