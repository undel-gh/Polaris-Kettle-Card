/**
 * Kettle Card
 * A single custom Lovelace card for a smart kettle (water_heater + switches +
 * select + light + sensors), built for Home Assistant.
 *
 * No build step required — plain Custom Element, works by dropping the file
 * into www/ or installing through HACS as a Lovelace plugin.
 */
(() => {
  const CARD_VERSION = '1.0.0';
  // eslint-disable-next-line no-console
  console.info(
    '%c KETTLE-CARD %c v' + CARD_VERSION + ' ',
    'color:#fff;background:#2AA9C4;font-weight:700;border-radius:3px 0 0 3px;padding:2px 0 2px 6px;',
    'color:#2AA9C4;background:transparent;font-weight:700;padding:2px 6px 2px 0;'
  );

  // ---------------------------------------------------------------------
  // Static metadata: labels & icons for select/select_mode options and for
  // water_heater operation modes. Override any of these from the card
  // config (preset_labels / mode_labels) if your integration differs.
  // ---------------------------------------------------------------------
  const DEFAULT_PRESET_META = {
    not_selected: { label: 'Не выбрано', icon: 'mdi:close-circle-outline' },
    black_tea: { label: 'Чёрный чай', icon: 'mdi:tea' },
    baby_bottle: { label: 'Детская смесь', icon: 'mdi:baby-bottle-outline' },
    instant_coffee: { label: 'Растворимый кофе', icon: 'mdi:coffee' },
    green_tea: { label: 'Зелёный чай', icon: 'mdi:leaf' },
    flower_tea: { label: 'Цветочный чай', icon: 'mdi:flower-tulip-outline' },
    tea_bag: { label: 'Чай в пакетике', icon: 'mdi:bag-personal-outline' },
    red_tea: { label: 'Красный чай', icon: 'mdi:tea' },
    puerh_tea: { label: 'Пуэр', icon: 'mdi:tea' },
    oolong_tea: { label: 'Улун', icon: 'mdi:tea' },
    white_tea: { label: 'Белый чай', icon: 'mdi:tea' },
    herbal_tea: { label: 'Травяной чай', icon: 'mdi:sprout-outline' },
  };

  // Confirmed labels for this kettle's water_heater operation_list
  // (off, performance, electric, heat_pump, eco), in that order.
  const DEFAULT_MODE_META = {
    off: { label: 'Выключен', icon: 'mdi:power' },
    performance: { label: 'Кипячение', icon: 'mdi:kettle-steam' },
    electric: { label: 'IQ Кипячение', icon: 'mdi:creation' },
    heat_pump: { label: 'Удержание', title: 'Разогрев с удержанием', icon: 'mdi:thermometer-lines' },
    eco: { label: 'Разогрев', icon: 'mdi:fire' },
  };

  const ENTITY_KEYS = [
    'water_heater',
    'temperature',
    'mode_select',
    'night_light',
    'backlight',
    'child_lock',
    'sound',
    'available',
    'error',
    'rssi',
    'firmware',
    'device_type',
  ];

  // A small curated palette for the night light color picker — kept as
  // discrete swatches (rather than a continuous color input) so a single
  // tap sets the color without relying on a native picker that could get
  // interrupted by a re-render.
  const NIGHT_LIGHT_SWATCHES = [
    '#ffffff',
    '#ffb74d',
    '#ff5252',
    '#e91e8c',
    '#7c4dff',
    '#2979ff',
    '#26c6da',
    '#4caf50',
  ];

  function hexToRgb(hex) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [255, 255, 255];
  }

  function clamp(v, min, max) {
    return Math.min(max, Math.max(min, v));
  }

  function signalBars(rssi) {
    const n = Number(rssi);
    if (Number.isNaN(n)) return 0;
    if (n >= -50) return 4;
    if (n >= -60) return 3;
    if (n >= -70) return 2;
    if (n >= -80) return 1;
    return 0;
  }

  class KettleCard extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
      this._config = null;
      this._hass = null;
      this._built = false;
    }

    setConfig(config) {
      if (!config || !config.entities || !config.entities.water_heater) {
        throw new Error(
          'kettle-card: в конфигурации нужно указать как минимум entities.water_heater'
        );
      }
      this._config = {
        name: 'Чайник',
        ...config,
        entities: { ...config.entities },
      };
      this._presetMeta = { ...DEFAULT_PRESET_META, ...(config.preset_labels || {}) };
      this._modeMeta = { ...DEFAULT_MODE_META, ...(config.mode_labels || {}) };
      this._built = false;
      this._render();
    }

    set hass(hass) {
      this._hass = hass;
      this._render();
    }

    getCardSize() {
      return 6;
    }

    static getStubConfig(hass) {
      // Try to auto-detect a kettle by locating a water_heater entity and
      // guessing sibling entity ids that share the same device prefix.
      const entities = {};
      if (hass && hass.states) {
        const wh = Object.keys(hass.states).find((id) => id.startsWith('water_heater.'));
        if (wh) {
          const base = wh.split('.')[1].replace(/_water_heater$/, '');
          entities.water_heater = wh;
          const guess = (domain, suffix) => `${domain}.${base}_${suffix}`;
          const tryIt = (id) => (hass.states[id] ? id : undefined);
          entities.temperature = tryIt(guess('sensor', 'temperature'));
          entities.mode_select = tryIt(guess('select', 'select_mode_kettle'));
          entities.night_light = tryIt(guess('light', 'night'));
          entities.backlight = tryIt(guess('switch', 'backlight'));
          entities.child_lock = tryIt(guess('switch', 'child_lock'));
          entities.sound = tryIt(guess('switch', 'sound'));
          entities.available = tryIt(guess('binary_sensor', 'available'));
          entities.error = tryIt(guess('sensor', 'error'));
          entities.rssi = tryIt(guess('sensor', 'rssi'));
          entities.firmware = tryIt(guess('sensor', 'firmware_version'));
          entities.device_type = tryIt(guess('sensor', 'device_type'));
          Object.keys(entities).forEach((k) => entities[k] === undefined && delete entities[k]);
        }
      }
      return { type: 'custom:kettle-card', name: 'Чайник', entities };
    }

    static getConfigElement() {
      return document.createElement('kettle-card-editor');
    }

    // -- helpers ------------------------------------------------------
    _state(key) {
      const id = this._config.entities[key];
      if (!id || !this._hass) return undefined;
      return this._hass.states[id];
    }

    _call(domain, service, data) {
      if (!this._hass) return;
      this._hass.callService(domain, service, data);
    }

    _moreInfo(key) {
      const id = this._config.entities[key];
      if (!id) return;
      this.dispatchEvent(
        new CustomEvent('hass-more-info', {
          detail: { entityId: id },
          bubbles: true,
          composed: true,
        })
      );
    }

    // -- render ---------------------------------------------------------
    _render() {
      if (!this._config || !this._hass) return;

      const whState = this._state('water_heater');
      if (!whState) {
        this.shadowRoot.innerHTML = `<ha-card><div style="padding:16px;">Сущность water_heater не найдена</div></ha-card>`;
        return;
      }

      const attrs = whState.attributes || {};
      const currentTemp = attrs.current_temperature ?? attrs.temperature ?? 0;
      const targetTemp = attrs.temperature ?? 100;
      const minTemp = attrs.min_temp ?? 30;
      const maxTemp = attrs.max_temp ?? 100;
      const step = attrs.target_temp_step ?? 5;
      const opMode = attrs.operation_mode ?? whState.state ?? 'off';
      const opList = attrs.operation_list || Object.keys(this._modeMeta);
      const heating = opMode && opMode !== 'off';

      const tempSensor = this._state('temperature');
      const displayTemp = tempSensor ? parseFloat(tempSensor.state) : currentTemp;

      const available = this._state('available');
      const isAvailable = available ? available.state === 'on' : true;

      const errorEnt = this._state('error');
      const hasError = errorEnt && errorEnt.state && errorEnt.state !== 'no_error';

      const modeSelect = this._state('mode_select');
      const presetOptions = modeSelect ? modeSelect.attributes.options || [] : [];
      const presetSelected = modeSelect ? modeSelect.state : null;

      const backlightSw = this._state('backlight');
      const childLockSw = this._state('child_lock');
      const soundSw = this._state('sound');
      const nightLight = this._state('night_light');

      const rssi = this._state('rssi');
      const firmware = this._state('firmware');
      const deviceType = this._state('device_type');

      const fillPct = clamp(((displayTemp - 20) / (100 - 20)) * 100, 4, 100);

      const presetChips = presetOptions
        .map((opt) => {
          const meta = this._presetMeta[opt] || { label: opt, icon: 'mdi:cup' };
          const active = opt === presetSelected;
          return `<button class="chip ${active ? 'chip-active' : ''}" data-action="preset" data-value="${opt}" title="${meta.label}">
            <ha-icon icon="${meta.icon}"></ha-icon><span>${meta.label}</span>
          </button>`;
        })
        .join('');

      const modeChips = opList
        .filter((m) => m !== 'off')
        .map((m) => {
          const meta = this._modeMeta[m] || { label: m, icon: 'mdi:tune' };
          const active = m === opMode;
          return `<button class="chip mode-chip ${active ? 'chip-active' : ''}" data-action="mode" data-value="${m}" title="${meta.label}">
            <ha-icon icon="${meta.icon}"></ha-icon><span>${meta.label}</span>
          </button>`;
        })
        .join('');

      const toggleChip = (key, stateObj, icon, label) => {
        if (!stateObj) return '';
        const on = stateObj.state === 'on';
        return `<button class="toggle ${on ? 'toggle-on' : ''}" data-action="toggle" data-key="${key}" title="${label}">
          <ha-icon icon="${icon}"></ha-icon><span>${label}</span>
        </button>`;
      };

      let nightLightPanel = '';
      if (nightLight) {
        const nlOn = nightLight.state === 'on';
        const nlAttrs = nightLight.attributes || {};
        const brightness = nlAttrs.brightness ?? 255;
        const brightnessPct = Math.round((brightness / 255) * 100);
        const swatches = NIGHT_LIGHT_SWATCHES.map(
          (hex) =>
            `<button class="swatch" style="background:${hex}" data-action="nl-color" data-hex="${hex}" title="${hex}"></button>`
        ).join('');
        nightLightPanel = `
          <div class="section-label" data-action="more-info" data-key="night_light">Ночник</div>
          <div class="night-light-panel">
            <button class="toggle ${nlOn ? 'toggle-on' : ''}" data-action="toggle" data-key="night_light" title="Ночник">
              <ha-icon icon="mdi:weather-night"></ha-icon><span>${nlOn ? 'Вкл' : 'Выкл'}</span>
            </button>
            <div class="swatches">${swatches}</div>
            <div class="stepper">
              <button class="step-btn" data-action="nl-bright-down">
                <ha-icon icon="mdi:brightness-4"></ha-icon>
              </button>
              <span class="step-value">${brightnessPct}%</span>
              <button class="step-btn" data-action="nl-bright-up">
                <ha-icon icon="mdi:brightness-6"></ha-icon>
              </button>
            </div>
          </div>`;
      }

      const bars = signalBars(rssi ? rssi.state : undefined);

      this.shadowRoot.innerHTML = `
        <style>${this._css()}</style>
        <ha-card>
          <div class="header">
            <div class="title-row" data-action="more-info" data-key="water_heater">
              <ha-icon icon="mdi:kettle"></ha-icon>
              <span class="title">${this._config.name}</span>
            </div>
            <div class="status-row" data-action="more-info" data-key="available" title="${isAvailable ? 'В сети' : 'Нет связи'}">
              <span class="dot ${isAvailable ? 'dot-online' : 'dot-offline'}"></span>
              <ha-icon icon="mdi:wifi" class="signal signal-${bars}"></ha-icon>
            </div>
          </div>

          ${
            hasError
              ? `<div class="error-banner" data-action="more-info" data-key="error">
                  <ha-icon icon="mdi:alert-circle"></ha-icon>
                  <span>Ошибка: ${errorEnt.state}</span>
                </div>`
              : ''
          }

          <div class="body">
            <div class="vessel-wrap">
              <div class="vessel">
                <div class="steam ${heating ? 'steam-on' : ''}">
                  <span></span><span></span><span></span>
                </div>
                <div class="glass">
                  <div class="fill" style="height:${fillPct}%"></div>
                </div>
              </div>
              <div class="readout" data-action="more-info" data-key="temperature">
                <span class="readout-value">${Number.isFinite(displayTemp) ? displayTemp.toFixed(0) : '--'}</span>
                <span class="readout-unit">°C</span>
              </div>
              <div class="readout-sub">${heating ? 'Нагрев…' : 'Ожидание'} · цель ${targetTemp}°C</div>
            </div>

            <div class="controls">
              <button class="power-btn ${heating ? 'power-on' : ''}" data-action="power">
                <ha-icon icon="${heating ? 'mdi:kettle-steam' : 'mdi:kettle'}"></ha-icon>
                <span>${heating ? 'Остановить' : 'Вскипятить'}</span>
              </button>

              <div class="target-row">
                <span class="target-label">Целевая температура</span>
                <div class="stepper">
                  <button class="step-btn" data-action="temp-down" ${targetTemp <= minTemp ? 'disabled' : ''}>
                    <ha-icon icon="mdi:minus"></ha-icon>
                  </button>
                  <span class="step-value">${targetTemp}°C</span>
                  <button class="step-btn" data-action="temp-up" ${targetTemp >= maxTemp ? 'disabled' : ''}>
                    <ha-icon icon="mdi:plus"></ha-icon>
                  </button>
                </div>
              </div>

              <div class="section-label">Режим нагрева</div>
              <div class="chip-row">${modeChips}</div>

              ${
                presetOptions.length
                  ? `<div class="section-label" data-action="more-info" data-key="mode_select">Напиток</div>
                     <div class="chip-row">${presetChips}</div>`
                  : ''
              }

              <div class="section-label">Дополнительно</div>
              <div class="toggle-row">
                ${toggleChip('backlight', backlightSw, 'mdi:led-outline', 'Подсветка')}
                ${toggleChip('sound', soundSw, 'mdi:volume-high', 'Звук')}
                ${toggleChip('child_lock', childLockSw, 'mdi:lock', 'Блокировка')}
              </div>

              ${nightLightPanel}
            </div>
          </div>

          <div class="footer">
            ${firmware ? `<span data-action="more-info" data-key="firmware">Прошивка ${firmware.state}</span>` : ''}
            ${rssi ? `<span data-action="more-info" data-key="rssi">RSSI ${rssi.state} dB</span>` : ''}
            ${deviceType ? `<span data-action="more-info" data-key="device_type">Тип ${deviceType.state}</span>` : ''}
          </div>
        </ha-card>
      `;

      this._bind({ opMode, targetTemp, minTemp, maxTemp, step });
    }

    _bind({ opMode, targetTemp, minTemp, maxTemp, step }) {
      const root = this.shadowRoot;
      const whId = this._config.entities.water_heater;

      root.querySelectorAll('[data-action="more-info"]').forEach((el) => {
        el.addEventListener('click', (ev) => {
          ev.stopPropagation();
          this._moreInfo(el.getAttribute('data-key'));
        });
      });

      const powerBtn = root.querySelector('.power-btn');
      if (powerBtn) {
        powerBtn.addEventListener('click', () => {
          const nextMode = opMode !== 'off' ? 'off' : this._config.default_mode || 'electric';
          this._call('water_heater', 'set_operation_mode', {
            entity_id: whId,
            operation_mode: nextMode,
          });
        });
      }

      root.querySelectorAll('[data-action="mode"]').forEach((el) => {
        el.addEventListener('click', () => {
          this._call('water_heater', 'set_operation_mode', {
            entity_id: whId,
            operation_mode: el.getAttribute('data-value'),
          });
        });
      });

      root.querySelectorAll('[data-action="preset"]').forEach((el) => {
        el.addEventListener('click', () => {
          this._call('select', 'select_option', {
            entity_id: this._config.entities.mode_select,
            option: el.getAttribute('data-value'),
          });
        });
      });

      const stepUp = root.querySelector('[data-action="temp-up"]');
      if (stepUp) {
        stepUp.addEventListener('click', () => {
          const next = clamp(targetTemp + step, minTemp, maxTemp);
          this._call('water_heater', 'set_temperature', { entity_id: whId, temperature: next });
        });
      }
      const stepDown = root.querySelector('[data-action="temp-down"]');
      if (stepDown) {
        stepDown.addEventListener('click', () => {
          const next = clamp(targetTemp - step, minTemp, maxTemp);
          this._call('water_heater', 'set_temperature', { entity_id: whId, temperature: next });
        });
      }

      root.querySelectorAll('[data-action="toggle"]').forEach((el) => {
        el.addEventListener('click', () => {
          const key = el.getAttribute('data-key');
          const entityId = this._config.entities[key];
          if (!entityId) return;
          const domain = entityId.split('.')[0];
          this._call(domain, 'toggle', { entity_id: entityId });
        });
      });

      const nlId = this._config.entities.night_light;
      if (nlId) {
        root.querySelectorAll('[data-action="nl-color"]').forEach((el) => {
          el.addEventListener('click', () => {
            const rgb = hexToRgb(el.getAttribute('data-hex'));
            this._call('light', 'turn_on', { entity_id: nlId, rgb_color: rgb });
          });
        });

        const nightLight = this._state('night_light');
        const currentBrightness = (nightLight && nightLight.attributes.brightness) ?? 255;

        const brightUp = root.querySelector('[data-action="nl-bright-up"]');
        if (brightUp) {
          brightUp.addEventListener('click', () => {
            const next = clamp(currentBrightness + 26, 1, 255);
            this._call('light', 'turn_on', { entity_id: nlId, brightness: next });
          });
        }
        const brightDown = root.querySelector('[data-action="nl-bright-down"]');
        if (brightDown) {
          brightDown.addEventListener('click', () => {
            const next = clamp(currentBrightness - 26, 1, 255);
            this._call('light', 'turn_on', { entity_id: nlId, brightness: next });
          });
        }
      }
    }

    _css() {
      return `
        :host {
          --kc-water-cold: #2aa9c4;
          --kc-water-hot: #ff7a3c;
          --kc-glass-border: var(--divider-color, #e0e0e0);
        }
        ha-card {
          padding: 0;
          overflow: hidden;
        }
        .header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 16px 0 16px;
        }
        .title-row {
          display: flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
        }
        .title-row ha-icon {
          color: var(--kc-water-hot);
        }
        .title {
          font-size: 1.15em;
          font-weight: 600;
          color: var(--primary-text-color);
        }
        .status-row {
          display: flex;
          align-items: center;
          gap: 6px;
          cursor: pointer;
        }
        .dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          display: inline-block;
        }
        .dot-online { background: #43a047; }
        .dot-offline { background: #bdbdbd; }
        .signal { color: var(--secondary-text-color); --mdc-icon-size: 18px; }
        .signal-0, .signal-1 { color: #e0a800; }
        .error-banner {
          margin: 10px 16px 0 16px;
          padding: 8px 10px;
          border-radius: 8px;
          background: rgba(255, 82, 82, 0.12);
          color: #ff5252;
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 0.9em;
          cursor: pointer;
        }
        .body {
          display: flex;
          gap: 16px;
          padding: 16px;
          flex-wrap: wrap;
        }
        .vessel-wrap {
          flex: 0 0 120px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
        }
        .vessel {
          position: relative;
          width: 84px;
          height: 130px;
          display: flex;
          align-items: flex-end;
          justify-content: center;
        }
        .steam {
          position: absolute;
          top: -22px;
          display: flex;
          gap: 6px;
          opacity: 0;
          transition: opacity 0.4s ease;
        }
        .steam-on { opacity: 0.8; }
        .steam span {
          width: 3px;
          height: 16px;
          border-radius: 2px;
          background: var(--secondary-text-color);
          animation: kc-rise 1.6s ease-in-out infinite;
          opacity: 0.6;
        }
        .steam span:nth-child(2) { animation-delay: 0.3s; }
        .steam span:nth-child(3) { animation-delay: 0.6s; }
        @keyframes kc-rise {
          0% { transform: translateY(6px) scaleY(0.6); opacity: 0; }
          40% { opacity: 0.7; }
          100% { transform: translateY(-14px) scaleY(1.1); opacity: 0; }
        }
        .glass {
          position: relative;
          width: 74px;
          height: 118px;
          border-radius: 14px 14px 20px 20px;
          border: 2px solid var(--kc-glass-border);
          overflow: hidden;
          background: var(--card-background-color, #fff);
        }
        .fill {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          background: linear-gradient(180deg, var(--kc-water-hot), var(--kc-water-cold));
          transition: height 0.6s ease;
        }
        .readout {
          display: flex;
          align-items: baseline;
          gap: 2px;
          font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
        }
        .readout-value {
          font-size: 1.9em;
          font-weight: 700;
          color: var(--primary-text-color);
          letter-spacing: -0.5px;
        }
        .readout-unit {
          font-size: 0.95em;
          color: var(--secondary-text-color);
        }
        .readout-sub {
          font-size: 0.78em;
          color: var(--secondary-text-color);
          text-align: center;
        }
        .controls {
          flex: 1 1 220px;
          display: flex;
          flex-direction: column;
          gap: 10px;
          min-width: 200px;
        }
        .power-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          border: none;
          border-radius: 999px;
          padding: 10px 16px;
          font-size: 1em;
          font-weight: 600;
          background: var(--secondary-background-color, #eee);
          color: var(--primary-text-color);
          cursor: pointer;
          transition: background 0.25s ease, color 0.25s ease;
        }
        .power-btn.power-on {
          background: var(--kc-water-hot);
          color: #fff;
        }
        .target-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }
        .target-label {
          font-size: 0.85em;
          color: var(--secondary-text-color);
        }
        .stepper {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .step-btn {
          width: 30px;
          height: 30px;
          border-radius: 50%;
          border: 1px solid var(--divider-color, #e0e0e0);
          background: transparent;
          color: var(--primary-text-color);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }
        .step-btn:disabled {
          opacity: 0.35;
          cursor: default;
        }
        .step-value {
          min-width: 48px;
          text-align: center;
          font-weight: 600;
          font-family: 'SFMono-Regular', Consolas, monospace;
        }
        .section-label {
          font-size: 0.78em;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: var(--secondary-text-color);
          margin-top: 2px;
        }
        .chip-row, .toggle-row {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }
        .chip {
          display: flex;
          align-items: center;
          gap: 4px;
          border: 1px solid var(--divider-color, #e0e0e0);
          background: transparent;
          color: var(--primary-text-color);
          border-radius: 999px;
          padding: 4px 9px;
          font-size: 0.76em;
          white-space: nowrap;
          cursor: pointer;
        }
        .chip ha-icon {
          --mdc-icon-size: 14px;
        }
        .chip-active {
          background: var(--kc-water-cold);
          border-color: var(--kc-water-cold);
          color: #fff;
        }
        .night-light-panel {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 8px;
        }
        .swatches {
          display: flex;
          gap: 4px;
        }
        .swatch {
          width: 20px;
          height: 20px;
          border-radius: 50%;
          border: 1px solid var(--divider-color, #e0e0e0);
          padding: 0;
          cursor: pointer;
        }
        .toggle {
          display: flex;
          align-items: center;
          gap: 4px;
          border: 1px solid var(--divider-color, #e0e0e0);
          background: transparent;
          color: var(--secondary-text-color);
          border-radius: 8px;
          padding: 6px 8px;
          font-size: 0.78em;
          cursor: pointer;
        }
        .toggle ha-icon {
          --mdc-icon-size: 16px;
        }
        .toggle-on {
          background: rgba(42, 169, 196, 0.15);
          border-color: var(--kc-water-cold);
          color: var(--kc-water-cold);
        }
        .footer {
          display: flex;
          gap: 14px;
          flex-wrap: wrap;
          padding: 8px 16px 14px 16px;
          font-size: 0.72em;
          color: var(--secondary-text-color);
          cursor: default;
        }
        .footer span { cursor: pointer; }
      `;
    }
  }

  // -----------------------------------------------------------------
  // Minimal visual editor (entity pickers) for the Lovelace UI editor
  // -----------------------------------------------------------------
  class KettleCardEditor extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
      this._built = false;
    }

    setConfig(config) {
      this._config = { entities: {}, ...config };
      if (!this._built) {
        this._buildDom();
        this._built = true;
      }
      this._syncValues();
    }

    set hass(hass) {
      this._hass = hass;
      if (!this._built && this._config) {
        this._buildDom();
        this._built = true;
        this._syncValues();
      }
      // IMPORTANT: do NOT reassign `.hass` on pickers that already have it.
      // hass updates arrive several times a second (the kettle's own
      // temperature/rssi sensors keep changing), and re-setting `.hass` on
      // an already-initialized ha-entity-picker makes it re-render
      // internally, which closes any dropdown the user currently has open.
      // Each picker only needs `hass` once to build its entity list; giving
      // it fresh data afterward isn't worth breaking mid-selection.
      if (this.shadowRoot) {
        this.shadowRoot.querySelectorAll('ha-entity-picker').forEach((picker) => {
          if (!picker.hass) picker.hass = hass;
        });
      }
    }

    _fieldDef() {
      return [
        ['water_heater', 'water_heater', 'Нагрев (обязательно)'],
        ['temperature', 'sensor', 'Температура'],
        ['mode_select', 'select', 'Предустановки напитков'],
        ['night_light', 'light', 'Ночник'],
        ['backlight', 'switch', 'Подсветка'],
        ['child_lock', 'switch', 'Блокировка'],
        ['sound', 'switch', 'Звук'],
        ['available', 'binary_sensor', 'Доступность'],
        ['error', 'sensor', 'Ошибка'],
        ['rssi', 'sensor', 'RSSI'],
        ['firmware', 'sensor', 'Прошивка'],
        ['device_type', 'sensor', 'Тип устройства'],
      ];
    }

    // Builds the static markup + pickers exactly once. Called either from
    // setConfig or from the first hass assignment, whichever happens first.
    _buildDom() {
      const nameRow = `
        <div class="row">
          <label>Название карточки</label>
          <input id="name" type="text" />
        </div>`;

      const rows = this._fieldDef()
        .map(
          ([key, domain, label]) => `
        <div class="row">
          <label>${label}</label>
          <ha-entity-picker
            data-key="${key}"
            .includeDomains='["${domain}"]'
            allow-custom-entity
          ></ha-entity-picker>
        </div>`
        )
        .join('');

      this.shadowRoot.innerHTML = `
        <style>
          .row { display: flex; align-items: center; gap: 12px; padding: 6px 0; }
          label { flex: 0 0 180px; font-size: 0.85em; color: var(--secondary-text-color); }
          input { flex: 1; padding: 6px 8px; border-radius: 6px; border: 1px solid var(--divider-color, #ccc); background: var(--card-background-color); color: var(--primary-text-color); }
          ha-entity-picker { flex: 1; }
        </style>
        <div class="editor">${nameRow}${rows}</div>
      `;

      this.shadowRoot.querySelectorAll('ha-entity-picker').forEach((picker) => {
        if (this._hass) picker.hass = this._hass;
        picker.addEventListener('value-changed', (ev) => {
          ev.stopPropagation();
          const key = picker.getAttribute('data-key');
          const entities = { ...this._config.entities, [key]: ev.detail.value };
          this._config = { ...this._config, entities };
          this._fireChanged();
        });
      });

      const nameInput = this.shadowRoot.getElementById('name');
      nameInput.addEventListener('change', () => {
        this._config = { ...this._config, name: nameInput.value };
        this._fireChanged();
      });
    }

    // Pushes current config values into the already-built inputs/pickers
    // without touching the DOM structure, so nothing loses focus.
    _syncValues() {
      if (!this.shadowRoot) return;
      const nameInput = this.shadowRoot.getElementById('name');
      if (nameInput && nameInput.value !== (this._config.name || '') && document.activeElement !== nameInput) {
        nameInput.value = this._config.name || '';
      }
      this.shadowRoot.querySelectorAll('ha-entity-picker').forEach((picker) => {
        const key = picker.getAttribute('data-key');
        const desired = this._config.entities[key] || '';
        if (picker.value !== desired) picker.value = desired;
      });
    }

    _fireChanged() {
      this.dispatchEvent(
        new CustomEvent('config-changed', {
          detail: { config: this._config },
          bubbles: true,
          composed: true,
        })
      );
    }
  }

  customElements.define('kettle-card', KettleCard);
  customElements.define('kettle-card-editor', KettleCardEditor);

  window.customCards = window.customCards || [];
  window.customCards.push({
    type: 'kettle-card',
    name: 'Kettle Card',
    description: 'Единая карточка для умного чайника: нагрев, режимы, напитки, статус.',
    preview: true,
  });
})();
