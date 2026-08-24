import React, { useState, useEffect, useCallback } from 'react';
import useFormDraft from '../hooks/useFormDraft';
import { isAirfreight, getForwardingAgents } from '../utils/shipmentConstants';
import WeekCalendar from './WeekCalendar';
import ResizableModal from './ResizableModal';
import { useNotification } from '../contexts/NotificationContext';

const EMPTY_FORM = {
  supplier: '',
  orderRef: '',
  finalPod: '',
  latestStatus: 'planned_airfreight',
  weekNumber: '',
  productName: '',
  quantity: '',
  cbm: '',
  palletQty: '',
  receivingWarehouse: '',
  forwardingAgent: '',
  vesselName: '',
  incoterm: '',
  notes: '',
  reminderDate: '',
  reminderNote: '',
  actualArrivalDate: '',
};

function validateShipmentForm(data) {
  const errors = {};
  if (!data.orderRef?.trim()) errors.orderRef = 'Order reference is required';
  if (!data.supplier?.trim()) errors.supplier = 'Supplier is required';
  if (!data.finalPod?.trim()) errors.finalPod = 'Final POD is required';
  if (data.quantity !== undefined && data.quantity !== null && data.quantity !== '') {
    if (isNaN(data.quantity) || Number(data.quantity) < 0) errors.quantity = 'Quantity must be a positive number';
  }
  if (data.weekNumber !== undefined && data.weekNumber !== null && data.weekNumber !== '') {
    const wn = Number(data.weekNumber);
    if (isNaN(wn) || wn < 1 || wn > 53) errors.weekNumber = 'Week number must be 1-53';
  }
  if (data.palletQty !== undefined && data.palletQty !== null && data.palletQty !== '') {
    if (isNaN(data.palletQty) || Number(data.palletQty) < 0) errors.palletQty = 'Pallet quantity must be a positive number';
  }
  if (data.cbm !== undefined && data.cbm !== null && data.cbm !== '') {
    if (isNaN(data.cbm) || Number(data.cbm) < 0) errors.cbm = 'CBM must be a positive number';
  }
  return errors;
}

/**
 * Parse initialData's productName into product lines for the form.
 * Handles semicolon-separated product names from existing shipments.
 */
function parseProductLines(initialData) {
  if (!initialData) return [{ name: '', qty: '' }];
  if (initialData.productName && initialData.productName.includes(';')) {
    const names = initialData.productName.split(';').map(n => n.trim());
    return names.map(n => ({ name: n, qty: '' }));
  }
  return [{
    name: initialData.productName || '',
    qty: initialData.quantity != null ? String(initialData.quantity) : ''
  }];
}

/**
 * Unified shipment form modal for both Add and Amend flows.
 *
 * @param {boolean} isOpen
 * @param {function} onClose
 * @param {function} onSubmit - (shipmentData) => Promise<void>
 * @param {function|null} onDelete - (id) => void — only shown in edit mode
 * @param {object|null} initialData - null = create mode, object = edit mode
 * @param {string[]} uniqueSuppliers - for supplier dropdown
 */
