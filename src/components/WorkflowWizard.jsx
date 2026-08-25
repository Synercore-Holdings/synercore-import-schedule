import React, { useState, useEffect, useCallback } from 'react';
import useFormDraft from '../hooks/useFormDraft';

/**
 * WorkflowWizard Component
 * A reusable step-by-step wizard component for multi-step workflows
 *
 * Props:
 * - title: string - Title of the wizard
 * - steps: array - Array of step objects with: { id, label, icon, component, required, helpText }
 * - onComplete: function - Callback when wizard is completed
 * - onCancel: function - Callback when wizard is cancelled
 * - initialData: object - Pre-filled data
 * - draftKey: string (optional) - If provided, auto-saves form to localStorage
 */
function WorkflowWizard({
  title,
  steps,
  onComplete,
  onCancel,
  initialData = {},
  draftKey
}) {
  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState(initialData);
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { clearDraft } = useFormDraft(draftKey || 'wizard', formData, setFormData, { enabled: !!draftKey });

  // Get current step config
  const step = steps && steps.length > 0 ? steps[currentStep] : null;
  const isFirstStep = currentStep === 0;
  const isLastStep = step && currentStep === steps.length - 1;
  const stepPercentage = steps && steps.length > 0 ? ((currentStep + 1) / steps.length) * 100 : 0;

  // If no steps available, show error
  if (!step) {
    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000
      }}>
        <div style={{
          backgroundColor: 'white',
          padding: '2rem',
          borderRadius: '12px',
          textAlign: 'center'
        }}>
          <h3 style={{ color: '#dc3545', margin: '0 0 1rem 0' }}>Error Loading Wizard</h3>
          <p style={{ color: '#666', margin: '0 0 1rem 0' }}>No steps are configured for this wizard.</p>
          <p style={{ color: '#999', margin: '0 0 1rem 0', fontSize: '0.8rem' }}>
            Steps received: {steps?.length ?? 'undefined'}
          </p>
          <button
            onClick={onCancel}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: '#6c757d',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer'
            }}
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  // Validate current step
  const validateStep = async () => {
    if (!step.validate) return true;

    const stepErrors = await step.validate(formData);
    if (stepErrors && Object.keys(stepErrors).length > 0) {
      setErrors(stepErrors);
      return false;
    }
    setErrors({});
    return true;
  };

  // Handle next
  const handleNext = async () => {
    const isValid = await validateStep();
    if (!isValid) return;

    if (isLastStep) {
      await handleComplete();
    } else {
      setCurrentStep(currentStep + 1);
      // Mark step as touched
      setTouched(prev => ({ ...prev, [step.id]: true }));
    }
  };

  // Handle previous
  const handlePrevious = () => {
    if (!isFirstStep) {
      setCurrentStep(currentStep - 1);
    }
  };

  // Handle complete
  const handleComplete = async () => {
    setIsSubmitting(true);
    try {
      await onComplete?.(formData);
      clearDraft();
    } finally {
      setIsSubmitting(false);
    }
  };

  // Update form data
  const updateFormData = (key, value) => {
    setFormData(prev => ({ ...prev, [key]: value }));
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000
    }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '12px',
        boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
        width: '90%',
        maxWidth: '600px',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {/* Header */}
        <div style={{
          padding: '2rem',
          borderBottom: '1px solid #e5e7eb',
          backgroundColor: '#f9fafb'
        }}>
          <h2 style={{ margin: '0 0 1rem 0', color: '#1f2937', fontSize: '1.5rem' }}>
            {title}
          </h2>

          {/* Progress Bar */}
          <div style={{
            height: '8px',
            backgroundColor: '#e5e7eb',
            borderRadius: '4px',
            overflow: 'hidden'
          }}>
            <div style={{
              height: '100%',
              backgroundColor: '#059669',
              width: `${stepPercentage}%`,
              transition: 'width 0.3s ease'
            }}></div>
          </div>

          <div style={{
            marginTop: '0.75rem',
            fontSize: '0.85rem',
            color: '#6b7280'
          }}>
            Step {currentStep + 1} of {steps.length}: {step.label}
          </div>
        </div>

        {/* Steps Indicator */}
        <div style={{
          padding: '1.5rem 2rem',
          borderBottom: '1px solid #e5e7eb',
          backgroundColor: '#ffffff'
        }}>
          <div style={{
            display: 'flex',
            gap: '0.5rem',
            flexWrap: 'wrap'
          }}>
            {steps.map((s, idx) => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center' }}>
                {/* Step Circle */}
                <div style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: idx <= currentStep ? '#059669' : '#d1d5db',
                  color: 'white',
                  fontWeight: '600',
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  title: s.label
                }}
                  onClick={() => {
                    if (idx < currentStep) {
                      setCurrentStep(idx);
                    }
                  }}
                >
                  {s.icon ? <span>{s.icon}</span> : idx + 1}
                </div>

                {/* Connector */}
                {idx < steps.length - 1 && (
                  <div style={{
                    width: '20px',
                    height: '2px',
                    backgroundColor: idx < currentStep ? '#059669' : '#d1d5db',
                    margin: '0 4px',
                    transition: 'background-color 0.2s ease'
                  }}></div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Content Area */}
        <div style={{
          flex: 1,
          padding: '2rem',
          overflow: 'auto'
        }}>
          {/* Step Content */}
          <div>
            {/* Help Text */}
            {step.helpText && (
              <div style={{
                padding: '12px',
                backgroundColor: '#eff6ff',
                borderLeft: '4px solid #3b82f6',
                borderRadius: '4px',
                marginBottom: '1.5rem',
                color: '#1e40af',
                fontSize: '0.9rem'
              }}>
                ℹ️ {step.helpText}
              </div>
            )}

            {/* Render Step Component */}
            {step.component && (() => {
              const StepComponent = step.component;
              return (
                <StepComponent
                  formData={formData}
                  updateFormData={updateFormData}
                  errors={errors}
                  touched={touched}
                  steps={steps}
                />
              );
            })()}
          </div>
        </div>

        {/* Footer with Actions */}
        <div style={{
          padding: '1.5rem 2rem',
          borderTop: '1px solid #e5e7eb',
          backgroundColor: '#f9fafb',
          display: 'flex',
          gap: '1rem',
          justifyContent: 'space-between'
        }}>
          {/* Left Group - Cancel */}
          <button
            onClick={onCancel}
            disabled={isSubmitting}
            style={{
              padding: '10px 16px',
              backgroundColor: '#f3f4f6',
              color: '#374151',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
              fontWeight: '500',
              fontSize: '0.95rem',
              transition: 'all 0.2s ease',
              opacity: isSubmitting ? 0.5 : 1
            }}
            onMouseEnter={(e) => {
              if (!isSubmitting) {
                e.target.style.backgroundColor = '#e5e7eb';
              }
            }}
            onMouseLeave={(e) => {
              if (!isSubmitting) {
                e.target.style.backgroundColor = '#f3f4f6';
              }
            }}
          >
            Cancel
          </button>

          {/* Right Group - Navigation */}
          <div style={{ display: 'flex', gap: '1rem' }}>
            {/* Previous Button */}
            <button
              onClick={handlePrevious}
              disabled={isFirstStep || isSubmitting}
              style={{
                padding: '10px 16px',
                backgroundColor: isFirstStep ? '#f3f4f6' : '#f3f4f6',
                color: isFirstStep ? '#d1d5db' : '#374151',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                cursor: isFirstStep || isSubmitting ? 'not-allowed' : 'pointer',
                fontWeight: '500',
                fontSize: '0.95rem',
                transition: 'all 0.2s ease',
                opacity: isFirstStep ? 0.5 : 1
              }}
              onMouseEnter={(e) => {
                if (!isFirstStep && !isSubmitting) {
                  e.target.style.backgroundColor = '#e5e7eb';
                }
              }}
              onMouseLeave={(e) => {
                if (!isFirstStep && !isSubmitting) {
                  e.target.style.backgroundColor = '#f3f4f6';
                }
              }}
            >
              ← Previous
            </button>

            {/* Next/Complete Button */}
            <button
              onClick={handleNext}
              disabled={isSubmitting}
              style={{
                padding: '10px 16px',
                backgroundColor: '#059669',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
                fontWeight: '500',
                fontSize: '0.95rem',
                transition: 'all 0.2s ease',
                opacity: isSubmitting ? 0.7 : 1
              }}
              onMouseEnter={(e) => {
                if (!isSubmitting) {
                  e.target.style.backgroundColor = '#047857';
                  e.target.style.transform = 'translateY(-1px)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isSubmitting) {
                  e.target.style.backgroundColor = '#059669';
                  e.target.style.transform = 'none';
                }
              }}
            >
              {isSubmitting ? '⏳ Saving...' : isLastStep ? 'Complete ✓' : 'Next →'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default WorkflowWizard;
