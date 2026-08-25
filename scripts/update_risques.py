#!/usr/bin/env python3
"""Calcule une carte de vigilance météo (10 aléas, échelle propre à chaque
aléa, non officielle) à partir des fichiers départementaux déjà publiés par
le hub `harmonie`.

Contrairement au pipeline HARMONIE (qui décode les GRIB du KNMI), ce script
ne télécharge aucune archive météo : il lit les 96 fichiers
``departements/XX.json`` déjà publiés sur la branche ``data`` du dépôt
``harmonie`` (mêmes données, déjà décodées et compactées), en dérive 10
aléas par département pour J / J+1 / J+2, et republie ``risques.json``.

Trois aléas réutilisent directement des codes de risque déjà calculés par
le pipeline HARMONIE (0-4, cf. ``update_harmonie_france.py::VALUE_COLUMNS``) :
orages, grêle (avec une garde : pas de grêle sans pluie en cours), verglas
(dérivé de ``snow_stick_risk_code``). Les autres sont calculés ici à partir
de seuils numériques explicites propres à chaque aléa (température, cumul
de pluie/neige, rafales, visibilité) — voir ``HAZARD_LEVELS`` et les
constantes ``*_THRESHOLDS*`` ci-dessous pour le détail des paliers.

L'aléa « feu » est un simple cocktail météo (température, humidité, vent,
pluie récente) : il ne remplace pas Météo des forêts et doit toujours être
présenté avec cet avertissement.
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import numpy as np
import requests

try:
    from zoneinfo import ZoneInfo
except ImportError:  # pragma: no cover - Python < 3.9 non pris en charge ici
    ZoneInfo = None  # type: ignore[assignment,misc]


LOGGER = logging.getLogger("risques")
PIPELINE_VERSION = "2.4.0"
PARIS_TZ = ZoneInfo("Europe/Paris") if ZoneInfo is not None else timezone.utc

DEFAULT_HARMONIE_BASE_URL = (
    "https://raw.githubusercontent.com/alertesmeteo-hub/harmonie/data"
)

HAZARDS = (
    "vent",
    "pluie_inondation",
    "orages",
    "grele",
    "chaleur",
    "froid",
    "neige",
    "verglas",
    "brouillard",
    "feu",
)

# L'ordre d'affichage (onglets, grille de détail) suit l'ordre d'insertion
# de ce dict, propagé tel quel dans le JSON (``manifest.hazards``) puis lu
# côté widget via ``Object.keys()`` — le réordonner ici suffit à réordonner
# toute l'interface, aucun changement JS n'est nécessaire.
HAZARD_LABELS = {
    "vent": "Vent",
    "pluie_inondation": "Pluie-inondation",
    "orages": "Orages",
    "grele": "Grêle",
    "chaleur": "Chaleur",
    "froid": "Froid",
    "neige": "Neige",
    "verglas": "Verglas",
    "brouillard": "Brouillard",
    "feu": "Feu",
}

# Chaque aléa a sa propre échelle (nombre de paliers et libellés) au lieu
# d'une échelle 0-4 unique partagée par tous : demandé explicitement pour
# refléter des critères réels (ex. cumul de pluie en mm, rafales en km/h)
# plutôt qu'un simple code générique. Le palier 0 est toujours « Nul ».
#
# Rampe de couleurs pastel commune à toutes les échelles (vert → jaune →
# orange → rouge → violet), seule la longueur varie selon le nombre de
# paliers de l'aléa.
_RAMP_5 = ["#e8f5e9", "#a5d6a7", "#fff59d", "#ffcc80", "#ce93d8"]
_RAMP_7 = [
    "#e8f5e9", "#c5e1a5", "#fff59d",
    "#ffe082", "#ffb74d", "#e57373", "#ce93d8",
]
_RAMP_8 = [
    "#e8f5e9", "#c5e1a5", "#fff59d", "#ffe082",
    "#ffb74d", "#ff8a65", "#e57373", "#ce93d8",
]
_RAMP_4 = ["#e8f5e9", "#fff59d", "#ffb74d", "#ce93d8"]

# Libellés pour les paliers des aléas à seuils numériques (chaleur/pluie/
# vent/froid/neige). Pour vent/pluie/chaleur, le mot générique (« Faible »,
# « Modéré »...) a été retiré sur demande explicite : le libellé est
# uniquement le seuil chiffré, ex. « (≥ 80 km/h) ». Froid/Neige gardent le
# mot + seuil (non concernés par ce changement).
_TIERS_6 = ["Faible", "Modéré", "Marqué", "Fort", "Très fort", "Extrême"]


def _numeric_tier_labels(
    thresholds: tuple[float, ...], unit: str, below: bool = False, bare: bool = False
) -> list[str]:
    """« Nul », puis un libellé par seuil : « Faible (≥ 28°C) » (ou juste
    « (≥ 28°C) » si ``bare``), etc. ``below`` inverse le comparateur pour un
    aléa qui s'aggrave quand la valeur diminue (froid)."""

    comparator = "≤" if below else "≥"
    labels = ["Nul"]
    for index, threshold in enumerate(thresholds):
        value = f"{threshold:g}"
        criterion = f"({comparator} {value} {unit})"
        if bare:
            labels.append(criterion)
        else:
            labels.append(f"{_TIERS_6[index]} {criterion}")
    return labels