function ShipmentFormModal({ isOpen, onClose, onSubmit, onDelete, initialData, uniqueSuppliers }) {
  const isEditMode = !!initialData;
  const { showWarning, confirm: confirmAction } = useNotification();

  const [formData, setFormData] = useState(EMPTY_FORM);
  const [productLines, setProductLines] = useState([{ name: '', qty: '' }]);
  const [formErrors, setFormErrors] = useState({});
  const [showCustomSupplier, setShowCustomSupplier] = useState(false);
  const [selectedWeekDate, setSelectedWeekDate] = useState(null);

  // Form draft — create mode only
  const { clearDraft, confirmClose } = useFormDraft(
    'shipment_new', formData, setFormData, { enabled: isOpen && !isEditMode }
  );

  // Initialize form when modal opens or initialData changes
  useEffect(() => {
    if (!isOpen) return;

    if (isEditMode) {
      setFormData({ ...EMPTY_FORM, ...initialData });
      setProductLines(parseProductLines(initialData));
      setSelectedWeekDate(initialData.selectedWeekDate ? new Date(initialData.selectedWeekDate) : null);
      setShowCustomSupplier(false);
    } else {
      // For create mode, form data will be restored by useFormDraft if a draft exists.
      // We only reset product lines and week date (not saved in draft).
      setProductLines([{ name: '', qty: '' }]);
      setSelectedWeekDate(null);
      setShowCustomSupplier(false);
    }
    setFormErrors({});
  }, [isOpen, initialData, isEditMode]);

  // --- Handlers ---

  const handleInputChange = useCallback((field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  }, []);

  const handleSupplierChange = useCallback((value) => {
    if (value === 'ADD_NEW') {
      setShowCustomSupplier(true);
      setFormData(prev => ({ ...prev, supplier: '' }));
    } else {
      setShowCustomSupplier(false);
      setFormData(prev => ({ ...prev, supplier: value }));
    }
  }, []);

  const handleWeekUpdate = useCallback((weekNumber, date) => {
    setFormData(prev => ({ ...prev, weekNumber: weekNumber.toString() }));
    setSelectedWeekDate(date);
  }, []);

  const addProductLine = useCallback(() => {
    setProductLines(prev => [...prev, { name: '', qty: '' }]);
  }, []);

  const removeProductLine = useCallback((idx) => {
    setProductLines(prev => prev.filter((_, i) => i !== idx));
  }, []);

  const updateProductLine = useCallback((idx, field, value) => {
    setProductLines(prev => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], [field]: value };
      return updated;
    });
  }, []);

  const handleClose = useCallback(() => {
    if (!isEditMode) {
      // Create mode — confirm if draft is dirty
      confirmClose(onClose);
    } else {
      onClose();
    }
  }, [isEditMode, confirmClose, onClose]);

  const handleSubmit = useCallback(async () => {
    const errors = validateShipmentForm(formData);
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) {
      showWarning('Please fix the validation errors before submitting.');
      return;
    }

    // Combine product lines into productName and total quantity
    const filledLines = productLines.filter(l => l.name.trim());
    const combinedProductName = filledLines.map(l => l.name.trim()).join('; ');
    const totalQuantity = Math.round(productLines.reduce((sum, l) => sum + (Number(l.qty) || 0), 0));

    const { productName: _pn, quantity: _qty, ...rest } = formData;
    const shipmentData = {
      ...rest,
      productName: combinedProductName || null,
      quantity: totalQuantity > 0 ? totalQuantity : null,
      cbm: formData.cbm ? Number(formData.cbm) : null,
      palletQty: formData.palletQty ? Number(formData.palletQty) : null,
      weekNumber: formData.weekNumber ? Number(formData.weekNumber) : null,
    };

    if (selectedWeekDate) {
      shipmentData.selectedWeekDate = selectedWeekDate.toISOString();
    }

    if (!isEditMode) {
      shipmentData.createdAt = new Date().toISOString();
    }
    shipmentData.updatedAt = new Date().toISOString();

    await onSubmit(shipmentData);

    // On success — clean up
    if (!isEditMode) {
      clearDraft();
      setFormData({ ...EMPTY_FORM });
      setProductLines([{ name: '', qty: '' }]);
      setShowCustomSupplier(false);
      setSelectedWeekDate(null);
    }
    setFormErrors({});
  }, [formData, productLines, selectedWeekDate, isEditMode, onSubmit, clearDraft, showWarning]);

  const handleDelete = useCallback(async () => {
    if (!initialData?.id || !onDelete) return;
    const confirmed = await confirmAction({
      title: 'Remove Shipment',
      message: 'Are you sure you want to remove this shipment? This action cannot be undone.',
      type: 'danger',
      confirmText: 'Remove',
    });
    if (confirmed) {
      onDelete(initialData.id);
      onClose();
    }
  }, [initialData, onDelete, confirmAction, onClose]);

  // Determine whether supplier field uses dropdown (create) or text input (edit / custom)
  const useSupplierDropdown = !isEditMode && !showCustomSupplier;
  const hasErrors = Object.values(formErrors).some(Boolean);
  const isValid = formData.supplier && formData.orderRef && formData.finalPod && !hasErrors;

  return (
    <ResizableModal
      title={isEditMode ? 'Amend Shipment' : 'Add New Shipment'}
      isOpen={isOpen}
      onClose={handleClose}
      initialWidth={650}
      minWidth={400}
      minHeight={400}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
        {/* Supplier */}
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', color: 'var(--text-900)' }}>
            Supplier *
          </label>
          {useSupplierDropdown ? (
            <select
              value={formData.supplier}
              onChange={(e) => { handleSupplierChange(e.target.value); setFormErrors(prev => ({ ...prev, supplier: undefined })); }}
              className="select"
              style={formErrors.supplier ? { border: '1px solid var(--danger)' } : undefined}
            >
              <option value="">Select a supplier...</option>
              {uniqueSuppliers.map(supplier => (
                <option key={supplier} value={supplier}>{supplier}</option>
              ))}
              <option value="ADD_NEW">+ Add New Supplier</option>
            </select>
          ) : (
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <input
                type="text"
                value={formData.supplier}
                onChange={(e) => { handleInputChange('supplier', e.target.value); setFormErrors(prev => ({ ...prev, supplier: undefined })); }}
                className="input"
                style={{
                  flex: 1,
                  ...(formErrors.supplier ? { border: '1px solid var(--danger)' } : {})
                }}
                placeholder={isEditMode ? 'Supplier name' : 'Enter new supplier name'}
                autoFocus={!isEditMode && showCustomSupplier}
              />
              {!isEditMode && showCustomSupplier && (
                <button
                  type="button"
                  onClick={() => {
                    setShowCustomSupplier(false);
                    setFormData(prev => ({ ...prev, supplier: '' }));
                  }}
                  style={{
                    padding: '0.75rem',
                    backgroundColor: '#6c757d',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '0.8rem'
                  }}
                  title="Back to dropdown"
                  aria-label="Back to supplier dropdown"
                >
                  &#8617;
                </button>
              )}
            </div>
          )}
          {formErrors.supplier && <div style={{ color: 'var(--danger)', fontSize: '0.75rem', marginTop: '2px' }}>{formErrors.supplier}</div>}
        </div>

        {/* Order Ref */}
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', color: 'var(--text-900)' }}>
            Order/Ref *
          </label>
          <input
            type="text"
            value={formData.orderRef}
            onChange={(e) => { handleInputChange('orderRef', e.target.value); setFormErrors(prev => ({ ...prev, orderRef: undefined })); }}
            className="input"
            style={formErrors.orderRef ? { border: '1px solid var(--danger)' } : undefined}
            placeholder="Order reference"
          />
          {formErrors.orderRef && <div style={{ color: 'var(--danger)', fontSize: '0.75rem', marginTop: '2px' }}>{formErrors.orderRef}</div>}
        </div>

        {/* Final POD */}
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', color: 'var(--text-900)' }}>
            Final POD *
          </label>
          <input
            type="text"
            value={formData.finalPod}
            onChange={(e) => { handleInputChange('finalPod', e.target.value); setFormErrors(prev => ({ ...prev, finalPod: undefined })); }}
            className="input"
            style={formErrors.finalPod ? { border: '1px solid var(--danger)' } : undefined}
            placeholder="Port of discharge"
          />
          {formErrors.finalPod && <div style={{ color: 'var(--danger)', fontSize: '0.75rem', marginTop: '2px' }}>{formErrors.finalPod}</div>}
        </div>

        {/* Status */}
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', color: 'var(--text-900)' }}>
            Status
          </label>
          <select
            value={formData.latestStatus}
            onChange={(e) => handleInputChange('latestStatus', e.target.value)}
            className="select"
            style={{ width: '100%' }}
          >
            <option value="planned_airfreight">Planned Airfreight</option>
            <option value="planned_seafreight">Planned Seafreight</option>
            <option value="in_transit_airfreight">In Transit Airfreight</option>
            <option value="air_customs_clearance">Air Customs Clearance Event</option>
            <option value="in_transit_roadway">In Transit Roadway</option>
            <option value="in_transit_seaway">In Transit Seaway</option>
            <option value="in_transit_last_mile">In Transit Last Mile</option>
            <option value="moored">Moored</option>
            <option value="berth_working">Berth Working</option>
            <option value="berth_complete">Berth Complete</option>
            <option value="gated_in_port">Gated In Port</option>
            <option value="arrived_pta">Arrived PTA</option>
            <option value="arrived_klm">Arrived KLM</option>
            <option value="arrived_offsite">Arrived OffSite</option>
            <optgroup label="Delayed">
              <option value="delayed_port">Delayed - Port</option>
              <option value="delayed_customs">Delayed - Customs</option>
              <option value="delayed_documents">Delayed - Documents</option>
              <option value="delayed_supplier">Delayed - Supplier</option>
            </optgroup>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>

        {/* Week Number */}
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', color: 'var(--text-900)' }}>
            Week Number
          </label>
          <WeekCalendar
            currentWeek={formData.weekNumber ? parseInt(formData.weekNumber) : null}
            onWeekSelect={handleWeekUpdate}
            selectedWeekDate={selectedWeekDate}
          />
        </div>

        {/* Expected Arrival Date — create mode only */}
        {!isEditMode && (
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', color: 'var(--text-900)' }}>
              Expected Arrival Date <span style={{ color: '#999', fontSize: '0.85em' }}>Optional</span>
            </label>
            <input
              type="date"
              value={formData.selectedWeekDate ? new Date(formData.selectedWeekDate).toISOString().split('T')[0] : ''}
              onChange={(e) => {
                if (e.target.value) {
                  const d = new Date(e.target.value);
                  handleInputChange('selectedWeekDate', d.toISOString());
                  const yearStart = new Date(d.getFullYear(), 0, 1);
                  const weekNumber = Math.ceil((((d - yearStart) / 86400000) + yearStart.getDay() + 1) / 7);
                  handleInputChange('weekNumber', weekNumber.toString());
                } else {
                  handleInputChange('selectedWeekDate', '');
                }
              }}
              className="input"
              style={{ width: '100%' }}
            />
          </div>
        )}

        {/* Product Lines */}
        <div style={{ gridColumn: '1 / -1' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <label style={{ fontWeight: '500', color: 'var(--text-900)' }}>
              Products
            </label>
            <button
              type="button"
              onClick={addProductLine}
              style={{
                background: 'none',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                padding: '2px 10px',
                cursor: 'pointer',
                fontSize: '0.85rem',
                color: 'var(--primary)',
                fontWeight: '600'
              }}
            >
              + Add Product
            </button>
          </div>
          {productLines.map((line, idx) => (
            <div key={idx} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', alignItems: 'center' }}>
              <input
                type="text"
                value={line.name}
                onChange={(e) => updateProductLine(idx, 'name', e.target.value)}
                className="input"
                style={{ flex: 2 }}
                placeholder="Product name"
              />
              <input
                type="number"
                value={line.qty}
                onChange={(e) => updateProductLine(idx, 'qty', e.target.value)}
                className="input"
                style={{ flex: 1 }}
                placeholder="Qty"
                min="0"
              />
              {productLines.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeProductLine(idx)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#d32f2f',
                    fontSize: '1.2rem',
                    padding: '0 4px',
                    lineHeight: 1
                  }}
                  title="Remove product"
                  aria-label="Remove product line"
                >
                  &times;
                </button>
              )}
            </div>
          ))}
        </div>

        {/* CBM — create mode only (amend modal doesn't have it) */}
        {!isEditMode && (
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', color: 'var(--text-500)' }}>
              CBM (Cubic Meters) <span style={{ color: '#999', fontSize: '0.85em' }}>Optional</span>
            </label>
            <input
              type="number"
              step="0.01"
              value={formData.cbm}
              onChange={(e) => { handleInputChange('cbm', e.target.value); setFormErrors(prev => ({ ...prev, cbm: undefined })); }}
              className="input"
              style={{
                width: '100%',
                ...(formErrors.cbm ? { border: '1px solid var(--danger)' } : {})
              }}
              placeholder="Cubic meters (optional)"
              min="0"
            />
            {formErrors.cbm && <div style={{ color: 'var(--danger)', fontSize: '0.75rem', marginTop: '2px' }}>{formErrors.cbm}</div>}
          </div>
        )}

        {/* Pallet Qty */}
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', color: 'var(--text-900)' }}>
            Pallet Qty
          </label>
          <input
            type="number"
            step="0.01"
            value={formData.palletQty || ''}
            onChange={(e) => { handleInputChange('palletQty', e.target.value); setFormErrors(prev => ({ ...prev, palletQty: undefined })); }}
            className="input"
            style={{
              width: '100%',
              ...(formErrors.palletQty ? { border: '1px solid var(--danger)' } : {})
            }}
            placeholder="Pallet quantity"
            min="0"
          />
          {formErrors.palletQty && <div style={{ color: 'var(--danger)', fontSize: '0.75rem', marginTop: '2px' }}>{formErrors.palletQty}</div>}
        </div>

        {/* Receiving Warehouse */}
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', color: 'var(--text-900)' }}>
            Receiving Warehouse
          </label>
          <select
            value={formData.receivingWarehouse || ''}
            onChange={(e) => handleInputChange('receivingWarehouse', e.target.value)}
            className="select"
            style={{ width: '100%' }}
          >
            <option value="">Select Warehouse</option>
            <option value="PRETORIA">PRETORIA</option>
            <option value="KLAPMUTS">KLAPMUTS</option>
            <option value="OFFSITE">OFFSITE</option>
          </select>
        </div>

        {/* Forwarding Agent */}
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', color: 'var(--text-900)' }}>
            Forwarding Agent
          </label>
          <select
            value={formData.forwardingAgent || ''}
            onChange={(e) => handleInputChange('forwardingAgent', e.target.value)}
            className="select"
            style={{ width: '100%' }}
          >
            <option value="">Select Forwarding Agent</option>
            {getForwardingAgents(formData.latestStatus).map(agent => (
              <option key={agent.value} value={agent.value}>{agent.label}</option>
            ))}
          </select>
        </div>

        {/* Vessel / AWB */}
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', color: 'var(--text-900)' }}>
            {isAirfreight(formData.latestStatus) ? 'AWB Number' : 'Vessel Name'}
          </label>
          <input
            type="text"
            value={formData.vesselName || ''}
            onChange={(e) => handleInputChange('vesselName', e.target.value)}
            className="input"
            style={{ width: '100%' }}
            placeholder={isAirfreight(formData.latestStatus) ? 'AWB number' : 'Vessel name'}
          />
        </div>

        {/* Incoterm */}
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', color: 'var(--text-900)' }}>
            Incoterm
          </label>
          <select
            value={formData.incoterm || ''}
            onChange={(e) => handleInputChange('incoterm', e.target.value)}
            className="select"
            style={{ width: '100%' }}
          >
            <option value="">Select Incoterm</option>
            <option value="EXW">EXW - Ex Works</option>
            <option value="FCA">FCA - Free Carrier</option>
            <option value="CPT">CPT - Carriage Paid To</option>
            <option value="CIP">CIP - Carriage and Insurance Paid To</option>
            <option value="DAP">DAP - Delivered At Place</option>
            <option value="DPU">DPU - Delivered At Place Unloaded</option>
            <option value="DDP">DDP - Delivered Duty Paid</option>
            <option value="FAS">FAS - Free Alongside Ship</option>
            <option value="FOB">FOB - Free On Board</option>
            <option value="CFR">CFR - Cost and Freight</option>
            <option value="CIF">CIF - Cost, Insurance and Freight</option>
          </select>
        </div>

        {/* Notes */}
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', color: 'var(--text-900)' }}>
            Notes
          </label>
          <textarea
            value={formData.notes || ''}
            onChange={(e) => handleInputChange('notes', e.target.value)}
            className="input"
            style={{ width: '100%', minHeight: '80px', resize: 'vertical' }}
            placeholder="Additional notes or comments"
          />
        </div>

        {/* Actual Arrival Date */}
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', color: 'var(--text-900)' }}>
            Actual Arrival Date
          </label>
          <input
            type="date"
            value={formData.actualArrivalDate ? formData.actualArrivalDate.split('T')[0] : ''}
            onChange={(e) => handleInputChange('actualArrivalDate', e.target.value)}
            className="input"
            style={{ width: '100%' }}
          />
          <div style={{ fontSize: '0.75rem', color: 'var(--text-500)', marginTop: '0.25rem' }}>
            When the consignment actually arrived — set this as soon as you know,
            regardless of when it gets processed through receiving. Used for
            on-time delivery / lead-time tracking.
          </div>
        </div>

        {/* Reminder Date */}
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', color: 'var(--text-900)' }}>
            Reminder Date
          </label>
          <input
            type="date"
            value={formData.reminderDate ? formData.reminderDate.split('T')[0] : ''}
            onChange={(e) => handleInputChange('reminderDate', e.target.value)}
            className="input"
            style={{ width: '100%' }}
          />
        </div>

        {/* Reminder Note */}
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', color: 'var(--text-900)' }}>
            Reminder Note
          </label>
          <input
            type="text"
            value={formData.reminderNote || ''}
            onChange={(e) => handleInputChange('reminderNote', e.target.value)}
            className="input"
            style={{ width: '100%' }}
            placeholder="e.g., Payment due, Follow up with supplier..."
          />
        </div>
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '2rem' }}>
        <button
          onClick={handleClose}
          style={{
            padding: '0.75rem 1.5rem',
            backgroundColor: '#6c757d',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '0.9rem',
            transition: 'background-color 0.2s ease'
          }}
          onMouseEnter={(e) => e.target.style.backgroundColor = '#545b62'}
          onMouseLeave={(e) => e.target.style.backgroundColor = '#6c757d'}
        >
          Cancel
        </button>

        {isEditMode && onDelete && (
          <button
            onClick={handleDelete}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: 'var(--danger)',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '0.9rem',
              transition: 'background-color 0.2s ease'
            }}
            onMouseEnter={(e) => e.target.style.backgroundColor = '#c82333'}
            onMouseLeave={(e) => e.target.style.backgroundColor = 'var(--danger)'}
          >
            Remove Shipment
          </button>
        )}

        <button
          onClick={handleSubmit}
          disabled={!isValid}
          style={{
            padding: '0.75rem 1.5rem',
            backgroundColor: !isValid ? '#6c757d' : (isEditMode ? 'var(--info)' : 'var(--success)'),
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: !isValid ? 'not-allowed' : 'pointer',
            fontSize: '0.9rem',
            transition: 'background-color 0.2s ease'
          }}
          onMouseEnter={(e) => {
            if (isValid) e.target.style.backgroundColor = isEditMode ? '#0056b3' : '#218838';
          }}
          onMouseLeave={(e) => {
            if (isValid) e.target.style.backgroundColor = isEditMode ? 'var(--info)' : 'var(--success)';
          }}
        >
          {isEditMode ? 'Save Changes' : 'Add Shipment'}
        </button>
      </div>

      <div style={{ fontSize: '0.8rem', color: '#6c757d', marginTop: '1rem', fontStyle: 'italic' }}>
        * Required fields
      </div>
    </ResizableModal>
  );
}

export default ShipmentFormModal;
