<?php
/**
 * Plugin Name: Carte de Vigilance HARMONIE (risques)
 * Plugin URI: https://github.com/alertesmeteo-hub/risques
 * Description: Carte de risques météo non officielle (9 aléas, 5 niveaux, J/J+1/J+2) dérivée du modèle HARMONIE, avec recherche de commune, géolocalisation et frises horaires.
 * Version: 1.1.0
 * Author: Alertes Météo Hub
 * Requires at least: 5.8
 * Requires PHP: 7.4
 * License: GPL-2.0-or-later
 */

if (!defined('ABSPATH')) {
    exit;
}

define('HRW_VERSION', '1.1.0');
define('HRW_RELEASE_DATE', '2026-08-25');
define('HRW_OPTION_BASE_URL', 'hrw_risques_data_base_url');
define(
    'HRW_DEFAULT_BASE_URL',
    'https://raw.githubusercontent.com/alertesmeteo-hub/risques/data'
);

add_action('wp_enqueue_scripts', 'hrw_register_assets');
add_action('admin_init', 'hrw_register_settings');
add_action('admin_menu', 'hrw_add_settings_page');
add_shortcode('harmonie_risques', 'hrw_render_shortcode');
add_filter('plugin_action_links_' . plugin_basename(__FILE__), 'hrw_plugin_action_links');

function hrw_register_assets() {
    wp_register_style(
        'hrw-carte',
        plugin_dir_url(__FILE__) . 'assets/harmonie-risques.css',
        array(),
        HRW_VERSION
    );
    wp_register_script(
        'hrw-carte',
        plugin_dir_url(__FILE__) . 'assets/harmonie-risques.js',
        array(),
        HRW_VERSION,
        true
    );
}

function hrw_register_settings() {
    register_setting(
        'hrw_settings',
        HRW_OPTION_BASE_URL,
        array(
            'type' => 'string',
            'sanitize_callback' => 'esc_url_raw',
            'default' => HRW_DEFAULT_BASE_URL,
        )
    );

    add_settings_section(
        'hrw_main_section',
        'Source des données de risques',
        '__return_false',
        'harmonie-risques'
    );

    add_settings_field(
        'hrw_data_base_url_field',
        'Adresse du dossier de données',
        'hrw_render_url_field',
        'harmonie-risques',
        'hrw_main_section'
    );
}

function hrw_render_url_field() {
    $value = get_option(HRW_OPTION_BASE_URL, HRW_DEFAULT_BASE_URL);
    printf(
        '<input type="url" class="regular-text code" name="%1$s" value="%2$s" autocomplete="off">',
        esc_attr(HRW_OPTION_BASE_URL),
        esc_attr($value)
    );
    echo '<p class="description">Conservez l’adresse proposée : elle pointe vers la branche « data » du dépôt risques.</p>';
}

function hrw_add_settings_page() {
    add_options_page(
        'Carte de Vigilance HARMONIE',
        'Vigilance HARMONIE',
        'manage_options',
        'harmonie-risques',
        'hrw_render_settings_page'
    );
    add_submenu_page(
        null,
        'Shortcodes Vigilance HARMONIE',
        'Shortcodes Vigilance HARMONIE',
        'manage_options',
        'harmonie-risques-aide',
        'hrw_render_admin_help_page'
    );
}

function hrw_plugin_action_links($links) {
    $help_link = sprintf(
        '<a href="%s">Shortcodes / Aide</a>',
        esc_url(admin_url('admin.php?page=harmonie-risques-aide'))
    );
    $settings_link = sprintf(
        '<a href="%s">Réglages</a>',
        esc_url(admin_url('options-general.php?page=harmonie-risques'))
    );
    array_unshift($links, $help_link);
    array_unshift($links, $settings_link);
    return $links;
}

function hrw_render_admin_help_page() {
    if (!current_user_can('manage_options')) {
        return;
    }
    ?>
    <div class="wrap">
        <h1>Shortcodes Vigilance HARMONIE</h1>
        <p><code>[harmonie_risques]</code> : carte de vigilance complète (9 aléas, J/J+1/J+2, recherche, frises).</p>
        <p><code>[harmonie_risques departement="75" alea="orages"]</code> : ouvre directement sur un département et un aléa donnés.</p>
        <p>L’aléa <strong>Feu</strong> est un indice non officiel (cocktail météo), affiché avec un avertissement systématique — il ne remplace pas Météo des forêts.</p>
        <p>Voir <a href="<?php echo esc_url(admin_url('options-general.php?page=harmonie-risques')); ?>">Réglages</a> pour l’adresse du dossier de données.</p>
    </div>
    <?php
}

function hrw_render_settings_page() {
    if (!current_user_can('manage_options')) {
        return;
    }
    ?>
    <div class="wrap">
        <h1>Carte de Vigilance HARMONIE</h1>
        <form action="options.php" method="post">
            <?php
            settings_fields('hrw_settings');
            do_settings_sections('harmonie-risques');
            submit_button();
            ?>
        </form>
        <h2>Shortcodes</h2>
        <p><code>[harmonie_risques]</code></p>
        <p><code>[harmonie_risques departement="75" alea="orages"]</code></p>
    </div>
    <?php
}

function hrw_base_url() {
    $url = get_option(HRW_OPTION_BASE_URL, HRW_DEFAULT_BASE_URL);
    return untrailingslashit(apply_filters('hrw_risques_data_base_url', $url));
}

function hrw_department_code($value) {
    $code = strtoupper(trim((string) $value));
    return preg_match('/^(?:\d{2}|2A|2B)$/', $code) ? $code : '';
}

