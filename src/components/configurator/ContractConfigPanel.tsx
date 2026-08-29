import { useState } from 'react';
import {
  INCLUDED_LEVEL_OPTIONS,
  PRICE_UNIT_OPTIONS,
  platinumLabelForCategory,
  type PricingCategory,
} from '../../lib/configurator/contractTypes';
import type { PriceUnit } from '../catalog/catalogTypes';
import type { AllowanceBudget } from '../../lib/configurator/projectTypes';
import { useConfiguratorStore } from '../../store/configuratorStore';

type Props = {
  /** When true, hide chrome and allow use inside the wizard. */
  embedded?: boolean;
  readOnly?: boolean;
};

/**
 * In-app Customer Option Form / contract editor:
 * Platinum included tiers + dollar allowances that feed COF export and delta pricing.
 */
export function ContractConfigPanel({ embedded = false, readOnly = false }: Props) {
  const project = useConfiguratorStore((s) => s.project);
  const role = useConfiguratorStore((s) => s.role);
  const setIncludedLevel = useConfiguratorStore((s) => s.setIncludedLevel);
  const addIncludedLevel = useConfiguratorStore((s) => s.addIncludedLevel);
  const removeIncludedLevel = useConfiguratorStore((s) => s.removeIncludedLevel);
  const resetIncludedLevelsToPlatinum = useConfiguratorStore((s) => s.resetIncludedLevelsToPlatinum);
  const upsertAllowance = useConfiguratorStore((s) => s.upsertAllowance);
  const removeAllowance = useConfiguratorStore((s) => s.removeAllowance);
  const importContractPricingFile = useConfiguratorStore((s) => s.importContractPricingFile);

  const [newLabel, setNewLabel] = useState('');
  const [newCategory, setNewCategory] = useState<PricingCategory>('outdoor-kitchen');
  const [newBudget, setNewBudget] = useState('');
  const [newUnit, setNewUnit] = useState<PriceUnit>('allowance');
  const [newTierLabel, setNewTierLabel] = useState('');
  const [newTierTab, setNewTierTab] = useState('');

  if (!project?.contract) return null;
  const canEdit = !readOnly && (role === 'admin' || role === 'designer' || embedded);

  const levels = project.contract.includedLevels.length
    ? project.contract.includedLevels
    : [];
  const categoryOptions = levels.map((l) => l.pricingCategory);
  const addAllowance = () => {
    const amount = Number(newBudget.replace(/[,$]/g, ''));
    if (!newLabel.trim() || !Number.isFinite(amount) || amount < 0) return;
    const row: AllowanceBudget = {
      pricingCategory: newCategory,
      label: newLabel.trim(),
      budgetAmount: amount,
      priceUnit: newUnit,
    };
    upsertAllowance(row);
    setNewLabel('');
    setNewBudget('');
  };

  const body = (
    <>
      <div className="configurator-section">
        <div className="configurator-section-title">
          <strong>Included tiers (COF / Platinum)</strong>
          {canEdit && (
            <button type="button" className="configurator-btn" onClick={() => resetIncludedLevelsToPlatinum()}>
              Reset to Platinum defaults
            </button>
          )}
        </div>
        <p className="muted">
          These tiers define what is included on the Customer Option Form. Changes update delta pricing and COF export.
        </p>
        <div className="configurator-table-wrap">
          <table className="configurator-mini-table contract-config-table">
            <thead>
              <tr>
                <th>Trade</th>
                <th>Catalog tab</th>
                <th>Included level</th>
                <th>Label</th>
                {canEdit ? <th /> : null}
              </tr>
            </thead>
            <tbody>
              {levels.map((row) => (
                <tr key={row.pricingCategory}>
                  <td>
                    <span className="contract-config-cat">{row.pricingCategory}</span>
                  </td>
                  <td>
                    {canEdit ? (
                      <input
                        value={row.sourceTab ?? ''}
                        aria-label={`Source tab for ${row.pricingCategory}`}
                        placeholder="e.g. Plumbing"
                        onChange={(e) => setIncludedLevel({ ...row, sourceTab: e.target.value })}
                      />
                    ) : (
                      row.sourceTab || '—'
                    )}
                  </td>
                  <td>
                    {canEdit ? (
                      <select
                        value={row.includedLevel}
                        aria-label={`Included level for ${row.pricingCategory}`}
                        onChange={(e) =>
                          setIncludedLevel({
                            ...row,
                            includedLevel: e.target.value,
                          })
                        }
                      >
                        {!INCLUDED_LEVEL_OPTIONS.includes(row.includedLevel as (typeof INCLUDED_LEVEL_OPTIONS)[number]) && (
                          <option value={row.includedLevel}>{row.includedLevel}</option>
                        )}
                        {INCLUDED_LEVEL_OPTIONS.map((lvl) => (
                          <option key={lvl} value={lvl}>
                            {lvl}
                          </option>
                        ))}
                      </select>
                    ) : (
                      row.includedLevel
                    )}
                  </td>
                  <td>
                    {canEdit ? (
                      <input
                        value={row.label}
                        aria-label={`Label for ${row.pricingCategory}`}
                        onChange={(e) =>
                          setIncludedLevel({
                            ...row,
                            label: e.target.value,
                          })
                        }
                      />
                    ) : (
                      row.label
                    )}
                  </td>
                  {canEdit ? (
                    <td>
                      <button
                        type="button"
                        className="configurator-btn"
                        onClick={() => removeIncludedLevel(row.pricingCategory)}
                        aria-label={`Remove ${row.label}`}
                      >
                        Remove
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {canEdit && (
          <div className="configurator-field-grid compact contract-config-add">
            <label className="configurator-field">
              <span>Add trade label</span>
              <input
                value={newTierLabel}
                onChange={(e) => setNewTierLabel(e.target.value)}
                placeholder="e.g. Fireplace package"
              />
            </label>
            <label className="configurator-field">
              <span>Catalog tab</span>
              <input
                value={newTierTab}
                onChange={(e) => setNewTierTab(e.target.value)}
                placeholder="Optional source tab"
              />
            </label>
            <button
              type="button"
              className="configurator-btn primary"
              disabled={!newTierLabel.trim()}
              onClick={() => {
                addIncludedLevel({ label: newTierLabel.trim(), sourceTab: newTierTab.trim() });
                setNewTierLabel('');
                setNewTierTab('');
              }}
            >
              Add tier
            </button>
          </div>
        )}
      </div>
      <div className="configurator-section">
        <div className="configurator-section-title">
          <strong>Allowances</strong>
          <span className="configurator-status-chip is-neutral">{project.allowances.length}</span>
        </div>
        <p className="muted">
          Dollar allowances export to the COF Allowances sheet and show on estimator verification.
        </p>

        {project.allowances.length === 0 ? (
          <p className="muted">No allowances yet — add lines below or import a contract pricing workbook.</p>
        ) : (
          <div className="configurator-table-wrap">
            <table className="configurator-mini-table contract-config-table">
              <thead>
                <tr>
                  <th>Label</th>
                  <th>Category</th>
                  <th>Budget</th>
                  <th>Unit</th>
                  {canEdit ? <th /> : null}
                </tr>
              </thead>
              <tbody>
                {project.allowances.map((a, index) => (
                  <tr key={`${a.pricingCategory}-${a.label}-${index}`}>
                    <td>
                      {canEdit ? (
                        <input
                          value={a.label}
                          aria-label={`Allowance label ${index + 1}`}
                          onChange={(e) =>
                            upsertAllowance({ ...a, label: e.target.value }, index)
                          }
                        />
                      ) : (
                        a.label
                      )}
                    </td>
                    <td>
                      {canEdit ? (
                        <select
                          value={a.pricingCategory}
                          aria-label={`Allowance category ${index + 1}`}
                          onChange={(e) =>
                            upsertAllowance(
                              { ...a, pricingCategory: e.target.value as PricingCategory },
                              index,
                            )
                          }
                        >
                          {categoryOptions.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                          {!categoryOptions.includes(a.pricingCategory) && (
                            <option value={a.pricingCategory}>{a.pricingCategory}</option>
                          )}
                        </select>
                      ) : (
                        a.pricingCategory
                      )}
                    </td>                    <td>
                      {canEdit ? (
                        <input
                          type="number"
                          min={0}
                          step={100}
                          value={a.budgetAmount}
                          aria-label={`Allowance budget ${index + 1}`}
                          onChange={(e) =>
                            upsertAllowance(
                              { ...a, budgetAmount: Number(e.target.value) || 0 },
                              index,
                            )
                          }
                        />
                      ) : (
                        `$${a.budgetAmount.toLocaleString()}`
                      )}
                    </td>
                    <td>
                      {canEdit ? (
                        <select
                          value={a.priceUnit ?? 'allowance'}
                          aria-label={`Allowance unit ${index + 1}`}
                          onChange={(e) =>
                            upsertAllowance(
                              { ...a, priceUnit: e.target.value as PriceUnit },
                              index,
                            )
                          }
                        >
                          {PRICE_UNIT_OPTIONS.map((u) => (
                            <option key={u} value={u}>
                              {u}
                            </option>
                          ))}
                        </select>
                      ) : (
                        a.priceUnit ?? 'allowance'
                      )}
                    </td>
                    {canEdit ? (
                      <td>
                        <button
                          type="button"
                          className="configurator-btn"
                          onClick={() => removeAllowance(index)}
                          aria-label={`Remove allowance ${a.label}`}
                        >
                          Remove
                        </button>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {canEdit && (
          <div className="configurator-field-grid compact contract-config-add">
            <label className="configurator-field">
              <span>New allowance label</span>
              <input
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder={platinumLabelForCategory(newCategory)}
              />
            </label>
            <label className="configurator-field">
              <span>Category</span>
              <select value={newCategory} onChange={(e) => setNewCategory(e.target.value as PricingCategory)}>
                {(categoryOptions.length ? categoryOptions : ['outdoor-kitchen']).map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>            </label>
            <label className="configurator-field">
              <span>Budget ($)</span>
              <input value={newBudget} onChange={(e) => setNewBudget(e.target.value)} placeholder="2500" />
            </label>
            <label className="configurator-field">
              <span>Unit</span>
              <select value={newUnit} onChange={(e) => setNewUnit(e.target.value as PriceUnit)}>
                {PRICE_UNIT_OPTIONS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="configurator-btn primary"
              disabled={!newLabel.trim() || !newBudget.trim()}
              onClick={addAllowance}
            >
              Add allowance
            </button>
          </div>
        )}

        {canEdit && (
          <label className="configurator-field" style={{ marginTop: 12 }}>
            <span>Import from contract pricing / COF workbook (optional)</span>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file && /\.xls/i.test(file.name)) void importContractPricingFile(file);
                e.target.value = '';
              }}
            />
          </label>
        )}

        {project.levelOverrides.length > 0 && (
          <p className="muted" style={{ marginTop: 8 }}>
            {project.levelOverrides.filter((o) => o.source === 'manual').length} manual tier edit
            {project.levelOverrides.filter((o) => o.source === 'manual').length === 1 ? '' : 's'}
            {project.levelOverrides.some((o) => o.source === 'contract_pricing_page')
              ? ` · ${project.levelOverrides.filter((o) => o.source === 'contract_pricing_page').length} from pricing workbook`
              : ''}
          </p>
        )}
      </div>
    </>
  );

  if (embedded) return <div className="contract-config-embedded">{body}</div>;

  return (
    <section className="configurator-panel contract-config-panel" aria-label="Customer Option Form and allowances">
      <header className="configurator-panel-header">
        <div>
          <p className="configurator-eyebrow">Contract</p>
          <strong>COF &amp; allowances</strong>
          <p className="muted">Configure included Platinum tiers and allowance budgets for this job.</p>
        </div>
      </header>
      {body}
    </section>
  );
}
