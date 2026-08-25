# risques

Carte de vigilance météo non officielle (10 aléas, échelle propre à chaque
aléa, J/J+1/J+2), dérivée des données du hub
[`harmonie`](https://github.com/alertesmeteo-hub/harmonie) — pas de nouveau
décodage GRIB, ce pipeline lit les fichiers départementaux déjà publiés par
`harmonie` et en dérive des indices de risque.

## Aléas

- **Orages, Grêle, Verglas** — dérivés des codes de risque déjà calculés
  par HARMONIE (`thunder_risk_code`, `hail_risk_code`,
  `snow_stick_risk_code`). Grêle est en plus subordonnée à une précipitation
  mesurable à l'heure considérée (pas de grêle sans pluie en cours).
- **Pluie-inondation, Vent, Neige, Chaleur, Froid** — seuils numériques
  explicites (cumul de pluie/neige en mm/cm, rafales en km/h, température),
  7 paliers + Nul chacun — voir `HAZARD_LEVELS` et les constantes
  `*_THRESHOLDS*` dans `scripts/update_risques.py`.
- **Brouillard** — paliers sur la visibilité.
- **Feu** — cocktail météo simple (température, humidité, vent, pluie
  récente). **Non officiel, ne remplace pas Météo des forêts.**

Chaque aléa a sa propre échelle de niveaux (nombre de paliers et libellés),
publiée dans `risques.json` sous `hazard_levels` — il n'y a plus d'échelle
0-4 unique partagée par tous les aléas.

## Fonctionnement

Une GitHub Action tourne toutes les heures, vérifie si le run HARMONIE
source a changé (sinon ne fait rien), calcule les 10 aléas pour chacun des
96 départements sur J/J+1/J+2 (calendrier Europe/Paris — J0 est toujours la
date du jour, même si le run source est en retard) et publie `risques.json`
sur la branche [`data`](../../tree/data).

## Structure du dépôt

```
.github/workflows/update-risques.yml   Action planifiée (branche data)
config/departements-france.geojson     Contours départementaux (IGN, licence ouverte)
scripts/update_risques.py              Calcul des 10 aléas à partir de harmonie
wordpress/harmonie-risques-widget/     Plugin WordPress (carte + shortcode)
```