HAZARD_LEVELS: dict[str, list[str]] = {
    # Aléas à seuils numériques (6 paliers + Nul) — construits plus bas à
    # partir des constantes *_THRESHOLDS* pour rester en phase avec le
    # calcul réel plutôt que dupliquer les valeurs ici.
    "vent": [],
    "pluie_inondation": [],
    # Aléas à code de risque HARMONIE (0-4, passthrough) : mêmes libellés
    # génériques pour les deux, dans l'esprit fourni pour les orages.
    "orages": ["Nul", "Faible / Modéré", "Marqué / Fort", "Intense / Violent", "Extrême"],
    "grele": ["Nul", "Faible / Modéré", "Marqué / Fort", "Intense / Violent", "Extrême"],
    "chaleur": [],
    "froid": [],
    "neige": [],
    # Verglas : 3 paliers qualitatifs fournis explicitement.
    "verglas": [
        "Nul",
        "Risque de verglas au sol",
        "Risque de pluie verglaçante",
        "Pluie verglaçante durable",
    ],
    "brouillard": ["Nul", "Faible", "Modéré", "Fort", "Sévère"],
    # Feu : inchangé, 0-4 générique.
    "feu": ["Nul", "Faible", "Modéré", "Fort", "Sévère"],
}


def _ramp_for(level_count: int) -> list[str]:
    if level_count == 5:
        return _RAMP_5
    if level_count == 7:
        return _RAMP_7
    if level_count == 8:
        return _RAMP_8
    if level_count == 4:
        return _RAMP_4
    raise ValueError(f"Pas de rampe de couleurs définie pour {level_count} paliers")


def hazard_levels_manifest() -> dict[str, dict[str, dict[str, str]]]:
    """Construit la section ``hazard_levels`` de risques.json : libellé et
    couleur pour chaque palier de chaque aléa, à partir de HAZARD_LEVELS."""

    manifest: dict[str, dict[str, dict[str, str]]] = {}
    for hazard, labels in HAZARD_LEVELS.items():
        ramp = _ramp_for(len(labels))
        manifest[hazard] = {
            str(level): {"label": label, "color": ramp[level]}
            for level, label in enumerate(labels)
        }
    return manifest


FIRE_DISCLAIMER = (
    "Indice non officiel (cocktail météo chaleur/humidité/vent/pluie). "
    "Ne remplace pas Météo des forêts."
)


def department_codes() -> list[str]:
    """Les 96 départements de France métropolitaine (dont Corse en 2A/2B)."""

    codes = [f"{i:02d}" for i in range(1, 96) if i != 20]
    codes += ["2A", "2B"]
    return sorted(codes)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--harmonie-base-url",
        default=DEFAULT_HARMONIE_BASE_URL,
        help="Racine des données HARMONIE déjà publiées (branche data)",
    )
    parser.add_argument(
        "--output-dir",
        default="build/national",
        help="Dossier de publication à produire",
    )
    parser.add_argument(
        "--days",
        type=int,
        default=3,
        help="Nombre de journées calendaires à conserver (J, J+1, J+2...)",
    )
    parser.add_argument(
        "--current-metadata-url",
        default=None,
        help="risques.json déjà publié, pour éviter un retraitement inutile",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Retraite même si le run HARMONIE source n'a pas changé",
    )
    return parser.parse_args()


