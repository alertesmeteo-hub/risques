(function () {
    'use strict';

    var COMMUNES_API = 'https://geo.api.gouv.fr/communes';
    var SVG_NS = 'http://www.w3.org/2000/svg';
    var IDF_CODES = ['75', '77', '78', '91', '92', '93', '94', '95'];
    var ICON_MIN_LEVEL = 2;

    // Icônes vectorielles épurées (monochromes, viewBox 24x24, dessinées à
    // la main — pas d'emoji, ni de dépendance externe). Chaque primitive
    // est rejouée à la fois en HTML (onglets, détail) et en SVG (badges sur
    // la carte) à partir de la même définition, pour éviter toute
    // divergence visuelle entre les deux usages.
    var ICONS = {
        orages: [
            { tag: 'path', d: 'M13 2 3 14h6l-1 8 10-12h-6l1-8z', fill: 'currentColor' }
        ],
        grele: [
            { tag: 'circle', cx: 7, cy: 9, r: 2.6, fill: 'currentColor' },
            { tag: 'circle', cx: 15, cy: 7, r: 2.1, fill: 'currentColor' },
            { tag: 'circle', cx: 11.5, cy: 15.5, r: 3, fill: 'currentColor' }
        ],
        pluie_inondation: [
            { tag: 'circle', cx: 8, cy: 11, r: 3.4, fill: 'currentColor' },
            { tag: 'circle', cx: 13, cy: 8.5, r: 4.4, fill: 'currentColor' },
            { tag: 'circle', cx: 17.2, cy: 11, r: 3.4, fill: 'currentColor' },
            { tag: 'rect', x: 5.4, y: 11, width: 13.6, height: 5.2, rx: 2.6, fill: 'currentColor' },
            { tag: 'path', d: 'M8 19.5l1.2 3h-2.4z', fill: 'currentColor' },
            { tag: 'path', d: 'M13 19.5l1.2 3h-2.4z', fill: 'currentColor' },
            { tag: 'path', d: 'M18 19.5l1.2 3h-2.4z', fill: 'currentColor' }
        ],
        vent: [
            { tag: 'path', d: 'M3 8h10.5a3 3 0 1 0-2.6-4.6', stroke: 'currentColor', 'stroke-width': 2.2, 'stroke-linecap': 'round', fill: 'none' },
            { tag: 'path', d: 'M3 13h14.5a3 3 0 1 1-2.6 4.6', stroke: 'currentColor', 'stroke-width': 2.2, 'stroke-linecap': 'round', fill: 'none' },
            { tag: 'path', d: 'M3 18h9', stroke: 'currentColor', 'stroke-width': 2.2, 'stroke-linecap': 'round', fill: 'none' }
        ],
        neige: [
            { tag: 'line', x1: 12, y1: 2, x2: 12, y2: 22, stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round' },
            { tag: 'line', x1: 4.2, y1: 7, x2: 19.8, y2: 17, stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round' },
            { tag: 'line', x1: 19.8, y1: 7, x2: 4.2, y2: 17, stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round' }
        ],
        verglas: [
            { tag: 'ellipse', cx: 12, cy: 16.5, rx: 8, ry: 3.2, fill: 'currentColor', opacity: '.35' },
            { tag: 'line', x1: 7, y1: 15, x2: 10, y2: 11.5, stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round' },
            { tag: 'line', x1: 12, y1: 14.5, x2: 15, y2: 9.5, stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round' },
            { tag: 'line', x1: 16, y1: 15, x2: 19, y2: 10.5, stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round' }
        ],
        chaleur: [
            { tag: 'circle', cx: 12, cy: 12, r: 4.2, fill: 'currentColor' },
            { tag: 'line', x1: 12, y1: 1.5, x2: 12, y2: 4.5, stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round' },
            { tag: 'line', x1: 12, y1: 19.5, x2: 12, y2: 22.5, stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round' },
            { tag: 'line', x1: 1.5, y1: 12, x2: 4.5, y2: 12, stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round' },
            { tag: 'line', x1: 19.5, y1: 12, x2: 22.5, y2: 12, stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round' },
            { tag: 'line', x1: 4.6, y1: 4.6, x2: 6.7, y2: 6.7, stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round' },
            { tag: 'line', x1: 17.3, y1: 17.3, x2: 19.4, y2: 19.4, stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round' },
            { tag: 'line', x1: 4.6, y1: 19.4, x2: 6.7, y2: 17.3, stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round' },
            { tag: 'line', x1: 17.3, y1: 6.7, x2: 19.4, y2: 4.6, stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round' }
        ],
        froid: [
            { tag: 'path', d: 'M12 3a2 2 0 0 0-2 2v8.1a4.2 4.2 0 1 0 4 0V5a2 2 0 0 0-2-2z', stroke: 'currentColor', 'stroke-width': 1.8, fill: 'none' },
            { tag: 'circle', cx: 12, cy: 18, r: 2.4, fill: 'currentColor' }
        ],
        brouillard: [
            { tag: 'line', x1: 4, y1: 7, x2: 20, y2: 7, stroke: 'currentColor', 'stroke-width': 2.2, 'stroke-linecap': 'round' },
            { tag: 'line', x1: 2.5, y1: 12, x2: 21.5, y2: 12, stroke: 'currentColor', 'stroke-width': 2.2, 'stroke-linecap': 'round' },
            { tag: 'line', x1: 4, y1: 17, x2: 20, y2: 17, stroke: 'currentColor', 'stroke-width': 2.2, 'stroke-linecap': 'round' }
        ],
        feu: [
            { tag: 'path', d: 'M12 2c1.6 2.8 1 4.6-.3 6.4-1.1 1.5-2.4 3-2.4 5.3a3.7 3.7 0 0 0 7.4 0c0-1.4-.5-2.3-1-3.1.2 1.2-.4 2-.4 2 .5-2.6-.9-4.4-1.7-5.6.2 1-.3 1.6-.3 1.6.4-2.6-.6-4.4-1.3-6.6z', fill: 'currentColor' },
            { tag: 'path', d: 'M11.2 22c-2.6 0-4.6-1.8-4.6-4.3 0-1.6.8-2.8 1.6-3.7-.2 1.3.3 2.1.3 2.1-.3-1.8.7-3 1.5-3.8-.1 1 .2 1.6.2 1.6 0-1.6 1-2.6 1-2.6-.6 1.8.2 3 .2 3 .7.4 1.2 1.2 1.2 2.2 0 1.6-1 2.5-1.4 3.5.6-.2 1.1-.6 1.4-1.1-.1 1.8-1.5 3.1-3.4 3.1z', fill: 'currentColor', opacity: '.55' }
        ]
    };

    function createSvgElement(tag, attrs) {
        var node = document.createElementNS(SVG_NS, tag);
        Object.keys(attrs || {}).forEach(function (key) {
            node.setAttribute(key, attrs[key]);
        });
        return node;
    }

    function appendIconPrimitives(container, name) {
        (ICONS[name] || []).forEach(function (primitive) {
            var attrs = {};
            Object.keys(primitive).forEach(function (key) {
                if (key !== 'tag') { attrs[key] = primitive[key]; }
            });
            container.appendChild(createSvgElement(primitive.tag, attrs));
        });
    }

    function buildIconNode(name, className) {
        var svg = createSvgElement('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false' });
        svg.setAttribute('class', className);
        appendIconPrimitives(svg, name);
        return svg;
    }

    // 3 paliers par aléa (léger / modéré / sévère), choisis en fonction de
    // la position du niveau réel dans l'échelle de l'aléa (cf.
    // adviceTierIndex) — rien n'est affiché au niveau 0 (Nul).
    var ADVICE_TIERS = {
        orages: [
            'Des orages sont possibles. Consultez régulièrement les prévisions et restez attentifs.',
            'Des orages marqués sont attendus, avec un risque de grêle ou de rafales. Mettez à l’abri les objets sensibles.',
            'De violents orages sont attendus. Évitez les déplacements, éloignez-vous des points hauts et des zones exposées à la foudre.'
        ],
        grele: [
            'De la grêle est possible en cas d’averse orageuse.',
            'De la grêle marquée est possible. Mettez les véhicules à l’abri si possible.',
            'De la grêle intense est possible, avec un risque de dégâts. Mettez impérativement les véhicules et objets fragiles à l’abri.'
        ],
        pluie_inondation: [
            'De la pluie est attendue, pouvant localement provoquer des ruissellements.',
            'De fortes pluies sont attendues, avec un risque de ruissellement ou de débordement localisé. Évitez les sous-sols et les points bas.',
            'De très fortes pluies sont attendues, avec un risque d’inondation important. Ne vous engagez pas sur une route inondée et suivez les consignes des autorités.'
        ],
        vent: [
            'Des rafales de vent sont possibles. Rangez les objets légers susceptibles de s’envoler.',
            'De fortes rafales de vent sont attendues. Évitez les activités exposées et fixez ce qui peut être emporté.',
            'De violentes rafales de vent sont attendues. Évitez les déplacements non indispensables et restez à l’écart des arbres et structures fragiles.'
        ],
        neige: [
            'De la neige est possible, pouvant rendre les routes glissantes.',
            'Des chutes de neige marquées sont attendues. Anticipez vos déplacements et équipez votre véhicule si besoin.',
            'De fortes chutes de neige sont attendues. Évitez les déplacements non indispensables et suivez l’évolution des conditions de circulation.'
        ],
        verglas: [
            'Un risque de verglas localisé est possible au sol.',
            'Un risque de pluie verglaçante est possible : la chaussée peut devenir brutalement glissante. Adaptez votre conduite.',
            'Un épisode durable de pluie verglaçante est attendu. Évitez les déplacements non indispensables, la chaussée peut rester dangereuse plusieurs heures.'
        ],
        chaleur: [
            'Des températures élevées sont attendues. Hydratez-vous régulièrement.',
            'De fortes chaleurs sont attendues. Évitez les efforts aux heures les plus chaudes et surveillez les personnes fragiles.',
            'Une chaleur extrême est attendue. Limitez les sorties et les efforts, hydratez-vous fréquemment, veillez sur les personnes vulnérables.'
        ],
        froid: [
            'Des températures basses sont attendues. Pensez à vous couvrir.',
            'Un froid marqué est attendu. Limitez les expositions prolongées et protégez les canalisations sensibles au gel.',
            'Un froid extrême est attendu. Évitez les expositions prolongées et soyez vigilant vis-à-vis des personnes vulnérables et des risques de gel.'
        ],
        brouillard: [
            'La visibilité peut être réduite par endroits.',
            'La visibilité peut être fortement réduite. Réduisez votre vitesse et augmentez les distances de sécurité.',
            'La visibilité peut être très fortement réduite (brouillard dense). Redoublez de prudence, envisagez de reporter vos déplacements.'
        ],
        feu: [
            'Les conditions météo peuvent légèrement favoriser le développement d’un feu. Respectez les consignes locales.',
            'Les conditions météo peuvent favoriser le développement d’un feu. Respectez les consignes locales et évitez tout départ de flamme.',
            'Les conditions météo sont très favorables au développement et à la propagation d’un feu. Soyez extrêmement vigilant et respectez strictement les interdictions locales.'
        ]
    };
    var FEU_DISCLAIMER = 'Important : ce niveau mesure seulement le cocktail météo chaleur, humidité, vent et pluie. Il reste non officiel et ne remplace pas la Météo des forêts.';

    function whenReady(callback) {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', callback);
        } else {
            callback();
        }
    }

    function fetchJson(url, options) {
        return fetch(url, Object.assign({ cache: 'no-cache' }, options || {})).then(function (response) {
            if (!response.ok) {
                throw new Error('Réponse HTTP ' + response.status);
            }
            return response.json();
        });
    }

    function fetchText(url) {
        return fetch(url, { cache: 'default' }).then(function (response) {
            if (!response.ok) {
                throw new Error('Réponse HTTP ' + response.status);
            }
            return response.text();
        });
    }

    // Certains thèmes (Avada/Fusion Builder) placent le shortcode dans une
    // colonne bien plus étroite que la ligne qui la contient. On mesure les
    // ancêtres réels au lieu de deviner une largeur fixe (même pattern que
    // harmonie-knmi.js, déjà corrigé d'une boucle infinie rétréci/agrandi).
    function clearWiden(card) {
        card.style.width = '';
        card.style.maxWidth = '';
        card.style.marginLeft = '';
        card.style.marginRight = '';
    }

    function widenToFitAncestor(card) {
        if (!card) {
            return;
        }
        if (window.innerWidth < 900) {
            clearWiden(card);
            return;
        }
        var parent = card.parentElement;
        if (!parent) {
            return;
        }
        clearWiden(card);
        var parentWidth = parent.getBoundingClientRect().width;
        var widest = parentWidth;
        var el = parent.parentElement;
        var hops = 0;
        while (el && hops < 6) {
            var rect = el.getBoundingClientRect();
            if (rect.width > widest) {
                widest = rect.width;
            }
            el = el.parentElement;
            hops += 1;
        }
        var viewportLimit = (document.documentElement.clientWidth || window.innerWidth) - 4;
        var target = Math.min(widest, 1700, viewportLimit);
        if (target <= parentWidth + 24) {
            return;
        }
        var offset = (target - parentWidth) / 2;
        card.style.maxWidth = target + 'px';
        card.style.width = target + 'px';
        card.style.marginLeft = (-offset) + 'px';
        card.style.marginRight = (-offset) + 'px';
    }

    // --- Projection GeoJSON -> SVG (équirectangulaire, corrigée en cosinus
    // de latitude pour ne pas déformer la France) : même principe que la
    // projection du fond de carte HARMONIE, mais bornes calculées
    // dynamiquement depuis les contours eux-mêmes plutôt que codées en dur.
    function computeBoundsFromFeatures(features) {
        var west = Infinity, east = -Infinity, south = Infinity, north = -Infinity;
        function visit(coords, depth) {
            if (depth === 0) {
                var lon = coords[0], lat = coords[1];
                if (lon < west) { west = lon; }
                if (lon > east) { east = lon; }
                if (lat < south) { south = lat; }
                if (lat > north) { north = lat; }
            } else {
                coords.forEach(function (item) { visit(item, depth - 1); });
            }
        }
        features.forEach(function (feature) {
            var geometry = feature.geometry;
            if (!geometry) { return; }
            var depth = geometry.type === 'Polygon' ? 2 : 3;
            visit(geometry.coordinates, depth);
        });
        return { west: west, east: east, south: south, north: north };
    }

    function buildProjector(bounds, viewSize, padding) {
        var latMid = (bounds.south + bounds.north) / 2;
        var scaleFactor = Math.cos(latMid * Math.PI / 180);
        var spanX = (bounds.east - bounds.west) * scaleFactor;
        var spanY = bounds.north - bounds.south;
        var usable = viewSize - padding * 2;
        var scale = usable / Math.max(spanX, spanY);
        var offsetX = padding + (usable - spanX * scale) / 2;
        var offsetY = padding + (usable - spanY * scale) / 2;
        return function project(lon, lat) {
            var x = (lon - bounds.west) * scaleFactor * scale + offsetX;
            var y = (bounds.north - lat) * scale + offsetY;
            return [x, y];
        };
    }

    function projectRing(ring, project) {
        return ring.map(function (point) { return project(point[0], point[1]); });
    }

    function pathForGeometry(geometry, project) {
        var polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
        var parts = [];
        polygons.forEach(function (polygon) {
            polygon.forEach(function (ring) {
                var points = projectRing(ring, project);
                var d = '';
                points.forEach(function (xy, index) {
                    d += (index === 0 ? 'M' : 'L') + xy[0].toFixed(2) + ',' + xy[1].toFixed(2) + ' ';
                });
                d += 'Z ';
                parts.push(d);
            });
        });
        return parts.join('');
    }

    // Centroïde (aire pondérée, formule du lacet) du plus grand contour
    // extérieur de la géométrie : plus fiable qu'une simple moyenne de
    // sommets pour placer une icône au centre visuel du département,
    // y compris pour les formes concaves ou multi-parties.
    function polygonSignedArea(points) {
        var sum = 0;
        for (var i = 0; i < points.length; i++) {
            var a = points[i];
            var b = points[(i + 1) % points.length];
            sum += a[0] * b[1] - b[0] * a[1];
        }
        return sum / 2;
    }

    function polygonCentroid(points) {
        var area = polygonSignedArea(points);
        if (Math.abs(area) < 1e-9) {
            var sx = 0, sy = 0;
            points.forEach(function (p) { sx += p[0]; sy += p[1]; });
            return [sx / points.length, sy / points.length];
        }
        var cx = 0, cy = 0;
        for (var i = 0; i < points.length; i++) {
            var a = points[i];
            var b = points[(i + 1) % points.length];
            var cross = a[0] * b[1] - b[0] * a[1];
            cx += (a[0] + b[0]) * cross;
            cy += (a[1] + b[1]) * cross;
        }
        return [cx / (6 * area), cy / (6 * area)];
    }

    function largestExteriorRingPoints(geometry, project) {
        var polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
        var best = null;
        var bestArea = -1;
        polygons.forEach(function (polygon) {
            if (!polygon.length) { return; }
            var points = projectRing(polygon[0], project);
            var area = Math.abs(polygonSignedArea(points));
            if (area > bestArea) {
                bestArea = area;
                best = points;
            }
        });
        return best || [];
    }

    function zonedDateKey(iso, tz) {
        var meteorologicalDate = new Date(new Date(iso).getTime() - 6 * 60 * 60 * 1000);
        return new Intl.DateTimeFormat('en-CA', {
            timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit'
        }).format(meteorologicalDate);
    }

    function initApp(app) {
        var baseUrl = (app.dataset.baseUrl || '').replace(/\/+$/, '');
        var geojsonUrl = app.dataset.geojsonUrl || '';
        var defaultDepartment = (app.dataset.defaultDepartment || '').toUpperCase();
        var defaultHazard = app.dataset.defaultHazard || 'orages';
        var timezone = app.dataset.timezone || 'Europe/Paris';

        var input = app.querySelector('.hrw-city-input');
        var locateButton = app.querySelector('[data-hrw-locate]');
        var searchResults = app.querySelector('[data-hrw-search-results]');
        var runMeta = app.querySelector('[data-hrw-run]');
        var generated = app.querySelector('[data-hrw-generated]');
        var nationalSummaryBox = app.querySelector('[data-hrw-national-summary]');
        var summaryMax = app.querySelector('[data-hrw-summary-max]');
        var summaryMin = app.querySelector('[data-hrw-summary-min]');
        var summaryGust = app.querySelector('[data-hrw-summary-gust]');
        var summaryPrecip = app.querySelector('[data-hrw-summary-precip]');
        var hazardTabs = app.querySelector('[data-hrw-hazard-tabs]');
        var dayTabs = app.querySelector('[data-hrw-day-tabs]');
        var mapSvg = app.querySelector('[data-hrw-map]');
        var insetSvg = app.querySelector('[data-hrw-inset-map]');
        var mapWrap = app.querySelector('.hrw-map-wrap');
        var mapLoading = app.querySelector('[data-hrw-map-loading]');
        var legendTitle = app.querySelector('[data-hrw-legend-title]');
        var legend = app.querySelector('[data-hrw-legend]');
        var detailPlaceholder = app.querySelector('[data-hrw-detail-placeholder]');
        var detailContent = app.querySelector('[data-hrw-detail-content]');
        var detailTitle = app.querySelector('[data-hrw-detail-title]');
        var detailGrid = app.querySelector('[data-hrw-detail-grid]');
        var friseHazardLabel = app.querySelector('[data-hrw-frise-hazard]');
        var friseTrack = app.querySelector('[data-hrw-frise-track]');
        var friseLabels = app.querySelector('[data-hrw-frise-labels]');
        var adviceBox = app.querySelector('[data-hrw-advice]');
        var adviceText = app.querySelector('[data-hrw-advice-text]');
        var captureButton = app.querySelector('[data-hrw-capture]');
        var copyButton = app.querySelector('[data-hrw-copy]');

        var manifest = null;
        var mapEntries = {};
        var namesByCode = {};
        var currentHazard = defaultHazard;
        var currentDayIndex = 0;
        var selectedDepartment = defaultDepartment || null;
        var detailHazard = defaultHazard;
        var debounceTimer = null;
        var searchController = null;

        function dayFormatter() {
            return new Intl.DateTimeFormat('fr-FR', {
                weekday: 'short', day: '2-digit', month: '2-digit', timeZone: timezone
            });
        }

        function hourFormatter() {
            return new Intl.DateTimeFormat('fr-FR', {
                hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: timezone
            });
        }

        function localHourOf(date) {
            // formatToParts() plutôt que format() : certaines données ICU
            // ajoutent un suffixe d'unité (« 3 h ») au format heure-seule
            // en fr-FR, ce qui casse Number() sur la chaîne complète —
            // confirmé empiriquement (les ticks affichaient « NaNh »).
            // Lire directement la part de type "hour" évite ce piège quel
            // que soit le comportement local du moteur.
            var parts = new Intl.DateTimeFormat('en-GB', {
                hour: '2-digit', hourCycle: 'h23', timeZone: timezone
            }).formatToParts(date);
            var hourPart = parts.filter(function (part) { return part.type === 'hour'; })[0];
            return hourPart ? Number(hourPart.value) : 0;
        }

        function levelInfo(hazard, level) {
            var scale = manifest && manifest.hazard_levels ? manifest.hazard_levels[hazard] : null;
            var info = scale ? scale[String(level)] : null;
            return info || { label: 'Inconnu', color: '#555' };
        }

        function maxLevelFor(hazard) {
            var scale = manifest && manifest.hazard_levels ? manifest.hazard_levels[hazard] : null;
            return scale ? Object.keys(scale).length - 1 : 4;
        }

        // « (X/N) » à côté du libellé : les échelles n'ont plus toutes le
        // même nombre de paliers (4 à 8 selon l'aléa), utile pour situer un
        // niveau sans avoir la légende sous les yeux. Rien n'est affiché
        // pour le niveau 0 (Nul) : « Nul (0/7) » n'a pas de sens, il n'y a
        // pas d'alerte à situer sur l'échelle.
        function levelSuffix(hazard, level) {
            if (!level) { return ''; }
            return ' (' + level + '/' + maxLevelFor(hazard) + ')';
        }

        function hazardLabel(hazard) {
            return (manifest && manifest.hazards && manifest.hazards[hazard]) || hazard;
        }

        function departmentLevel(code, hazard, dayIndex) {
            var department = manifest && manifest.departments ? manifest.departments[code] : null;
            if (!department || !department.daily || !department.daily[dayIndex]) {
                return 0;
            }
            var hazards = department.daily[dayIndex].hazards || {};
            return hazards[hazard] || 0;
        }

        function paintMap() {
            Object.keys(mapEntries).forEach(function (code) {
                var level = departmentLevel(code, currentHazard, currentDayIndex);
                var color = levelInfo(currentHazard, level).color;
                var showIconForLevel = level >= ICON_MIN_LEVEL;
                mapEntries[code].forEach(function (entry) {
                    entry.path.setAttribute('fill', color);
                    entry.path.classList.toggle('is-selected', code === selectedDepartment);
                    if (showIconForLevel && entry.showIcon) {
                        entry.glyph.replaceChildren();
                        appendIconPrimitives(entry.glyph, currentHazard);
                        entry.iconGroup.style.display = '';
                    } else {
                        entry.iconGroup.style.display = 'none';
                    }
                });
            });
        }

        function buildLegend() {
            // L'échelle (nombre de paliers, libellés) dépend de l'aléa
            // affiché — la légende est donc reconstruite à chaque
            // changement d'aléa plutôt que dessinée une seule fois.
            legend.replaceChildren();
            var maxLevel = maxLevelFor(currentHazard);
            if (legendTitle) {
                legendTitle.textContent = hazardLabel(currentHazard) + ' 0/' + maxLevel;
            }
            for (var level = 0; level <= maxLevel; level++) {
                var info = levelInfo(currentHazard, level);
                var item = document.createElement('div');
                item.className = 'hrw-legend-item';
                var swatch = document.createElement('span');
                swatch.className = 'hrw-legend-swatch';
                swatch.style.backgroundColor = info.color;
                var label = document.createElement('span');
                label.textContent = info.label;
                item.appendChild(swatch);
                item.appendChild(label);
                legend.appendChild(item);
            }
        }

        function buildHazardTabs() {
            hazardTabs.replaceChildren();
            if (!manifest || !manifest.hazards) { return; }
            Object.keys(manifest.hazards).forEach(function (hazard) {
                var button = document.createElement('button');
                button.type = 'button';
                button.className = 'hrw-tab';
                button.dataset.hazard = hazard;
                button.appendChild(buildIconNode(hazard, 'hrw-tab-icon'));
                button.appendChild(document.createTextNode(manifest.hazards[hazard]));
                button.classList.toggle('is-active', hazard === currentHazard);
                button.addEventListener('click', function () {
                    setHazard(hazard);
                });
                hazardTabs.appendChild(button);
            });
        }

        function buildDayTabs() {
            dayTabs.replaceChildren();
            var department = manifest && manifest.departments ? manifest.departments[selectedDepartment || Object.keys(manifest.departments)[0]] : null;
            var daily = department ? department.daily : [];
            var formatter = dayFormatter();
            var labels = ['J0', 'J1', 'J2', 'J3', 'J4'];
            daily.forEach(function (entry, index) {
                var date = new Date(entry.date + 'T12:00:00Z');
                var button = document.createElement('button');
                button.type = 'button';
                button.className = 'hrw-tab';
                button.textContent = (labels[index] || ('J' + index)) + ' · ' + formatter.format(date);
                button.classList.toggle('is-active', index === currentDayIndex);
                button.addEventListener('click', function () {
                    setDay(index);
                });
                dayTabs.appendChild(button);
            });
        }

        function selectCurrentMeteorologicalDay() {
            var department = manifest && manifest.departments
                ? manifest.departments[selectedDepartment || Object.keys(manifest.departments)[0]]
                : null;
            var daily = department ? department.daily : [];
            var today = zonedDateKey(new Date().toISOString(), timezone);
            var todayIndex = daily.findIndex(function (entry) {
                return entry && entry.date === today;
            });
            currentDayIndex = todayIndex >= 0 ? todayIndex : 0;
        }

        function setHazard(hazard) {
            currentHazard = hazard;
            detailHazard = hazard;
            Array.prototype.forEach.call(hazardTabs.children, function (button) {
                button.classList.toggle('is-active', button.dataset.hazard === hazard);
            });
            buildLegend();
            paintMap();
            renderDetail();
        }

        function setDay(index) {
            currentDayIndex = index;
            Array.prototype.forEach.call(dayTabs.children, function (button, i) {
                button.classList.toggle('is-active', i === index);
            });
            paintMap();
            renderDetail();
        }

        function selectDepartment(code) {
            if (!manifest || !manifest.departments[code]) {
                return;
            }
            selectedDepartment = code;
            paintMap();
            buildDayTabs();
            renderDetail();
        }

        function renderDetail() {
            if (!selectedDepartment || !manifest) {
                detailPlaceholder.hidden = false;
                detailContent.hidden = true;
                return;
            }
            var department = manifest.departments[selectedDepartment];
            if (!department || !department.daily[currentDayIndex]) {
                detailPlaceholder.hidden = false;
                detailContent.hidden = true;
                return;
            }
            detailPlaceholder.hidden = true;
            detailContent.hidden = false;

            var name = namesByCode[selectedDepartment] || selectedDepartment;
            detailTitle.textContent = name + ' (' + selectedDepartment + ')';

            var hazards = department.daily[currentDayIndex].hazards || {};
            detailGrid.replaceChildren();
            Object.keys(manifest.hazards).forEach(function (hazard) {
                var level = hazards[hazard] || 0;
                var info = levelInfo(hazard, level);
                var cell = document.createElement('div');
                cell.className = 'hrw-hazard-cell';
                cell.classList.toggle('is-active', hazard === detailHazard);
                var name2 = document.createElement('span');
                name2.className = 'hrw-hazard-name';
                name2.appendChild(buildIconNode(hazard, 'hrw-hazard-icon'));
                name2.appendChild(document.createTextNode(manifest.hazards[hazard]));
                var levelSpan = document.createElement('span');
                levelSpan.className = 'hrw-hazard-level';
                levelSpan.style.backgroundColor = info.color;
                levelSpan.textContent = info.label + levelSuffix(hazard, level);
                cell.appendChild(name2);
                cell.appendChild(document.createElement('br'));
                cell.appendChild(levelSpan);
                cell.addEventListener('click', function () {
                    detailHazard = hazard;
                    renderDetail();
                });
                detailGrid.appendChild(cell);
            });

            renderFrise(department);
        }

        function renderAdvice(level) {
            if (!adviceText) { return; }
            // Rien à afficher au niveau Nul (0) : pas d'alerte, pas de
            // conseil à donner.
            if (!level) {
                if (adviceBox) { adviceBox.hidden = true; }
                adviceText.textContent = '';
                return;
            }
            if (adviceBox) { adviceBox.hidden = false; }

            // Palier léger/modéré/sévère choisi selon la position relative
            // du niveau dans l'échelle propre à l'aléa (4 à 9 paliers selon
            // les cas, donc un simple découpage en tiers plutôt que des
            // seuils absolus).
            var maxLevel = maxLevelFor(detailHazard);
            var ratio = maxLevel > 0 ? level / maxLevel : 1;
            var tierIndex = ratio <= 1 / 3 ? 0 : (ratio <= 2 / 3 ? 1 : 2);
            var tiers = ADVICE_TIERS[detailHazard] || [];
            var message = tiers[tierIndex] || tiers[tiers.length - 1] || '';

            if (detailHazard === 'feu') {
                message += ' ' + FEU_DISCLAIMER;
            }
            adviceText.textContent = message;
        }

        function renderFrise(department) {
            friseHazardLabel.textContent = hazardLabel(detailHazard);
            friseTrack.replaceChildren();
            if (friseLabels) { friseLabels.replaceChildren(); }

            var dayEntry = department.daily[currentDayIndex];
            if (!dayEntry) { return; }

            var hourlyAll = department.hourly || [];
            var dayHours = hourlyAll.filter(function (entry) {
                return zonedDateKey(entry.time, timezone) === dayEntry.date;
            });
            if (!dayHours.length) {
                if (adviceText) {
                    adviceText.textContent = 'Données HARMONIE indisponibles pour cette journée.';
                }
                return;
            }

            // La frise doit toujours partir de minuit (0h), même le jour où
            // le run HARMONIE lui-même n'a démarré que plus tard (ex. un run
            // lancé à 9h ne peut pas avoir de données pour 0h-8h ce jour-là)
            // — sinon la première case affichée n'était pas 0h mais l'heure
            // de départ réelle du run, ce qui semblait être un bug. On
            // construit donc les 24 cases une par une par heure locale, avec
            // une case « pas de données » pour les heures manquantes,
            // plutôt que de se contenter des entrées réellement présentes.
            var hourMap = {};
            dayHours.forEach(function (entry) {
                hourMap[localHourOf(new Date(entry.time))] = entry;
            });

            var lastIndex = hourlyAll.indexOf(dayHours[dayHours.length - 1]);
            var closingEntry = lastIndex >= 0 ? hourlyAll[lastIndex + 1] : null;

            var formatter = hourFormatter();

            function appendCell(hourLabel, entry) {
                var cell = document.createElement('div');
                cell.className = 'hrw-frise-hour';
                if (entry) {
                    var level = (entry.hazards || {})[detailHazard] || 0;
                    var info = levelInfo(detailHazard, level);
                    cell.style.backgroundColor = info.color;
                    cell.title = formatter.format(new Date(entry.time)) + ' — ' +
                        hazardLabel(detailHazard) + ' : ' + info.label + levelSuffix(detailHazard, level);
                } else {
                    cell.classList.add('hrw-frise-hour-empty');
                    cell.title = 'Données indisponibles pour cette heure (avant le début du run).';
                }
                friseTrack.appendChild(cell);

                if (friseLabels) {
                    var tick = document.createElement('span');
                    tick.className = 'hrw-frise-tick';
                    if (hourLabel % 3 === 0) {
                        tick.textContent = hourLabel + 'h';
                    }
                    friseLabels.appendChild(tick);
                }
            }

            for (var hour = 0; hour <= 23; hour++) {
                appendCell(hour, hourMap[hour] || null);
            }
            // Case de clôture « 0h » du lendemain, pour boucler l'affichage
            // 0h → 21h → 0h comme sur la maquette fournie.
            appendCell(0, closingEntry);

            renderAdvice(dayEntry.hazards[detailHazard] || 0);
        }

        // --- Petit résumé national (records du jour J0 : maxi/mini de
        // température, rafale maxi, cumul de pluie maxi, chacun avec le
        // département qui le détient). Toujours J0, indépendant de l'onglet
        // jour actif — appelé une fois après le chargement des données.
        function renderNationalSummary() {
            if (!nationalSummaryBox) { return; }
            var entry = manifest && Array.isArray(manifest.national_summary)
                ? manifest.national_summary[0]
                : null;
            if (!entry) {
                nationalSummaryBox.hidden = true;
                return;
            }

            function label(field, unit, decimals) {
                if (!field) { return '—'; }
                var deptName = namesByCode[field.department] || field.department;
                return field.value.toFixed(decimals) + unit + ' (' + deptName + ')';
            }

            if (summaryMax) { summaryMax.textContent = label(entry.max_temperature, '°C', 1); }
            if (summaryMin) { summaryMin.textContent = label(entry.min_temperature, '°C', 1); }
            if (summaryGust) { summaryGust.textContent = label(entry.max_gust, ' km/h', 0); }
            if (summaryPrecip) { summaryPrecip.textContent = label(entry.max_precip, ' mm', 1); }
            nationalSummaryBox.hidden = false;
        }

        // --- Info-bulle au survol d'un département (nom, niveau de l'aléa
        // affiché, mini-frise de la journée sélectionnée) — indépendante du
        // clic, qui ouvre lui le panneau de détail complet.
        var tooltip = document.createElement('div');
        tooltip.className = 'hrw-map-tooltip';
        tooltip.hidden = true;
        if (mapWrap) { mapWrap.appendChild(tooltip); }

        function positionTooltip(anchorEl) {
            if (!mapWrap) { return; }
            var wrapRect = mapWrap.getBoundingClientRect();
            var anchorRect = anchorEl.getBoundingClientRect();
            var x = anchorRect.left + anchorRect.width / 2 - wrapRect.left;
            var y = anchorRect.top - wrapRect.top;

            // Le CSS applique translate(-50%, -100% - 10px) : le clamp
            // précédent ne bornait que la propriété "left" elle-même, pas
            // le décalage supplémentaire de moitié-largeur/hauteur que le
            // transform applique ensuite — un département à l'extrême
            // gauche de la carte (ex. Gironde) faisait ainsi déborder la
            // bulle hors écran (left négatif, coupée). On mesure la taille
            // réelle de la bulle (déjà remplie, juste rendue visible) pour
            // borner sa boîte finale plutôt que son seul point d'ancrage.
            tooltip.style.left = x + 'px';
            tooltip.style.top = Math.max(8, y) + 'px';
            var halfWidth = tooltip.offsetWidth / 2;
            var minX = halfWidth + 4;
            var maxX = wrapRect.width - halfWidth - 4;
            var clampedX = maxX >= minX ? Math.min(Math.max(x, minX), maxX) : wrapRect.width / 2;
            tooltip.style.left = clampedX + 'px';

            var tooltipHeight = tooltip.offsetHeight;
            var minY = tooltipHeight + 14;
            tooltip.style.top = Math.max(minY, y) + 'px';
        }

        function showDeptTooltip(code, anchorEl) {
            if (!manifest || !manifest.departments[code]) { return; }
            var department = manifest.departments[code];
            var dayEntry = department.daily[currentDayIndex];
            if (!dayEntry) { return; }
            var level = (dayEntry.hazards || {})[currentHazard] || 0;
            var info = levelInfo(currentHazard, level);

            tooltip.replaceChildren();
            var title = document.createElement('div');
            title.className = 'hrw-tooltip-title';
            title.textContent = (namesByCode[code] || code) + ' (' + code + ')';
            tooltip.appendChild(title);

            var chip = document.createElement('div');
            chip.className = 'hrw-tooltip-chip';
            chip.style.backgroundColor = info.color;
            chip.textContent = hazardLabel(currentHazard) + ' — ' + info.label + levelSuffix(currentHazard, level);
            tooltip.appendChild(chip);

            var hourlyAll = department.hourly || [];
            var dayHours = hourlyAll.filter(function (entry) {
                return zonedDateKey(entry.time, timezone) === dayEntry.date;
            });
            if (dayHours.length) {
                var mini = document.createElement('div');
                mini.className = 'hrw-tooltip-frise';
                dayHours.forEach(function (entry) {
                    var hourLevel = (entry.hazards || {})[currentHazard] || 0;
                    var segment = document.createElement('span');
                    segment.style.backgroundColor = levelInfo(currentHazard, hourLevel).color;
                    mini.appendChild(segment);
                });
                tooltip.appendChild(mini);

                // Repères positionnés en absolu (premier, milieu, dernier)
                // plutôt qu'une case par heure en flex : dans une info-bulle
                // de 180px avec 20-30 heures, une case flex par heure était
                // trop étroite pour son propre texte, qui débordait sur les
                // voisines et devenait illisible (ex. « 22h » × 2 superposés
                // rendus comme « 2222h »).
                var miniLabels = document.createElement('div');
                miniLabels.className = 'hrw-tooltip-frise-labels';
                var lastIdx = dayHours.length - 1;
                var tickIndexes = lastIdx > 0
                    ? Array.from(new Set([0, Math.round(lastIdx / 2), lastIdx]))
                    : [0];
                tickIndexes.forEach(function (idx) {
                    var tick = document.createElement('span');
                    tick.className = 'hrw-tooltip-frise-tick-abs';
                    tick.textContent = localHourOf(new Date(dayHours[idx].time)) + 'h';
                    var pct = lastIdx > 0 ? (idx / lastIdx) * 100 : 50;
                    tick.style.left = pct + '%';
                    if (idx === 0) {
                        tick.style.transform = 'translateX(0)';
                    } else if (idx === lastIdx) {
                        tick.style.transform = 'translateX(-100%)';
                    } else {
                        tick.style.transform = 'translateX(-50%)';
                    }
                    miniLabels.appendChild(tick);
                });
                tooltip.appendChild(miniLabels);
            }

            // Rendre visible AVANT de positionner : positionTooltip() a
            // besoin de mesurer la largeur/hauteur réelle de la bulle
            // (offsetWidth/offsetHeight), qui valent 0 tant que l'élément
            // est masqué via [hidden].
            tooltip.hidden = false;
            positionTooltip(anchorEl);
        }

        function hideDeptTooltip() {
            tooltip.hidden = true;
        }

        function buildMapInto(svgEl, features, viewSize, padding, suppressIconCodes, iconRadius) {
            if (!svgEl || !features.length) { return; }
            var bounds = computeBoundsFromFeatures(features);
            var project = buildProjector(bounds, viewSize, padding);
            features.forEach(function (feature) {
                var code = String((feature.properties || {}).code || '').toUpperCase();
                var name = (feature.properties || {}).nom || code;
                if (!code) { return; }
                namesByCode[code] = name;

                var path = document.createElementNS(SVG_NS, 'path');
                path.setAttribute('d', pathForGeometry(feature.geometry, project));
                path.setAttribute('data-code', code);
                path.setAttribute('role', 'button');
                path.setAttribute('tabindex', '0');
                path.setAttribute('aria-label', name);
                path.addEventListener('click', function () {
                    selectDepartment(code);
                });
                path.addEventListener('keydown', function (event) {
                    if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        selectDepartment(code);
                    }
                });
                path.addEventListener('mouseenter', function () { showDeptTooltip(code, path); });
                path.addEventListener('mouseleave', hideDeptTooltip);
                path.addEventListener('focus', function () { showDeptTooltip(code, path); });
                path.addEventListener('blur', hideDeptTooltip);
                svgEl.appendChild(path);

                var ringPoints = largestExteriorRingPoints(feature.geometry, project);
                var centroid = ringPoints.length ? polygonCentroid(ringPoints) : [0, 0];

                // Badge blanc + icône monochrome par-dessus, plutôt qu'un
                // glyphe nu : reste lisible quelle que soit la couleur
                // pastel du département en dessous.
                var iconGroup = createSvgElement('g', { class: 'hrw-dept-icon-wrap' });
                iconGroup.style.display = 'none';
                var badge = createSvgElement('circle', {
                    class: 'hrw-dept-icon-badge',
                    cx: centroid[0].toFixed(2),
                    cy: centroid[1].toFixed(2),
                    r: iconRadius
                });
                var glyphScale = (iconRadius * 1.25) / 24;
                var glyphX = centroid[0] - 12 * glyphScale;
                var glyphY = centroid[1] - 12 * glyphScale;
                var glyph = createSvgElement('g', {
                    class: 'hrw-dept-icon',
                    transform: 'translate(' + glyphX.toFixed(2) + ',' + glyphY.toFixed(2) + ') scale(' + glyphScale.toFixed(3) + ')'
                });
                iconGroup.appendChild(badge);
                iconGroup.appendChild(glyph);
                svgEl.appendChild(iconGroup);

                if (!mapEntries[code]) { mapEntries[code] = []; }
                mapEntries[code].push({
                    path: path,
                    iconGroup: iconGroup,
                    glyph: glyph,
                    showIcon: suppressIconCodes.indexOf(code) === -1
                });
            });
        }

        function buildMap(geojson) {
            var features = geojson.features || [];
            buildMapInto(mapSvg, features, 1000, 12, IDF_CODES, 13);

            var idfFeatures = features.filter(function (feature) {
                var code = String((feature.properties || {}).code || '').toUpperCase();
                return IDF_CODES.indexOf(code) !== -1;
            });
            buildMapInto(insetSvg, idfFeatures, 300, 14, [], 17);

            mapLoading.hidden = true;
        }

        function composeMapCanvas() {
            return new Promise(function (resolve, reject) {
                var rect = mapSvg.getBoundingClientRect();
                var width = Math.max(1, Math.round(rect.width || 1000));
                var height = Math.max(1, Math.round(rect.height || 1000));
                var clone = mapSvg.cloneNode(true);
                clone.setAttribute('width', width);
                clone.setAttribute('height', height);
                clone.setAttribute('xmlns', SVG_NS);
                var svgText = new XMLSerializer().serializeToString(clone);
                var svgBlob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
                var url = URL.createObjectURL(svgBlob);
                var image = new Image();
                image.onload = function () {
                    var canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;
                    var context = canvas.getContext('2d');
                    context.fillStyle = '#ffffff';
                    context.fillRect(0, 0, width, height);
                    context.drawImage(image, 0, 0, width, height);
                    URL.revokeObjectURL(url);
                    resolve(canvas);
                };
                image.onerror = function () {
                    URL.revokeObjectURL(url);
                    reject(new Error('Rendu SVG indisponible'));
                };
                image.src = url;
            });
        }

        function exportFilename(extension) {
            function two(number) { return String(number).padStart(2, '0'); }
            var now = new Date();
            var stamp = now.getFullYear() + two(now.getMonth() + 1) + two(now.getDate()) +
                '-' + two(now.getHours()) + two(now.getMinutes()) + two(now.getSeconds());
            return 'vigilance-' + currentHazard + '-' + stamp + '.' + extension;
        }

        if (captureButton) {
            captureButton.addEventListener('click', function () {
                composeMapCanvas().then(function (canvas) {
                    canvas.toBlob(function (blob) {
                        if (!blob) { return; }
                        var url = URL.createObjectURL(blob);
                        var link = document.createElement('a');
                        link.href = url;
                        link.download = exportFilename('png');
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                        window.setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
                    }, 'image/png');
                }).catch(function () {});
            });
        }

        if (copyButton) {
            copyButton.addEventListener('click', function () {
                if (!navigator.clipboard || !window.ClipboardItem) {
                    return;
                }
                composeMapCanvas().then(function (canvas) {
                    canvas.toBlob(function (blob) {
                        if (!blob) { return; }
                        navigator.clipboard.write([
                            new window.ClipboardItem({ 'image/png': blob })
                        ]).catch(function () {});
                    }, 'image/png');
                }).catch(function () {});
            });
        }

        // --- Recherche commune + géolocalisation (même API que le tableau
        // HARMONIE : geo.api.gouv.fr).
        function closeResults() {
            searchResults.hidden = true;
            searchResults.replaceChildren();
        }

        function displaySearchResults(candidates) {
            searchResults.replaceChildren();
            if (!candidates.length) {
                closeResults();
                return;
            }
            candidates.forEach(function (candidate) {
                var button = document.createElement('button');
                button.type = 'button';
                button.className = 'hrw-search-result';
                button.textContent = candidate.nom + ' (' + (candidate.codeDepartement || '') + ')';
                button.addEventListener('click', function () {
                    input.value = candidate.nom;
                    closeResults();
                    selectDepartment(String(candidate.codeDepartement || '').toUpperCase());
                });
                searchResults.appendChild(button);
            });
            searchResults.hidden = false;
        }

        function searchCommunes(query) {
            if (searchController) {
                searchController.abort();
            }
            searchController = new AbortController();
            var parameters = new URLSearchParams({
                fields: 'nom,code,codeDepartement,population',
                format: 'json',
                boost: 'population',
                limit: '10'
            });
            if (/^\d{5}$/.test(query)) {
                parameters.set('codePostal', query);
            } else {
                parameters.set('nom', query);
            }
            fetchJson(COMMUNES_API + '?' + parameters.toString(), { signal: searchController.signal })
                .then(function (payload) {
                    displaySearchResults(Array.isArray(payload) ? payload : []);
                })
                .catch(function (error) {
                    if (error.name === 'AbortError') { return; }
                    closeResults();
                });
        }

        if (input) {
            input.addEventListener('input', function () {
                var query = input.value.trim();
                window.clearTimeout(debounceTimer);
                if (query.length < 2) {
                    closeResults();
                    return;
                }
                debounceTimer = window.setTimeout(function () {
                    searchCommunes(query);
                }, 220);
            });
            document.addEventListener('click', function (event) {
                if (!app.contains(event.target)) { return; }
                if (!event.target.closest('.hrw-search')) {
                    closeResults();
                }
            });
        }

        if (locateButton) {
            locateButton.addEventListener('click', function () {
                if (!navigator.geolocation) { return; }
                locateButton.disabled = true;
                locateButton.textContent = '📍 Localisation…';
                navigator.geolocation.getCurrentPosition(function (position) {
                    var parameters = new URLSearchParams({
                        lat: String(position.coords.latitude),
                        lon: String(position.coords.longitude),
                        fields: 'nom,code,codeDepartement',
                        format: 'json'
                    });
                    fetchJson(COMMUNES_API + '?' + parameters.toString())
                        .then(function (payload) {
                            var candidates = Array.isArray(payload) ? payload : (payload ? [payload] : []);
                            if (!candidates.length) {
                                throw new Error('Position hors couverture');
                            }
                            var candidate = candidates[0];
                            input.value = candidate.nom;
                            selectDepartment(String(candidate.codeDepartement || '').toUpperCase());
                        })
                        .catch(function () {})
                        .then(function () {
                            locateButton.disabled = false;
                            locateButton.textContent = '📍 Me géolocaliser';
                        });
                }, function () {
                    locateButton.disabled = false;
                    locateButton.textContent = '📍 Me géolocaliser';
                });
            });
        }

        // --- Chargement initial.
        if (!baseUrl) {
            mapLoading.textContent = 'Adresse des données de risques non configurée.';
            return;
        }

        widenToFitAncestor(app);
        var widenTimer = null;
        function scheduleWiden() {
            window.clearTimeout(widenTimer);
            widenTimer = window.setTimeout(function () {
                widenToFitAncestor(app);
            }, 150);
        }
        window.addEventListener('resize', scheduleWiden);

        Promise.all([
            fetchJson(baseUrl + '/risques.json'),
            fetchText(geojsonUrl).then(function (text) { return JSON.parse(text); })
        ]).then(function (results) {
            manifest = results[0];
            var geojson = results[1];
            if (!manifest || manifest.status !== 'ok') {
                throw new Error('Manifeste de risques invalide');
            }
            selectCurrentMeteorologicalDay();
            buildMap(geojson);
            buildLegend();
            buildHazardTabs();
            buildDayTabs();
            paintMap();
            renderNationalSummary();

            if (manifest.run_time) {
                var runDate = new Date(manifest.run_time);
                runMeta.textContent = 'Run HARMONIE du ' +
                    new Intl.DateTimeFormat('fr-FR', {
                        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'UTC'
                    }).format(runDate) + ' UTC';
            }
            if (manifest.generated_at) {
                generated.textContent = 'Risques calculés le ' +
                    new Intl.DateTimeFormat('fr-FR', {
                        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
                    }).format(new Date(manifest.generated_at));
            }

            if (selectedDepartment && manifest.departments[selectedDepartment]) {
                selectDepartment(selectedDepartment);
            }

            [300, 1000, 2500].forEach(function (delay) {
                window.setTimeout(function () { widenToFitAncestor(app); }, delay);
            });
        }).catch(function (error) {
            mapLoading.textContent = 'Les données de vigilance ne sont pas encore disponibles : ' + error.message;
        });
    }

    whenReady(function () {
        document.querySelectorAll('[data-hrw-app]').forEach(initApp);
    });
}());
