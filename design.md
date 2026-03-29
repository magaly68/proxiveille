# EpiGuard - Design de l'Interface Mobile

## Vue d'ensemble

EpiGuard est une application de détection des crises d'épilepsie tonico-cloniques utilisant les capteurs du smartphone (accéléromètre et gyroscope). L'application est conçue pour être utilisée d'une seule main, en orientation portrait, avec une interface accessible et rassurante.

## Palette de couleurs

| Token | Light | Dark | Usage |
|-------|-------|------|-------|
| primary | #6C5CE7 | #A29BFE | Couleur d'accent principale, boutons CTA |
| background | #FAFBFC | #0F1419 | Fond d'écran principal |
| surface | #F0F2F5 | #1A1F2E | Cartes, surfaces élevées |
| foreground | #1A1A2E | #E8ECF1 | Texte principal |
| muted | #7C8DB5 | #8892B0 | Texte secondaire |
| border | #E2E8F0 | #2D3548 | Bordures, séparateurs |
| success | #00C853 | #69F0AE | Statut actif, pas de crise |
| warning | #FF9100 | #FFB74D | Avertissement, mouvement suspect |
| error | #FF1744 | #FF5252 | Alarme, crise détectée |

## Liste des écrans

### 1. Accueil / Monitoring (Tab: Accueil)
Écran principal avec le statut de détection en temps réel.

**Contenu :**
- Grand indicateur circulaire de statut (vert = normal, orange = avertissement, rouge = alarme)
- Texte de statut : "Surveillance active" / "Mouvement suspect" / "Crise détectée"
- Visualisation en temps réel des données capteurs (graphique simplifié)
- Bouton ON/OFF pour activer/désactiver la surveillance
- Dernière crise détectée (date/heure) en bas
- Indicateur de sensibilité actuelle

### 2. Journal des crises (Tab: Journal)
Historique complet des crises détectées.

**Contenu :**
- Liste chronologique des événements (FlatList)
- Chaque carte d'événement affiche : date/heure, durée, intensité (faible/moyenne/forte), notes
- Filtre par période (7j, 30j, 90j, tout)
- Statistiques résumées en haut (nombre de crises ce mois, durée moyenne)
- Possibilité d'ajouter une crise manuellement
- Possibilité d'ajouter des notes à chaque événement

### 3. Contacts d'urgence (Tab: Urgence)
Gestion des contacts à alerter en cas de crise.

**Contenu :**
- Liste des contacts d'urgence avec nom, téléphone, relation
- Bouton d'ajout de contact
- Bouton SOS manuel (grand, rouge, bien visible)
- Configuration du message d'alerte personnalisé
- Option d'appel automatique au premier contact

### 4. Profil médical (Tab: Profil)
Informations médicales et paramètres de l'application.

**Contenu :**
- Section "Informations personnelles" : nom, âge, groupe sanguin
- Section "Informations médicales" : type d'épilepsie, médicaments, allergies, médecin traitant
- Section "Paramètres de détection" : sensibilité (faible/moyenne/haute), durée seuil
- Section "Préférences" : notifications, vibration, son d'alarme
- Bouton "Exporter les données" (pour le médecin)
- Informations sur l'épilepsie (lien vers ressources)

## Flux utilisateur principaux

### Flux 1 : Surveillance active
1. L'utilisateur ouvre l'app → Écran d'accueil
2. Appuie sur le bouton "Démarrer la surveillance"
3. L'indicateur passe au vert "Surveillance active"
4. Les capteurs collectent les données en continu
5. L'écran affiche les données en temps réel

### Flux 2 : Détection d'une crise
1. Les capteurs détectent un mouvement anormal (3-8 Hz)
2. L'indicateur passe à l'orange "Mouvement suspect" (avertissement)
3. Si le mouvement persiste >10 sec → Rouge "Crise détectée"
4. Alarme sonore + vibration
5. Compte à rebours de 30 sec pour annuler (fausse alerte)
6. Si non annulé → envoi d'alertes aux contacts d'urgence
7. L'événement est enregistré dans le journal

### Flux 3 : Ajout d'un contact d'urgence
1. Tab Urgence → Bouton "Ajouter un contact"
2. Formulaire : nom, téléphone, relation
3. Validation → contact ajouté à la liste
4. Le contact recevra les alertes en cas de crise

### Flux 4 : Consultation du journal
1. Tab Journal → Liste des événements
2. Tap sur un événement → Détail avec graphique
3. Possibilité d'ajouter/modifier des notes
4. Filtrer par période pour voir les tendances

## Navigation

Navigation par onglets (Tab Bar) avec 4 onglets :
1. **Accueil** (icône : shield/bouclier) - Monitoring en temps réel
2. **Journal** (icône : book/livre) - Historique des crises
3. **Urgence** (icône : phone/téléphone) - Contacts d'urgence + SOS
4. **Profil** (icône : person/personne) - Profil médical + paramètres

## Principes de design

- **Accessibilité** : Tailles de texte généreuses, contrastes élevés, zones tactiles larges (min 44x44pt)
- **Clarté** : Statut visible en un coup d'oeil grâce aux codes couleur
- **Sérénité** : Tons doux en mode normal, couleurs vives uniquement pour les alertes
- **Simplicité** : Pas de surcharge d'information, hiérarchie visuelle claire
- **Utilisabilité** : Navigation une main, actions principales accessibles sans scroll