def already_published(session: requests.Session, metadata_url: str | None, run_time: datetime | None) -> bool:
    """True seulement si le run HARMONIE ET la version du pipeline sont
    identiques à ce qui est déjà publié.

    Bug constaté en production : un changement de code (seuils, schéma)
    poussé sans que le run HARMONIE source ait changé restait ignoré
    indéfiniment — le run était déjà « publié » au sens de cette fonction,
    donc le job sortait immédiatement sans jamais republier avec le
    nouveau code. Comparer aussi ``pipeline_version`` force un retraitement
    dès qu'un déploiement de code a eu lieu, même sans nouveau run source.
    """

    if not metadata_url or run_time is None:
        return False
    try:
        response = session.get(metadata_url, timeout=30)
        if response.status_code != 200:
            return False
        previous = response.json()
    except (requests.RequestException, ValueError):
        return False
    if previous.get("pipeline_version") != PIPELINE_VERSION:
        return False
    previous_run = previous.get("run_time")
    current_run = run_time.isoformat().replace("+00:00", "Z")
    return previous_run == current_run


def fetch_json(session: requests.Session, url: str) -> dict[str, Any]:
    response = session.get(url, timeout=60)
    response.raise_for_status()
    return response.json()


@dataclass
class DepartmentSeries:
    code: str
    times: list[datetime]
    columns: dict[str, int]
    # forecast[i] est la matrice (points x colonnes) pour l'heure times[i]
    forecast: list[np.ndarray]

    def column(self, step_index: int, name: str) -> np.ndarray:
        index = self.columns.get(name)
        if index is None:
            return np.asarray([], dtype=np.float64)
        matrix = self.forecast[step_index]
        if matrix.size == 0:
            return np.asarray([], dtype=np.float64)
        return matrix[:, index]


def load_department_series(
    session: requests.Session, base_url: str, code: str
) -> DepartmentSeries | None:
    url = f"{base_url}/departements/{code}.json"
    try:
        payload = fetch_json(session, url)
    except requests.RequestException as error:
        LOGGER.warning("Département %s indisponible (%s)", code, error)
        return None
    if payload.get("status") != "ok":
        LOGGER.warning("Département %s : statut invalide", code)
        return None

    value_names: list[str] = payload["columns"]["values"]
    columns = {name: index for index, name in enumerate(value_names)}

    times: list[datetime] = []
    forecast: list[np.ndarray] = []
    for iso_time, rows in payload.get("forecast", []):
        try:
            valid_time = datetime.fromisoformat(iso_time.replace("Z", "+00:00"))
        except ValueError:
            continue
        times.append(valid_time)
        if rows:
            matrix = np.asarray(
                [[np.nan if v is None else v for v in row] for row in rows],
                dtype=np.float64,
            )
        else:
            matrix = np.empty((0, len(value_names)), dtype=np.float64)
        forecast.append(matrix)

    return DepartmentSeries(code=code, times=times, columns=columns, forecast=forecast)


def _nanpercentile_high(values: np.ndarray, percentile: float = 90.0) -> float:
    """Perçentile haut plutôt que le max strict : un département compte des
    dizaines à centaines de points HARMONIE, et prendre le max fait qu'UNE
    seule commune en pointe fait passer tout le département au niveau
    maximal, pour toute la journée (constaté en production : 58% des
    départements en Orages « Sévère » le même jour). Le 90e centile reste
    sensible à un risque réellement étendu, sans être piloté par un seul
    point isolé."""

    finite = values[np.isfinite(values)] if values.size else values
    return float(np.percentile(finite, percentile)) if finite.size else float("nan")