function hrw_hazard_code($value) {
    $allowed = array(
        'orages', 'grele', 'pluie_inondation', 'vent', 'neige_verglas',
        'chaleur', 'froid', 'brouillard', 'feu',
    );
    $code = strtolower(trim((string) $value));
    return in_array($code, $allowed, true) ? $code : 'orages';
}

function hrw_unique_identifier() {
    if (function_exists('wp_unique_id')) {
        return wp_unique_id('hrw-');
    }
    return 'hrw-' . wp_rand(1000, 999999);
}

function hrw_render_shortcode($atts) {
    $atts = shortcode_atts(
        array(
            'departement' => '',
            'alea' => 'orages',
            'titre' => 'Vigilance météo HARMONIE',
        ),
        $atts,
        'harmonie_risques'
    );

    $department = hrw_department_code($atts['departement']);
    $hazard = hrw_hazard_code($atts['alea']);
    $title = trim(sanitize_text_field($atts['titre']));
    if ($title === '') {
        $title = 'Vigilance météo HARMONIE';
    }

    $input_id = hrw_unique_identifier();

    wp_enqueue_style('hrw-carte');
    wp_enqueue_script('hrw-carte');

    ob_start();
    ?>
    <section
        class="hrw-card"
        data-hrw-app
        data-base-url="<?php echo esc_url(hrw_base_url()); ?>"
        data-geojson-url="<?php echo esc_url(plugin_dir_url(__FILE__) . 'assets/departements-france.geojson'); ?>"
        data-default-department="<?php echo esc_attr($department); ?>"
        data-default-hazard="<?php echo esc_attr($hazard); ?>"
        data-timezone="<?php echo esc_attr(wp_timezone_string()); ?>"
    >
        <header class="hrw-header">
            <div>
                <p class="hrw-kicker">VIGILANCE NON OFFICIELLE • MODÈLE HARMONIE</p>
                <h2><?php echo esc_html($title); ?></h2>
                <p class="hrw-meta" data-hrw-run>Chargement du dernier run…</p>
            </div>
        </header>

        <div class="hrw-search">
            <label for="<?php echo esc_attr($input_id); ?>">Rechercher une commune</label>
            <div class="hrw-search-control">
                <span class="hrw-search-icon" aria-hidden="true">⌕</span>
                <input
                    id="<?php echo esc_attr($input_id); ?>"
                    class="hrw-city-input"
                    type="search"
                    placeholder="Nom de commune ou code postal"
                    autocomplete="off"
                    spellcheck="false"
                >
            </div>
            <button type="button" class="hrw-locate-button" data-hrw-locate>📍 Me géolocaliser</button>
            <div class="hrw-search-results" data-hrw-search-results role="listbox" hidden></div>
        </div>

        <div class="hrw-toolbar">
            <div class="hrw-hazard-tabs" role="tablist" aria-label="Aléa" data-hrw-hazard-tabs></div>
            <div class="hrw-day-tabs" role="tablist" aria-label="Échéance" data-hrw-day-tabs></div>
        </div>

        <p class="hrw-fire-disclaimer" data-hrw-fire-disclaimer hidden></p>

        <div class="hrw-body">
            <div class="hrw-map-wrap">
                <svg class="hrw-map" data-hrw-map viewBox="0 0 1000 1000" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Carte des départements de France"></svg>
                <div class="hrw-map-loading" data-hrw-map-loading>Chargement de la carte…</div>
                <div class="hrw-map-inset-wrap">
                    <svg class="hrw-inset-map" data-hrw-inset-map viewBox="0 0 300 300" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Carte détaillée de l’Île-de-France"></svg>
                    <span class="hrw-inset-label">Île-de-France</span>
                </div>
                <div class="hrw-legend" data-hrw-legend></div>
                <div class="hrw-map-tools">
                    <button type="button" data-hrw-capture title="Capturer l’image affichée">📷 Capture PNG</button>
                    <button type="button" data-hrw-copy title="Copier la vue dans le presse-papiers">📋 Copier la vue</button>
                </div>
            </div>

            <div class="hrw-detail" data-hrw-detail>
                <p class="hrw-detail-placeholder" data-hrw-detail-placeholder>Cliquez sur un département ou recherchez une commune.</p>
                <div class="hrw-detail-content" data-hrw-detail-content hidden>
                    <h3 data-hrw-detail-title></h3>
                    <div class="hrw-detail-grid" data-hrw-detail-grid></div>
                    <div class="hrw-frise" data-hrw-frise>
                        <h4>Frise horaire — <span data-hrw-frise-hazard></span></h4>
                        <div class="hrw-frise-track" data-hrw-frise-track></div>
                        <div class="hrw-frise-labels" data-hrw-frise-labels></div>
                    </div>
                    <div class="hrw-advice" data-hrw-advice>
                        <h4>Détails des phénomènes</h4>
                        <p class="hrw-advice-subtitle">Bonnes pratiques</p>
                        <p class="hrw-advice-text" data-hrw-advice-text></p>
                    </div>
                </div>
            </div>
        </div>

        <footer class="hrw-footer">
            <span data-hrw-generated>Mise à jour en cours de lecture…</span>
            <span>
                Données dérivées de
                <a href="https://dataplatform.knmi.nl/dataset/harmonie-arome-cy43-p3-1-0" target="_blank" rel="noopener noreferrer">HARMONIE-AROME Cy43 (KNMI)</a>
                • Contours départementaux : IGN / data.gouv.fr (licence ouverte)
            </span>
            <span class="hrw-plugin-version">Plugin Vigilance HARMONIE v<?php echo esc_html(HRW_VERSION); ?> (<?php echo esc_html(HRW_RELEASE_DATE); ?>)</span>
        </footer>

        <noscript>
            <p class="hrw-message hrw-error">JavaScript doit être activé pour afficher la carte de vigilance.</p>
        </noscript>
    </section>
    <?php
    return ob_get_clean();
}
