import React, { useState, useEffect } from 'react';
import {
  Sliders,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  Clock,
  Plus,
  X,
  Info,
  Save,
  Lock,
  TrendingUp,
  Layers,
  Sparkles
} from 'lucide-react';
import {
  getOrganizationAssumptions,
  updateOrganizationAssumptions,
  OrganizationAssumptions as IAssumptions,
  UpdateAssumptionsPayload
} from '../../lib/api';
import { loadAuthUser } from '../../lib/authStorage';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export default function OrganizationAssumptionsPage() {
  const user = loadAuthUser();
  const isAdmin = user?.role === 'admin';

  // Loading & Data State
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [rollbackNotice, setRollbackNotice] = useState<string | null>(null);

  // Form State
  const [originalConfig, setOriginalConfig] = useState<IAssumptions | null>(null);
  const [efficiencyFactor, setEfficiencyFactor] = useState<number>(0.35);
  const [costPerFteLakhs, setCostPerFteLakhs] = useState<number>(10);
  const [standardMonthlyHours, setStandardMonthlyHours] = useState<number>(160);
  const [screeningThresholdHours, setScreeningThresholdHours] = useState<number>(26);
  const [keywords, setKeywords] = useState<string[]>(['automation', 'rpa', 'repeat']);
  const [newKeywordInput, setNewKeywordInput] = useState<string>('');

  // Confirmation Modal
  const [showConfirmModal, setShowConfirmModal] = useState<boolean>(false);

  // Fetch Current Assumptions
  const loadAssumptions = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getOrganizationAssumptions();
      setOriginalConfig(data);
      setEfficiencyFactor(data.scenarioAssumptions?.efficiencyFactor ?? 0.35);
      setCostPerFteLakhs(data.scenarioAssumptions?.costPerFteLakhs ?? 10);
      setStandardMonthlyHours(data.screeningSettings?.standardMonthlyHours ?? 160);
      setScreeningThresholdHours(data.screeningSettings?.screeningThresholdHours ?? 26);
      setKeywords(data.screeningSettings?.screeningKeywords ?? ['automation', 'rpa', 'repeat']);
    } catch (err: any) {
      setError(err?.message || 'Failed to load organization assumptions.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAssumptions();
  }, []);

  // Keyword Management
  const handleAddKeyword = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const clean = newKeywordInput.trim().toLowerCase();
    if (!clean) return;
    if (keywords.includes(clean)) {
      setNewKeywordInput('');
      return;
    }
    setKeywords([...keywords, clean]);
    setNewKeywordInput('');
  };

  const handleRemoveKeyword = (kwToRemove: string) => {
    if (!isAdmin) return;
    if (keywords.length <= 1) {
      setError('At least one screening keyword is required.');
      return;
    }
    setKeywords(keywords.filter((k) => k !== kwToRemove));
  };

  // Form Validation
  const validateForm = (): string | null => {
    if (isNaN(efficiencyFactor) || efficiencyFactor < 0 || efficiencyFactor > 1) {
      return 'Efficiency factor must be a valid number between 0.00 and 1.00 (e.g. 0.35 for 35%).';
    }
    if (isNaN(costPerFteLakhs) || costPerFteLakhs < 0 || costPerFteLakhs > 1000) {
      return 'Annual cost per FTE must be a valid number between 0 and 1000 Lakhs.';
    }
    if (isNaN(standardMonthlyHours) || standardMonthlyHours < 1 || standardMonthlyHours > 744) {
      return 'Standard monthly hours must be a valid number between 1 and 744 hours.';
    }
    if (isNaN(screeningThresholdHours) || screeningThresholdHours < 0 || screeningThresholdHours > 744) {
      return 'Screening threshold hours must be a valid number between 0 and 744 hours.';
    }
    if (!keywords || keywords.length === 0) {
      return 'At least one screening keyword is required.';
    }
    return null;
  };

  // Dispatch Save
  const handleConfirmSave = async () => {
    setShowConfirmModal(false);
    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      setSaving(true);
      setError(null);
      setSuccessMessage(null);
      setRollbackNotice(null);

      const payload: UpdateAssumptionsPayload = {
        scenarioAssumptions: {
          efficiencyFactor: Number(efficiencyFactor),
          costPerFteLakhs: Number(costPerFteLakhs),
        },
        screeningSettings: {
          standardMonthlyHours: Number(standardMonthlyHours),
          screeningThresholdHours: Number(screeningThresholdHours),
          screeningKeywords: keywords,
        },
      };

      const result = await updateOrganizationAssumptions(payload);

      setSuccessMessage('Organization assumptions saved successfully. Dashboard and analysis models will use the updated values.');
      if (result.data) {
        setOriginalConfig(result.data);
      }

      // Signal background components (Dashboard & Deep Analysis) to bust local caches
      try {
        window.dispatchEvent(new CustomEvent('bper:assumptions-updated', { detail: payload }));
      } catch (evtErr) {
        console.warn('Could not dispatch assumptions-updated event:', evtErr);
      }
    } catch (err: any) {
      if (err?.rolledBack === true) {
        setRollbackNotice('Audit logging failed. The update was rolled back successfully, and original assumptions were preserved.');
      } else if (err?.rolledBack === false) {
        setError('Audit logging failed and compensating rollback could not complete. Assumptions may remain partially modified. Please contact engineering.');
      } else {
        setError(err?.message || 'Failed to update organization assumptions.');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-in fade-in duration-300">
      {/* Header Banner */}
      <div className="rounded-2xl border border-[#DCE7F5] bg-white p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-[#1A5BA7]/10 flex items-center justify-center text-[#1A5BA7]">
              <Sliders className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-[#0F2649]">Organization Assumptions</h1>
              <p className="text-xs text-[#627D9E]">
                Configure organization-wide FTE capacity baselines, consolidation efficiency factors, and screening thresholds.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {originalConfig?.isDefault ? (
            <span className="inline-flex items-center rounded-full border border-amber-300 bg-amber-50 text-amber-800 text-xs font-semibold px-3 py-1">
              Using System Defaults
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full border border-emerald-300 bg-emerald-50 text-emerald-800 text-xs font-semibold px-3 py-1">
              Saved Organization Settings
            </span>
          )}

          {!isAdmin && (
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 text-slate-700 text-xs font-medium px-2.5 py-1 border border-slate-200">
              <Lock className="h-3 w-3" /> Read-Only Mode
            </span>
          )}
        </div>
      </div>

      {/* Disclaimers & Governance Alert */}
      <Alert className="border-[#B8D5FA] bg-[#F0F6FF] text-[#102B52] py-2.5">
        <Info className="h-4 w-4 text-[#1A5BA7]" />
        <AlertTitle className="font-bold text-xs uppercase tracking-wide text-[#1A5BA7]">Hypothetical Planning Model Notice</AlertTitle>
        <AlertDescription className="text-xs text-[#355377] mt-0.5 leading-relaxed">
          Efficiency factor and annual cost assumptions are used strictly for scenario modelling and hypothetical consolidation projections. They do not represent audited historical savings or realized headcount reductions. Official operational effort and actual submission hours remain separate.
        </AlertDescription>
      </Alert>

      {/* Status Messages */}
      {successMessage && (
        <Alert className="border-emerald-200 bg-emerald-50 text-emerald-900 py-2.5">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          <AlertTitle className="font-bold text-xs text-emerald-800">Success</AlertTitle>
          <AlertDescription className="text-xs text-emerald-700 mt-0.5">{successMessage}</AlertDescription>
        </Alert>
      )}

      {rollbackNotice && (
        <Alert className="border-amber-300 bg-amber-50 text-amber-900 py-2.5">
          <AlertCircle className="h-4 w-4 text-amber-600" />
          <AlertTitle className="font-bold text-xs text-amber-800">Rollback Applied</AlertTitle>
          <AlertDescription className="text-xs text-amber-700 mt-0.5">{rollbackNotice}</AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert className="border-red-200 bg-red-50 text-red-900 py-2.5">
          <AlertCircle className="h-4 w-4 text-red-600" />
          <AlertTitle className="font-bold text-xs text-red-800">Error</AlertTitle>
          <AlertDescription className="text-xs text-red-700 mt-0.5">{error}</AlertDescription>
        </Alert>
      )}

      {/* Form Content: Assumption Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Card 1: Scenario Assumptions */}
        <div className="rounded-2xl border border-[#DCE7F5] bg-white shadow-xs overflow-hidden">
          <div className="border-b border-[#EEF3FA] p-4 pb-3">
            <div className="flex items-center gap-2 text-[#1A5BA7]">
              <TrendingUp className="h-4 w-4" />
              <h3 className="text-sm font-bold text-[#0F2649]">Scenario Modeling Assumptions</h3>
            </div>
            <p className="text-xs text-[#627D9E] mt-1">
              Parameters applied to screened candidate activities to calculate consolidation potential.
            </p>
          </div>
          <div className="p-4 space-y-4 pt-3.5">
            <div>
              <div className="flex items-center justify-between">
                <Label htmlFor="efficiencyFactor" className="text-xs font-semibold text-[#1A3353]">
                  Efficiency Factor (0.00 – 1.00)
                </Label>
                <span className="text-[11px] font-bold text-[#1A5BA7]">{(efficiencyFactor * 100).toFixed(0)}% Target</span>
              </div>
              <Input
                id="efficiencyFactor"
                type="number"
                step="0.01"
                min="0"
                max="1"
                disabled={!isAdmin || loading || saving}
                value={efficiencyFactor}
                onChange={(e) => setEfficiencyFactor(parseFloat(e.target.value) || 0)}
                className="mt-1.5 h-9 text-xs"
              />
              <p className="text-[10px] text-[#718BAA] mt-1">Current default assumption: 0.35 (35% scenario target; valid range 0.00 – 1.00).</p>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <Label htmlFor="costPerFteLakhs" className="text-xs font-semibold text-[#1A3353]">
                  Annual Cost per FTE (₹ Lakhs)
                </Label>
                <span className="text-[11px] font-bold text-[#1A5BA7]">₹{costPerFteLakhs} Lakhs / FTE</span>
              </div>
              <Input
                id="costPerFteLakhs"
                type="number"
                step="0.5"
                min="0"
                max="1000"
                disabled={!isAdmin || loading || saving}
                value={costPerFteLakhs}
                onChange={(e) => setCostPerFteLakhs(parseFloat(e.target.value) || 0)}
                className="mt-1.5 h-9 text-xs"
              />
              <p className="text-[10px] text-[#718BAA] mt-1">Current default assumption: 10 (₹10 Lakhs annual baseline compensation per FTE; valid range 0 – 1000).</p>
            </div>
          </div>
        </div>

        {/* Card 2: Screening Settings */}
        <div className="rounded-2xl border border-[#DCE7F5] bg-white shadow-xs overflow-hidden">
          <div className="border-b border-[#EEF3FA] p-4 pb-3">
            <div className="flex items-center gap-2 text-[#1A5BA7]">
              <Layers className="h-4 w-4" />
              <h3 className="text-sm font-bold text-[#0F2649]">Screening & Capacity Baselines</h3>
            </div>
            <p className="text-xs text-[#627D9E] mt-1">
              Standards for operational FTE conversion and automated screening signal classification.
            </p>
          </div>
          <div className="p-4 space-y-4 pt-3.5">
            <div>
              <div className="flex items-center justify-between">
                <Label htmlFor="standardMonthlyHours" className="text-xs font-semibold text-[#1A3353]">
                  Standard Monthly Hours (Baseline FTE)
                </Label>
                <span className="text-[11px] font-bold text-[#1A5BA7]">{standardMonthlyHours}h / month</span>
              </div>
              <Input
                id="standardMonthlyHours"
                type="number"
                step="1"
                min="1"
                max="744"
                disabled={!isAdmin || loading || saving}
                value={standardMonthlyHours}
                onChange={(e) => setStandardMonthlyHours(parseFloat(e.target.value) || 0)}
                className="mt-1.5 h-9 text-xs"
              />
              <p className="text-[10px] text-[#718BAA] mt-1">Current default assumption: 160 hours/month (used across FTE reports and Excel exports; valid range 1 – 744).</p>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <Label htmlFor="screeningThresholdHours" className="text-xs font-semibold text-[#1A3353]">
                  Screening Threshold Hours
                </Label>
                <span className="text-[11px] font-bold text-[#1A5BA7]">≥ {screeningThresholdHours}h / month</span>
              </div>
              <Input
                id="screeningThresholdHours"
                type="number"
                step="1"
                min="0"
                max="744"
                disabled={!isAdmin || loading || saving}
                value={screeningThresholdHours}
                onChange={(e) => setScreeningThresholdHours(parseFloat(e.target.value) || 0)}
                className="mt-1.5 h-9 text-xs"
              />
              <p className="text-[10px] text-[#718BAA] mt-1">Current default assumption: 26 hours/month (screens activities with monthly effort ≥ threshold; valid range 0 – 744).</p>
            </div>
          </div>
        </div>
      </div>

      {/* Card 3: Screening Keywords */}
      <div className="rounded-2xl border border-[#DCE7F5] bg-white shadow-xs overflow-hidden">
        <div className="border-b border-[#EEF3FA] p-4 pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-[#1A5BA7]">
              <Sparkles className="h-4 w-4" />
              <h3 className="text-sm font-bold text-[#0F2649]">Screening Keywords</h3>
            </div>
            <span className="text-[11px] font-semibold text-[#1A5BA7] bg-[#EDF4FD] px-2.5 py-0.5 rounded-full border border-[#CDE0F7]">
              {keywords.length} active keyword{keywords.length === 1 ? '' : 's'}
            </span>
          </div>
          <p className="text-xs text-[#627D9E] mt-1">
            Activities with process names or comments containing any of these keywords are flagged as candidate consolidation opportunities.
          </p>
        </div>
        <div className="p-4 space-y-3 pt-3.5">
          {isAdmin && (
            <div className="flex gap-2">
              <Input
                type="text"
                placeholder="Enter new keyword (e.g. manual, excel, reconcil)..."
                value={newKeywordInput}
                onChange={(e) => setNewKeywordInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddKeyword();
                  }
                }}
                disabled={loading || saving}
                className="h-9 text-xs max-w-sm"
              />
              <Button
                type="button"
                onClick={() => handleAddKeyword()}
                disabled={!newKeywordInput.trim() || loading || saving}
                className="h-9 bg-[#1A5BA7] hover:bg-[#144885] text-xs font-semibold gap-1.5 px-3"
              >
                <Plus className="h-3.5 w-3.5" /> Add Keyword
              </Button>
            </div>
          )}

          <div className="flex flex-wrap gap-2 pt-1">
            {keywords.map((kw) => (
              <span
                key={kw}
                className="inline-flex items-center gap-1.5 bg-[#EDF4FD] hover:bg-[#E2EDFB] text-[#133F73] text-xs font-medium py-1 px-3 rounded-lg border border-[#CDE0F7] shadow-2xs"
              >
                <span>{kw}</span>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => handleRemoveKeyword(kw)}
                    disabled={loading || saving}
                    title={`Remove keyword "${kw}"`}
                    aria-label={`Remove keyword ${kw}`}
                    className="hover:text-red-600 transition p-0.5 rounded-full hover:bg-white/60"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Footer Metadata & Action Bar - positioned directly below the cards */}
      <div className="rounded-xl border border-[#DCE7F5] bg-white p-4 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="text-xs text-[#718BAA] flex items-center gap-2">
          <Clock className="h-3.5 w-3.5 text-[#1A5BA7]" />
          <span>
            {originalConfig?.updatedAt
              ? `Last updated on ${new Date(originalConfig.updatedAt).toLocaleString('en-IN')}`
              : 'Using initial system defaults'}
          </span>
        </div>

        {isAdmin ? (
          <div className="flex items-center gap-3">
            <Button
              type="button"
              onClick={() => {
                const valErr = validateForm();
                if (valErr) {
                  setError(valErr);
                  return;
                }
                setShowConfirmModal(true);
              }}
              disabled={loading || saving}
              className="bg-[#1A5BA7] hover:bg-[#144885] text-white text-xs font-bold gap-2 px-5 h-9"
            >
              <Save className="h-3.5 w-3.5" /> Save Changes
            </Button>
          </div>
        ) : (
          <p className="text-xs font-medium text-slate-500">Only authorized administrators may modify organization assumptions.</p>
        )}
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl border border-[#DCE7F5] shadow-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-[#1A5BA7]/10 flex items-center justify-center text-[#1A5BA7]">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-[#0F2649]">Confirm Assumptions Update</h3>
                <p className="text-xs text-[#627D9E]">Save organization-wide settings to MongoDB</p>
              </div>
            </div>

            <p className="text-xs text-[#4F6888] leading-relaxed">
              You are about to save organization-wide assumptions. All subsequent reports, executive consolidation calculations, and Excel exports will immediately reflect these updated parameters.
            </p>

            <div className="space-y-2 rounded-xl bg-[#F5F9FE] p-3.5 border border-[#DDEAF8] text-xs">
              <div className="flex justify-between">
                <span className="text-[#627D9E]">Efficiency Factor:</span>
                <span className="font-bold text-[#0F2649]">{(efficiencyFactor * 100).toFixed(0)}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#627D9E]">Annual Cost per FTE:</span>
                <span className="font-bold text-[#0F2649]">₹{costPerFteLakhs} Lakhs</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#627D9E]">Standard Monthly Hours:</span>
                <span className="font-bold text-[#0F2649]">{standardMonthlyHours}h</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#627D9E]">Screening Threshold:</span>
                <span className="font-bold text-[#0F2649]">≥ {screeningThresholdHours}h</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#627D9E]">Keywords ({keywords.length}):</span>
                <span className="font-bold text-[#0F2649] truncate max-w-[200px]">{keywords.join(', ')}</span>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowConfirmModal(false)}
                disabled={saving}
                className="text-xs h-9 px-4"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleConfirmSave}
                disabled={saving}
                className="bg-[#1A5BA7] hover:bg-[#144885] text-white text-xs font-bold h-9 px-4"
              >
                {saving ? 'Saving...' : 'Confirm & Persist'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