def _nanpercentile_low(values: np.ndarray, percentile: float = 10.0) -> float:
    """Symétrique de ``_nanpercentile_high`` pour les grandeurs qui
    s'aggravent quand elles diminuent (visibilité, température, humidité)."""

    finite = values[np.isfinite(values)] if values.size else values
    return float(np.percentile(finite, percentile)) if finite.size else float("nan")


def _risk_column_level(values: np.ndarray, cap: int = 4) -> int:
    finite = values[np.isfinite(values)] if values.size else values
    if not finite.size:
        return 0
    return int(min(cap, max(0, round(_nanpercentile_high(values)))))


def _threshold_level(value: float, thresholds: tuple[float, ...]) -> int:
    """Paliers croissants : renvoie le niveau (0 à len(thresholds)) atteint
    par ``value``. ``thresholds`` doit être trié en ordre croissant."""

    if not np.isfinite(value):
        return 0
    level = 0
    for threshold in thresholds:
        if value >= threshold:
            level += 1
    return level


def _threshold_level_below(value: float, thresholds: tuple[float, ...]) -> int:
    """Comme ``_threshold_level`` mais pour un aléa qui s'aggrave quand la
    valeur DIMINUE (visibilité, température minimale). ``thresholds`` doit
    être trié en ordre DÉCROISSANT (du moins sévère au plus sévère)."""

    if not np.isfinite(value):
        return 0
    level = 0
    for threshold in thresholds:
        if value <= threshold:
            level += 1
    return level


# Seuils numériques (ascendants) fournis explicitement pour chaque aléa —
# le nombre de valeurs fixe le nombre de paliers. ``_threshold_level``
# incrémente le niveau à chaque seuil atteint ou dépassé, donc ces tuples
# doivent rester en ordre croissant. Chaleur/Pluie/Vent sont revenus à 7
# seuils (dont Pluie avec un nouveau palier bas à 5mm) après une version
# intermédiaire à 6 ; Froid/Neige restent à 6, non concernés par ce
# dernier ajustement.
CHALEUR_THRESHOLDS = (25.0, 28.0, 31.0, 34.0, 37.0, 40.0, 45.0)
PLUIE_THRESHOLDS_MM = (5.0, 15.0, 30.0, 50.0, 80.0, 150.0, 300.0)
VENT_THRESHOLDS_KMH = (80.0, 90.0, 100.0, 110.0, 130.0, 150.0, 180.0)
NEIGE_THRESHOLDS_CM = (1.0, 3.0, 7.0, 15.0, 30.0, 50.0)
# ``_threshold_level_below`` a besoin de l'ordre inverse (du seuil le plus
# « chaud »/le moins sévère au plus froid) — cf. sa docstring.
FROID_THRESHOLDS_BELOW = (-3.0, -6.0, -10.0, -15.0, -20.0, -30.0)

# Les libellés de légende intègrent directement le seuil réel plutôt qu'un
# mot seul — demandé explicitement, « qu'il faut mettre en légende ».
# Pluie/Vent : uniquement le seuil, sans mot générique (``bare``).
# Complète les entrées vides laissées dans HAZARD_LEVELS plus haut (qui
# doivent rester en phase avec ces constantes plutôt que dupliquer les
# seuils à deux endroits).
HAZARD_LEVELS["pluie_inondation"] = _numeric_tier_labels(PLUIE_THRESHOLDS_MM, "mm", bare=True)
HAZARD_LEVELS["vent"] = _numeric_tier_labels(VENT_THRESHOLDS_KMH, "km/h", bare=True)
HAZARD_LEVELS["neige"] = _numeric_tier_labels(NEIGE_THRESHOLDS_CM, "cm")
HAZARD_LEVELS["froid"] = _numeric_tier_labels(FROID_THRESHOLDS_BELOW, "°C", below=True)

# Chaleur : mot + seuil rétabli (contrairement à Pluie/Vent, restés
# « bare ») — mais au féminin (« la chaleur ») : Modérée/Marquée/Forte/
# Très forte, pas Modéré/Marqué/Fort/Très fort.
_CHALEUR_TIER_NAMES = ["Faible", "Modérée", "Marquée", "Forte", "Très forte", "Intense", "Extrême"]
HAZARD_LEVELS["chaleur"] = ["Nul"] + [
    f"{name} (≥ {threshold:g} °C)"
    for name, threshold in zip(_CHALEUR_TIER_NAMES, CHALEUR_THRESHOLDS)
]


