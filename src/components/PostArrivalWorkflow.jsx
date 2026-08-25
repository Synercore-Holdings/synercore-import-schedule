import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { authFetch } from '../utils/authFetch';
import { authUtils } from '../utils/auth';
import { ShipmentStatus, InspectionStatus, ReceivingStatus, STATUS_LABELS } from '../types/shipment';
import { getApiUrl } from '../config/api';
import PostArrivalWizard from './PostArrivalWizard';
import { useNotification } from '../contexts/NotificationContext';
import {
  Truck, PackageOpen, Clock, Search, XCircle, CheckCircle, ClipboardList, Check, Store, File,
} from 'lucide-react';

function PostArrivalWorkflow() {
  const { showSuccess, showError, showWarning, confirm: confirmAction } = useNotification();
  const [searchParams, setSearchParams] = useSearchParams();
  const globalSearchTerm = searchParams.get('search') || '';
  const [postArrivalShipments, setPostArrivalShipments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedShipment, setSelectedShipment] = useState(null);
  const [showWorkflowDialog, setShowWorkflowDialog] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const [useWizard, setUseWizard] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [detailShipment, setDetailShipment] = useState(null);
  const [searchTerm, setSearchTerm] = useState(globalSearchTerm || '');

  const [truckInfoMap, setTruckInfoMap] = useState({});

  const [damagePhotos, setDamagePhotos] = useState({}); // { [shipmentId]: [{ id, file_name, ... }] }
  const [photoBlobUrls, setPhotoBlobUrls] = useState({}); // { [photoId]: objectURL }
  const [uploadingPhotos, setUploadingPhotos] = useState({}); // { [shipmentId]: boolean }
  const [viewingPhoto, setViewingPhoto] = useState(null); // { url, fileName }

  const [workflowData, setWorkflowData] = useState({
    inspectedBy: '',
    inspectionNotes: '',
    inspectionPassed: true,
    inspectionOnHold: false,
    holdTypes: [],
    inspectionFailed: false,
    failureReasons: [],
    receivedBy: '',
    receivingNotes: '',
    receivedQuantity: '',
    discrepancies: []
  });

  const isAdmin = authUtils.getUser()?.role === 'admin';
  const canBulkShipToStored = (shipment) =>
    shipment.latest_status !== 'stored' && shipment.latest_status !== 'inspection_failed';

  const [showRejectionDialog, setShowRejectionDialog] = useState(false);
  const [rejectionData, setRejectionData] = useState({
    rejectedBy: '',
    rejectionReason: '',
    archiveShipment: true
  });

  useEffect(() => {
    fetchPostArrivalShipments();
  }, []);

  useEffect(() => {
    postArrivalShipments
      .filter(s => s.latest_status === 'inspection_failed' && !(s.id in damagePhotos))
      .forEach(s => fetchDamagePhotos(s.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postArrivalShipments]);

  useEffect(() => {
    if (globalSearchTerm) {
      setSearchTerm(globalSearchTerm);
      // Clear the search param from URL after consuming it
      const params = new URLSearchParams(searchParams);
      params.delete('search');
      setSearchParams(params, { replace: true });
    }
  }, [globalSearchTerm]);

  // The /api/shipments/post-arrival endpoint returns raw snake_case DB columns
  // (order_ref, final_pod, inspection_date, ...) rather than the camelCase shape
  // the rest of this component expects, so normalize before using it.
  const normalizeShipment = (s) => ({
    ...s,
    orderRef: s.orderRef || s.order_ref,
    productName: s.productName || s.product_name,
    palletQty: s.palletQty ?? s.pallet_qty,
    finalPod: s.finalPod || s.final_pod,
    receivingWarehouse: s.receivingWarehouse || s.receiving_warehouse,
    weekNumber: s.weekNumber ?? s.week_number,
    freightType: s.freightType || s.freight_type,
    unloadingStartDate: s.unloadingStartDate || s.unloading_start_date,
    unloadingCompletedDate: s.unloadingCompletedDate || s.unloading_completed_date,
    inspectionDate: s.inspectionDate || s.inspection_date,
    inspectionStatus: s.inspectionStatus || s.inspection_status,
    inspectionNotes: s.inspectionNotes || s.inspection_notes,
    inspectedBy: s.inspectedBy || s.inspected_by,
    receivingDate: s.receivingDate || s.receiving_date,
    receivingStatus: s.receivingStatus || s.receiving_status,
    receivingNotes: s.receivingNotes || s.receiving_notes,
    receivedBy: s.receivedBy || s.received_by,
    receivedQuantity: s.receivedQuantity ?? s.received_quantity,
  });

  const fetchPostArrivalShipments = async () => {
    try {
      setLoading(true);
      const response = await authFetch(getApiUrl('/api/shipments/post-arrival'));
      if (response.ok) {
        const shipments = (await response.json()).map(normalizeShipment);
        setPostArrivalShipments(shipments);
        // Fetch truck info for each shipment
        const truckMap = {};
        await Promise.all(shipments.map(async (s) => {
          try {
            const sid = s.id || s._id;
            const truckRes = await authFetch(getApiUrl(`/api/docks/truck-for-shipment/${sid}`));
            if (truckRes.ok) {
              const info = await truckRes.json();
              if (info) truckMap[sid] = info;
            }
          } catch { /* ignore */ }
        }));
        setTruckInfoMap(truckMap);
      } else {
        console.error('Failed to fetch post-arrival shipments');
      }
    } catch (error) {
      console.error('Error fetching post-arrival shipments:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchDamagePhotos = async (shipmentId) => {
    try {
      const res = await authFetch(getApiUrl(`/api/shipments/${shipmentId}/damage-photos`));
      if (!res.ok) return;
      const { data } = await res.json();
      setDamagePhotos(prev => ({ ...prev, [shipmentId]: data }));

      // Fetch each photo's file as a blob so it can be shown in an <img> without
      // exposing the auth-protected download URL directly (authFetch attaches the token).
      data.forEach(async (photo) => {
        try {
          const imgRes = await authFetch(getApiUrl(`/api/shipments/${shipmentId}/damage-photos/${photo.id}`));
          if (imgRes.ok) {
            const blob = await imgRes.blob();
            setPhotoBlobUrls(prev => ({ ...prev, [photo.id]: URL.createObjectURL(blob) }));
          }
        } catch { /* ignore */ }
      });
    } catch { /* ignore */ }
  };

  const handleDamagePhotoUpload = async (shipmentId, files) => {
    if (!files || files.length === 0) return;
    setUploadingPhotos(prev => ({ ...prev, [shipmentId]: true }));
    try {
      const formData = new FormData();
      Array.from(files).forEach(f => formData.append('photos', f));
      const res = await authFetch(getApiUrl(`/api/shipments/${shipmentId}/damage-photos`), {
        method: 'POST',
        body: formData
      });
      if (res.ok) {
        await fetchDamagePhotos(shipmentId);
      } else {
        const err = await res.json().catch(() => ({}));
        showError(`❌ Error uploading photo: ${err.error || 'Unknown error'}`);
      }
    } catch (error) {
      showError('❌ Error uploading photo. Please try again.');
    } finally {
      setUploadingPhotos(prev => ({ ...prev, [shipmentId]: false }));
    }
  };

  const handleDeleteDamagePhoto = async (shipmentId, photoId) => {
    try {
      const res = await authFetch(getApiUrl(`/api/shipments/${shipmentId}/damage-photos/${photoId}`), { method: 'DELETE' });
      if (res.ok) {
        setDamagePhotos(prev => ({ ...prev, [shipmentId]: (prev[shipmentId] || []).filter(p => p.id !== photoId) }));
      }
    } catch { /* ignore */ }
  };

  const getStatusColor = (status) => {
    const colors = {
      'arrived_pta': 'var(--success)',
      'arrived_klm': 'var(--success)',
      'arrived_offsite': 'var(--success)',
      'unloading': 'var(--warning)',
      'inspection_pending': 'var(--warning)',
      'inspecting': 'var(--info)',
      'inspection_failed': 'var(--danger)',
      'inspection_passed': 'var(--success)',
      'receiving': 'var(--navy-600)',
      'received': 'var(--success)',
      'stored': 'var(--text-500)'
    };
    return colors[status] || 'var(--text-500)';
  };

  const getStatusIcon = (status) => {
    const map = {
      arrived_pta: Truck,
      arrived_klm: Truck,
      arrived_offsite: Truck,
      unloading: PackageOpen,
      inspection_pending: Clock,
      inspecting: Search,
      inspection_failed: XCircle,
      inspection_passed: CheckCircle,
      receiving: ClipboardList,
      received: Check,
      stored: Store,
    };
    const Icon = map[status] || File;
    return <Icon size={14} strokeWidth={2} />;
  };

  const getStatusLabel = (status) => STATUS_LABELS[status] || status;

  const getAvailableActions = (shipment) => {
    const actions = [];
    // Use latest_status from database (snake_case), not latestStatus
    const status = shipment.latest_status;

    if (status === 'arrived_pta' || status === 'arrived_klm' || status === 'arrived_offsite') {
      actions.push({ key: 'start-unloading', label: 'Start Unloading', icon: '📦', color: 'var(--warning)' });
    } else if (status === 'unloading') {
      actions.push({ key: 'complete-unloading', label: 'Complete Unloading', icon: '✅', color: 'var(--success)' });
    } else if (status === 'inspection_pending') {
      actions.push({ key: 'start-inspection', label: 'Start Inspection', icon: '🔍', color: 'var(--info)' });
    } else if (status === 'inspecting') {
      actions.push({ key: 'complete-inspection', label: 'Complete Inspection', icon: '✅', color: 'var(--success)' });
    } else if (status === 'inspection_passed') {
      actions.push({ key: 'start-receiving', label: 'Start Receiving', icon: '📋', color: 'var(--navy-600)' });
    } else if (status === 'inspection_failed') {
      actions.push({ key: 'start-inspection', label: 'Re-inspect', icon: '🔍', color: 'var(--info)' });
      actions.push({ key: 'receive-partial', label: 'Receive Accepted Balance', icon: '📋', color: 'var(--navy-600)' });
      actions.push({ key: 'reject-shipment', label: 'Reject/Return to Supplier', icon: '↩️', color: 'var(--danger)' });
    } else if (status === 'receiving' || status === 'receiving_goods') {
      actions.push({ key: 'complete-receiving', label: 'Complete Receiving', icon: '✔️', color: 'var(--success)' });
    } else if (status === 'received' || status === 'in_warehouse') {
      actions.push({ key: 'mark-stored', label: 'Mark as Stored', icon: '🏪', color: 'var(--text-500)' });
    }

    // Admin-only: skip entire workflow
    if (isAdmin) {
      actions.push({ key: 'admin-complete', label: 'Skip to Stored', icon: '⚡', color: 'var(--danger)' });
    }

    // Always add the ability to amend status (revert to shipping schedule)
    actions.push({ key: 'amend-status', label: 'Amend Status', icon: '🔄', color: 'var(--danger)' });

    return actions;
  };

  const performWorkflowAction = async (shipment, action) => {
    if (action === 'reject-shipment') {
      setSelectedShipment(shipment);
      setShowRejectionDialog(true);
      return;
    }

    if (action === 'receive-partial') {
      // Traditional dialog only handles inspection_in_progress/inspection_passed/receiving_goods
      // statuses, not inspection_failed, so always use the wizard for this action.
      setSelectedShipment(shipment);
      setWorkflowData({
        ...workflowData,
        workflowAction: action,
        receivedQuantity: shipment.quantity || ''
      });
      setShowWizard(true);
      return;
    }

    if (action === 'complete-inspection' || action === 'start-inspection' ||
        action === 'complete-receiving' || action === 'start-receiving') {
      setSelectedShipment(shipment);
      setWorkflowData({
        ...workflowData,
        workflowAction: action, // Store the action being performed
        receivedQuantity: shipment.quantity || ''
      });

      // Offer choice between wizard and traditional form
      const useWizardChoice = await confirmAction({
        title: 'Choose Workflow Style',
        message: 'Would you like to use the new Step-by-Step Workflow Wizard?\n\nConfirm = Wizard (Recommended)\nCancel = Traditional Form',
        confirmText: 'Use Wizard',
        cancelText: 'Use Form',
        type: 'success',
      });
      if (useWizardChoice) {
        setShowWizard(true);
      } else {
        setShowWorkflowDialog(true);
      }
      return;
    }

    if (action === 'mark-stored') {
      try {
        setActionLoading(true);
        const response = await authFetch(getApiUrl(`/api/shipments/${shipment.id}/status`), {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            status: 'stored'
          })
        });

        if (response.ok) {
          showSuccess(`✅ Shipment ${shipment.orderRef} marked as stored successfully!`);
          await fetchPostArrivalShipments();
        } else {
          const error = await response.json();
          showError(`❌ Error: ${error.error}`);
        }
      } catch (error) {
        console.error('Error marking shipment as stored:', error);
        showError('❌ Error marking shipment as stored. Please try again.');
      } finally {
        setActionLoading(false);
      }
      return;
    }

    if (action === 'admin-complete') {
      const confirmed = await confirmAction({
        title: 'Admin: Skip to Stored',
        message: `Skip all remaining workflow steps for ${shipment.orderRef}?\n\nThis will mark unloading, inspection (passed), and receiving as complete, then set status to Stored.`,
        confirmText: 'Skip to Stored',
        cancelText: 'Cancel',
        type: 'warning',
      });
      if (!confirmed) return;
      try {
        setActionLoading(true);
        const response = await authFetch(getApiUrl(`/api/shipments/${shipment.id}/admin-complete`), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({})
        });
        if (response.ok) {
          showSuccess(`Shipment ${shipment.orderRef} workflow completed and stored.`);
          await fetchPostArrivalShipments();
        } else {
          const error = await response.json();
          showError(`Error: ${error.error}`);
        }
      } catch (error) {
        showError('Error completing workflow. Please try again.');
      } finally {
        setActionLoading(false);
      }
      return;
    }

    if (action === 'amend-status') {
      const confirmed = await confirmAction({
        title: 'Amend Shipment Status',
        message: `Are you sure you want to amend the status for shipment ${shipment.orderRef}?\n\nThis will revert it back to "In Transit" status and remove it from the Post-Arrival Workflow, making it appear in the Shipping Schedule again.`,
        confirmText: 'Amend Status',
        cancelText: 'Cancel',
        type: 'warning',
      });
      if (!confirmed) return;
      try {
        setActionLoading(true);
        const response = await authFetch(getApiUrl(`/api/shipments/${shipment.id}/status`), {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'in_transit_seafreight' })
        });
        if (response.ok) {
          showSuccess(`Shipment ${shipment.orderRef} has been reverted to shipping status and will now appear in the Shipping Schedule.`);
          await fetchPostArrivalShipments();
        } else {
          const error = await response.json();
          showError(`Error: ${error.error}`);
        }
      } catch (error) {
        console.error('Error amending shipment status:', error);
        showError('Error amending shipment status. Please try again.');
      } finally {
        setActionLoading(false);
      }
      return;
    }

    try {
      setActionLoading(true);
      const endpoint = `/api/shipments/${shipment.id}/${action.replace('_', '-')}`;

      const response = await authFetch(getApiUrl(endpoint), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({})
      });

      if (response.ok) {
        showSuccess(`✅ Workflow action completed successfully!`);
        await fetchPostArrivalShipments();
      } else {
        const error = await response.json();
        showError(`❌ Error: ${error.error}`);
      }
    } catch (error) {
      console.error('Error performing workflow action:', error);
      showError('❌ Error performing action. Please try again.');
    } finally {
      setActionLoading(false);
    }
  };

  const submitWorkflowAction = async (action) => {
    try {
      setActionLoading(true);
      const endpoint = `/api/shipments/${selectedShipment.id}/${action.replace('_', '-')}`;

      let requestBody = {};

      if (action === 'start-inspection') {
        requestBody = {
          inspectedBy: workflowData.inspectedBy
        };
      } else if (action === 'complete-inspection') {
        requestBody = {
          passed: workflowData.inspectionPassed && !workflowData.inspectionOnHold && !workflowData.inspectionFailed,
          notes: workflowData.inspectionNotes,
          inspectedBy: workflowData.inspectedBy
        };
      } else if (action === 'start-receiving') {
        requestBody = {
          receivedBy: workflowData.receivedBy
        };
      } else if (action === 'complete-receiving') {
        requestBody = {
          receivedQuantity: parseInt(workflowData.receivedQuantity) || 0,
          notes: workflowData.receivingNotes,
          receivedBy: workflowData.receivedBy,
          discrepancies: workflowData.discrepancies
        };
      }

      const response = await authFetch(getApiUrl(endpoint), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      });

      if (response.ok) {
        showSuccess(`✅ Workflow action completed successfully!`);
        setShowWorkflowDialog(false);
        setSelectedShipment(null);
        setWorkflowData({
          inspectedBy: '',
          inspectionNotes: '',
          inspectionPassed: true,
          inspectionOnHold: false,
          holdTypes: [],
          inspectionFailed: false,
          failureReasons: [],
          receivedBy: '',
          receivingNotes: '',
          receivedQuantity: '',
          discrepancies: []
        });
        await fetchPostArrivalShipments();
      } else {
        const error = await response.json();
        showError(`❌ Error: ${error.error}`);
      }
    } catch (error) {
      console.error('Error submitting workflow action:', error);
      showError('❌ Error performing action. Please try again.');
    } finally {
      setActionLoading(false);
    }
  };

  const submitRejection = async () => {
    try {
      if (!rejectionData.rejectionReason.trim()) {
        showWarning('⚠️ Please provide a rejection reason');
        return;
      }

      setActionLoading(true);
      const response = await authFetch(getApiUrl(`/api/shipments/${selectedShipment.id}/reject-shipment`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          rejectionReason: rejectionData.rejectionReason,
          rejectedBy: rejectionData.rejectedBy,
          archiveShipment: rejectionData.archiveShipment
        })
      });

      if (response.ok) {
        const result = await response.json();
        showSuccess(`✅ ${result.message || 'Shipment rejected successfully'}`);
        setShowRejectionDialog(false);
        setSelectedShipment(null);
        setRejectionData({
          rejectedBy: '',
          rejectionReason: '',
          archiveShipment: true
        });
        await fetchPostArrivalShipments();
      } else {
        const error = await response.json();
        showError(`❌ Error: ${error.error}`);
      }
    } catch (error) {
      console.error('Error rejecting shipment:', error);
      showError('❌ Error rejecting shipment. Please try again.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleShipAllToStored = async () => {
    const eligible = postArrivalShipments.filter(canBulkShipToStored);
    const skippedInspectionFailed = postArrivalShipments.filter(s => s.latest_status === 'inspection_failed').length;
    if (eligible.length === 0) {
      showWarning(
        skippedInspectionFailed > 0
          ? 'No shipments available to ship to stored. Inspection failed shipments were skipped.'
          : 'No shipments available to ship to stored.'
      );
      return;
    }

    const confirmed = await confirmAction({
      title: 'Ship All to Stored',
      message: `Skip all remaining workflow steps for ${eligible.length} shipment(s)?\n\nThis will mark unloading, inspection (passed), and receiving as complete, then set status to Stored. Inspection failed shipments will be ignored.`,
      confirmText: 'Ship All',
      cancelText: 'Cancel',
      type: 'warning',
    });
    if (!confirmed) return;

    try {
      setActionLoading(true);
      const results = await Promise.allSettled(
        eligible.map(s =>
          authFetch(getApiUrl(`/api/shipments/${s.id}/admin-complete`), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
          }).then(async res => {
            if (!res.ok) {
              const err = await res.json().catch(() => ({}));
              throw new Error(err.error || `Failed for ${s.orderRef}`);
            }
            return s.orderRef;
          })
        )
      );

      const succeeded = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected');

      if (failed.length === 0) {
        const skippedMessage = skippedInspectionFailed > 0 ? ` ${skippedInspectionFailed} inspection failed shipment(s) skipped.` : '';
        showSuccess(`✅ All ${succeeded} eligible shipment(s) marked as stored.${skippedMessage}`);
      } else {
        showError(`Stored ${succeeded} of ${eligible.length}. ${failed.length} failed: ${failed.map(f => f.reason?.message).join('; ')}`);
      }
      await fetchPostArrivalShipments();
    } catch (error) {
      console.error('Error shipping all to stored:', error);
      showError('Error shipping all to stored. Please try again.');
    } finally {
      setActionLoading(false);
    }
  };

  const getWorkflowProgress = (shipment) => {
    const states = [
      'arrived_pta', 'arrived_klm', 'arrived_offsite', 'unloading', 'inspection_pending',
      'inspecting', 'inspection_failed', 'inspection_passed', 'receiving', 'received', 'stored'
    ];

    const currentIndex = states.indexOf(shipment.latest_status);
    const percentage = Math.round(((currentIndex + 1) / states.length) * 100);

    return {
      currentStep: currentIndex + 1,
      totalSteps: states.length,
      percentage: percentage
    };
  };

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <div>Loading post-arrival workflow...</div>
      </div>
    );
  }

  return (
    <div style={{ padding: '1rem' }}>
      <div className="brand-strip" />
      <div style={{
        marginBottom: '0.75rem', paddingBottom: '0.75rem',
        borderBottom: '1px solid var(--border)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem',
      }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-900)' }}>
            Post-Arrival Workflow
          </h2>
          <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: 'var(--text-500)' }}>
            Manage shipments through unloading, inspection, receiving, and storage
          </p>
        </div>
        {isAdmin && postArrivalShipments.some(canBulkShipToStored) && (
          <button
            onClick={handleShipAllToStored}
            disabled={actionLoading}
            style={{
              padding: '0.6rem 1rem',
              backgroundColor: actionLoading ? '#ccc' : 'var(--danger)',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: actionLoading ? 'not-allowed' : 'pointer',
              fontSize: '0.85rem',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              whiteSpace: 'nowrap',
            }}
            title="Admin only: Skip workflow for all shipments and mark them as stored"
          >
            <span>⚡</span>
            Ship all to stored
          </button>
        )}
      </div>

      {searchTerm && (
        <div style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, color: 'var(--text-500)' }}>Filtered by: <strong>{searchTerm}</strong></span>
          <button onClick={() => setSearchTerm('')} className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 10px' }}>Clear</button>
        </div>
      )}

      {(() => {
        const displayed = searchTerm
          ? postArrivalShipments.filter(s =>
              (s.orderRef || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
              (s.supplier || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
              (s.productName || '').toLowerCase().includes(searchTerm.toLowerCase())
            )
          : postArrivalShipments;
        return displayed.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '3rem',
          backgroundColor: 'var(--surface-2)',
          borderRadius: '8px',
          border: '2px dashed var(--border)'
        }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📦</div>
          <h3 style={{ margin: '0 0 0.5rem 0', color: 'var(--text-500)' }}>No Shipments in Post-Arrival Workflow</h3>
          <p style={{ margin: 0, color: 'var(--text-500)' }}>
            Shipments will appear here once they reach "ARRIVED" status.
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '1rem' }}>
          {displayed.map((shipment) => {
            const progress = getWorkflowProgress(shipment);
            const actions = getAvailableActions(shipment);

            return (
              <div key={shipment.id} className="dash-panel" style={{
                padding: '1.5rem'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                  <div>
                    <h4 style={{ margin: '0 0 0.5rem 0', color: 'var(--text-900)' }}>
                      {shipment.supplier} - <span
                        onClick={() => setDetailShipment(shipment)}
                        style={{ color: 'var(--accent)', cursor: 'pointer', borderBottom: '1px dashed var(--accent)' }}
                        title="View order details"
                      >{shipment.orderRef}</span>
                    </h4>
                    {shipment.productName && (
                      <div style={{ color: 'var(--text-700)', fontSize: '0.85rem', fontWeight: 600, marginBottom: '2px' }}>
                        🧪 {shipment.productName}
                      </div>
                    )}
                    <div style={{ color: 'var(--text-500)', fontSize: '0.9rem' }}>
                      📍 {shipment.finalPod} | 📦 {shipment.quantity} units | 🏭 {shipment.receivingWarehouse} | 🔖 APO: {shipment.orderRef || 'Not set'}
                    </div>
                    {truckInfoMap[shipment.id] && (
                      <div style={{ color: 'var(--info)', fontSize: '0.82rem', marginTop: '2px' }}>
                        🚛 {truckInfoMap[shipment.id].carrier || 'Truck'}{truckInfoMap[shipment.id].vehicle_reg ? ` (${truckInfoMap[shipment.id].vehicle_reg})` : ''}{truckInfoMap[shipment.id].dock_number ? ` — ${truckInfoMap[shipment.id].dock_number}` : ''}
                      </div>
                    )}
                  </div>

                  <div style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.5rem 1rem',
                    backgroundColor: getStatusColor(shipment.latest_status),
                    color: 'white',
                    borderRadius: '20px',
                    fontSize: '0.85rem',
                    fontWeight: '600'
                  }}>
                    <span>{getStatusIcon(shipment.latest_status)}</span>
                    {getStatusLabel(shipment.latest_status)}
                  </div>
                </div>

                {/* Progress Bar */}
                <div style={{ marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-500)' }}>
                      Progress: Step {progress.currentStep} of {progress.totalSteps}
                    </span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-500)', fontWeight: '600' }}>
                      {progress.percentage}%
                    </span>
                  </div>
                  <div style={{
                    width: '100%',
                    height: '8px',
                    backgroundColor: '#e9ecef',
                    borderRadius: '4px',
                    overflow: 'hidden'
                  }}>
                    <div style={{
                      width: `${progress.percentage}%`,
                      height: '100%',
                      backgroundColor: getStatusColor(shipment.latest_status),
                      borderRadius: '4px',
                      transition: 'width 0.3s ease'
                    }} />
                  </div>
                </div>

                {/* Workflow Details */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
                  {shipment.unloadingStartDate && (
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-500)' }}>
                      🚚 <strong>Unloading Started:</strong><br />
                      {new Date(shipment.unloadingStartDate).toLocaleString()}
                    </div>
                  )}
                  {shipment.inspectionDate && (
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-500)' }}>
                      🔍 <strong>Inspection:</strong><br />
                      {shipment.inspectedBy} ({new Date(shipment.inspectionDate).toLocaleDateString()})
                    </div>
                  )}
                  {shipment.receivingDate && (
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-500)' }}>
                      📋 <strong>Receiving:</strong><br />
                      {shipment.receivedBy} ({new Date(shipment.receivingDate).toLocaleDateString()})
                    </div>
                  )}
                  {shipment.receivedQuantity !== null && shipment.receivedQuantity !== undefined && (
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-500)' }}>
                      📦 <strong>Received:</strong><br />
                      {shipment.receivedQuantity} / {shipment.quantity} units
                      {shipment.receivingStatus === 'partial' && (
                        <span style={{
                          marginLeft: '6px', padding: '1px 6px', borderRadius: '10px',
                          backgroundColor: 'var(--warning)', color: 'white', fontSize: '0.7rem', fontWeight: 600
                        }}>
                          ⚠ Partial
                        </span>
                      )}
                      {shipment.receivingStatus === 'partial' && shipment.quantity > shipment.receivedQuantity && (
                        <div style={{ color: 'var(--warning)', marginTop: '2px' }}>
                          Rejected: {shipment.quantity - shipment.receivedQuantity} units
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Notes */}
                {(shipment.inspectionNotes || shipment.receivingNotes) && (
                  <div style={{ marginBottom: '1rem' }}>
                    {shipment.inspectionNotes && (
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-500)', marginBottom: '0.5rem' }}>
                        <strong>Inspection Notes:</strong> {shipment.inspectionNotes}
                      </div>
                    )}
                    {shipment.receivingNotes && (
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-500)' }}>
                        <strong>Receiving Notes:</strong> {shipment.receivingNotes}
                      </div>
                    )}
                  </div>
                )}

                {/* Damage Photos */}
                {shipment.latest_status === 'inspection_failed' && (
                  <div style={{
                    marginBottom: '1rem', padding: '0.75rem',
                    backgroundColor: 'var(--surface-2)', borderRadius: '8px',
                    border: '1px dashed var(--border)'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                      <strong style={{ fontSize: '0.85rem', color: 'var(--text-700)' }}>📷 Damage Photos</strong>
                      <label style={{
                        fontSize: '0.75rem', padding: '4px 10px',
                        backgroundColor: 'var(--danger)', color: 'white', borderRadius: '4px',
                        cursor: uploadingPhotos[shipment.id] ? 'not-allowed' : 'pointer',
                        opacity: uploadingPhotos[shipment.id] ? 0.6 : 1
                      }}>
                        {uploadingPhotos[shipment.id] ? 'Uploading...' : '+ Add Photo'}
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          disabled={uploadingPhotos[shipment.id]}
                          onChange={(e) => {
                            handleDamagePhotoUpload(shipment.id, e.target.files);
                            e.target.value = '';
                          }}
                          style={{ display: 'none' }}
                        />
                      </label>
                    </div>
                    {(damagePhotos[shipment.id] || []).length > 0 ? (
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        {damagePhotos[shipment.id].map((photo) => (
                          <div key={photo.id} style={{ position: 'relative' }}>
                            <img
                              src={photoBlobUrls[photo.id]}
                              alt={photo.file_name}
                              onClick={() => photoBlobUrls[photo.id] && setViewingPhoto({ url: photoBlobUrls[photo.id], fileName: photo.file_name })}
                              style={{
                                width: '64px', height: '64px', objectFit: 'cover', borderRadius: '6px',
                                cursor: photoBlobUrls[photo.id] ? 'pointer' : 'default',
                                border: '1px solid var(--border)', backgroundColor: '#e9ecef'
                              }}
                            />
                            <button
                              onClick={() => handleDeleteDamagePhoto(shipment.id, photo.id)}
                              title="Remove photo"
                              style={{
                                position: 'absolute', top: '-6px', right: '-6px', width: '18px', height: '18px',
                                borderRadius: '50%', border: 'none', backgroundColor: 'var(--danger)', color: 'white',
                                fontSize: '11px', lineHeight: '18px', cursor: 'pointer', padding: 0
                              }}
                            >×</button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-500)' }}>No photos uploaded yet</div>
                    )}
                  </div>
                )}

                {/* Actions */}
                {actions.length > 0 && (
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {actions.map((action) => (
                      <button
                        key={action.key}
                        onClick={() => performWorkflowAction(shipment, action.key)}
                        disabled={actionLoading}
                        style={{
                          padding: '0.5rem 1rem',
                          backgroundColor: action.color,
                          color: 'white',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: actionLoading ? 'not-allowed' : 'pointer',
                          fontSize: '0.8rem',
                          fontWeight: '500',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                          opacity: actionLoading ? 0.6 : 1
                        }}
                      >
                        <span>{action.icon}</span>
                        {action.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      );
      })()}

      {/* Workflow Wizard - New Step-by-Step UI */}
      {showWizard && selectedShipment && (
        <PostArrivalWizard
          shipment={selectedShipment}
          action={workflowData.workflowAction}
          onComplete={async (formData) => {
            // Handle wizard completion
            try {
              setActionLoading(true);

              // Determine which workflow endpoints to call based on the action being performed
              const currentStatus = selectedShipment.latest_status;
              const workflowAction = workflowData.workflowAction;
              let apiCalls = [];

              // Handle receive-partial: accepting the balance of a failed-inspection
              // shipment in one step. start-receiving must succeed before
              // complete-receiving is valid, so these run sequentially, not via apiCalls.
              if (workflowAction === 'receive-partial') {
                const startRes = await authFetch(getApiUrl(`/api/shipments/${selectedShipment.id}/start-receiving`), {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ receivedBy: formData.receivedBy || '' })
                });
                if (!startRes.ok) {
                  const errorData = await startRes.json().catch(() => ({}));
                  showError(`❌ Error: ${errorData.error || 'Failed to start receiving'}`);
                  return;
                }
                const completeRes = await authFetch(getApiUrl(`/api/shipments/${selectedShipment.id}/complete-receiving`), {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    receivedQuantity: parseInt(formData.receivedQuantity) || 0,
                    receivedBy: formData.receivedBy || '',
                    discrepancies: formData.discrepancies || ''
                  })
                });
                if (completeRes.ok) {
                  showSuccess('✅ Accepted balance received and stored successfully!');
                  setShowWizard(false);
                  setSelectedShipment(null);
                  await fetchPostArrivalShipments();
                } else {
                  const errorData = await completeRes.json().catch(() => ({}));
                  showError(`❌ Error: ${errorData.error || 'Failed to complete receiving'}`);
                }
                return;
              }

              // Handle start-inspection
              if (workflowAction === 'start-inspection') {
                apiCalls.push(
                  authFetch(getApiUrl(`/api/shipments/${selectedShipment.id}/start-inspection`), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      inspectedBy: formData.inspectedBy || ''
                    })
                  })
                );
              }

              // Handle complete-inspection
              if (workflowAction === 'complete-inspection') {
                apiCalls.push(
                  authFetch(getApiUrl(`/api/shipments/${selectedShipment.id}/complete-inspection`), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      passed: formData.inspectionStatus === 'inspection_passed',
                      notes: formData.inspectionNotes,
                      inspectedBy: formData.inspectedBy || ''
                    })
                  })
                );
              }

              // Handle start-receiving
              if (workflowAction === 'start-receiving') {
                apiCalls.push(
                  authFetch(getApiUrl(`/api/shipments/${selectedShipment.id}/start-receiving`), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      receivedBy: formData.receivedBy || ''
                    })
                  })
                );
              }

              // Handle complete-receiving
              if (workflowAction === 'complete-receiving') {
                apiCalls.push(
                  authFetch(getApiUrl(`/api/shipments/${selectedShipment.id}/complete-receiving`), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      receivedQuantity: parseInt(formData.receivedQuantity) || 0,
                      receivedBy: formData.receivedBy || '',
                      discrepancies: formData.discrepancies || ''
                    })
                  })
                );
              }

              // Execute all workflow calls
              const responses = await Promise.all(apiCalls);

              // Check if all responses were successful
              const allSuccess = responses.every(res => res.ok);

              if (allSuccess || responses.length === 0) {
                // If mark as stored was checked, make another call to mark as stored
                if (formData.markAsStored && (workflowAction === 'complete-receiving' || workflowAction === 'start-receiving')) {
                  const storedResponse = await authFetch(getApiUrl(`/api/shipments/${selectedShipment.id}/status`), {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status: 'stored' })
                  });

                  if (storedResponse.ok) {
                    showSuccess('✅ Shipment received and marked as stored successfully!');
                  } else {
                    const errorData = await storedResponse.json();
                    showError(`❌ Receiving completed but failed to mark as stored: ${errorData.error || 'Unknown error'}`);
                  }
                } else {
                  showSuccess('✅ Post-arrival workflow completed successfully!');
                }
                setShowWizard(false);
                setSelectedShipment(null);
                await fetchPostArrivalShipments(); // Refresh list
              } else {
                const failedResponse = responses.find(res => !res.ok);
                const errorData = await failedResponse.json();
                showError(`❌ Failed to save post-arrival workflow: ${errorData.error || 'Unknown error'}`);
              }
            } catch (error) {
              console.error('Error saving workflow:', error);
              showError(`❌ Error saving workflow: ${error.message}`);
            } finally {
              setActionLoading(false);
            }
          }}
          onCancel={() => {
            setShowWizard(false);
            setSelectedShipment(null);
          }}
        />
      )}

      {/* Workflow Dialog */}
      {showWorkflowDialog && selectedShipment && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: 'white',
            padding: '2rem',
            borderRadius: '12px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            width: '90%',
            maxWidth: '500px',
            maxHeight: '80vh',
            overflow: 'auto'
          }}>
            <div style={{ marginBottom: '1.5rem' }}>
              <h3 style={{ margin: '0 0 0.5rem 0', color: 'var(--text-900)' }}>
                {selectedShipment.latest_status === 'inspection_in_progress' ? '🔍 Inspection Details' : '📋 Receiving Details'}
              </h3>
              <div style={{ color: 'var(--text-500)', fontSize: '0.9rem' }}>
                {selectedShipment.supplier} - {selectedShipment.orderRef}
              </div>
            </div>

            {(selectedShipment.latest_status === 'inspection_in_progress') ? (
              <div style={{ marginBottom: '1.5rem' }}>
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', color: 'var(--text-900)' }}>
                    Inspector Name
                  </label>
                  <input
                    type="text"
                    value={workflowData.inspectedBy}
                    onChange={(e) => setWorkflowData({...workflowData, inspectedBy: e.target.value})}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '2px solid var(--border)',
                      borderRadius: '6px',
                      fontSize: '0.9rem',
                      outline: 'none'
                    }}
                    placeholder="Enter inspector name"
                  />
                </div>

                {selectedShipment.latest_status === 'inspection_in_progress' && (
                  <>
                    <div style={{ marginBottom: '1rem' }}>
                      <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', color: 'var(--text-900)' }}>
                        Inspection Result
                      </label>
                      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <input
                            type="radio"
                            checked={workflowData.inspectionPassed && !workflowData.inspectionOnHold && !workflowData.inspectionFailed}
                            onChange={() => setWorkflowData({...workflowData, inspectionPassed: true, inspectionOnHold: false, inspectionFailed: false, holdTypes: [], failureReasons: []})}
                          />
                          ✅ Passed
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <input
                            type="radio"
                            checked={workflowData.inspectionOnHold}
                            onChange={() => setWorkflowData({...workflowData, inspectionOnHold: true, inspectionPassed: false, inspectionFailed: false, failureReasons: []})}
                          />
                          ⏸️ Passed On Hold
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <input
                            type="radio"
                            checked={workflowData.inspectionFailed}
                            onChange={() => setWorkflowData({...workflowData, inspectionFailed: true, inspectionPassed: false, inspectionOnHold: false, holdTypes: []})}
                          />
                          ❌ Failed
                        </label>
                      </div>
                    </div>

                    {workflowData.inspectionOnHold && (
                      <div style={{ marginBottom: '1rem' }}>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', color: 'var(--text-900)' }}>
                          Hold Type(s) <span style={{ color: 'var(--danger)' }}>*</span>
                        </label>
                        <div style={{
                          border: '2px solid var(--border)',
                          borderRadius: '6px',
                          padding: '0.75rem',
                          backgroundColor: 'var(--surface-2)'
                        }}>
                          {['Pending Results', 'Damage Stock', 'Non Compliant Documentation', 'Awaiting COA'].map((type) => (
                            <label
                              key={type}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                marginBottom: '0.5rem',
                                cursor: 'pointer'
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={workflowData.holdTypes.includes(type)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setWorkflowData({
                                      ...workflowData,
                                      holdTypes: [...workflowData.holdTypes, type]
                                    });
                                  } else {
                                    setWorkflowData({
                                      ...workflowData,
                                      holdTypes: workflowData.holdTypes.filter(t => t !== type)
                                    });
                                  }
                                }}
                                style={{ cursor: 'pointer' }}
                              />
                              <span style={{ fontSize: '0.9rem' }}>{type}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}

                    {workflowData.inspectionFailed && (
                      <div style={{ marginBottom: '1rem' }}>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', color: 'var(--text-900)' }}>
                          Failure Reason(s) <span style={{ color: 'var(--danger)' }}>*</span>
                        </label>
                        <div style={{
                          border: '2px solid var(--border)',
                          borderRadius: '6px',
                          padding: '0.75rem',
                          backgroundColor: '#fff5f5'
                        }}>
                          {['No COA', 'Supplier not Approved', 'Damage Stock', 'Expired Stock', 'Non Compliant Documentation'].map((reason) => (
                            <label
                              key={reason}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                marginBottom: '0.5rem',
                                cursor: 'pointer'
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={workflowData.failureReasons.includes(reason)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setWorkflowData({
                                      ...workflowData,
                                      failureReasons: [...workflowData.failureReasons, reason]
                                    });
                                  } else {
                                    setWorkflowData({
                                      ...workflowData,
                                      failureReasons: workflowData.failureReasons.filter(r => r !== reason)
                                    });
                                  }
                                }}
                                style={{ cursor: 'pointer' }}
                              />
                              <span style={{ fontSize: '0.9rem' }}>{reason}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}

                    <div style={{ marginBottom: '1rem' }}>
                      <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', color: 'var(--text-900)' }}>
                        Inspection Notes
                      </label>
                      <textarea
                        value={workflowData.inspectionNotes}
                        onChange={(e) => setWorkflowData({...workflowData, inspectionNotes: e.target.value})}
                        style={{
                          width: '100%',
                          padding: '0.75rem',
                          border: '2px solid var(--border)',
                          borderRadius: '6px',
                          fontSize: '0.9rem',
                          outline: 'none',
                          minHeight: '80px',
                          resize: 'vertical'
                        }}
                        placeholder="Enter inspection notes..."
                      />
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div style={{ marginBottom: '1.5rem' }}>
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', color: 'var(--text-900)' }}>
                    Receiver Name
                  </label>
                  <input
                    type="text"
                    value={workflowData.receivedBy}
                    onChange={(e) => setWorkflowData({...workflowData, receivedBy: e.target.value})}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '2px solid var(--border)',
                      borderRadius: '6px',
                      fontSize: '0.9rem',
                      outline: 'none'
                    }}
                    placeholder="Enter receiver name"
                  />
                </div>

                {selectedShipment.latest_status === 'receiving_goods' && (
                  <>
                    <div style={{ marginBottom: '1rem' }}>
                      <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', color: 'var(--text-900)' }}>
                        Received Quantity
                      </label>
                      <input
                        type="number"
                        value={workflowData.receivedQuantity}
                        onChange={(e) => setWorkflowData({...workflowData, receivedQuantity: e.target.value})}
                        style={{
                          width: '100%',
                          padding: '0.75rem',
                          border: '2px solid var(--border)',
                          borderRadius: '6px',
                          fontSize: '0.9rem',
                          outline: 'none'
                        }}
                        placeholder={`Expected: ${selectedShipment.quantity}`}
                      />
                    </div>

                    <div style={{ marginBottom: '1rem' }}>
                      <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', color: 'var(--text-900)' }}>
                        Receiving Notes
                      </label>
                      <textarea
                        value={workflowData.receivingNotes}
                        onChange={(e) => setWorkflowData({...workflowData, receivingNotes: e.target.value})}
                        style={{
                          width: '100%',
                          padding: '0.75rem',
                          border: '2px solid var(--border)',
                          borderRadius: '6px',
                          fontSize: '0.9rem',
                          outline: 'none',
                          minHeight: '80px',
                          resize: 'vertical'
                        }}
                        placeholder="Enter receiving notes..."
                      />
                    </div>
                  </>
                )}
              </div>
            )}

            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setShowWorkflowDialog(false);
                  setSelectedShipment(null);
                }}
                style={{
                  padding: '0.75rem 1.5rem',
                  backgroundColor: 'var(--text-500)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                  fontWeight: '500'
                }}
              >
                Cancel
              </button>

              <button
                onClick={() => {
                  // Validate hold types if on hold
                  if (selectedShipment.latest_status === 'inspection_in_progress' &&
                      workflowData.inspectionOnHold &&
                      workflowData.holdTypes.length === 0) {
                    showWarning('⚠️ Please select at least one hold type');
                    return;
                  }

                  // Validate failure reasons if failed
                  if (selectedShipment.latest_status === 'inspection_in_progress' &&
                      workflowData.inspectionFailed &&
                      workflowData.failureReasons.length === 0) {
                    showWarning('⚠️ Please select at least one failure reason');
                    return;
                  }

                  if (selectedShipment.latest_status === 'inspection_in_progress') {
                    submitWorkflowAction('complete-inspection');
                  } else if (selectedShipment.latest_status === 'inspection_passed') {
                    submitWorkflowAction('start-receiving');
                  } else if (selectedShipment.latest_status === 'receiving_goods') {
                    submitWorkflowAction('complete-receiving');
                  }
                }}
                disabled={actionLoading}
                style={{
                  padding: '0.75rem 1.5rem',
                  backgroundColor: actionLoading ? '#ccc' : 'var(--info)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: actionLoading ? 'not-allowed' : 'pointer',
                  fontSize: '0.9rem',
                  fontWeight: '500'
                }}
              >
                {actionLoading ? 'Processing...' : 'Submit'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rejection Dialog */}
      {showRejectionDialog && selectedShipment && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: 'white',
            padding: '2rem',
            borderRadius: '12px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            width: '90%',
            maxWidth: '500px',
            maxHeight: '80vh',
            overflow: 'auto'
          }}>
            <div style={{ marginBottom: '1.5rem' }}>
              <h3 style={{ margin: '0 0 0.5rem 0', color: 'var(--danger)' }}>
                ↩️ Reject/Return Shipment to Supplier
              </h3>
              <div style={{ color: 'var(--text-500)', fontSize: '0.9rem' }}>
                {selectedShipment.supplier} - {selectedShipment.orderRef}
              </div>
            </div>

            <div style={{
              backgroundColor: '#fff3cd',
              border: '1px solid var(--warning)',
              borderRadius: '6px',
              padding: '1rem',
              marginBottom: '1.5rem',
              fontSize: '0.85rem',
              color: '#856404'
            }}>
              ⚠️ This will reject the shipment and remove it from the post-arrival workflow.
              {rejectionData.archiveShipment && ' The shipment will be archived for record-keeping.'}
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', color: 'var(--text-900)' }}>
                Rejected By
              </label>
              <input
                type="text"
                value={rejectionData.rejectedBy}
                onChange={(e) => setRejectionData({...rejectionData, rejectedBy: e.target.value})}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '2px solid var(--border)',
                  borderRadius: '6px',
                  fontSize: '0.9rem',
                  outline: 'none'
                }}
                placeholder="Enter your name"
              />
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', color: 'var(--text-900)' }}>
                Rejection Reason <span style={{ color: 'var(--danger)' }}>*</span>
              </label>
              <textarea
                value={rejectionData.rejectionReason}
                onChange={(e) => setRejectionData({...rejectionData, rejectionReason: e.target.value})}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '2px solid var(--border)',
                  borderRadius: '6px',
                  fontSize: '0.9rem',
                  outline: 'none',
                  minHeight: '100px',
                  resize: 'vertical'
                }}
                placeholder="Describe why this shipment is being rejected/returned to supplier..."
              />
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={rejectionData.archiveShipment}
                  onChange={(e) => setRejectionData({...rejectionData, archiveShipment: e.target.checked})}
                  style={{ cursor: 'pointer' }}
                />
                <span style={{ fontSize: '0.9rem' }}>Archive this shipment (recommended for record-keeping)</span>
              </label>
            </div>

            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setShowRejectionDialog(false);
                  setSelectedShipment(null);
                  setRejectionData({
                    rejectedBy: '',
                    rejectionReason: '',
                    archiveShipment: true
                  });
                }}
                style={{
                  padding: '0.75rem 1.5rem',
                  backgroundColor: 'var(--text-500)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                  fontWeight: '500'
                }}
              >
                Cancel
              </button>

              <button
                onClick={submitRejection}
                disabled={actionLoading || !rejectionData.rejectionReason.trim()}
                style={{
                  padding: '0.75rem 1.5rem',
                  backgroundColor: actionLoading || !rejectionData.rejectionReason.trim() ? '#ccc' : 'var(--danger)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: actionLoading || !rejectionData.rejectionReason.trim() ? 'not-allowed' : 'pointer',
                  fontSize: '0.9rem',
                  fontWeight: '500'
                }}
              >
                {actionLoading ? 'Processing...' : 'Reject & Remove'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Order Detail Card */}
      {detailShipment && (
        <div
          onClick={() => setDetailShipment(null)}
          style={{
            position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--surface)', borderRadius: 12, padding: '1.5rem',
              width: '90%', maxWidth: 520, maxHeight: '80vh', overflowY: 'auto',
              boxShadow: '0 12px 40px rgba(0,0,0,0.2)', border: '1px solid var(--border)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--navy-900)' }}>
                {detailShipment.orderRef}
              </h3>
              <button
                onClick={() => setDetailShipment(null)}
                style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text-500)', lineHeight: 1 }}
              >
                x
              </button>
            </div>
            {(() => {
              const s = detailShipment;
              const fmt = (d) => d ? new Date(d).toLocaleDateString('en-ZA', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '-';
              const rows = [
                ['Supplier', s.supplier],
                ['Product', s.productName || s.product_name],
                ['Quantity', s.quantity],
                ['Pallets', s.palletQty ? (Math.round(s.palletQty) || 1) : '-'],
                ['CBM', s.cbm || '-'],
                ['Week', s.weekNumber ? `Week ${s.weekNumber}` : '-'],
                ['Warehouse', s.receivingWarehouse || s.receiving_warehouse || '-'],
                ['Freight Type', s.freightType || '-'],
                ['Final POD', s.finalPod || '-'],
                ['Status', getStatusLabel(s.latest_status)],
                ['Unloading Started', fmt(s.unloadingStartDate || s.unloading_start_date)],
                ['Unloading Completed', fmt(s.unloadingCompletedDate || s.unloading_completed_date)],
                ['Inspection Date', fmt(s.inspectionDate || s.inspection_date)],
                ['Inspected By', s.inspectedBy || s.inspected_by || '-'],
                ['Inspection Status', s.inspectionStatus || s.inspection_status || '-'],
                ['Inspection Notes', s.inspectionNotes || s.inspection_notes || '-'],
                ['Receiving Date', fmt(s.receivingDate || s.receiving_date)],
                ['Received By', s.receivedBy || s.received_by || '-'],
                ['Received Qty', s.receivedQuantity || s.received_quantity || '-'],
              ];
              return (
                <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: 0 }}>
                  {rows.map(([label, value]) => (
                    <React.Fragment key={label}>
                      <div style={{
                        padding: '6px 8px', fontSize: 12, fontWeight: 600,
                        color: 'var(--text-500)', borderBottom: '1px solid var(--border)'
                      }}>
                        {label}
                      </div>
                      <div style={{
                        padding: '6px 8px', fontSize: 13,
                        color: 'var(--text-700)', borderBottom: '1px solid var(--border)',
                        wordBreak: 'break-word'
                      }}>
                        {value || '-'}
                      </div>
                    </React.Fragment>
                  ))}
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Damage Photo Lightbox */}
      {viewingPhoto && (
        <div
          onClick={() => setViewingPhoto(null)}
          style={{
            position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1100, cursor: 'zoom-out'
          }}
        >
          <img
            src={viewingPhoto.url}
            alt={viewingPhoto.fileName}
            style={{ maxWidth: '90%', maxHeight: '90%', borderRadius: '8px' }}
          />
        </div>
      )}

    </div>
  );
}

export default PostArrivalWorkflow;
