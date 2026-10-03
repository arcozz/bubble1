// ==UserScript==
// @name           Tab Open Animations
// @version        1.0
// @description    Animation visible a l'ouverture d'un onglet (Explosion, Aimant, Vol depuis la droite).
// @compatibility  Firefox 100+
// ==/UserScript==

(() => {
    const STYLE_ID = 'tab-open-animations-styles';
    const PREF_PREFIX = 'extension.middle-click-tab-animation.';
    const STARTUP_GRACE_MS = 3000;   // ignore les onglets restaures au demarrage

    const DEFAULTS = { style: 'explosion', speed: 100, debug: false };

    const COLOR = 'var(--mcs-color)';
    const CONF = [COLOR, '#ff5d73', '#ffd166', '#06d6a0', '#4cc9f0', '#b388ff'];

    let S = 1;        // facteur de duree (1 = normal, 2 = deux fois plus lent)
    let ready = false;
    let cfg = null;

    /* ---------- prefs ---------- */

    function readPref(key, fallback) {
        const fullKey = PREF_PREFIX + key;
        try {
            switch (Services.prefs.getPrefType(fullKey)) {
                case Services.prefs.PREF_INT: return Services.prefs.getIntPref(fullKey);
                case Services.prefs.PREF_BOOL: return Services.prefs.getBoolPref(fullKey);
                case Services.prefs.PREF_STRING: return Services.prefs.getCharPref(fullKey);
            }
        } catch (_) { /* pref absente */ }
        return fallback;
    }

    function readConfig() {
        let speed = parseInt(readPref('speed', DEFAULTS.speed), 10);
        if (Number.isNaN(speed)) speed = DEFAULTS.speed;
        speed = Math.min(300, Math.max(25, speed));
        const dbg = readPref('debug', DEFAULTS.debug);
        return {
            style: String(readPref('animation-style', DEFAULTS.style)),
            slow: 100 / speed,
            debug: dbg === true || dbg === 'true',
        };
    }

    /* ---------- styles + helpers ---------- */

    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            .mcs-container {
                position: absolute;
                width: 0;
                height: 0;
                pointer-events: none;
                z-index: 99999;
                --mcs-color: color-mix(in srgb, var(--zen-primary-color, #7F77DD), #e6e8e6);
            }
            .mcs-item {
                position: absolute;
                pointer-events: none;
                will-change: transform, opacity;
            }
        `;
        document.head.appendChild(style);
    }

    function getAnimationParent() {
        return document.getElementById('browser')
            || document.getElementById('main-window')
            || document.documentElement;
    }

    const rand = (a, b) => a + Math.random() * (b - a);

    function dot(c, w, h, bg, radius) {
        const e = document.createElement('div');
        e.className = 'mcs-item';
        e.style.cssText += `width:${w}px;height:${h}px;left:${-w / 2}px;top:${-h / 2}px;background:${bg};border-radius:${radius}`;
        c.appendChild(e);
        return e;
    }

    function ring(c, size, delay, dur, bw) {
        const e = dot(c, size, size, 'transparent', '50%');
        e.style.border = `${bw}px solid ${COLOR}`;
        e.animate(
            [{ transform: 'scale(.05)', opacity: 0.9 }, { transform: 'scale(1)', opacity: 0 }],
            { duration: dur * S, delay: delay * S, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'both' }
        );
    }

    function sparks(c, n, dist) {
        for (let i = 0; i < n; i++) {
            const e = dot(c, rand(14, 22), 3, COLOR, '2px');
            const a = i * (360 / n) + rand(-8, 8);
            const d = dist * rand(0.7, 1.2);
            e.animate([
                { transform: `rotate(${a}deg) translateX(20px)`, opacity: 1 },
                { transform: `rotate(${a}deg) translateX(${d}px) scaleX(.2)`, opacity: 0 },
            ], { duration: 650 * S, easing: 'ease-out', fill: 'forwards' });
        }
    }

    /* ---------- animations ---------- */

    const EFFECTS = {
        // Le nouvel onglet gonfle d'un coup, ondes de choc + eclats autour
        explosion(tab, r, c) {
            tab.animate([
                { transform: 'scale(0) rotate(-15deg)', opacity: 0 },
                { transform: 'scale(1.4) rotate(4deg)', opacity: 1, offset: 0.5 },
                { transform: 'scale(1)', opacity: 1 },
            ], { duration: 550 * S, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'backwards' });
            ring(c, 380, 0, 700, 4);
            ring(c, 240, 120, 600, 3);
            sparks(c, 20, 190);
        },

        // Des particules sont aspirees vers l'emplacement, puis l'onglet "pop"
        aimant(tab, r, c) {
            tab.animate([
                { transform: 'scale(.2)', opacity: 0 },
                { transform: 'scale(1.3)', opacity: 1, offset: 0.5 },
                { transform: 'scale(1)', opacity: 1 },
            ], { duration: 450 * S, delay: 560 * S, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'backwards' });

            for (let i = 0; i < 34; i++) {
                const a = rand(0, Math.PI * 2);
                const d = rand(160, 300);
                const e = dot(c, rand(4, 8), rand(4, 8), CONF[i % CONF.length], '50%');
                e.animate([
                    { transform: `translate(${Math.cos(a) * d}px,${Math.sin(a) * d}px) scale(1)`, opacity: 0 },
                    { opacity: 1, offset: 0.2 },
                    { transform: 'translate(0,0) scale(.3)', opacity: 0 },
                ], { duration: 520 * S, delay: rand(0, 120) * S, easing: 'ease-in', fill: 'both' });
            }
            setTimeout(() => {
                ring(c, 300, 0, 500, 4);
                sparks(c, 14, 120);
            }, 560 * S);
        },

        // Un "double" de l'onglet traverse la fenetre depuis la droite et atterrit
        vol(tab, r, c) {
            const D = 750 * S;
            const dist = Math.max(300, window.innerWidth - (r.left + r.width / 2) + r.width);
            const label = tab.getAttribute('label') || '';

            const pill = dot(c, r.width, r.height, 'var(--zen-primary-color, #7F77DD)', '10px');
            pill.style.cssText += ';display:flex;align-items:center;padding:0 12px;box-sizing:border-box;color:#fff;font-size:13px;white-space:nowrap;overflow:hidden';
            pill.textContent = label;
            pill.animate([
                { transform: `translateX(${dist}px) rotate(-10deg) scale(1.25)`, opacity: 0, boxShadow: '0 0 30px 6px rgba(127,119,221,.7)' },
                { opacity: 1, offset: 0.15 },
                { transform: 'translateX(-16px) rotate(2deg) scale(1.06)', boxShadow: '0 0 24px 4px rgba(127,119,221,.5)', offset: 0.8 },
                { transform: 'none', opacity: 1, boxShadow: '0 0 0 0 rgba(127,119,221,0)', offset: 0.9 },
                { transform: 'none', opacity: 0 },
            ], { duration: D, easing: 'cubic-bezier(.25,.8,.3,1)', fill: 'forwards' });

            // le vrai onglet reste cache puis apparait quand le double se pose
            tab.animate([{ opacity: 0 }, { opacity: 0, offset: 0.85 }, { opacity: 1 }],
                { duration: D, fill: 'backwards' });

            setTimeout(() => {
                ring(c, 200, 0, 500, 3);
                sparks(c, 8, 90);
            }, D * 0.8);
        },
    };

    function pickStyle(name) {
        if (name === 'random') {
            const keys = Object.keys(EFFECTS);
            return keys[Math.floor(Math.random() * keys.length)];
        }
        return EFFECTS[name] ? name : 'explosion';
    }

    /* ---------- ouverture d'onglet ---------- */

    // Attend que Zen ait fini de placer l'onglet (sa hauteur/position se stabilisent)
    function whenSettled(tab, cb) {
        let last = null;
        const check = (i) => {
            const r = tab.getBoundingClientRect();
            if (r.width > 0 && r.height > 0 && last
                && Math.abs(r.top - last.top) < 0.5 && Math.abs(r.height - last.height) < 0.5) {
                return cb(r);
            }
            last = r;
            if (i < 40) requestAnimationFrame(() => check(i + 1));
            else cb(r.width > 0 && r.height > 0 ? r : null);
        };
        requestAnimationFrame(() => check(0));
    }

    function run(tab, r) {
        const name = pickStyle(cfg.style);
        S = cfg.slow;

        const parent = getAnimationParent();
        const p = parent.getBoundingClientRect();
        const c = document.createElement('div');
        c.className = 'mcs-container';
        c.style.left = `${r.left + r.width / 2 - p.left}px`;
        c.style.top = `${r.top + r.height / 2 - p.top}px`;
        parent.appendChild(c);

        if (cfg.debug) console.log('[TabOpenAnimations]', name, r);
        EFFECTS[name](tab, r, c);
        setTimeout(() => c.remove(), 2500 * S);
    }

    function onTabOpen(event) {
        if (!ready) return;
        const tab = event.target;
        if (!tab || tab.localName !== 'tab') return;
        if (tab.hasAttribute('zen-glance-tab')) return;

        cfg = readConfig();

        // masque l'onglet des l'ouverture pour eviter un flash avant l'animation
        const hold = tab.animate([{ opacity: 0 }, { opacity: 0 }], { duration: 2000, fill: 'forwards' });

        whenSettled(tab, (r) => {
            try {
                if (r) run(tab, r);
            } catch (e) {
                console.error('[TabOpenAnimations]', e);
            }
            hold.cancel();
        });
    }

    function init() {
        if (window.__tabOpenAnimationsInit) return;
        window.__tabOpenAnimationsInit = true;
        injectStyles();
        gBrowser.tabContainer.addEventListener('TabOpen', onTabOpen);
        setTimeout(() => { ready = true; }, STARTUP_GRACE_MS);
    }

    if (gBrowserInit?.delayedStartupFinished) {
        init();
    } else {
        const obs = (subject, topic) => {
            if (topic === 'browser-delayed-startup-finished' && subject === window) {
                Services.obs.removeObserver(obs, topic);
                init();
            }
        };
        Services.obs.addObserver(obs, 'browser-delayed-startup-finished');
    }
})();
