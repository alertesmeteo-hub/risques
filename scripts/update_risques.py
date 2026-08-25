#!/usr/bin/env python3
"""Calcule une carte de vigilance météo (9 aléas, 5 niveaux, non officielle)
à partir des fichiers départementaux déjà publiés par le hub `harmonie`.

Contrairement au pipeline HARMONIE (qui décode les GRIB du KNMI), ce script
ne télécharge aucune archive météo : il lit les 96 fichiers
``departements/XX.json`` déjà publiés sur la branche ``data`` du dépôt
``harmonie`` (mêmes données, déjà décodées et compactées), en dérive 9 aléas
par département pour J / J+1 / J+2, et republie ``risques.json``.

Cinq des neuf aléas réutilisent directement des diagnostics déjà calculés
par le pipeline HARMONIE (mêmes noms de colonne que dans
``update_harmonie_france.py::VALUE_COLUMNS``, échelle 0-4 déjà en place) :
orages, grêle, pluie-inondation, vent, neige-verglas. Les quatre autres
(chaleur, froid, brouillard, feu) sont calculés ici à partir des champs
bruts (température, humidité, vent, précipitations, visibilité).

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
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import numpy as np
import requests

try:
    from zoneinfo import ZoneInfo
except ImportError:  # pragma: no cover - Python < 3.9 non pris en charge ici
    ZoneInfo = None  # type: ignore[assignment,misc]


LOGGER = logging.getLogger("risques")
PIPELINE_VERSION = "1.0.0"
PARIS_TZ = ZoneInfo("Europe/Paris") if ZoneInfo is not None else timezone.utc

DEFAULT_HARMONIE_BASE_URL = (
    "https://raw.githubusercontent.com/alertesmeteo-hub/harmonie/data"
)

HAZARDS = (
    "orages",
    "grele",
    "pluie_inondation",
    "vent",
    "neige_verglas",
    "chaleur",
    "froid",
    "brouillard",
    "feu",
)

HAZARD_LABELS = {
    "orages": "Orages",
    "grele": "Grêle",
    "pluie_inondation": "Pluie-inondation",
    "vent": "Vent",
    "neige_verglas": "Neige-verglas",
    "chaleur": "Chaleur",
    "froid": "Froid",
    "brouillard": "Brouillard",
    "feu": "Feu",
}

LEVEL_LABELS = {0: "Minime", 1: "Faible", 2: "Modéré", 3: "Fort", 4: "Sévère"}
LEVEL_COLORS = {
    0: "#3a8f4a",
    1: "#c7d92e",
    2: "#f2a531",
    3: "#e0402e",
    4: "#7a1fa2",
}

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
    if not metadata_url or run_time is None:
        return False
    try:
        response = session.get(metadata_url, timeout=30)
        if response.status_code != 200:
            return False
        previous = response.json()
    except (requests.RequestException, ValueError):
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


def _nanmax(values: np.ndarray) -> float:
    finite = values[np.isfinite(values)] if values.size else values
    return float(np.max(finite)) if finite.size else float("nan")


def _nanmin(values: np.ndarray) -> float:
    finite = values[np.isfinite(values)] if values.size else values
    return float(np.min(finite)) if finite.size else float("nan")


def _risk_column_level(values: np.ndarray, cap: int = 4) -> int:
    finite = values[np.isfinite(values)] if values.size else values
    if not finite.size:
        return 0
    return int(min(cap, max(0, round(float(np.max(finite))))))


def _threshold_level(value: float, thresholds: tuple[float, float, float, float]) -> int:
    """Paliers croissants : renvoie le niveau (0-4) atteint par ``value``."""

    if not np.isfinite(value):
        return 0
    level = 0
    for threshold in thresholds:
        if value >= threshold:
            level += 1
    return level


def _threshold_level_below(value: float, thresholds: tuple[float, float, float, float]) -> int:
    """Comme ``_threshold_level`` mais pour un aléa qui s'aggrave quand la
    valeur DIMINUE (visibilité, température minimale)."""

    if not np.isfinite(value):
        return 0
    level = 0
    for threshold in thresholds:
        if value <= threshold:
            level += 1
    return level


def hourly_hazard_levels(
    series: DepartmentSeries, step_index: int, cumulative_precip_mm: float
) -> dict[str, int]:
    """Niveau 0-4 de chaque aléa pour un département, à une échéance donnée."""

    def col(name: str) -> np.ndarray:
        return series.column(step_index, name)

    temperature = col("temperature_c")
    humidity = col("humidity_pct")
    wind_speed = col("wind_speed_kmh")
    visibility = col("visibility_km")

    max_temperature = _nanmax(temperature)
    min_temperature = _nanmin(temperature)
    min_humidity = _nanmin(humidity)
    max_wind = _nanmax(wind_speed)
    min_visibility = _nanmin(visibility)

    fire_score = 0
    if np.isfinite(max_temperature):
        if max_temperature >= 32:
            fire_score += 2
        elif max_temperature >= 27:
            fire_score += 1
    if np.isfinite(min_humidity):
        if min_humidity <= 30:
            fire_score += 2
        elif min_humidity <= 45:
            fire_score += 1
    if np.isfinite(max_wind) and max_wind >= 40:
        fire_score += 1
    if cumulative_precip_mm < 1.0:
        fire_score += 1

    return {
        "orages": _risk_column_level(col("thunder_risk_code")),
        "grele": _risk_column_level(col("hail_risk_code")),
        "pluie_inondation": _risk_column_level(col("heavy_rain_risk_code")),
        "vent": _risk_column_level(col("severe_wind_risk_code")),
        "neige_verglas": max(
            _risk_column_level(col("snow_risk_code")),
            _risk_column_level(col("snow_stick_risk_code"), cap=3),
        ),
        "chaleur": _threshold_level(max_temperature, (30.0, 33.0, 36.0, 39.0)),
        "froid": _threshold_level_below(min_temperature, (-5.0, -10.0, -15.0, -18.0)),
        "brouillard": _threshold_level_below(min_visibility, (1.0, 0.5, 0.2, 0.05)),
        "feu": int(min(4, fire_score)),
    }


def build_department_risk(
    series: DepartmentSeries, day_count: int
) -> dict[str, Any] | None:
    if not series.times:
        return None

    # Cumul glissant des précipitations HARMONIE (proxy de sécheresse
    # récente pour l'aléa Feu) : on ne dispose pas d'observations passées
    # dans ce pipeline, seulement des prévisions — on cumule donc depuis le
    # début de l'échéance disponible.
    running_precip = 0.0
    hourly: list[dict[str, Any]] = []
    for step_index, valid_time in enumerate(series.times):
        precip = series.column(step_index, "precipitation_mm")
        finite_precip = precip[np.isfinite(precip)] if precip.size else precip
        running_precip += float(np.max(finite_precip)) if finite_precip.size else 0.0
        levels = hourly_hazard_levels(series, step_index, running_precip)
        hourly.append(
            {
                "time": valid_time.astimezone(timezone.utc)
                .isoformat()
                .replace("+00:00", "Z"),
                "hazards": levels,
            }
        )

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

    ordered_dates = sorted(days)[:day_count]
    daily: list[dict[str, Any]] = []
    for date in ordered_dates:
        entries = days[date]
        day_levels: dict[str, int] = {}
        for hazard in HAZARDS:
            day_levels[hazard] = max(
                (entry["hazards"][hazard] for entry in entries), default=0
            )
        daily.append({"date": date, "hazards": day_levels})

    return {"daily": daily, "hourly": hourly}


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

    departments: dict[str, Any] = {}
    run_time: datetime | None = None
    missing = 0
    for code in department_codes():
        series = load_department_series(session, base_url, code)
        if series is None:
            missing += 1
            continue
        risk = build_department_risk(series, day_count)
        if risk is None:
            missing += 1
            continue
        departments[code] = risk
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
        "levels": {
            str(level): {"label": LEVEL_LABELS[level], "color": LEVEL_COLORS[level]}
            for level in range(5)
        },
        "fire_disclaimer": FIRE_DISCLAIMER,
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
