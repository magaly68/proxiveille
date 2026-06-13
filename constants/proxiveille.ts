import {
  ACCESSIBLE_BUTTON_STYLE,
  APP_NAME,
  NON_MEDICAL_NOTICE,
  SAMSUNG_TEST_LABEL,
} from "@/constants/proxiveille";


export const APP_NAME = "ProxiVeille";

export const SAMSUNG_TEST_LABEL = "Version test Samsung Galaxy";

export const NON_MEDICAL_NOTICE =
  "ProxiVeille n'est pas un dispositif médical et ne remplace pas une prise en charge professionnelle. Vous gardez toujours le contrôle avant toute action sensible.";

export const ACCESSIBLE_BUTTON_STYLE = {
  minHeight: 56,
  paddingVertical: 16,
  paddingHorizontal: 18,
  borderRadius: 16,
};

export const APP_NAME = "ProxiVeille";

export const SAMSUNG_TEST_LABEL = "Version test Samsung Galaxy";

export const NON_MEDICAL_NOTICE =
  "ProxiVeille n'est pas un dispositif médical et ne remplace pas une prise en charge professionnelle. Vous gardez toujours le contrôle avant toute action sensible.";

export const ACCESSIBLE_BUTTON_STYLE = {
  minHeight: 56,
  paddingVertical: 16,
  paddingHorizontal: 18,
  borderRadius: 16,
};

export const STATUS_CONFIG = {
  inactive: {
    label: "Veille inactive",
    sublabel: "Touchez le bouton pour lancer le test",
    colorKey: "muted",
  },
  active: {
    label: "Veille active",
    sublabel: "Aucune situation inhabituelle détectée",
    colorKey: "success",
  },
  warning: {
    label: "Mouvement inhabituel",
    sublabel: "Analyse en cours. Vous gardez le contrôle.",
    colorKey: "warning",
  },
  alarm: {
    label: "Situation inhabituelle détectée",
    sublabel: "Confirmez ou annulez avant toute action.",
    colorKey: "error",
  },
} as const;