import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ClipboardList,
  Layers,
  ListChecks,
  Mail,
  Map,
  Save,
  Shield,
  Sparkles,
} from 'lucide-react';
import {
  INCLUDED_LEVEL_OPTIONS,
  PRICE_UNIT_OPTIONS,
  type ContractIncludedLevel,
} from '../../lib/configurator/contractTypes';
import {
  formatInviteEmail,
  newPlatinumTierRow,
  newSurveyQuestion,
  type CatalogTabMapping,
  type LookbookSeedRule,
} from '../../lib/configurator/orgConfig';
import type { SurveyQuestion, SurveyQuestionOption } from '../../lib/configurator/surveyConfig';
import { useOrgConfigStore } from '../../store/orgConfigStore';
import './configStudio.css';

type TabId = 'platinum' | 'survey' | 'mappings' | 'lookbook' | 'client' | 'invite';

const TABS: { id: TabId; label: string; icon: typeof Layers; blurb: string }[] = [
  { id: 'platinum', label: 'Platinum tiers', icon: Layers, blurb: 'Included levels that seed every new job and COF' },
  { id: 'survey', label: 'Client survey', icon: ListChecks, blurb: 'Questions clients answer before the configurator' },
  { id: 'mappings', label: 'COF mappings', icon: Map, blurb: 'Catalog tab → pricing category → Excel sheet' },
  { id: 'lookbook', label: 'Look Book', icon: Sparkles, blurb: 'Default curated picks after the survey' },
  { id: 'client', label: 'Client rules', icon: Shield, blurb: 'What clients can see and change' },
  { id: 'invite', label: 'Invite copy', icon: Mail, blurb: 'Email text for the client portal link' },
];

/**
 * Org-wide Build configuration studio — Platinum, survey, COF maps, Look Book, client rules, invite.
 */