def _safe_max(values: np.ndarray) -> float:
    finite = values[np.isfinite(values)] if values.size else values
    return float(np.max(finite)) if finite.size else float("nan")


def _safe_min(values: np.ndarray) -> float:
    finite = values[np.isfinite(values)] if values.size else values
    return float(np.min(finite)) if finite.size else float("nan")


def hourly_hazard_levels(
    series: DepartmentSeries,
    step_index: int,
    cumulative_precip_mm: float,
    day_precip_mm: float,
    day_snow_cm: float,
) -> tuple[dict[str, int], dict[str, float]]:
    """Niveau de chaque aléa (dict) + valeurs brutes record de l'heure
    (2e dict : max/min réels, pas le perçentile utilisé pour les niveaux)
    pour un département, à une échéance donnée.

    ``cumulative_precip_mm`` ne se réinitialise jamais (utilisé par Feu,
    proxy de sécheresse récente) ; ``day_precip_mm``/``day_snow_cm`` sont
    des cumuls glissants remis à zéro à chaque changement de journée
    calendaire Europe/Paris (utilisés par Pluie-inondation et Neige, dont
    les seuils sont désormais des cumuls en mm/cm et non plus une valeur
    instantanée).
    """

    def col(name: str) -> np.ndarray:
        return series.column(step_index, name)

    temperature = col("temperature_c")
    humidity = col("humidity_pct")
    wind_speed = col("wind_speed_kmh")
    wind_gust = col("wind_gust_kmh")
    visibility = col("visibility_km")
    precipitation_now = col("precipitation_mm")

    # Valeurs brutes (max/min réels, pas le perçentile) pour le résumé
    # national « records du jour » — objectif différent du niveau d'alerte
    # (qui doit rester insensible à un point isolé), ici on veut justement
    # la valeur la plus extrême relevée quelque part.
    raw_extremes = {
        "max_temperature": _safe_max(temperature),
        "min_temperature": _safe_min(temperature),
        "max_gust": _safe_max(wind_gust),
    }

    # Perçentiles plutôt que max/min strict : même correction que pour les
    # aléas à code de risque (cf. _nanpercentile_high) — une seule commune
    # ne doit pas suffire à faire basculer tout le département.
    max_temperature = _nanpercentile_high(temperature)
    min_temperature = _nanpercentile_low(temperature)
    min_humidity = _nanpercentile_low(humidity)
    max_wind = _nanpercentile_high(wind_speed)
    max_gust = _nanpercentile_high(wind_gust)
    min_visibility = _nanpercentile_low(visibility)
    precip_now_repr = _nanpercentile_high(precipitation_now)

    # Cocktail feu recalibré pour ne pas s'allumer sur une journée d'été
    # ordinaire (ex. 30°C/40% d'humidité en France ne constitue pas un
    # risque en soi) : il faut une chaleur ET une sécheresse de l'air
    # réellement marquées pour que le score grimpe.
    fire_score = 0
    if np.isfinite(max_temperature):
        if max_temperature >= 35:
            fire_score += 2
        elif max_temperature >= 30:
            fire_score += 1
    if np.isfinite(min_humidity):
        if min_humidity <= 25:
            fire_score += 2
        elif min_humidity <= 35:
            fire_score += 1
    if np.isfinite(max_wind) and max_wind >= 35:
        fire_score += 1
    # Le cumul de précipitations part de 0 au début de la série disponible
    # (pas d'observations passées dans ce pipeline) : sur le premier jour,
    # « moins de 1 mm cumulé » est donc presque toujours vrai par simple
    # effet de démarrage, pas parce qu'il fait réellement sec — constaté en
    # production (point +1 quasi systématique en J0). On n'accorde ce point
    # qu'à partir d'une trentaine d'heures de série, quand le cumul reflète
    # un vrai créneau sans pluie plutôt qu'un compteur qui vient de démarrer.
    if step_index >= 24 and cumulative_precip_mm < 1.0:
        fire_score += 1

    # Grêle : météorologiquement impossible sans précipitation en cours
    # (la grêle est une forme de précipitation convective) — un code de
    # risque non nul sans pluie mesurable à cette heure est ignoré plutôt
    # que reporté tel quel.
    grele_level = _risk_column_level(col("hail_risk_code"))
    if not np.isfinite(precip_now_repr) or precip_now_repr < 0.1:
        grele_level = 0

    hazards = {
        "orages": _risk_column_level(col("thunder_risk_code")),
        "grele": grele_level,
        # Cumul de pluie du jour (mm), pas un code instantané : le niveau à
        # une heure donnée reflète le cumul depuis minuit jusqu'à cette
        # heure-là (la frise progresse donc en escalier croissant sur la
        # journée, comme un cumul réel).
        "pluie_inondation": _threshold_level(day_precip_mm, PLUIE_THRESHOLDS_MM),
        # Rafales (et non le vent moyen) : seuils fournis en km/h de rafale.
        "vent": _threshold_level(max_gust, VENT_THRESHOLDS_KMH),
        "neige": _threshold_level(day_snow_cm, NEIGE_THRESHOLDS_CM),
        "verglas": _risk_column_level(col("snow_stick_risk_code"), cap=3),
        "chaleur": _threshold_level(max_temperature, CHALEUR_THRESHOLDS),
        "froid": _threshold_level_below(min_temperature, FROID_THRESHOLDS_BELOW),
        "brouillard": _threshold_level_below(min_visibility, (1.0, 0.5, 0.2, 0.1)),
        "feu": int(min(4, fire_score)),
    }
    return hazards, raw_extremes


