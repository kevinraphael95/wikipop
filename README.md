# WikiPop

Un jeu de duel rapide : à chaque manche, deux articles Wikipédia (aléatoires, tirés du top des pages les plus consultées de la semaine) s'affrontent. Devine lequel a été le plus vu ces 7 derniers jours.

🔗 [Jouer](https://kevinraphael95.github.io/wikipop/)

## Fonctionnement

- Les articles proviennent de l'API **Pageviews** de Wikimédia (top des pages consultées, agrégé sur les 7 derniers jours, Wikipédia FR).
- Les pages "techniques" (Accueil, Spécial:, Portail:, listes, pages de décès, etc.) sont filtrées pour ne garder que de vrais sujets.
- L'image de chaque article vient en priorité de son image principale Wikipédia ; si aucune image correcte n'est trouvée, l'app cherche une image de secours sur **Wikimedia Commons**.
- Le score (série actuelle, meilleure série, % de bonnes réponses) et le thème choisi sont sauvegardés dans le `localStorage` du navigateur, sous une seule clé (`wikipop-state`), avec purge automatique après 30 jours d'inactivité.
- Le thème (clair/sombre) suit par défaut la préférence système, puis mémorise le choix de l'utilisateur.

## Raccourcis clavier

- `←` / `→` : choisir le côté gauche / droit
- `Espace` / `Entrée` : question suivante (une fois répondu)

## Structure du projet

```
index.html   → structure de la page
style.css    → mise en page, thèmes clair/sombre, responsive mobile
script.js    → logique du jeu, appels API, sauvegarde locale
theme.js     → gestion du bouton clair/sombre
```

## Tech

- HTML / CSS / JavaScript vanilla, aucune dépendance, aucun build.
- Hébergé sur GitHub Pages.
- Données : [API Pageviews Wikimédia](https://wikimedia.org/api/rest_v1/) + [API Wikipédia FR](https://fr.wikipedia.org/w/api.php) + [API Wikimedia Commons](https://commons.wikimedia.org/w/api.php).

## Lancer en local

Aucune installation nécessaire — ouvre simplement `index.html` dans un navigateur, ou sers le dossier avec un petit serveur statique (ex. `npx serve`) pour éviter d'éventuelles restrictions CORS locales.
