// ==UserScript==
// @name         Kick Roulette Cooldown via Pusher (par chaîne)
// @namespace    http://tampermonkey.net/
// @version      1.7
// @description  Timer de cooldown pour !roulette avec réponse Botrix, stockage par chaîne + logs console sur Kick.com
// @author       GPT
// @match        https://kick.com/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';
    // --- Variables globales ---
    const pseudo = 'NarKotiix';
    let cooldownEnd = null;
    let timerInterval = null;
    let userName = null;
    let userId = null;
    let channelName = null;
    let detectedChatroomId = null;
    let ws = null;
    let subscribedChannel = null;

    // --- Logs ---
    const ENABLE_LOGS = false;
    function log(...args) {
        if (ENABLE_LOGS) {
            console.log('[🎯 RouletteCooldown]', ...args);
        }
    }

    // --- Utilitaires stockage ---
    function getStorageKey() {
        return `kickRouletteCooldownEnd_${channelName}`;
    }
    function getCooldownEnabled() {
        const key = `kickRouletteCooldownEnabled_${channelName}`;
        const val = localStorage.getItem(key);
        if (val === null) return true;
        return val === 'true';
    }
    function setCooldownEnabled(val) {
        const key = `kickRouletteCooldownEnabled_${channelName}`;
        localStorage.setItem(key, val ? 'true' : 'false');
    }

    // --- Affichage du cooldown ---
    function updateStatusDisplay() {
        // Si le cooldown est désactivé, on remet l'affichage par défaut du header
        if (!cooldownEnabled) {
            resetHeaderStatus();
            clearInterval(timerInterval);
            timerInterval = null;
            cooldownEnd = null;
            localStorage.removeItem(getStorageKey());
            log('Cooldown désactivé, header réinitialisé');
            return;
        }

        const now = Date.now();
        const remaining = cooldownEnd - now;
        let statusText, color, highlightNumbers = false;
        if (remaining <= 0 || !cooldownEnd) {
            statusText = 'Roulette dispo !';
            color = ''; // couleur vide = pas de style forcé (blanc natif)
            clearInterval(timerInterval);
            timerInterval = null;
            cooldownEnd = null;
            localStorage.removeItem(getStorageKey());
            log('Cooldown terminé');
        } else {
            const minutes = Math.floor(remaining / 60000);
            const seconds = Math.floor((remaining % 60000) / 1000);
            statusText = `Cooldown: ${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            if (remaining > 5 * 60 * 1000) color = '#ff4444';
            else if (remaining > 2 * 60 * 1000) color = '#ff9900';
            else if (remaining > 30 * 1000) color = '#ffe066';
            else color = '#00cc44';
            if (remaining < 6 * 60 * 1000) highlightNumbers = true;
        }
        updateHeaderStatus(statusText, color, highlightNumbers);
    }

    // --- UI Header ---
    function updateHeaderStatus(text, color, highlightNumbers) {
        const chatHeaderSpan = document.querySelector('span.absolute.left-1\\/2.-translate-x-1\\/2.text-sm.font-bold.lg\\:text-base');
        if (chatHeaderSpan) {
            if (highlightNumbers && typeof text === 'string' && color) {
                const html = text.replace(/(\d{2}:\d{2})/, `<span style="color:${color};">$1</span>`);
                chatHeaderSpan.innerHTML = 'Chat' + (text ? ` | ${html}` : '');
            } else {
                chatHeaderSpan.textContent = 'Chat' + (text ? ` | ${text}` : '');
            }
            chatHeaderSpan.style.fontSize = '14px';
            if (color) {
                chatHeaderSpan.style.color = color;
            } else {
                chatHeaderSpan.style.color = '';
            }
        }
    }

    // --- Réinitialise le header central à l'affichage par défaut ---
    function resetHeaderStatus() {
        const chatHeaderSpan = document.querySelector('span.absolute.left-1\\/2.-translate-x-1\\/2.text-sm.font-bold.lg\\:text-base');
        if (chatHeaderSpan) {
            chatHeaderSpan.textContent = 'Chat';
            chatHeaderSpan.style.fontSize = '';
            chatHeaderSpan.style.color = '';
        }
    }

    // --- Cooldown activé/désactivé ---
    let cooldownEnabled = true;

    // --- Injection paramètres dans le popup natif Kick ---
    function injectCooldownSettingsInKickPopup() {
        const popup = document.querySelector('div[role="dialog"] .overflow-y-auto.pt-1');
        if (!popup) return;
        const ul = popup.querySelector('ul');
        if (!ul || popup.querySelector('#roulette-cooldown-settings')) return;

        const li = document.createElement('li');
        li.id = 'roulette-cooldown-settings';
        li.className = 'bg-transparent px-1.5 py-1.5 text-sm font-medium lg:px-2.5 h-10 rounded-sm text-white focus:bg-transparent focus-visible:outline-none betterhover:hover:!bg-[#2A2D32] cursor-pointer transition-colors duration-200 ease-out';
        li.innerHTML = `
            <div class="flex h-full select-none items-center justify-between text-white">
                <span>Cooldown Roulette</span>
                <div style="display:flex;gap:8px;align-items:center;">
                    <label style="display:flex;align-items:center;gap:4px;cursor:pointer;">
                        <input type="checkbox" id="roulette-cooldown-enable" ${cooldownEnabled ? 'checked' : ''} style="accent-color:#00aaff;">
                        <span style="font-size:12px;">Actif</span>
                    </label>
                    <button id="roulette-cooldown-reset" style="background:#ff4444;color:#fff;border:none;padding:2px 8px;border-radius:6px;cursor:pointer;font-size:12px;" ${!cooldownEnabled ? 'disabled style="opacity:0.5;pointer-events:none;"' : ''}>Effacer</button>
                </div>
            </div>
        `;
        ul.appendChild(li);

        const enableCheckbox = li.querySelector('#roulette-cooldown-enable');
        const resetBtn = li.querySelector('#roulette-cooldown-reset');
        enableCheckbox.onchange = (e) => {
            cooldownEnabled = e.target.checked;
            setCooldownEnabled(cooldownEnabled);
            if (!cooldownEnabled) {
                cooldownEnd = null;
                localStorage.removeItem(getStorageKey());
                resetBtn.disabled = true;
                resetBtn.style.opacity = '0.5';
                resetBtn.style.pointerEvents = 'none';
                updateStatusDisplay();
                if (ws) {
                    ws.close();
                    ws = null;
                }
            } else {
                resetBtn.disabled = false;
                resetBtn.style.opacity = '';
                resetBtn.style.pointerEvents = '';
                updateStatusDisplay();
                waitForPusher();
            }
        };
        resetBtn.onclick = () => {
            cooldownEnd = null;
            localStorage.removeItem(getStorageKey());
            updateStatusDisplay();
            // Redémarre le timer d'affichage pour bien remettre à zéro
            if (timerInterval) {
                clearInterval(timerInterval);
                timerInterval = null;
            }
        };
    }

    // --- Observe l'ouverture du popup natif Kick ---
    const popupObserver = new MutationObserver(() => {
        injectCooldownSettingsInKickPopup();
    });
    popupObserver.observe(document.body, { childList: true, subtree: true });

    // --- Bouton menu cooldown custom ---
    function insertCooldownMenuButton() {
        const avatarContainer = document.querySelector('div.flex.items-center.gap-5');
        if (!avatarContainer || document.getElementById('roulette-cooldown-menu-btn')) return;
        const btn = document.createElement('button');
        btn.id = 'roulette-cooldown-menu-btn';
        btn.title = 'Paramètres cooldown roulette';
        btn.className = 'group relative box-border flex shrink-0 grow-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded font-semibold ring-0 transition-all focus-visible:outline-none active:scale-[0.95] disabled:pointer-events-none bg-transparent focus-visible:outline-grey-300 text-white [&_svg]:fill-current betterhover:hover:bg-surface-tint size-8 text-sm leading-none';
        btn.style.marginRight = '8px';
        btn.innerHTML = `<svg width="24" height="24" viewBox="0 0 32 32" fill="white"><path d="M25.7,17.3c0.1-0.4,0.1-1.3,0-1.7l2.7-2.1c0.2-0.2,0.3-0.6,0.2-0.8L26,7.3C25.8,7,25.5,6.9,25.2,7l-3.2,1.3c-0.7-0.5-1.4-0.9-2.2-1.3l-0.5-3.4C19.2,3.3,18.9,3,18.6,3h-5.2c-0.3,0-0.6,0.2-0.6,0.6L12.3,7c-0.8,0.3-1.5,0.8-2.2,1.3L6.9,7C6.6,6.9,6.2,7,6.1,7.3l-2.6,4.5c-0.2,0.3-0.1,0.6,0.2,0.8l2.7,2.1c-0.1,0.4-0.1,1.3,0,1.7l-2.7,2.1c-0.2,0.2-0.3,0.6-0.2,0.8L6,24.7C6.2,25,6.5,25.1,6.8,25l3.2-1.3c0.7,0.5,1.4,0.9,2.2,1.3l0.5,3.4c0.1,0.3,0.3,0.6,0.6,0.6h5.2c0.3,0,0.6-0.2,0.6-0.6l0.5-3.4c0.8-0.3,1.5-0.8,2.2-1.3l3.2,1.3c0.3,0.1,0.6,0,0.8-0.3l2.6-4.5c0.2-0.3,0.1-0.6-0.2-0.8L25.7,17.3z M16,20.9c-2.7,0-4.9-2.2-4.9-4.9s2.2-4.9,4.9-4.9s4.9,2.2,4.9,4.9S18.7,20.9,16,20.9z"></path></svg>`;
        btn.onclick = (e) => {
            e.stopPropagation();
            toggleCooldownDropdownMenu(btn);
        };
        avatarContainer.insertBefore(btn, avatarContainer.firstChild);
    }
    const avatarBtnObserver = new MutationObserver(() => {
        insertCooldownMenuButton();
    });
    avatarBtnObserver.observe(document.body, { childList: true, subtree: true });

    // --- Menu dropdown custom ---
    function toggleCooldownDropdownMenu(anchorBtn) {
        const oldMenu = document.getElementById('roulette-cooldown-dropdown');
        if (oldMenu) {
            oldMenu.remove();
            return;
        }
        showCooldownDropdownMenu(anchorBtn);
    }
    function showCooldownDropdownMenu(anchorBtn) {
        const oldMenu = document.getElementById('roulette-cooldown-dropdown');
        if (oldMenu) oldMenu.remove();
        cooldownEnabled = getCooldownEnabled();
        const menu = document.createElement('div');
        menu.id = 'roulette-cooldown-dropdown';
        menu.setAttribute('role', 'menu');
        menu.className = 'z-dropdown bg-shade-base flex h-fit flex-col gap-1 rounded text-sm shadow-xl shadow-black data-[side=bottom]:animate-slideUpAndFade min-w-[200px] p-3';
        menu.style.position = 'absolute';
        menu.style.top = `${anchorBtn.getBoundingClientRect().bottom + window.scrollY + 8}px`;
        menu.style.left = `${anchorBtn.getBoundingClientRect().left + window.scrollX}px`;
        menu.innerHTML = `
            <div class="text-base font-semibold pb-2">Paramètre de Cooldown</div>
            <div class="bg-dropdown-separator h-px w-full mb-2"></div>
            <div class="flex flex-col gap-2 py-2">
                <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
                    <input type="checkbox" id="roulette-cooldown-enable" ${!cooldownEnabled ? 'checked' : ''} style="accent-color:#00aaff;">
                    <span style="font-size:14px;">Désactiver le cooldown</span>
                </label>
                <button id="roulette-cooldown-reset" style="background:#ff4444;color:#fff;border:none;padding:6px 14px;border-radius:6px;cursor:pointer;font-weight:bold;" ${!cooldownEnabled ? 'disabled style="opacity:0.5;pointer-events:none;"' : ''}>Effacer le cooldown</button>
            </div>
        `;
        document.body.appendChild(menu);
        const rect = menu.getBoundingClientRect();
        if (rect.right > window.innerWidth) {
            menu.style.left = `${window.innerWidth - rect.width - 10}px`;
        }
        function closeMenu(ev) {
            if (!menu.contains(ev.target) && ev.target !== anchorBtn) {
                menu.remove();
                document.removeEventListener('mousedown', closeMenu, true);
            }
        }
        setTimeout(() => {
            document.addEventListener('mousedown', closeMenu, true);
        }, 0);
        anchorBtn._cooldownMenuOpen = true;
        menu.addEventListener('mousedown', e => e.stopPropagation());
        anchorBtn.addEventListener('mousedown', function handler(e) {
            if (anchorBtn._cooldownMenuOpen) {
                menu.remove();
                anchorBtn._cooldownMenuOpen = false;
                document.removeEventListener('mousedown', closeMenu, true);
                anchorBtn.removeEventListener('mousedown', handler);
            }
        });
        const enableCheckbox = menu.querySelector('#roulette-cooldown-enable');
        const resetBtn = menu.querySelector('#roulette-cooldown-reset');
        enableCheckbox.onchange = (e) => {
            cooldownEnabled = !e.target.checked;
            setCooldownEnabled(cooldownEnabled);
            if (!cooldownEnabled) {
                cooldownEnd = null;
                localStorage.removeItem(getStorageKey());
                resetBtn.disabled = true;
                resetBtn.style.opacity = '0.5';
                resetBtn.style.pointerEvents = 'none';
                updateStatusDisplay();
                if (ws) {
                    ws.close();
                    ws = null;
                }
            } else {
                resetBtn.disabled = false;
                resetBtn.style.opacity = '';
                resetBtn.style.pointerEvents = '';
                updateStatusDisplay();
                waitForPusher();
            }
        };
        resetBtn.onclick = () => {
            cooldownEnd = null;
            localStorage.removeItem(getStorageKey());
            updateStatusDisplay();
            // Redémarre le timer d'affichage pour bien remettre à zéro
            if (timerInterval) {
                clearInterval(timerInterval);
                timerInterval = null;
            }
            menu.remove();
        };
    }

    // --- Cooldown logique ---
    async function setCooldown(seconds) {
        if (!cooldownEnabled) {
            log('Cooldown désactivé, setCooldown ignoré');
            return;
        }
        cooldownEnd = Date.now() + seconds * 1000;
        localStorage.setItem(getStorageKey(), cooldownEnd);
        log(`Cooldown de ${seconds}s activé (fin à ${new Date(cooldownEnd).toLocaleTimeString()})`);
        updateStatusDisplay();
        if (!timerInterval) {
            timerInterval = setInterval(updateStatusDisplay, 1000);
        }
    }
    async function restoreCooldown() {
        cooldownEnabled = getCooldownEnabled();
        if (!cooldownEnabled) {
            cooldownEnd = null;
            localStorage.removeItem(getStorageKey());
            updateStatusDisplay();
            return;
        }
        const saved = localStorage.getItem(getStorageKey());
        if (saved) {
            const savedTime = parseInt(saved, 10);
            if (savedTime > Date.now()) {
                cooldownEnd = savedTime;
                log('Cooldown restauré depuis le stockage local');
                updateStatusDisplay();
                if (!timerInterval) {
                    timerInterval = setInterval(updateStatusDisplay, 1000);
                }
                return;
            }
            localStorage.removeItem(getStorageKey());
            log('Ancien cooldown expiré, supprimé');
        }
        updateHeaderStatus('Roulette dispo !');
    }

    // --- Initialisation ---
    async function waitForPusher() {
        cooldownEnabled = getCooldownEnabled();
        if (!cooldownEnabled) {
            log('Cooldown désactivé, aucune connexion Pusher');
            return;
        }
        let chatroomId = getChatroomId();
        if (!cooldownEnabled) return;
        if (chatroomId) {
            subscribeToPusherChannel(chatroomId);
        } else {
            log('[INFO] Attente de la détection du chatroomId via WebSocket...');
            await waitForDetectedChatroomId();
        }
    }

    async function waitForDetectedChatroomId() {
        return new Promise(resolve => {
            const interval = setInterval(() => {
                if (detectedChatroomId) {
                    log(`[INFO] chatroomId détecté dynamiquement : ${detectedChatroomId}`);
                    clearInterval(interval);
                    subscribeToPusherChannel(detectedChatroomId);
                    resolve();
                }
            }, 500);
        });
    }

    // --- Récupération du nom utilisateur/id ---
    function getCurrentUsername() {
        if (window.__INITIAL_STATE__ && window.__INITIAL_STATE__.user && window.__INITIAL_STATE__.user.username) {
            userId = window.__INITIAL_STATE__.user.id || null;
            return window.__INITIAL_STATE__.user.username;
        }
        const userDiv = document.querySelector('div.text-base.font-semibold');
        if (userDiv && userDiv.textContent) {
            return userDiv.textContent.trim();
        }
        return pseudo;
    }
    function getCurrentUserId() {
        if (window.__INITIAL_STATE__ && window.__INITIAL_STATE__.user && window.__INITIAL_STATE__.user.id) {
            return window.__INITIAL_STATE__.user.id;
        }
        return null;
    }

    // --- ChatroomId Kick ---
    function getChatroomId() {
        if (window.__INITIAL_STATE__ && window.__INITIAL_STATE__.chatroomId) {
            log(`[DEBUG] chatroomId via __INITIAL_STATE__ : ${window.__INITIAL_STATE__.chatroomId}`);
            return window.__INITIAL_STATE__.chatroomId;
        }
        const path = window.location.pathname;
        const match = path.match(/\/channel\/(\d+)/);
        if (match) {
            log(`[DEBUG] chatroomId via URL : ${match[1]}`);
            return match[1];
        }
        const pusherChannel = Array.from(document.querySelectorAll('script'))
            .map(s => s.textContent)
            .find(txt => txt && txt.includes('chatrooms.'));
        if (pusherChannel) {
            const idMatch = pusherChannel.match(/chatrooms\.(\d+)\.v2/);
            if (idMatch) {
                log(`[DEBUG] chatroomId via script DOM : ${idMatch[1]}`);
                return idMatch[1];
            }
        }
        if (detectedChatroomId) {
            log(`[DEBUG] chatroomId via interception WebSocket : ${detectedChatroomId}`);
            return detectedChatroomId;
        }
        log('[ERREUR] Impossible de récupérer chatroomId pour WebSocket Pusher');
        return null;
    }
    function waitForDetectedChatroomId() {
        const interval = setInterval(() => {
            if (detectedChatroomId) {
                log(`[INFO] chatroomId détecté dynamiquement : ${detectedChatroomId}`);
                clearInterval(interval);
                subscribeToPusherChannel(detectedChatroomId);
            }
        }, 500);
    }

    // --- Abonnement Pusher ---
    function subscribeToPusherChannel(chatroomId) {
        // Ne jamais se connecter si désactivé
        if (!cooldownEnabled) {
            log('Cooldown désactivé, annulation de la connexion Pusher');
            return;
        }
        if (ws) {
            ws.close();
            ws = null;
        }
        if (!chatroomId) {
            log('Impossible de récupérer chatroomId pour WebSocket Pusher');
            return;
        }
        log(`Connexion WebSocket Pusher pour chatroomId ${chatroomId}`);
        if (!userName) {
            log('Aucun nom d\'utilisateur trouvé, impossible de s\'abonner au canal Pusher');
            return;
        }
        const channelName = `chatrooms.${chatroomId}.v2`;
        const pusherWsUrl =
            'wss://ws-us2.pusher.com/app/32cbd69e4b950bf97679?protocol=7&client=js&version=8.4.0-rc2&flash=false';
        ws = new WebSocket(pusherWsUrl);
        ws.onopen = function () {
            // Vérifie encore une fois avant d'envoyer l'abonnement
            if (!cooldownEnabled) {
                log('Cooldown désactivé, fermeture WebSocket');
                ws.close();
                ws = null;
                return;
            }
            log('WebSocket Pusher ouvert');
            const subscribeMsg = {
                event: "pusher:subscribe",
                data: { channel: channelName }
            };
            ws.send(JSON.stringify(subscribeMsg));
            subscribedChannel = channelName;
            log(`Abonnement demandé à ${channelName}`);
        };
        ws.onmessage = function (event) {
            try {
                const data = JSON.parse(event.data);
                if (data.event === 'App\\Events\\ChatMessageEvent' && data.channel === subscribedChannel) {
                    if (typeof data.data === 'string') {
                        try {
                            const json = JSON.parse(data.data);
                            const content = json.content;
                            const sender = json.sender?.username;
                            log(`(WS) Message reçu de ${sender} : ${content}`);
                            if (sender === 'BotRix') {
                                const match = content.match(/@(\w+).*?(\d+)s/);
                                if (match) {
                                    const usernameInMsg = match[1];
                                    const seconds = parseInt(match[2], 10);
                                    const now = Date.now();
                                    const newCooldownEnd = now + seconds * 1000;
                                    if (!cooldownEnd || Math.abs(cooldownEnd - newCooldownEnd) > 1000) {
                                        log(`BotRix -> cooldown reçu pour ${usernameInMsg} : ${seconds}s`);
                                        setCooldown(seconds);
                                    } else {
                                        log('BotRix -> cooldown identique, pas de reset');
                                    }
                                }
                            }
                            else if (
                                sender?.toLowerCase() === userName?.toLowerCase() &&
                                content.startsWith('!roulette')
                            ) {
                                const parts = content.trim().split(' ');
                                if (parts.length === 1) {
                                    log('!roulette sans paramètre, aucune action');
                                    return;
                                }
                                if (cooldownEnd && cooldownEnd > Date.now()) {
                                    log('Cooldown déjà en cours, !roulette ignoré');
                                    return;
                                }
                                const cooldownSeconds = 900;
                                log(`Commande !roulette détectée par ${sender}, cooldown forcé à ${cooldownSeconds}s`);
                                setCooldown(cooldownSeconds);
                            }
                        } catch (jsonErr) {
                            log('Erreur parsing data.data JSON:', jsonErr, data.data);
                        }
                    } else {
                        log('Donnée inattendue pour data.data:', data.data);
                    }
                }
            } catch (err) {
                log('Erreur WebSocket Pusher:', err);
            }
        };
        ws.onerror = function (err) {
            log('WebSocket Pusher erreur:', err);
        };
        ws.onclose = function () {
            log('WebSocket Pusher fermé');
        };
    }

    // --- Interception WebSocket pour détecter chatroomId ---
    (function interceptWebSocket() {
        const NativeWebSocket = window.WebSocket;
        window.WebSocket = function(...args) {
            const wsInstance = new NativeWebSocket(...args);
            wsInstance.addEventListener('message', (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (
                        data &&
                        data.event === "pusher_internal:subscription_succeeded" &&
                        typeof data.channel === "string"
                    ) {
                        if (ENABLE_LOGS) {
                            console.log('[WS][SUBSCRIBED]', data);
                        }
                        let match = data.channel.match(/^chatrooms[._](\d+)(?:\.v2)?$/);
                        if (match) {
                            detectedChatroomId = match[1];
                            log(`[AUTO] chatroomId détecté via WebSocket : ${detectedChatroomId}`);
                        }
                    }
                } catch (e) {}
            });
            return wsInstance;
        };
        window.WebSocket.prototype = NativeWebSocket.prototype;
    })();

        function getChannelName() {
        const path = window.location.pathname.split('/');
        if (path.length > 1 && path[1]) {
            channelName = path[1].toLowerCase();
            log(`Chaîne actuelle : ${channelName}`);
        } else {
            log('Impossible de détecter le nom de la chaîne');
        }
    }

    // --- Initialisation ---
    window.addEventListener('load', async () => {
        log('Page chargée, initialisation dans 1s...');
        setTimeout(async () => {
            getChannelName();
            userName = getCurrentUsername();
            userId = getCurrentUserId && getCurrentUserId();
            await restoreCooldown();
            await waitForPusher();
        }, 1000);
    });

    log('Script chargé');
})();
