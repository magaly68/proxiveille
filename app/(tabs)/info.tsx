import { useState, useCallback } from "react";
import {
  Text,
  View,
  ScrollView,
  Pressable,
  Linking,
  Platform,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import * as Haptics from "expo-haptics";

type InfoSection = "types" | "firstaid" | "triggers" | "living" | "resources";

interface SectionData {
  title: string;
  icon: string;
  content: ContentItem[];
}

interface ContentItem {
  title: string;
  text: string;
}

const INFO_SECTIONS: Record<InfoSection, SectionData> = {
  types: {
    title: "Types de crises",
    icon: "🧠",
    content: [
      {
        title: "Crises tonico-cloniques (grand mal)",
        text: "La personne perd connaissance, le corps se raidit (phase tonique) puis est secoue de convulsions (phase clonique). Duree typique : 1 a 3 minutes. C'est le type de crise que l'application detecte principalement.",
      },
      {
        title: "Crises d'absence (petit mal)",
        text: 'Breves pertes de conscience (5 a 30 secondes) avec un regard fixe. La personne peut sembler "deconnectee" puis reprendre ses activites normalement. Plus frequentes chez les enfants.',
      },
      {
        title: "Crises focales (partielles)",
        text: "Elles debutent dans une zone specifique du cerveau. La personne peut ressentir des sensations inhabituelles, des mouvements involontaires d'un membre, ou des alterations de conscience. Elles peuvent evoluer vers une crise generalisee.",
      },
      {
        title: "Crises myocloniques",
        text: "Secousses musculaires breves et soudaines, comme un sursaut. Elles durent generalement moins d'une seconde et peuvent affecter tout le corps ou une partie seulement.",
      },
      {
        title: "Crises atoniques",
        text: "Perte soudaine du tonus musculaire entrainant une chute. Tres breves (quelques secondes), elles peuvent causer des blessures dues a la chute.",
      },
    ],
  },
  firstaid: {
    title: "Premiers secours",
    icon: "🩺",
    content: [
      {
        title: "Restez calme",
        text: "La plupart des crises s'arretent d'elles-memes en quelques minutes. Gardez votre calme et chronometrez la duree de la crise.",
      },
      {
        title: "Protegez la personne",
        text: "Eloignez les objets dangereux. Placez quelque chose de doux sous sa tete. Ne tentez PAS de la maintenir ou de restreindre ses mouvements.",
      },
      {
        title: "Position laterale de securite",
        text: "Une fois les convulsions terminees, placez la personne en position laterale de securite (PLS) pour degager les voies respiratoires.",
      },
      {
        title: "Ce qu'il ne faut PAS faire",
        text: "Ne mettez RIEN dans la bouche de la personne. Ne tentez pas de lui donner a boire ou a manger. Ne la maintenez pas de force. Ces gestes sont dangereux et inutiles.",
      },
      {
        title: "Quand appeler le 15 (SAMU)",
        text: "Appelez les urgences si : la crise dure plus de 5 minutes, la personne ne reprend pas conscience, c'est sa premiere crise, elle s'est blessee, elle a des difficultes a respirer, ou une deuxieme crise survient rapidement.",
      },
      {
        title: "Apres la crise",
        text: "Restez avec la personne jusqu'a ce qu'elle soit pleinement consciente. Parlez-lui calmement et rassurez-la. Elle peut etre confuse et fatiguee pendant un moment (phase post-ictale).",
      },
    ],
  },
  triggers: {
    title: "Facteurs declenchants",
    icon: "⚡",
    content: [
      {
        title: "Manque de sommeil",
        text: "Le manque de sommeil est l'un des declencheurs les plus courants. Maintenez un rythme de sommeil regulier (7 a 9 heures par nuit) et evitez les nuits blanches.",
      },
      {
        title: "Stress et anxiete",
        text: "Le stress emotionnel peut abaisser le seuil de declenchement des crises. Pratiquez des techniques de relaxation : respiration profonde, meditation, yoga.",
      },
      {
        title: "Oubli de medicaments",
        text: "Ne sautez jamais une prise de medicament antiepileptique. Utilisez des rappels et gardez toujours une reserve de medicaments avec vous.",
      },
      {
        title: "Alcool et substances",
        text: "L'alcool peut interagir avec les medicaments et abaisser le seuil epileptogene. La consommation excessive est particulierement risquee. Discutez avec votre medecin.",
      },
      {
        title: "Stimulations lumineuses",
        text: "Chez certaines personnes (epilepsie photosensible), les lumieres clignotantes, les ecrans ou les jeux video peuvent declencher des crises. Utilisez des filtres de lumiere bleue.",
      },
      {
        title: "Fievre et maladie",
        text: "La fievre, la deshydratation et les infections peuvent augmenter le risque de crises. Consultez rapidement en cas de maladie.",
      },
    ],
  },
  living: {
    title: "Vivre avec l'epilepsie",
    icon: "💪",
    content: [
      {
        title: "Vie quotidienne",
        text: "La majorite des personnes epileptiques menent une vie normale et active. Avec un traitement adapte, environ 70% des personnes controlent leurs crises.",
      },
      {
        title: "Travail et etudes",
        text: "L'epilepsie n'empeche pas de travailler ou d'etudier. En France, la RQTH (Reconnaissance de la Qualite de Travailleur Handicape) peut offrir des amenagements. Informez votre employeur si vous le souhaitez.",
      },
      {
        title: "Conduite automobile",
        text: "En France, la conduite est possible apres une periode sans crise (generalement 1 an) et avec un avis medical favorable. Consultez votre neurologue et la commission medicale du permis.",
      },
      {
        title: "Sport et activites",
        text: "Le sport est recommande ! Evitez les activites a risque en cas de chute (escalade, plongee sous-marine). La natation est possible avec surveillance. Informez votre entourage sportif.",
      },
      {
        title: "Grossesse",
        text: "Une grossesse est tout a fait possible avec l'epilepsie. Elle doit etre planifiee avec votre neurologue pour adapter le traitement. L'acide folique est recommande avant la conception.",
      },
      {
        title: "Sante mentale",
        text: "L'anxiete et la depression sont plus frequentes chez les personnes epileptiques. N'hesitez pas a en parler a votre medecin. Un accompagnement psychologique peut etre tres benefique.",
      },
    ],
  },
  resources: {
    title: "Ressources utiles",
    icon: "📚",
    content: [
      {
        title: "SAMU - 15",
        text: "Numero d'urgence medicale en France. A appeler en cas de crise prolongee (plus de 5 minutes) ou de situation dangereuse.",
      },
      {
        title: "Epilepsie France",
        text: "Association nationale qui informe, accompagne et defend les droits des personnes epileptiques. Site : www.epilepsie-france.com",
      },
      {
        title: "Fondation Francaise pour la Recherche sur l'Epilepsie (FFRE)",
        text: "Soutient la recherche sur l'epilepsie et propose des informations medicales fiables. Site : www.fondation-epilepsie.fr",
      },
      {
        title: "Ligne Epilepsie - 01 47 83 65 36",
        text: "Ligne d'ecoute et d'information animee par des professionnels. Pour poser vos questions et etre oriente(e).",
      },
      {
        title: "Centres de reference epilepsie",
        text: "Des centres specialises existent dans les CHU de France. Demandez a votre medecin une orientation vers un centre de reference pour un suivi specialise.",
      },
      {
        title: "Application ProxiVeille",
        text: "Cette application est un outil d'aide a la detection, pas un dispositif medical certifie. Elle ne remplace en aucun cas l'avis et le suivi de votre neurologue.",
      },
    ],
  },
};

export default function InfoScreen() {
  const colors = useColors();
  const [expandedSection, setExpandedSection] = useState<InfoSection | null>(
    null,
  );
  const [expandedItem, setExpandedItem] = useState<string | null>(null);

  const toggleSection = useCallback((section: InfoSection) => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setExpandedSection((prev) => (prev === section ? null : section));
    setExpandedItem(null);
  }, []);

  const toggleItem = useCallback((itemKey: string) => {
    setExpandedItem((prev) => (prev === itemKey ? null : itemKey));
  }, []);

  const handleCallSAMU = useCallback(() => {
    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }
    Linking.openURL("tel:15");
  }, []);

  return (
    <ScreenContainer className="px-6">
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 30 }}
      >
        {/* Header */}
        <View className="pt-4 mb-2">
          <Text className="text-2xl font-bold text-foreground">
            Informations
          </Text>
          <Text className="text-sm text-muted mt-1">
            Comprendre l'epilepsie et savoir reagir
          </Text>
        </View>

        {/* Emergency banner */}
        <Pressable
          onPress={handleCallSAMU}
          style={({ pressed }) => [
            {
              backgroundColor: colors.error,
              padding: 14,
              borderRadius: 14,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              marginVertical: 12,
              opacity: pressed ? 0.85 : 1,
              transform: [{ scale: pressed ? 0.98 : 1 }],
            },
          ]}
        >
          <Text style={{ fontSize: 16, fontWeight: "700", color: "#FFFFFF" }}>
            Urgence : Appeler le 15 (SAMU)
          </Text>
        </Pressable>

        {/* Sections */}
        {(Object.keys(INFO_SECTIONS) as InfoSection[]).map((sectionKey) => {
          const section = INFO_SECTIONS[sectionKey];
          const isExpanded = expandedSection === sectionKey;

          return (
            <View key={sectionKey} className="mb-3">
              <Pressable
                onPress={() => toggleSection(sectionKey)}
                style={({ pressed }) => [
                  {
                    backgroundColor: colors.surface,
                    padding: 16,
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: isExpanded ? colors.primary : colors.border,
                    opacity: pressed ? 0.85 : 1,
                    borderBottomLeftRadius: isExpanded ? 0 : 14,
                    borderBottomRightRadius: isExpanded ? 0 : 14,
                  },
                ]}
              >
                <View className="flex-row justify-between items-center">
                  <View className="flex-row items-center gap-3 flex-1">
                    <Text style={{ fontSize: 22 }}>{section.icon}</Text>
                    <Text className="text-base font-semibold text-foreground">
                      {section.title}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 18, color: colors.muted }}>
                    {isExpanded ? "−" : "+"}
                  </Text>
                </View>
              </Pressable>

              {isExpanded && (
                <View
                  style={{
                    backgroundColor: colors.background,
                    borderWidth: 1,
                    borderTopWidth: 0,
                    borderColor: colors.primary,
                    borderBottomLeftRadius: 14,
                    borderBottomRightRadius: 14,
                    padding: 12,
                  }}
                >
                  {section.content.map((item, index) => {
                    const itemKey = `${sectionKey}-${index}`;
                    const isItemExpanded = expandedItem === itemKey;

                    return (
                      <Pressable
                        key={itemKey}
                        onPress={() => toggleItem(itemKey)}
                        style={({ pressed }) => [
                          {
                            backgroundColor: isItemExpanded
                              ? colors.primary + "08"
                              : "transparent",
                            padding: 12,
                            borderRadius: 10,
                            marginBottom:
                              index < section.content.length - 1 ? 4 : 0,
                            opacity: pressed ? 0.85 : 1,
                          },
                        ]}
                      >
                        <View className="flex-row justify-between items-start">
                          <Text
                            style={{
                              fontSize: 14,
                              fontWeight: "600",
                              color: colors.foreground,
                              flex: 1,
                              paddingRight: 8,
                            }}
                          >
                            {item.title}
                          </Text>
                          <Text style={{ fontSize: 14, color: colors.muted }}>
                            {isItemExpanded ? "▲" : "▼"}
                          </Text>
                        </View>
                        {isItemExpanded && (
                          <Text
                            style={{
                              fontSize: 13,
                              color: colors.muted,
                              lineHeight: 20,
                              marginTop: 8,
                            }}
                          >
                            {item.text}
                          </Text>
                        )}
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </View>
          );
        })}

        {/* Disclaimer */}
        <View
          style={{
            backgroundColor: colors.warning + "15",
            padding: 14,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.warning + "30",
            marginTop: 8,
          }}
        >
          <Text
            style={{
              fontSize: 13,
              fontWeight: "700",
              color: colors.warning,
              marginBottom: 4,
            }}
          >
            Avertissement
          </Text>
          <Text style={{ fontSize: 12, color: colors.muted, lineHeight: 18 }}>
            Les informations presentees ici sont a titre educatif et ne
            remplacent pas un avis medical professionnel. Consultez toujours
            votre neurologue pour des conseils personnalises.
          </Text>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
