/**
 * Configurable client design-discovery questionnaire.
 * Edit this module (or swap the JSON) to change questions/options without UI rewrites.
 */

export type SurveyQuestionType = 'single' | 'multi' | 'text';

export type SurveyQuestionOption = {
  value: string;
  label: string;
};

export type SurveyQuestion = {
  id: string;
  label: string;
  help?: string;
  type: SurveyQuestionType;
  required?: boolean;
  options?: SurveyQuestionOption[];
  /** Maps legacy SurveyResponse fields for curation scoring */
  mapsTo?: 'exteriorStyle' | 'interiorStyle' | 'palette' | 'notes';
  placeholder?: string;
  rows?: number;
};

export type SurveyConfig = {
  id: string;
  title: string;
  description: string;
  version: number;
  questions: SurveyQuestion[];
};

/** Default Olsen client portal survey — replace/extend as product configures questions. */
export const DEFAULT_SURVEY_CONFIG: SurveyConfig = {
  id: 'olsen-client-discovery-v1',
  title: 'Design discovery',
  description: 'Tell us about your home style — we preload Platinum Look Book options in every room.',
  version: 1,
  questions: [
    {
      id: 'exterior',
      label: 'Exterior style',
      type: 'single',
      required: true,
      mapsTo: 'exteriorStyle',
      options: [
        { value: 'coastal', label: 'Coastal / beach contemporary' },
        { value: 'modern', label: 'Modern / clean lines' },
        { value: 'traditional', label: 'Traditional / classic Florida' },
        { value: 'transitional', label: 'Transitional mix' },
      ],
    },
    {
      id: 'interior',
      label: 'Interior style',
      type: 'single',
      required: true,
      mapsTo: 'interiorStyle',
      options: [
        { value: 'warm', label: 'Warm transitional' },
        { value: 'modern', label: 'Modern' },
        { value: 'traditional', label: 'Traditional' },
        { value: 'coastal', label: 'Light coastal' },
      ],
    },
    {
      id: 'palette',
      label: 'Color palette',
      type: 'single',
      required: true,
      mapsTo: 'palette',
      options: [
        { value: 'neutrals', label: 'Soft neutrals' },
        { value: 'contrast', label: 'High contrast' },
        { value: 'earth', label: 'Earth tones' },
        { value: 'light', label: 'Light & airy whites' },
      ],
    },
    {
      id: 'flooring',
      label: 'Preferred flooring feel',
      type: 'single',
      options: [
        { value: 'large-porcelain', label: 'Large-format porcelain' },
        { value: 'wood-look', label: 'Wood-look plank tile' },
        { value: 'natural-stone', label: 'Natural stone look' },
        { value: 'unsure', label: 'Not sure — show me options' },
      ],
    },
    {
      id: 'kitchen-priority',
      label: 'Kitchen priority',
      type: 'single',
      options: [
        { value: 'entertaining', label: 'Entertaining / open island' },
        { value: 'storage', label: 'Maximum storage' },
        { value: 'statement', label: 'Statement countertops & backsplash' },
        { value: 'balanced', label: 'Balanced everyday kitchen' },
      ],
    },
    {
      id: 'bath-priority',
      label: 'Primary bath priority',
      type: 'single',
      options: [
        { value: 'spa', label: 'Spa-like shower experience' },
        { value: 'dual', label: 'Dual vanity & storage' },
        { value: 'light', label: 'Bright, light surfaces' },
        { value: 'classic', label: 'Classic, timeless finishes' },
      ],
    },
    {
      id: 'hardware',
      label: 'Metal finish preference',
      type: 'single',
      options: [
        { value: 'matte-black', label: 'Matte black' },
        { value: 'brushed-nickel', label: 'Brushed nickel' },
        { value: 'champagne', label: 'Champagne / gold tones' },
        { value: 'mixed', label: 'Mixed metals OK' },
      ],
    },
    {
      id: 'notes',
      label: 'Anything else we should know?',
      type: 'text',
      mapsTo: 'notes',
      placeholder: 'Must-haves, must-avoids, inspiration homes…',
      rows: 3,
    },
  ],
};

let activeSurveyConfig: SurveyConfig = DEFAULT_SURVEY_CONFIG;

export function getSurveyConfig(): SurveyConfig {
  return activeSurveyConfig;
}

/** Runtime override for admin-configured questionnaires (persisted separately later). */
export function setSurveyConfig(config: SurveyConfig) {
  activeSurveyConfig = config;
}

export function surveyAnswersToLegacyFields(
  answers: Record<string, string | string[]>,
  config: SurveyConfig = getSurveyConfig(),
): {
  exteriorStyle?: string;
  interiorStyle?: string;
  palette?: string;
  notes?: string;
} {
  const out: {
    exteriorStyle?: string;
    interiorStyle?: string;
    palette?: string;
    notes?: string;
  } = {};
  for (const q of config.questions) {
    if (!q.mapsTo) continue;
    const raw = answers[q.id];
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (value != null && value !== '') out[q.mapsTo] = String(value);
  }
  return out;
}
