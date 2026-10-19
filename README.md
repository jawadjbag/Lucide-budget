# Lucide Budget — PWA de finances personnelles (locale et chiffrée)

Application indépendante pour le suivi de tes revenus, charges, abonnements, catégories de dépenses, budgets mensuels et pistes de réduction des coûts.

## Fonctionnalités
- Dashboard mensuel avec revenus, dépenses, solde, taux d'épargne, évolution sur 6 mois et répartition par catégorie.
- Dépenses et revenus saisis manuellement ; catégorisation et recherche.
- Suivi des factures / abonnements mensuels, trimestriels et annuels, conversion en montant mensuel indicatif.
- Diagnostic de dépenses évitables, scénarios de réduction ajustables et recommandations à confirmer (ce ne sont pas des « gaspillages » prouvés).
- Budgets mensuels par catégorie et objectif d'épargne.
- Import de relevés **CSV** (avec association manuelle des colonnes) et **CAMT.053 XML** ; aperçu avant import et détection des doublons exacts. Les PDF ne sont pas pris en charge.
- Coffre chiffré **AES-256-GCM** ; clé dérivée du mot de passe avec **PBKDF2-SHA256** (310 000 itérations) ; données réelles sauvegardées uniquement sous forme chiffrée dans IndexedDB sur cet appareil.
- Export d'une sauvegarde chiffrée au format `.lucide`, restauration avec mot de passe, verrouillage, changement de mot de passe.
- Mode démonstration avec **données entièrement fictives**, indépendant du coffre réel.
- PWA installable et interface responsive pour ordinateur, iPhone et Android.

## Lancer / mettre en ligne
Cette application a besoin d'une **origine sécurisée HTTPS** (ou `http://localhost` pendant le développement) pour le chiffrement Web Crypto et l'installation PWA. **Ne pas ouvrir `index.html` en `file://` pour saisir des données réelles.**

Pour publier : décompresser l'archive à la racine d'un hébergement **statique HTTPS** (GitHub Pages, Cloudflare Pages, Netlify, etc.). Le site ne nécessite ni compte ni serveur de données. Pour l'installation iPhone : ouvrir le lien HTTPS dans Safari, puis Partager > Ajouter à l'écran d'accueil.

## Confidentialité
- Les scripts, styles et polices sont locaux, sans SDK de banque, API de suivi, publicité ni analytics.
- Import bancaire : le fichier est lu par le navigateur ; il n'est pas envoyé à un serveur.
- Le code du site peut être hébergé publiquement ; tes données chiffrées restent stockées sur l'appareil.
- Les contenus sont déchiffrés temporairement **en mémoire** lorsque le coffre est déverrouillé. Évite de l'utiliser sur un appareil partagé.
- Les sauvegardes chiffrées restent sensibles : protège leur emplacement et ton mot de passe.
- Sans sauvegarde exportée, la suppression des données du navigateur ou la perte de l'appareil entraîne la perte des données. Sans mot de passe, aucune récupération n'est prévue.
- **Aucune synchronisation multi-appareils** : chaque navigateur dispose de son coffre indépendant. Le transfert s'effectue manuellement via export/restauration chiffré.
- Cette version n'a pas fait l'objet d'un audit professionnel de sécurité. Ne l'utilise pas comme unique archive de tes finances.

## Comprendre les chiffres
Le taux d'épargne est calculé à partir des opérations du mois (revenus moins dépenses / revenus). Le mois en cours est provisoire. Les charges récurrentes sont affichées séparément ; elles ne sont pas ajoutées automatiquement une seconde fois aux dépenses importées, pour éviter un double comptage. Les pistes de réduction sont des hypothèses et nécessitent un examen humain avant toute résiliation.

## Contenu de l'archive
`index.html`, `styles.css`, `app.js`, `sw.js`, `manifest.webmanifest`, `icon.svg`, `icon-192.png`, `icon-512.png`.

## Tester l'import CSV
Le fichier `exemple-releve-fictif.csv` fourni est entièrement fictif. Il peut être importé après la création de ton coffre pour tester le mapping des colonnes et les catégories. Les virements internes peuvent être reclassés manuellement si nécessaire.