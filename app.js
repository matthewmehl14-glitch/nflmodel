// --- Global Configurations ---
const MIN_EDGE = 0.03; // 3.00% Minimum Edge Filter

// --- Core Math Engine (Pure Top-Down Devigging) ---
function getFairProbability(oddsOver, oddsUnder) {
    let probOver = oddsOver > 0 ? 100 / (oddsOver + 100) : Math.abs(oddsOver) / (Math.abs(oddsOver) + 100);
    let probUnder = oddsUnder > 0 ? 100 / (oddsUnder + 100) : Math.abs(oddsUnder) / (Math.abs(oddsUnder) + 100);
    let vig = probOver + probUnder;
    return {
        'Over': probOver / vig,
        'Under': probUnder / vig
    };
}

function getAmericanOdds(probability) {
    if (probability > 0.5) {
        return Math.round(-(probability / (1 - probability)) * 100).toString();
    } else {
        return "+" + Math.round(((1 - probability) / probability) * 100).toString();
    }
}

// --- UI Controls & Filters ---
let globalPlays = [];
let currentFilter = 'all';

function saveApiKey() {
    const key = document.getElementById("api-key-input").value.trim();
    if (key) {
        localStorage.setItem("OddsApiKey", key);
        initDashboard();
    }
}

function clearApiKey() {
    localStorage.removeItem("OddsApiKey");
    document.getElementById("api-key-input").value = "";
    document.getElementById("setup-panel").classList.remove("hidden");
    document.getElementById("dashboard").classList.add("hidden");
    document.getElementById("results-grid").innerHTML = "";
}

function initDashboard() {
    if (localStorage.getItem("OddsApiKey")) {
        document.getElementById("setup-panel").classList.add("hidden");
        document.getElementById("dashboard").classList.remove("hidden");
    }
}

function updateStatus(message) {
    document.getElementById("status-text").innerText = message;
}

function filterResults(filterKey) {
    currentFilter = filterKey;
    
    const buttons = document.querySelectorAll('#filters button');
    buttons.forEach(btn => {
        btn.classList.remove('bg-blue-600', 'hover:bg-blue-500');
        btn.classList.add('bg-gray-700', 'hover:bg-gray-600');
    });
    
    const activeBtn = document.getElementById(`btn-${filterKey}`);
    if (activeBtn) {
        activeBtn.classList.remove('bg-gray-700', 'hover:bg-gray-600');
        activeBtn.classList.add('bg-blue-600', 'hover:bg-blue-500');
    }
    
    renderCards();
}

function renderCards() {
    const grid = document.getElementById("results-grid");
    grid.innerHTML = "";
    
    let playsToShow = [];
    if (currentFilter === 'all') {
        playsToShow = globalPlays;
    } else {
        playsToShow = globalPlays.filter(play => play.marketName === currentFilter);
    }
        
    for (const play of playsToShow) {
        appendResultCard(play);
    }
}

