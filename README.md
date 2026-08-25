# risques

Carte de vigilance météo non officielle (9 aléas, 5 niveaux, J/J+1/J+2),
dérivée des données du hub [`harmonie`](https://github.com/alertesmeteo-hub/harmonie)
— pas de nouveau décodage GRIB, ce pipeline lit les fichiers départementaux
déjà publiés par `harmonie` et en dérive des indices de risque.

## Aléas

- **Orages, Grêle, Pluie-inondation, Vent, Neige-verglas** — dérivés
  directement des diagnostics déjà calculés par HARMONIE
  (`thunder_risk_code`, `hail_risk_code`, `heavy_rain_risk_code`,
  `severe_wind_risk_code`, `snow_risk_code`/`snow_stick_risk_code`).
- **Chaleur, Froid, Brouillard** — paliers sur température/visibilité.
- **Feu** — cocktail météo simple (température, humidité, vent, pluie
  récente). **Non officiel, ne remplace pas Météo des forêts.**

## Fonctionnement

Une GitHub Action tourne toutes les heures, vérifie si le run HARMONIE
source a changé (sinon ne fait rien), calcule les 9 aléas pour chacun des
96 départements sur J/J+1/J+2 (maximum horaire du jour, calendrier
Europe/Paris) et publie `risques.json` sur la branche
[`data`](../../tree/data).

## Structure du dépôt

```
.github/workflows/update-risques.yml   Action planifiée (branche data)
config/departements-france.geojson     Contours départementaux (IGN, licence ouverte)
scripts/update_risques.py              Calcul des 9 aléas à partir de harmonie
wordpress/harmonie-risques-widget/     Plugin WordPress (carte + shortcode)
```