def build_department_risk(
    series: DepartmentSeries, day_count: int, today: date
) -> tuple[dict[str, Any], dict[str, dict[str, float]]] | None:
    """Renvoie (objet publiable {daily, hourly}, records bruts par jour).

    Le 2e élément (``{date: {max_temperature, min_temperature, max_gust,
    total_precip_mm}}``) n'est PAS publié tel quel dans risques.json (pas de
    valeurs brutes par département, seulement des niveaux) — il sert juste
    à ``build_risques`` à calculer le résumé national (records du jour,
    département par département)."""

    if not series.times:
        return None

    # Cumul glissant des précipitations HARMONIE (proxy de sécheresse
    # récente pour l'aléa Feu) : on ne dispose pas d'observations passées
    # dans ce pipeline, seulement des prévisions — on cumule donc depuis le
    # début de l'échéance disponible.
    running_precip = 0.0
    # Cumuls du jour courant (mm de pluie, cm de neige) pour Pluie-inondation
    # et Neige : remis à zéro à chaque changement de journée calendaire
    # Europe/Paris, contrairement à ``running_precip`` ci-dessus (qui ne se
    # réinitialise jamais, propre au proxy de sécheresse de Feu).
    running_day_precip = 0.0
    running_day_snow = 0.0
    current_local_date: str | None = None
    hourly: list[dict[str, Any]] = []
    raw_by_date: dict[str, dict[str, float]] = {}
    for step_index, valid_time in enumerate(series.times):
        local_date = valid_time.astimezone(PARIS_TZ).date().isoformat()
        if local_date != current_local_date:
            running_day_precip = 0.0
            running_day_snow = 0.0
            current_local_date = local_date

        precip = series.column(step_index, "precipitation_mm")
        finite_precip = precip[np.isfinite(precip)] if precip.size else precip
        running_precip += float(np.max(finite_precip)) if finite_precip.size else 0.0

        precip_repr = _nanpercentile_high(precip) if precip.size else float("nan")
        running_day_precip += precip_repr if np.isfinite(precip_repr) else 0.0

        snow_fresh = series.column(step_index, "snow_fresh_cm")
        snow_repr = _nanpercentile_high(snow_fresh) if snow_fresh.size else float("nan")
        running_day_snow += snow_repr if np.isfinite(snow_repr) else 0.0

        levels, raw = hourly_hazard_levels(
            series, step_index, running_precip, running_day_precip, running_day_snow
        )
        hourly.append(
            {
                "time": valid_time.astimezone(timezone.utc)
                .isoformat()
                .replace("+00:00", "Z"),
                "hazards": levels,
            }
        )

        day_raw = raw_by_date.setdefault(
            local_date,
            {"max_temperature": float("-inf"), "min_temperature": float("inf"), "max_gust": float("-inf")},
        )
        if np.isfinite(raw["max_temperature"]):
            day_raw["max_temperature"] = max(day_raw["max_temperature"], raw["max_temperature"])
        if np.isfinite(raw["min_temperature"]):
            day_raw["min_temperature"] = min(day_raw["min_temperature"], raw["min_temperature"])
        if np.isfinite(raw["max_gust"]):
            day_raw["max_gust"] = max(day_raw["max_gust"], raw["max_gust"])
        # Le cumul du jour ne fait qu'augmenter (remis à 0 à chaque
        # changement de date) : sa valeur à la dernière heure du jour EST
        # le total du jour.
        day_raw["total_precip_mm"] = running_day_precip

    # Regroupement par journée calendaire Europe/Paris.
    days: dict[str, list[dict[str, Any]]] = {}
    for entry in hourly:
        local_date = (
            datetime.fromisoformat(entry["time"].replace("Z", "+00:00"))
            .astimezone(PARIS_TZ)
            .date()
            .isoformat()
        )
        days.setdefault(local_date, []).append(entry)

    # J0 doit toujours être la date du jour (Europe/Paris), même si le run
    # HARMONIE source est en retard et ne couvre pas encore (ou plus) la
    # journée en cours : un département sans données pour une date cible
    # reçoit simplement des niveaux à 0 plutôt que de décaler tout l'axe
    # J/J+1/J+2. ``today`` est calculé une seule fois pour tout le run (et
    # non par département) pour que les 96 départements du même run
    # partagent exactement la même date J0, même si le traitement chevauche
    # minuit.
    ordered_dates = [
        (today + timedelta(days=offset)).isoformat() for offset in range(day_count)
    ]
    daily: list[dict[str, Any]] = []
    for date_str in ordered_dates:
        entries = days.get(date_str, [])
        day_levels: dict[str, int] = {}
        for hazard in HAZARDS:
            day_levels[hazard] = max(
                (entry["hazards"][hazard] for entry in entries), default=0
            )
        daily.append({"date": date_str, "hazards": day_levels})

    return {"daily": daily, "hourly": hourly}, raw_by_date