function appendResultCard(play) {
    const grid = document.getElementById("results-grid");
    const edgePercent = (play.edge * 100).toFixed(2);
    const fairOddsStr = getAmericanOdds(play.fairProb);
    const retailOddsStr = play.bestRetailOdds > 0 ? `+${play.bestRetailOdds}` : `${play.bestRetailOdds}`;
    
    // 1/4 Kelly Calculation using Best Retail Odds (Capped at 2.00 Units)
    const b = play.bestRetailOdds > 0 ? (play.bestRetailOdds / 100) : (100 / Math.abs(play.bestRetailOdds));
    const p = play.fairProb;
    const q = 1 - p;
    const fullKelly = ((b * p) - q) / b;
    const quarterKellyPct = fullKelly > 0 ? (fullKelly * 0.25) : 0;
    
    let unitSize = quarterKellyPct * 100;
    if (unitSize > 2.00) unitSize = 2.00;
    
    const kellyText = fullKelly > 0 ? `${unitSize.toFixed(2)}u` : "0.00u";
    const betColor = play.betType === 'Over' ? 'text-emerald-400' : 'text-rose-400';

    const card = document.createElement("div");
    card.className = "bg-gray-800 p-4 rounded-lg border-l-4 border-blue-500 shadow-md transition hover:bg-gray-700 flex flex-col";
    card.innerHTML = `
        <div class="flex justify-between items-center mb-1">
            <div class="text-xs text-gray-400 uppercase">${play.marketName.replace(/_/g, ' ')}</div>
            <div class="text-xs font-bold text-blue-300">${play.gameTime} CT</div>
        </div>
        <div class="text-xl font-bold text-white flex items-center flex-wrap mb-2">${play.playerName}</div>
        
        <div class="flex justify-between text-sm mb-1 mt-2">
            <span class="text-gray-300">Target Bet:</span>
            <span class="font-bold ${betColor} text-base uppercase">${play.betType} ${play.targetLine}</span>
        </div>
        <div class="flex justify-between text-sm mb-1">
            <span class="text-gray-300">${play.benchmarkName} Fair Odds:</span>
            <span class="font-bold text-blue-400">${fairOddsStr}</span>
        </div>
        <div class="flex justify-between text-sm mb-2 pb-2 border-b border-gray-700">
            <span class="text-gray-300">Best Available (<span class="text-xs text-gray-400">${play.bestRetailBook}</span>):</span>
            <span class="text-emerald-400 font-bold">${retailOddsStr}</span>
        </div>
        <div class="flex justify-between items-center mb-2 pt-1">
            <span class="text-sm text-gray-400">Pure Math Edge:</span>
            <span class="font-bold text-emerald-400 bg-emerald-900/30 px-2 py-1 rounded text-lg">+${edgePercent}%</span>
        </div>
        <div class="mt-1 flex justify-between items-center border-t border-gray-700 pt-3">
            <span class="text-sm text-gray-400">Unit Size Recommendation:</span>
            <span class="font-bold text-yellow-400">${kellyText}</span>
        </div>
    `;
    grid.appendChild(card);
}