export function ConfigPage() {
  const config = useOrgConfigStore((s) => s.config);
  const dirty = useOrgConfigStore((s) => s.dirty);
  const hydrate = useOrgConfigStore((s) => s.hydrate);
  const save = useOrgConfigStore((s) => s.save);
  const resetSection = useOrgConfigStore((s) => s.resetSection);
  const resetAll = useOrgConfigStore((s) => s.resetAll);
  const setPlatinumTiers = useOrgConfigStore((s) => s.setPlatinumTiers);
  const setSurvey = useOrgConfigStore((s) => s.setSurvey);
  const setTabMappings = useOrgConfigStore((s) => s.setTabMappings);
  const setLookbookSeeds = useOrgConfigStore((s) => s.setLookbookSeeds);
  const setClientRules = useOrgConfigStore((s) => s.setClientRules);
  const setInviteCopy = useOrgConfigStore((s) => s.setInviteCopy);

  const [tab, setTab] = useState<TabId>('platinum');

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  const active = TABS.find((t) => t.id === tab) ?? TABS[0]!;

  const invitePreview = useMemo(
    () =>
      formatInviteEmail(config.inviteCopy, {
        clientName: 'Alex',
        projectName: '183 Stillwater',
        inviteUrl: 'https://app.example/build?share=…',
      }),
    [config.inviteCopy],
  );

  const updateTier = (index: number, patch: Partial<ContractIncludedLevel>) => {
    const next = config.platinumTiers.map((row, i) => (i === index ? { ...row, ...patch } : row));
    setPlatinumTiers(next);
  };

  const updateQuestion = (index: number, patch: Partial<SurveyQuestion>) => {
    const questions = config.survey.questions.map((q, i) => (i === index ? { ...q, ...patch } : q));
    setSurvey({ ...config.survey, questions });
  };

  const updateMapping = (index: number, patch: Partial<CatalogTabMapping>) => {
    setTabMappings(config.tabMappings.map((m, i) => (i === index ? { ...m, ...patch } : m)));
  };

  const updateSeed = (index: number, patch: Partial<LookbookSeedRule>) => {
    setLookbookSeeds(config.lookbookSeeds.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  };

  return (
    <div className="data-page config-studio">
      <header className="data-page-header config-studio-hero">
        <div>
          <p className="eyebrow">Studio · Configuration</p>
          <h1>Build Config</h1>
          <p className="muted">
            Org defaults for Platinum features, client survey, COF export mappings, Look Book seeds, and invite email.
            Job-level overrides still live on each project&apos;s COF tab.
          </p>
        </div>
        <div className="data-page-actions config-studio-actions">
          {dirty && <span className="config-studio-dirty">Unsaved changes</span>}
          <button type="button" className="configurator-btn" onClick={() => resetAll()}>
            Reset all
          </button>
          <button type="button" className="configurator-btn primary" onClick={() => save()} disabled={!dirty}>
            <Save size={16} strokeWidth={2.2} />
            Save configuration
          </button>
        </div>
      </header>

      <div className="config-studio-layout">
        <nav className="config-studio-nav" aria-label="Configuration sections">
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                type="button"
                className={tab === t.id ? 'active' : ''}
                onClick={() => setTab(t.id)}
              >
                <Icon size={18} strokeWidth={1.75} />
                <span>
                  <strong>{t.label}</strong>
                  <small>{t.blurb}</small>
                </span>
              </button>
            );
          })}
          <Link className="config-studio-nav-link" to="/settings">
            CRM field settings →
          </Link>
        </nav>

        <section className="config-studio-panel" aria-label={active.label}>
          <header className="config-studio-panel-header">
            <div>
              <p className="eyebrow">{active.label}</p>
              <h2>{active.blurb}</h2>
            </div>
            <button type="button" className="configurator-btn" onClick={() => resetSection(sectionKey(tab))}>
              Reset section
            </button>
          </header>

          {tab === 'platinum' && (
            <div className="config-studio-block">
              <p className="muted">
                These tiers seed every new project contract. Add or remove trades as your Platinum Features sheet
                evolves.
              </p>
              <div className="configurator-table-wrap">
                <table className="configurator-mini-table contract-config-table">
                  <thead>
                    <tr>
                      <th>Category id</th>
                      <th>Catalog tab</th>
                      <th>Level</th>
                      <th>Label</th>
                      <th>Unit</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {config.platinumTiers.map((row, index) => (
                      <tr key={`${row.pricingCategory}-${index}`}>
                        <td>
                          <input
                            value={row.pricingCategory}
                            onChange={(e) => updateTier(index, { pricingCategory: e.target.value })}
                          />
                        </td>
                        <td>
                          <input
                            value={row.sourceTab ?? ''}
                            onChange={(e) => updateTier(index, { sourceTab: e.target.value })}
                          />
                        </td>
                        <td>
                          <select
                            value={row.includedLevel}
                            onChange={(e) => updateTier(index, { includedLevel: e.target.value })}
                          >
                            {INCLUDED_LEVEL_OPTIONS.map((lvl) => (
                              <option key={lvl} value={lvl}>
                                {lvl}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <input value={row.label} onChange={(e) => updateTier(index, { label: e.target.value })} />
                        </td>
                        <td>
                          <select
                            value={row.priceUnit}
                            onChange={(e) =>
                              updateTier(index, { priceUnit: e.target.value as ContractIncludedLevel['priceUnit'] })
                            }
                          >
                            {PRICE_UNIT_OPTIONS.map((u) => (
                              <option key={u} value={u}>
                                {u}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="configurator-btn"
                            onClick={() =>
                              setPlatinumTiers(config.platinumTiers.filter((_, i) => i !== index))
                            }
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button
                type="button"
                className="configurator-btn primary"
                onClick={() => setPlatinumTiers([...config.platinumTiers, newPlatinumTierRow()])}
              >
                Add Platinum tier
              </button>
            </div>
          )}

          {tab === 'survey' && (
            <div className="config-studio-block">
              <div className="configurator-field-grid">
                <label className="configurator-field">
                  <span>Survey title</span>
                  <input
                    value={config.survey.title}
                    onChange={(e) => setSurvey({ ...config.survey, title: e.target.value })}
                  />
                </label>
                <label className="configurator-field full">
                  <span>Description</span>
                  <input
                    value={config.survey.description}
                    onChange={(e) => setSurvey({ ...config.survey, description: e.target.value })}
                  />
                </label>
              </div>
              <ul className="config-survey-list">
                {config.survey.questions.map((q, index) => (
                  <li key={q.id} className="config-survey-card">
                    <div className="config-survey-card-top">
                      <strong>Q{index + 1}</strong>
                      <button
                        type="button"
                        className="configurator-btn"
                        onClick={() =>
                          setSurvey({
                            ...config.survey,
                            questions: config.survey.questions.filter((_, i) => i !== index),
                          })
                        }
                      >
                        Delete
                      </button>
                    </div>
                    <div className="configurator-field-grid">
                      <label className="configurator-field">
                        <span>Label</span>
                        <input value={q.label} onChange={(e) => updateQuestion(index, { label: e.target.value })} />
                      </label>
                      <label className="configurator-field">
                        <span>Type</span>
                        <select
                          value={q.type}
                          onChange={(e) =>
                            updateQuestion(index, { type: e.target.value as SurveyQuestion['type'] })
                          }
                        >
                          <option value="single">Single select</option>
                          <option value="multi">Multi select</option>
                          <option value="text">Text</option>
                        </select>
                      </label>
                      <label className="configurator-field">
                        <span>Maps to</span>
                        <select
                          value={q.mapsTo ?? ''}
                          onChange={(e) =>
                            updateQuestion(index, {
                              mapsTo: (e.target.value || undefined) as SurveyQuestion['mapsTo'],
                            })
                          }
                        >
                          <option value="">—</option>
                          <option value="exteriorStyle">exteriorStyle</option>
                          <option value="interiorStyle">interiorStyle</option>
                          <option value="palette">palette</option>
                          <option value="notes">notes</option>
                        </select>
                      </label>
                      <label className="configurator-check">
                        <input
                          type="checkbox"
                          checked={!!q.required}
                          onChange={(e) => updateQuestion(index, { required: e.target.checked })}
                        />
                        <span>Required</span>
                      </label>
                    </div>
                    {q.type !== 'text' && (
                      <div className="config-survey-options">
                        <span className="eyebrow">Options</span>
                        {(q.options ?? []).map((opt, oi) => (
                          <div key={`${q.id}-${oi}`} className="config-survey-option-row">
                            <input
                              value={opt.label}
                              placeholder="Label"
                              onChange={(e) => {
                                const options = [...(q.options ?? [])];
                                options[oi] = { ...opt, label: e.target.value, value: slug(e.target.value) || opt.value };
                                updateQuestion(index, { options });
                              }}
                            />
                            <button
                              type="button"
                              className="configurator-btn"
                              onClick={() => {
                                const options = (q.options ?? []).filter((_, i) => i !== oi);
                                updateQuestion(index, { options });
                              }}
                            >
                              ×
                            </button>
                          </div>
                        ))}
                        <button
                          type="button"
                          className="configurator-btn"
                          onClick={() => {
                            const options: SurveyQuestionOption[] = [
                              ...(q.options ?? []),
                              { value: `opt-${Date.now()}`, label: 'New option' },
                            ];
                            updateQuestion(index, { options });
                          }}
                        >
                          Add option
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                className="configurator-btn primary"
                onClick={() =>
                  setSurvey({
                    ...config.survey,
                    questions: [...config.survey.questions, newSurveyQuestion()],
                    version: config.survey.version + 1,
                  })
                }
              >
                Add question
              </button>
            </div>
          )}

          {tab === 'mappings' && (
            <div className="config-studio-block">
              <p className="muted">
                Controls how catalog source tabs map into pricing categories and Customer Option Form Excel sheets.
              </p>
              <div className="configurator-table-wrap">
                <table className="configurator-mini-table contract-config-table">
                  <thead>
                    <tr>
                      <th>Catalog tab</th>
                      <th>Pricing category</th>
                      <th>COF sheet</th>
                      <th>Kitchen/bath split</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {config.tabMappings.map((m, index) => (
                      <tr key={m.id}>
                        <td>
                          <input
                            value={m.sourceTab}
                            onChange={(e) => updateMapping(index, { sourceTab: e.target.value })}
                          />
                        </td>
                        <td>
                          <input
                            value={m.pricingCategory}
                            onChange={(e) => updateMapping(index, { pricingCategory: e.target.value })}
                          />
                        </td>
                        <td>
                          <input
                            value={m.cofSheet}
                            onChange={(e) => updateMapping(index, { cofSheet: e.target.value })}
                          />
                        </td>
                        <td>
                          <input
                            type="checkbox"
                            checked={!!m.kitchenBathSplit}
                            onChange={(e) => updateMapping(index, { kitchenBathSplit: e.target.checked })}
                            aria-label="Kitchen bath split"
                          />
                        </td>
                        <td>
                          <button
                            type="button"
                            className="configurator-btn"
                            onClick={() =>
                              setTabMappings(config.tabMappings.filter((_, i) => i !== index))
                            }
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button
                type="button"
                className="configurator-btn primary"
                onClick={() =>
                  setTabMappings([
                    ...config.tabMappings,
                    {
                      id: `map-${Date.now()}`,
                      sourceTab: 'New Tab',
                      pricingCategory: 'custom-trade',
                      cofSheet: 'Options',
                    },
                  ])
                }
              >
                Add mapping
              </button>
            </div>
          )}

          {tab === 'lookbook' && (
            <div className="config-studio-block">
              <p className="muted">
                After the client survey, these rules seed curated Look Book picks (Platinum thumbnails) into each room.
              </p>
              <div className="configurator-table-wrap">
                <table className="configurator-mini-table contract-config-table">
                  <thead>
                    <tr>
                      <th>Catalog tab</th>
                      <th>Min level</th>
                      <th>Room type</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {config.lookbookSeeds.map((s, index) => (
                      <tr key={s.id}>
                        <td>
                          <input
                            value={s.sourceTab}
                            onChange={(e) => updateSeed(index, { sourceTab: e.target.value })}
                          />
                        </td>
                        <td>
                          <select
                            value={s.minLevel}
                            onChange={(e) => updateSeed(index, { minLevel: e.target.value })}
                          >
                            {INCLUDED_LEVEL_OPTIONS.map((lvl) => (
                              <option key={lvl} value={lvl}>
                                {lvl}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <input
                            value={s.roomType}
                            onChange={(e) => updateSeed(index, { roomType: e.target.value })}
                          />
                        </td>
                        <td>
                          <button
                            type="button"
                            className="configurator-btn"
                            onClick={() =>
                              setLookbookSeeds(config.lookbookSeeds.filter((_, i) => i !== index))
                            }
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button
                type="button"
                className="configurator-btn primary"
                onClick={() =>
                  setLookbookSeeds([
                    ...config.lookbookSeeds,
                    {
                      id: `lb-${Date.now()}`,
                      sourceTab: 'Countertops',
                      minLevel: 'Level 3',
                      roomType: 'Kitchen',
                    },
                  ])
                }
              >
                Add Look Book seed
              </button>
            </div>
          )}

          {tab === 'client' && (
            <div className="config-studio-block config-client-rules">
              <label className="config-toggle-row">
                <input
                  type="checkbox"
                  checked={config.clientRules.curatedOnlyWhenAvailable}
                  onChange={(e) =>
                    setClientRules({ ...config.clientRules, curatedOnlyWhenAvailable: e.target.checked })
                  }
                />
                <span>
                  <strong>Curated-only when survey options exist</strong>
                  <small>Clients only see products preloaded from survey / Look Book.</small>
                </span>
              </label>
              <label className="config-toggle-row">
                <input
                  type="checkbox"
                  checked={config.clientRules.hidePricing}
                  onChange={(e) => setClientRules({ ...config.clientRules, hidePricing: e.target.checked })}
                />
                <span>
                  <strong>Hide pricing for clients</strong>
                  <small>Platinum stage — no dollar amounts in the catalog.</small>
                </span>
              </label>
              <label className="config-toggle-row">
                <input
                  type="checkbox"
                  checked={config.clientRules.lockStructuralEdits}
                  onChange={(e) =>
                    setClientRules({ ...config.clientRules, lockStructuralEdits: e.target.checked })
                  }
                />
                <span>
                  <strong>Lock structural edits</strong>
                  <small>No moving walls, doors, or windows in the client portal.</small>
                </span>
              </label>
              <label className="configurator-field">
                <span>Allowed level pattern (regex)</span>
                <input
                  value={config.clientRules.maxLevelPattern}
                  onChange={(e) =>
                    setClientRules({ ...config.clientRules, maxLevelPattern: e.target.value })
                  }
                  placeholder="level\\s*[1-5]"
                />
              </label>
            </div>
          )}

          {tab === 'invite' && (
            <div className="config-studio-block config-invite-grid">
              <div className="configurator-field-grid">
                <label className="configurator-field full">
                  <span>Email subject</span>
                  <input
                    value={config.inviteCopy.subject}
                    onChange={(e) => setInviteCopy({ ...config.inviteCopy, subject: e.target.value })}
                  />
                </label>
                <label className="configurator-field full">
                  <span>Greeting</span>
                  <input
                    value={config.inviteCopy.greeting}
                    onChange={(e) => setInviteCopy({ ...config.inviteCopy, greeting: e.target.value })}
                  />
                </label>
                <label className="configurator-field full">
                  <span>Body</span>
                  <textarea
                    rows={4}
                    value={config.inviteCopy.body}
                    onChange={(e) => setInviteCopy({ ...config.inviteCopy, body: e.target.value })}
                  />
                </label>
                <label className="configurator-field full">
                  <span>Portal blurb</span>
                  <input
                    value={config.inviteCopy.portalBlurb}
                    onChange={(e) => setInviteCopy({ ...config.inviteCopy, portalBlurb: e.target.value })}
                  />
                </label>
                <label className="configurator-field full">
                  <span>Closing</span>
                  <input
                    value={config.inviteCopy.closing}
                    onChange={(e) => setInviteCopy({ ...config.inviteCopy, closing: e.target.value })}
                  />
                </label>
              </div>
              <aside className="config-invite-preview" aria-label="Invite email preview">
                <div className="config-invite-preview-head">
                  <ClipboardList size={16} />
                  <strong>Preview</strong>
                </div>
                <pre>{invitePreview}</pre>
              </aside>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function sectionKey(tab: TabId): 'platinumTiers' | 'survey' | 'tabMappings' | 'lookbookSeeds' | 'clientRules' | 'inviteCopy' {
  if (tab === 'platinum') return 'platinumTiers';
  if (tab === 'survey') return 'survey';
  if (tab === 'mappings') return 'tabMappings';
  if (tab === 'lookbook') return 'lookbookSeeds';
  if (tab === 'client') return 'clientRules';
  return 'inviteCopy';
}

function slug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
