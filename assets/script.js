        const PLATFORM_MAP = {
            'Flash': { lib: 'ruffle-files', type: 'Flash' },
            'HTML5': { lib: 'html-files', type: 'HTML5' },
            'Emulator.Js': { lib: 'emulator-files', type: 'Emulator.Js' }
        };

        let masterRegistry = [];
        let emulatorSystemsMap = {};
        let activeTypeFilter = 'All';
        let activeSeriesFilters = new Set();
        let activeEmulatorFilters = new Set();

        function sanitizeRawJsonString(str) {
            return str
                .replace(/\/\/.*$/gm, '')
                .replace(/\/\*[\s\S]*?\*\//g, '')
                .replace(/,\s*([\]}])/g, '$1')
                .replace(/["']\s*["']/g, '"')
                .trim();
        }

        function sanitizeUrlComponent(str) {
            if (!str) return '';
            return str.replace(/["'\s].*$/, '').trim();
        }

        function cleanAndParseJSON(rawText) {
            const sanitized = sanitizeRawJsonString(rawText);
            try {
                return JSON.parse(sanitized);
            } catch (e) {
                return permissiveJSONParse(sanitized);
            }
        }

        function permissiveJSONParse(str) {
            let index = 0;
            
            function skipWhitespace() {
                while (index < str.length) {
                    const char = str[index];
                    if (char === ' ' || char === '\t' || char === '\n' || char === '\r') {
                        index++;
                    } else if (char === '/' && str[index + 1] === '/') {
                        while (index < str.length && str[index] !== '\n') {
                            index++;
                        }
                    } else if (char === '/' && str[index + 1] === '*') {
                        index += 2;
                        while (index < str.length && !(str[index] === '*' && str[index + 1] === '/')) {
                            index++;
                        }
                        index += 2;
                    } else {
                        break;
                    }
                }
            }
            
            function parseValue() {
                skipWhitespace();
                if (index >= str.length) return undefined;
                const char = str[index];
                if (char === '{') return parseObject();
                if (char === '[') return parseArray();
                if (char === '"' || char === "'") return parseString();
                return parsePrimitive();
            }
            
            function parseObject() {
                const obj = {};
                index++;
                while (index < str.length) {
                    skipWhitespace();
                    if (str[index] === '}') {
                        index++;
                        return obj;
                    }
                    let key;
                    if (str[index] === '"' || str[index] === "'") {
                        key = parseString();
                    } else {
                        let keyStart = index;
                        while (index < str.length && /[a-zA-Z0-9_\-$]/.test(str[index])) {
                            index++;
                        }
                        key = str.substring(keyStart, index).trim();
                    }
                    skipWhitespace();
                    if (str[index] === ':') {
                        index++;
                    }
                    const value = parseValue();
                    if (key) {
                        obj[key] = value;
                    }
                    skipWhitespace();
                    if (str[index] === ',') {
                        index++;
                    }
                }
                return obj;
            }
            
            function parseArray() {
                const arr = [];
                index++;
                while (index < str.length) {
                    skipWhitespace();
                    if (str[index] === ']') {
                        index++;
                        return arr;
                    }
                    const value = parseValue();
                    arr.push(value);
                    skipWhitespace();
                    if (str[index] === ',') {
                        index++;
                    }
                }
                return arr;
            }
            
            function parseString() {
                const quoteChar = str[index];
                index++;
                let result = "";
                let escaped = false;
                while (index < str.length) {
                    const char = str[index];
                    if (escaped) {
                        if (char === 'n') result += '\n';
                        else if (char === 't') result += '\t';
                        else if (char === 'r') result += '\r';
                        else result += char;
                        escaped = false;
                        index++;
                    } else if (char === '\\') {
                        escaped = true;
                        index++;
                    } else if (char === quoteChar) {
                        let peekIndex = index + 1;
                        while (peekIndex < str.length) {
                            const peekChar = str[peekIndex];
                            if (peekChar === ' ' || peekChar === '\t' || peekChar === '\n' || peekChar === '\r') {
                                peekIndex++;
                            } else {
                                break;
                            }
                        }
                        const nextChar = str[peekIndex];
                        if (nextChar === ',' || nextChar === ':' || nextChar === '}' || nextChar === ']' || peekIndex >= str.length) {
                            index++;
                            return result;
                        } else {
                            result += char;
                            index++;
                        }
                    } else {
                        result += char;
                        index++;
                    }
                }
                return result;
            }
            
            function parsePrimitive() {
                let start = index;
                while (index < str.length) {
                    const char = str[index];
                    if (char === ',' || char === '}' || char === ']' || char === ':' || char === ' ' || char === '\t' || char === '\n' || char === '\r') {
                        break;
                    }
                    index++;
                }
                const valStr = str.substring(start, index).trim();
                if (valStr === 'true' || valStr === 'True') return true;
                if (valStr === 'false' || valStr === 'False') return false;
                if (valStr === 'null' || valStr === 'None') return null;
                if (valStr === 'undefined') return undefined;
                const num = Number(valStr);
                if (!isNaN(num)) return num;
                return valStr;
            }
            
            skipWhitespace();
            const firstChar = str[index];
            if (firstChar !== '{' && firstChar !== '[') {
                let altIndexStart = str.indexOf('{');
                let altIndexArr = str.indexOf('[');
                if (altIndexStart !== -1 && altIndexArr !== -1) {
                    index = Math.min(altIndexStart, altIndexArr);
                } else if (altIndexStart !== -1) {
                    index = altIndexStart;
                } else if (altIndexArr !== -1) {
                    index = altIndexArr;
                }
            }
            return parseValue();
        }

        function setupCollapsibleContainer(container, limit = 10) {

            const oldShowMoreBtn = container.querySelector('.show-more-btn');
            if (oldShowMoreBtn) {
                oldShowMoreBtn.remove();
            }


            const buttons = Array.from(container.querySelectorAll('.btn:not(.show-more-btn)'));
            

            buttons.forEach(btn => btn.style.display = '');

            if (buttons.length > limit) {
                const remainder = buttons.length - limit;

      
                for (let i = limit; i < buttons.length; i++) {
                    buttons[i].style.display = 'none';
                }

     
                const expandBtn = document.createElement('button');
                expandBtn.className = 'btn show-more-btn';
                expandBtn.textContent = `Show ${remainder} more`;

                expandBtn.onclick = (e) => {
                    e.preventDefault();
        
                    for (let i = limit; i < buttons.length; i++) {
                        buttons[i].style.display = '';
                    }
                    expandBtn.remove();
                };

                container.appendChild(expandBtn);
            }
        }

        async function loadEmulatorSystems() {
            try {
                const listUrl = `https://cdn.jsdelivr.net/gh/bloxys-playables/emulator-files@main/cdn-data/list.txt`;
                const listResponse = await fetch(listUrl);
                const listText = await listResponse.text();
                const files = listText.split(/\r?\n/).map(line => line.trim()).filter(line => line.length > 0);

                await Promise.all(files.map(async (file) => {
                    try {
                        const systemName = file.replace(/\.txt$/i, '').trim();
                        const fileUrl = `https://cdn.jsdelivr.net/gh/bloxys-playables/emulator-files@main/cdn-data/extra/${encodeURIComponent(file)}`;
                        const fileResponse = await fetch(fileUrl);
                        const fileText = await fileResponse.text();
                        const games = fileText.split(/\r?\n/)
                            .map(line => line.trim())
                            .filter(line => line.length > 0)
                            .map(line => line.replace(/\.html$/i, '').toLowerCase().replace(/\s+/g, '').trim());

                        if (!emulatorSystemsMap[systemName]) {
                            emulatorSystemsMap[systemName] = new Set();
                        }
                        games.forEach(g => emulatorSystemsMap[systemName].add(g));
                    } catch (err) {
                        console.error(err);
                    }
                }));
            } catch (err) {
                console.error(err);
            }
        }

        async function bootPlatform() {
            await loadEmulatorSystems();
            const loaders = Object.keys(PLATFORM_MAP).map(key => loadPlatformManifest(PLATFORM_MAP[key]));
            await Promise.all(loaders);
            
            buildDynamicFilterInterfaces();
            renderActiveViewRegistry();
            setupEventPipelines();

            setupCollapsibleContainer(document.getElementById('gameTypeContainer'), 10);
        }

        async function loadPlatformManifest(platform) {
            try {
                const rootManifestUrl = `https://cdn.jsdelivr.net/gh/bloxys-playables/${platform.lib}@main/cdn-data/v.json`;
                const rootResponse = await fetch(rootManifestUrl);
                const rootRawText = await rootResponse.text();
                const rootData = cleanAndParseJSON(rootRawText);
                const nodeConfig = rootData[0];
                
                const cleanCdnJson = sanitizeUrlComponent(nodeConfig.cdn.json);
                const keyTitle = sanitizeUrlComponent(nodeConfig.json.title);
                const keyOrder = sanitizeUrlComponent(nodeConfig.json.list);
                const keyId = sanitizeUrlComponent(nodeConfig.json.identifier);
                const keyGroup = sanitizeUrlComponent(nodeConfig.json.group);
                const thumbnailFile = sanitizeUrlComponent(nodeConfig.cdn.img);

                const catalogUrl = `https://cdn.jsdelivr.net/gh/bloxys-playables/${platform.lib}@main/cdn-data/${cleanCdnJson}`;
                const catalogResponse = await fetch(catalogUrl);
                const catalogRawText = await catalogResponse.text();
                const rawGameList = cleanAndParseJSON(catalogRawText);

                const processedGames = rawGameList.map(game => {
                    const nameStr = game[keyTitle] || game.name || game.title || "Unknown Game";
                    const cleanName = nameStr.toLowerCase().replace(/\s+/g, '').trim();
                    const orderVal = parseInt(game[keyOrder] || game.order || game.list) || 999;
                    const groupStr = game[keyGroup] || game.type || game.group || "Other";
                    const idVal = game[keyId] || game.id || game.identifier;
                    
                    let matchedSystem = "Other";
                    if (platform.type === 'Emulator.Js') {
                        for (const [system, gameSet] of Object.entries(emulatorSystemsMap)) {
                            if (gameSet.has(cleanName)) {
                                matchedSystem = system;
                                break;
                            }
                        }
                    }

                    return {
                        id: idVal,
                        name: nameStr,
                        order: orderVal,
                        series: groupStr,
                        platform: platform.type,
                        lib: platform.lib,
                        thumb: `https://cdn.jsdelivr.net/gh/bloxys-playables/${platform.lib}@main/cdn-data/${thumbnailFile}`,
                        emulatorSystem: matchedSystem
                    };
                });

                masterRegistry.push(...processedGames);
            } catch (err) {
                console.error(`Error loading ${platform.type}:`, err);
            }
        }

        function buildDynamicFilterInterfaces() {
            const seriesContainer = document.getElementById('gameSeriesContainer');
            const emuContainer = document.getElementById('emulatorExtensionContainer');
            
            seriesContainer.innerHTML = '';
            emuContainer.innerHTML = '';

            const uniqueSeries = new Set();
            const uniqueEmuSystems = new Set();

            masterRegistry.forEach(game => {
                if (activeTypeFilter === 'All' || game.platform === activeTypeFilter) {
                    uniqueSeries.add(game.series);
                    if (game.platform === 'Emulator.Js' && game.emulatorSystem && game.emulatorSystem !== 'Other') {
                        uniqueEmuSystems.add(game.emulatorSystem);
                    }
                }
            });

            uniqueSeries.forEach(seriesName => {
                const btn = document.createElement('button');
                btn.className = `btn ${activeSeriesFilters.has(seriesName) ? 'active' : ''}`;
                btn.textContent = seriesName;
                btn.onclick = () => toggleFilterCriteria(seriesName, activeSeriesFilters, btn);
                seriesContainer.appendChild(btn);
            });

            uniqueEmuSystems.forEach(systemName => {
                const btn = document.createElement('button');
                btn.className = `btn ${activeEmulatorFilters.has(systemName) ? 'active' : ''}`;
                btn.textContent = systemName;
                btn.onclick = () => toggleFilterCriteria(systemName, activeEmulatorFilters, btn);
                emuContainer.appendChild(btn);
            });

            setupCollapsibleContainer(seriesContainer, 10);
            setupCollapsibleContainer(emuContainer, 10);

            const wrapper = document.getElementById('emulatorExtensionWrapper');
            if (activeTypeFilter === 'Emulator.Js') {
                wrapper.classList.remove('hidden');
            } else {
                wrapper.classList.add('hidden');
            }
        }

        function toggleFilterCriteria(value, activeSet, btnElement) {
            if (activeSet.has(value)) {
                activeSet.delete(value);
                btnElement.classList.remove('active');
            } else {
                activeSet.add(value);
                btnElement.classList.add('active');
            }
            renderActiveViewRegistry();
        }

        function renderActiveViewRegistry() {
            const grid = document.getElementById('gamesViewGrid');
            const counterElement = document.getElementById('gameCounter');
            const searchQuery = document.getElementById('searchBar').value.toLowerCase();
            grid.innerHTML = '';

            let filteredList = masterRegistry.filter(game => {
                if (activeTypeFilter !== 'All' && game.platform !== activeTypeFilter) return false;
                
                if (activeSeriesFilters.size > 0 && !activeSeriesFilters.has(game.series)) return false;

                if (activeTypeFilter === 'Emulator.Js' && activeEmulatorFilters.size > 0) {
                    if (!activeEmulatorFilters.has(game.emulatorSystem)) return false;
                }

                if (searchQuery && !game.name.toLowerCase().includes(searchQuery)) return false;

                return true;
            });

            filteredList.sort((a, b) => a.order - b.order);

            counterElement.textContent = `${filteredList.length} Game${filteredList.length !== 1 ? 's' : ''}`;

            filteredList.forEach(game => {
                const card = document.createElement('div');
                card.className = 'game-card';
                card.innerHTML = `
                    <div class="game-thumbnail">
                        <img src="${game.thumb}" alt="${game.name}" loading="lazy">
                    </div>
                    <div class="game-details">
                        <div class="game-name">${game.name}</div>
                        <button class="play-btn">Play</button>
                    </div>
                `;
                
                card.querySelector('.play-btn').onclick = () => initializeGameExecutionRuntime(game);
                grid.appendChild(card);
            });
        }

        function initializeGameExecutionRuntime(game) {
            const runtimeOverlay = document.createElement('div');
            runtimeOverlay.id = 'runtimeContainer';

            const toolbar = document.createElement('div');
            toolbar.id = 'runtimeToolbar';
            
            const title = document.createElement('div');
            title.className = 'runtime-title';
            title.textContent = game.name;
            toolbar.appendChild(title);

            const buttonsWrapper = document.createElement('div');
            buttonsWrapper.className = 'runtime-controls';

            if (game.platform !== 'Flash') {
                const fullscreenBtn = document.createElement('button');
                fullscreenBtn.className = 'control-btn btn-fullscreen';
                fullscreenBtn.textContent = 'Fullscreen';
                fullscreenBtn.onclick = () => {
                    const targetFrame = document.getElementById('gameIframe');
                    if (targetFrame.requestFullscreen) targetFrame.requestFullscreen();
                    else if (targetFrame.webkitRequestFullscreen) targetFrame.webkitRequestFullscreen();
                };
                buttonsWrapper.appendChild(fullscreenBtn);
            }

            const closeBtn = document.createElement('button');
            closeBtn.className = 'control-btn btn-close';
            closeBtn.textContent = 'Close';
            closeBtn.onclick = () => runtimeOverlay.remove();
            buttonsWrapper.appendChild(closeBtn);

            toolbar.appendChild(buttonsWrapper);
            runtimeOverlay.appendChild(toolbar);

            const iframe = document.createElement('iframe');
            iframe.id = 'gameIframe';
            runtimeOverlay.appendChild(iframe);
            document.body.appendChild(runtimeOverlay);

            if (game.platform === 'Flash') {
                const flashBlueprint = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/tharun9772/game-assets@main/flash-em.css">
    <title>${game.name}</title>
</head>
<body>
    <script src="https://unpkg.com/@ruffle-rs/ruffle"><\/script>
    <div id="container">
        <div id="subContainer">
            <div id="gameContainer"></div>
            <div id="fullScreenBar">
                <h3 id="gameFName"></h3>
                <div id="fullscreen"><img src="https://cdn.jsdelivr.net/gh/tharun9772/game-assets@main/flash-em.svg"></div>
            </div>
        </div>
    </div>
    <script src="https://cdn.jsdelivr.net/gh/tharun9772/game-assets@main/flash-em.js" data-swf-file-src="https://cdn.jsdelivr.net/gh/bloxys-playables/${game.lib}@main/${game.name}.swf" data-fname="Bloxcraft UBG | Ruffle Player">
    <\/script>
</body>
</html>`;
                iframe.srcdoc = flashBlueprint;
            } else {
                const remoteTargetUrl = `https://cdn.jsdelivr.net/gh/bloxys-playables/${game.lib}@main/${game.name}.html`;
                
                fetch(remoteTargetUrl)
                    .then(res => res.text())
                    .then(htmlMarkup => {
                        const isPlaintext = !htmlMarkup.trim().toLowerCase().startsWith('<!doc') && !htmlMarkup.includes('<html') && !htmlMarkup.includes('<body');
                        let finalMarkup = htmlMarkup;
                        
                        if (isPlaintext) {
                            finalMarkup = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        body {
            background-color: #000000;
            color: #ffffff;
            font-family: monospace;
            padding: 20px;
            white-space: pre-wrap;
            word-wrap: break-word;
        }
    </style>
</head>
<body>${htmlMarkup}</body>
</html>`;
                        } else {
                            const baseTag = `<base href="https://cdn.jsdelivr.net/gh/bloxys-playables/${game.lib}@main/">`;
                            if (htmlMarkup.includes('<head>')) {
                                finalMarkup = htmlMarkup.replace('<head>', `<head>${baseTag}`);
                            } else if (htmlMarkup.includes('<html>')) {
                                finalMarkup = htmlMarkup.replace('<html>', `<html><head>${baseTag}</head>`);
                            } else {
                                finalMarkup = `<head>${baseTag}</head>${htmlMarkup}`;
                            }
                        }
                        
                        iframe.srcdoc = finalMarkup;
                    })
                    .catch(err => {
                        console.error(err);
                        iframe.srcdoc = `<div style="color:white;text-align:center;margin-top:20%;font-family:sans-serif;">Failed to load game assets.</div>`;
                    });
            }
        }

        function setupEventPipelines() {
            document.getElementById('gameTypeContainer').addEventListener('click', (e) => {
                const target = e.target;
                if (!target.classList.contains('btn') || target.classList.contains('disabled')) return;

                document.querySelectorAll('#gameTypeContainer .btn').forEach(btn => btn.classList.remove('active'));
                target.classList.add('active');

                activeTypeFilter = target.getAttribute('data-type');
                activeSeriesFilters.clear();
                activeEmulatorFilters.clear();

                buildDynamicFilterInterfaces();
                renderActiveViewRegistry();
            });

            document.getElementById('searchBar').addEventListener('input', renderActiveViewRegistry);
        }

        window.addEventListener('DOMContentLoaded', bootPlatform);