def department_display_name(series: DepartmentSeries) -> str | None:
    # Le nom du département n'est pas publié tel quel par HARMONIE (seules
    # les communes le sont) ; les communes elles-mêmes ne portent pas le nom
    # du département. On le laisse à None ici : le plugin WordPress associe
    # le code département à un nom via sa propre table statique (96 lignes,
    # déjà nécessaire pour l'INSEE, ne bouge jamais).
    return None


def harmonie_run_time(session: requests.Session, base_url: str) -> datetime | None:
    """Lit le run HARMONIE courant depuis l'index léger, sans télécharger
    les 96 fichiers départementaux — sert uniquement à décider si un
    retraitement est nécessaire avant de faire le travail complet."""

    try:
        index = fetch_json(session, f"{base_url}/index.json")
    except requests.RequestException:
        return None
    run_time_text = (index.get("model") or {}).get("run_time")
    if not run_time_text:
        return None
    try:
        return datetime.fromisoformat(run_time_text.replace("Z", "+00:00"))
    except ValueError:
        return None


def build_risques(
    base_url: str, day_count: int
) -> tuple[dict[str, Any], datetime | None]:
    session = requests.Session()
    session.headers["User-Agent"] = "alertesmeteo-hub-risques/1.0"

    today = datetime.now(PARIS_TZ).date()
    departments: dict[str, Any] = {}
    # {date: {field: (best_value, department_code)}} — alimenté au fil des
    # départements pour calculer le résumé national (records du jour, avec
    # le département qui les détient) sans tout garder en mémoire deux fois.
    national_by_date: dict[str, dict[str, tuple[float, str]]] = {}
    run_time: datetime | None = None
    missing = 0
    for code in department_codes():
        series = load_department_series(session, base_url, code)
        if series is None:
            missing += 1
            continue
        result = build_department_risk(series, day_count, today)
        if result is None:
            missing += 1
            continue
        risk, raw_by_date = result
        departments[code] = risk
        for date_str, raw in raw_by_date.items():
            slot = national_by_date.setdefault(date_str, {})

            def consider(field: str, value: float, better: Any) -> None:
                if not np.isfinite(value):
                    return
                current = slot.get(field)
                if current is None or better(value, current[0]):
                    slot[field] = (value, code)

            consider("max_temperature", raw["max_temperature"], lambda new, best: new > best)
            consider("min_temperature", raw["min_temperature"], lambda new, best: new < best)
            consider("max_gust", raw["max_gust"], lambda new, best: new > best)
            consider("total_precip_mm", raw["total_precip_mm"], lambda new, best: new > best)

        if run_time is None and series.times:
            run_time = series.times[0]
        LOGGER.info("Département %s : %s échéances traitées", code, len(series.times))

    if missing:
        LOGGER.warning(
            "%s département(s) sur %s n'ont pas pu être traités",
            missing,
            len(department_codes()),
        )
    if len(departments) < 80:
        raise RuntimeError(
            f"Trop de départements manquants ({len(departments)}/96) — "
            "le hub harmonie n'est probablement pas encore à jour."
        )

    # Résumé national par jour : maxi/mini de température, rafale maxi,
    # cumul de pluie maxi, chacun avec le département qui le détient — le
    # plugin résout le code en nom via sa table de départements déjà
    # nécessaire pour l'affichage de la carte.
    ordered_dates = [
        (today + timedelta(days=offset)).isoformat() for offset in range(day_count)
    ]
    national_summary = []
    for date_str in ordered_dates:
        slot = national_by_date.get(date_str, {})

        def field(name: str) -> dict[str, Any] | None:
            entry = slot.get(name)
            if entry is None:
                return None
            value, department = entry
            return {"value": round(value, 1), "department": department}

        national_summary.append(
            {
                "date": date_str,
                "max_temperature": field("max_temperature"),
                "min_temperature": field("min_temperature"),
                "max_gust": field("max_gust"),
                "max_precip": field("total_precip_mm"),
            }
        )

    manifest = {
        "schema_version": 1,
        "status": "ok",
        "pipeline_version": PIPELINE_VERSION,
        "generated_at": datetime.now(timezone.utc)
        .isoformat()
        .replace("+00:00", "Z"),
        "run_time": (
            run_time.isoformat().replace("+00:00", "Z") if run_time else None
        ),
        "source": {
            "model": "HARMONIE-AROME Cy43 (KNMI)",
            "base_url": base_url,
        },
        "hazards": HAZARD_LABELS,
        "hazard_levels": hazard_levels_manifest(),
        "fire_disclaimer": FIRE_DISCLAIMER,
        "national_summary": national_summary,
        "departments": departments,
    }
    return manifest, run_time


def main() -> int:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s | %(levelname)s | %(message)s",
    )
    args = parse_args()

    session = requests.Session()
    session.headers["User-Agent"] = "alertesmeteo-hub-risques/1.0"
    if not args.force:
        current_run = harmonie_run_time(session, args.harmonie_base_url)
        if already_published(session, args.current_metadata_url, current_run):
            LOGGER.info(
                "Run HARMONIE %s déjà publié dans risques.json, rien à faire.",
                current_run,
            )
            return 0

    manifest, run_time = build_risques(args.harmonie_base_url, args.days)

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    destination = output_dir / "risques.json"
    with destination.open("w", encoding="utf-8") as handle:
        json.dump(manifest, handle, ensure_ascii=False, separators=(",", ":"))
        handle.write("\n")

    LOGGER.info(
        "Publication prête : %s départements, run %s",
        len(manifest["departments"]),
        manifest["run_time"],
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