// --- Main Orchestrator ---
async function scanSlate() {
    const apiKey = localStorage.getItem("OddsApiKey");
    document.getElementById("results-grid").innerHTML = ""; 
    globalPlays = []; 
    
    // Read the dropdown value from the UI
    const timeWindowElement = document.getElementById("time-window");
    const maxHoursAhead = timeWindowElement ? parseInt(timeWindowElement.value) : 24;
    
    const targetBookmakers = "pinnacle,williamhill_us,draftkings,fanatics,fanduel,novig,espnbet,betmgm";
    const marketsToScan = "player_pass_yds,player_rush_yds,player_reception_yds,player_receptions";
    
    try {
        updateStatus("Fetching NFL Schedule...");
        const eventsResponse = await fetch(`https://api.the-odds-api.com/v4/sports/americanfootball_nfl/events?apiKey=${apiKey}`);
        const events = await eventsResponse.json();
        
        if (!Array.isArray(events)) {
            throw new Error(events.message || "The API returned an unexpected response format.");
        }
        
        const currentTime = new Date(); 
        let gamesScanned = 0;
        
        for (const game of events) {
            const gameDate = new Date(game.commence_time);
            
            // Skip games already started or finished
            if (gameDate < currentTime) continue; 
            
            // Dynamic Kickoff Filter based on the UI dropdown
            const hoursUntilKickoff = (gameDate - currentTime) / (1000 * 60 * 60);
            if (hoursUntilKickoff > maxHoursAhead) {
                console.log(`Skipping ${game.away_team} @ ${game.home_team} (${hoursUntilKickoff.toFixed(1)}h until kickoff > ${maxHoursAhead}h window)`);
                continue; 
            }
            
            gamesScanned++;
            updateStatus(`Analyzing: ${game.away_team} @ ${game.home_team}...`);
            const timeString = gameDate.toLocaleTimeString('en-US', { timeZone: 'America/Chicago', weekday: 'short', hour: 'numeric', minute: '2-digit', hour12: true });
            
            const oddsUrl = `https://api.the-odds-api.com/v4/sports/americanfootball_nfl/events/${game.id}/odds?apiKey=${apiKey}&markets=${marketsToScan}&bookmakers=${targetBookmakers}&oddsFormat=american`;
            let oddsResponse;
            try {
                oddsResponse = await fetch(oddsUrl);
            } catch(e) { continue; }
            
            let oddsData = await oddsResponse.json();
            
            if (oddsData.message) {
                throw new Error(oddsData.message);
            }
            
            if (!oddsData.bookmakers || oddsData.bookmakers.length === 0) continue;
            
            const marketDict = {};
            for (const bookmaker of oddsData.bookmakers) {
                const bookName = bookmaker.title;
                
                for (const market of bookmaker.markets) {
                    const marketName = market.key;
                    if (!marketDict[marketName]) marketDict[marketName] = {};
                    
                    for (const outcome of market.outcomes) {
                        const playerName = outcome.description;
                        if (!playerName) continue;
                        
                        if (!marketDict[marketName][playerName]) {
                            marketDict[marketName][playerName] = { pinnacle: {}, fanduel: {}, retail: {} };
                        }
                        
                        if (bookmaker.key === 'pinnacle') {
                            marketDict[marketName][playerName].pinnacle[outcome.name] = outcome;
                        } 
                        if (bookmaker.key === 'fanduel') {
                            marketDict[marketName][playerName].fanduel[outcome.name] = outcome;
                        }
                        
                        if (!marketDict[marketName][playerName].retail[bookName]) {
                            marketDict[marketName][playerName].retail[bookName] = {};
                        }
                        marketDict[marketName][playerName].retail[bookName][outcome.name] = outcome;
                    }
                }
            }
            
            // Core Top-Down Evaluation
            for (const [marketName, players] of Object.entries(marketDict)) {
                for (const [playerName, lines] of Object.entries(players)) {
                    
                    const fd = lines.fanduel;
                    const pinny = lines.pinnacle;
                    
                    for (const betType of ['Over', 'Under']) {
                        let targetLine = null;
                        let fairProb = null;
                        let benchmarkName = "";
                        
                        if (fd && fd['Over'] && fd['Under']) {
                            targetLine = fd[betType].point;
                            const devigged = getFairProbability(fd['Over'].price, fd['Under'].price);
                            fairProb = devigged[betType];
                            benchmarkName = "FanDuel";
                        } 
                        else if (pinny && pinny['Over'] && pinny['Under']) {
                            targetLine = pinny[betType].point;
                            const devigged = getFairProbability(pinny['Over'].price, pinny['Under'].price);
                            fairProb = devigged[betType];
                            benchmarkName = "Pinnacle";
                        }
                        
                        if (fairProb === null || targetLine === null) continue;
                        
                        let bestRetailOdds = -Infinity;
                        let bestRetailBook = "";
                        
                        for (const [retailBookName, retailLines] of Object.entries(lines.retail)) {
                            if (retailLines[betType] && retailLines[betType].point === targetLine) {
                                if (retailLines[betType].price > bestRetailOdds) {
                                    bestRetailOdds = retailLines[betType].price;
                                    bestRetailBook = retailBookName;
                                }
                            }
                        }
                        
                        if (bestRetailOdds === -Infinity) continue; 
                        
                        const retailProb = bestRetailOdds > 0 ? 100 / (bestRetailOdds + 100) : Math.abs(bestRetailOdds) / (Math.abs(bestRetailOdds) + 100);
                        const edge = fairProb - retailProb;
                        
                        if (edge >= MIN_EDGE) {
                            globalPlays.push({
                                playerName: playerName,
                                marketName: marketName,
                                betType: betType,
                                targetLine: targetLine,
                                bestRetailOdds: bestRetailOdds,
                                bestRetailBook: bestRetailBook,
                                fairProb: fairProb,
                                edge: edge,
                                benchmarkName: benchmarkName,
                                gameTime: timeString
                            });
                        }
                    }
                }
            }
        }

        globalPlays.sort((a, b) => b.edge - a.edge);
        renderCards();
        updateStatus(`NFL Scan complete. Analyzed ${gamesScanned} game(s) within ${maxHoursAhead}h. Found ${globalPlays.length} play(s).`);
    } catch (error) {
        updateStatus(`Error: ${error.message}`);
        document.getElementById("results-grid").innerHTML = `
            <div class="col-span-full text-red-400 p-6 bg-red-900/20 border border-red-500 rounded text-center mt-4">
                <h3 class="text-xl font-bold mb-2">API Connection Failed</h3>
                <p class="font-mono text-sm">${error.message}</p>
                <p class="mt-4 text-gray-300 text-sm">Verify your key and check your monthly request limit.</p>
            </div>
        `;
        console.error(error);
    }
}

initDashboard();
