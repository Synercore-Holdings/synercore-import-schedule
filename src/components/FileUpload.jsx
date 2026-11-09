// src/components/FileUpload.jsx
import React, { useState, useRef } from 'react';
import { ExcelProcessor } from '../utils/excelProcessor';
import ImportValidationPreview from './ImportValidationPreview';
import { useNotification } from '../contexts/NotificationContext';
import { buildSupplierMatcher } from '../utils/importSupplierAllowlist';
import './FileUpload.css'; // ← add this

function FileUpload({ onFileUpload, loading, suppliers = [] }) {
  const { showError, showWarning } = useNotification();
  const [isOpen, setIsOpen] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [validationData, setValidationData] = useState(null);
  const [validationLoading, setValidationLoading] = useState(false);
  const fileInputRef = useRef(null);
  const currentFileRef = useRef(null);

  const handleDragOver = (e) => { e.preventDefault(); setIsDragOver(true); };
  const handleDragLeave = (e) => { e.preventDefault(); setIsDragOver(false); };
  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) handleFileSelection(files[0]);
  };
  const handleFileInputChange = (e) => {
    const files = e.target.files;
    if (files.length > 0) handleFileSelection(files[0]);
  };

  const handleValidateFile = async (file) => {
    try {
      setValidationLoading(true);
      const result = await ExcelProcessor.parseExcelFileWithValidation(file);

      // Only suppliers set up in Supplier Management — every other row is ignored.
      // (The import itself re-checks against a fresh supplier list.)
      if (result.validRows && result.validRows.length > 0 && suppliers.length > 0) {
        const isKnownSupplier = buildSupplierMatcher(suppliers.map(s => s.name));
        const before = result.validRows.length;
        result.validRows = result.validRows.filter(row =>
          isKnownSupplier(row.supplier || row.SUPPLIER || row.Supplier || ''));
        if (result.validRows.length < before) result.preview = result.validRows.slice(0, 5);
      }

      setValidationData(result);
      currentFileRef.current = file;
    } catch (error) {
      showError(`Error reading file: ${error.message}`);
    } finally {
      setValidationLoading(false);
    }
  };

  const handleFileSelection = (file) => {
    const validTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel', '.xlsx', '.xls',
    ];
    const isValidType = validTypes.some(t => file.type === t || file.name.toLowerCase().endsWith(t));
    if (!isValidType) { showWarning('Please select a valid Excel file (.xlsx or .xls)'); return; }
    if (file.size > 10 * 1024 * 1024) { showWarning('File size must be less than 10MB'); return; }

    // Validate file before showing preview
    handleValidateFile(file);
  };

  const handleProceedWithImport = () => {
    if (validationData?.validRows && validationData.validRows.length > 0) {
      onFileUpload(currentFileRef.current);
      setValidationData(null);
    }
  };

  const handleCancelValidation = () => {
    setValidationData(null);
    currentFileRef.current = null;
  };

  const handleUploadClick = () => fileInputRef.current?.click();
  const handleDownloadTemplate = () => ExcelProcessor.downloadTemplate();

  return (
    <>
      <div className="fu-section" style={{ padding: isOpen ? undefined : 0 }}>
        {/* Toggle bar */}
        <button
          onClick={() => setIsOpen(prev => !prev)}
          type="button"
          style={{
            display: 'flex', alignItems: 'center', gap: 8, width: '100%',
            padding: '10px 16px', background: 'var(--surface-2)', border: 'none',
            borderBottom: isOpen ? '1px solid var(--border)' : 'none',
            borderRadius: isOpen ? '8px 8px 0 0' : 8,
            cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--text-700)',
            transition: 'background 0.15s',
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = 'var(--border)'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'var(--surface-2)'}
        >
          <span style={{ transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s', fontSize: 11 }}>▶</span>
          Import Excel File
          <span style={{ fontWeight: 400, color: 'var(--text-500)', fontSize: 12 }}>Upload a shipment schedule spreadsheet</span>
        </button>

        {isOpen && (
          <div style={{ padding: '1rem 1.25rem' }}>
            <div className="fu-actions">
              <button className="btn btn-secondary" onClick={handleDownloadTemplate} type="button">
                Download Template
              </button>
              <span className="fu-actions-hint">Download a properly formatted Excel template</span>
            </div>

            <div
              className={`fu-dropzone ${isDragOver ? 'is-dragover' : ''} ${validationLoading || loading ? 'is-loading' : ''}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={handleUploadClick}
              role="button"
              tabIndex={0}
              onKeyDown={(e)=> (e.key === 'Enter' || e.key === ' ') && handleUploadClick()}
              aria-busy={validationLoading || loading ? 'true' : 'false'}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileInputChange}
                className="fu-input"
                disabled={validationLoading || loading}
              />

              {validationLoading || loading ? (
                <div className="fu-state fu-state--loading">
                  <div className="fu-emoji" aria-hidden>⏳</div>
                  <p>{validationLoading ? 'Validating file...' : 'Processing file...'}</p>
                </div>
              ) : (
                <div className="fu-state">
                  <div className="fu-emoji fu-emoji--accent" aria-hidden>📊</div>
                  <h4 className="fu-headline">Drag and drop your Excel file here</h4>
                  <p className="fu-hint">or click to browse</p>
                  <button className="btn" type="button">Choose File</button>
                </div>
              )}
            </div>

            <div className="fu-help">
              <p><strong>Supported formats:</strong> .xlsx, .xls</p>
              <p><strong>Maximum file size:</strong> 10MB</p>
              <p>
                <strong>Expected columns:</strong> SUPPLIER, ORDER/REF, FINAL POD, LATEST STATUS, WEEK NUMBER, PRODUCT NAME,
                QUANTITY, PALLET QTY, RECEIVING WAREHOUSE, FORWARDING AGENT
              </p>
              <p style={{ color: 'var(--text-500)', fontSize: '0.8rem' }}>
                <strong>Note:</strong> Only suppliers set up in Supplier Management ({suppliers.length}) are imported, all other rows are ignored. To import a new supplier, add it in Supplier Management first.
              </p>
            </div>
          </div>
        )}
      </div>

      {validationData && (
        <ImportValidationPreview
          errors={validationData.errors}
          preview={validationData.preview}
          validCount={validationData.validRows?.length || 0}
          onProceed={handleProceedWithImport}
          onCancel={handleCancelValidation}
          loading={loading}
        />
      )}
    </>
  );
}

export default FileUpload;
