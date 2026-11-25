// E1 §4.3 — Phase-gated feature flags.

export type Phase = 1 | 2 | 3 | 4;

export interface FeatureFlags {
  ENABLE_PRAYER_ENGINE: boolean;
  ENABLE_CLOUD_SYNC: boolean;
  ENABLE_E2EE_VAULT: boolean;
  ENABLE_EXEGESIS_AND_INK: boolean;
  ENABLE_AUDIO_MIXER: boolean;
  ENABLE_AI_GATEWAY: boolean;
  ENABLE_SYNTAX_TREES_V11: boolean;
}

export const PHASE_FLAGS: Record<Phase, FeatureFlags> = {
  1: {
    ENABLE_PRAYER_ENGINE: false,
    ENABLE_CLOUD_SYNC: false,
    ENABLE_E2EE_VAULT: false,
    ENABLE_EXEGESIS_AND_INK: false,
    ENABLE_AUDIO_MIXER: false,
    ENABLE_AI_GATEWAY: false,
    ENABLE_SYNTAX_TREES_V11: false,
  },
  2: {
    ENABLE_PRAYER_ENGINE: true,
    ENABLE_CLOUD_SYNC: true,
    ENABLE_E2EE_VAULT: true,
    ENABLE_EXEGESIS_AND_INK: false,
    ENABLE_AUDIO_MIXER: false,
    ENABLE_AI_GATEWAY: false,
    ENABLE_SYNTAX_TREES_V11: false,
  },
  3: {
    ENABLE_PRAYER_ENGINE: true,
    ENABLE_CLOUD_SYNC: true,
    ENABLE_E2EE_VAULT: true,
    ENABLE_EXEGESIS_AND_INK: true,
    ENABLE_AUDIO_MIXER: true,
    ENABLE_AI_GATEWAY: false,
    ENABLE_SYNTAX_TREES_V11: false,
  },
  4: {
    ENABLE_PRAYER_ENGINE: true,
    ENABLE_CLOUD_SYNC: true,
    ENABLE_E2EE_VAULT: true,
    ENABLE_EXEGESIS_AND_INK: true,
    ENABLE_AUDIO_MIXER: true,
    ENABLE_AI_GATEWAY: true,
    ENABLE_SYNTAX_TREES_V11: false,
  },
};

export function getPhaseFlags(phase: Phase): FeatureFlags {
  return PHASE_FLAGS[phase];
}
