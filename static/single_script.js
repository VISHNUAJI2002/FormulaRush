/* --- CONFIGURATION & STATE --- */
// ================================
// PERSISTENT PLAYER CONFIG
// (DOES NOT RESET ON GAME OVER)
// ================================
const playerConfig = {
    controlMode: 'keyboard',
    difficulty: 'easy',
    mathMode: 'simple',

    multipliers: [],
    advancedOps: {
        squares: false,
        cubes: false,
        sqrt: false
    },
    voiceOps: {
        shapes: false,
        diff: false,
        int: false,
        trig: false
    },
    customActive: false
};

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const CONFIG = {
    laneCount: 5, roadWidth: 800,
    playerWidth: 130, playerHeight: 110,
    enemyWidth: 45, enemyHeight: 85,
    laneWidth: 800 / 5
};

const SPEEDS = {
    easy:   { base: 0.5, max: 2.0, acceleration: 0.00005, spawnInterval: 2500 },
    medium: { base: 0.5, max: 2.5, acceleration: 0.00005, spawnInterval: 2000 },
    hard:   { base: 0.5, max: 3.0, acceleration: 0.00005, spawnInterval: 1800 }
};

const VOICE_STATS = { base: 0.5, max: 1.5, acceleration: 0.000025, spawnInterval: 3900 };

// ================================
// GAME RUNTIME STATE
// (RESETS EVERY GAME)
// ================================
let gameState = {
    isPlaying: false,
    score: 0,
    speed: 0,
    maxSpeed: 0,
    lane: 2,
    distance: 0
};

function savePlayerConfig() {
    localStorage.setItem("formulaRushConfig", JSON.stringify(playerConfig));
}

function loadPlayerConfig() {
    const saved = localStorage.getItem("formulaRushConfig");
    if (!saved) return;

    try {
        const parsed = JSON.parse(saved);
        Object.assign(playerConfig, parsed);

        // --- RESTORE UI STATE FROM CONFIG ---
        // 1. Restore Control Mode (Visuals + Logic)
        if (typeof setControlMode === 'function') setControlMode(playerConfig.controlMode);

        // 2. Restore Difficulty (Visuals: Shifter knob)
        if (typeof shiftGear === 'function') shiftGear(playerConfig.difficulty);

        // 3. Restore Math Mode (Radio Buttons)
        const radios = document.getElementsByName('math');
        for (const radio of radios) {
            if (radio.value === playerConfig.mathMode) radio.checked = true;
        }

        // 4. Restore Feature Toggles (Visual Buttons)
        document.querySelectorAll('.feature-btn').forEach(btn => {
            const type = btn.dataset.type;
            const value = btn.dataset.value;
            let isActive = false;
            
            if (type === 'mult') isActive = playerConfig.multipliers.includes(parseInt(value));
            else if (type === 'adv') isActive = playerConfig.advancedOps[value];
            else if (type === 'voice') isActive = playerConfig.voiceOps[value];

            if (isActive) btn.classList.add('active');
            else btn.classList.remove('active');
        });

        // 5. Restore Nav Controls State
        if (playerConfig.customActive) stdNavControls.classList.add('controls-disabled');
        else stdNavControls.classList.remove('controls-disabled');

    } catch (e) {
        console.warn("Failed to load saved config", e);
    }
}

const playerImg = new Image(); playerImg.src = "/static/car_player.png"; 
// GARAGE INTEGRATION: OVERRIDE DEFAULT IF SELECTED
// ADDED: CAR DIMENSION REGISTRY
const CAR_REGISTRY = {
    'car_default': { width: 130, height: 110, src: 'car_default.png' },
    'car_bronze':  { width: 72, height: 123, src: 'car_bronze.png' },
    'car_silver':  { width: 75, height: 145, src: 'car_silver.png' },
    'car_gold':    { width: 120, height: 120, src: 'car_gold.png' }
};
const storedCar = localStorage.getItem('formulaRush_selectedCar');
if (storedCar && CAR_REGISTRY[storedCar]) {
    playerImg.src = "/static/" + CAR_REGISTRY[storedCar].src;
    CONFIG.playerWidth = CAR_REGISTRY[storedCar].width;
    CONFIG.playerHeight = CAR_REGISTRY[storedCar].height;
}

// Traffic Logic
const TRAFFIC_TYPES = [
    { name: "normal", img: "/static/normal.png", width: 95, height: 105, speedMultiplier: 0.9, spawnWeight: 15 },
    { name: "taxi", img: "/static/car_enemy.png", width: 45, height: 90, speedMultiplier: 0.9, spawnWeight: 45 },    
    { name: "bike", img: "/static/bike.png", width: 73, height: 100, speedMultiplier: 0.6, spawnWeight: 10 },
    { name: "redcar", img: "/static/car1.png", width: 80, height: 115, speedMultiplier: 0.8, spawnWeight: 30 }
];
const enemyImages = {};
TRAFFIC_TYPES.forEach(type => { const img = new Image(); img.src = type.img; enemyImages[type.name] = img; }); 

let enemies = [];
let currentQuestion = null;
let expectedLeft = null; 
let expectedRight = null;
let spawnTimer = null;
let recognition = null; 
let isProcessingSpeech = false; 

/* --- UI ELEMENTS --- */
const questionLeftEl = document.getElementById('question-left');
const questionRightEl = document.getElementById('question-right');
const gameOverScreen = document.getElementById('game-over-screen');
const gameOverTitle = document.getElementById('game-over-title');
const finalScoreEl = document.getElementById('final-score');
const liveDistanceEl = document.getElementById('live-distance');
const speedNeedle = document.getElementById('speed-needle');
const speedValueEl = document.getElementById('speed-value');
const btnStart = document.getElementById('btn-start');
const btnStop = document.getElementById('btn-stop');
const btnModeKey = document.getElementById('btn-mode-key');
const btnModeVoice = document.getElementById('btn-mode-voice');
const micIndicator = document.getElementById('mic-indicator');
const micText = document.getElementById('mic-text');
const shifterAssembly = document.getElementById('shifter-assembly');
const knobNumber = document.getElementById('knob-number');
const labelEasy = document.getElementById('label-easy');
const labelMedium = document.getElementById('label-medium');
const labelHard = document.getElementById('label-hard');
const stdNavControls = document.getElementById('std-nav-controls');

const leftMathValue  = questionLeftEl.querySelector('.math-value');
const rightMathValue = questionRightEl.querySelector('.math-value');

// Modal & Tooltip Elements
const btnSysConfig = document.getElementById('btn-sys-config');
const configModal = document.getElementById('config-modal');
const closeModal = document.getElementById('close-modal');
const cursorTooltip = document.getElementById('cursor-tooltip');
let tooltipTimer = null;

document.querySelectorAll('.feature-btn, .click-zone, .rocker-label, .input-mode-btn').forEach(el => {

    el.addEventListener('mouseenter', (e) => {

        // Freeze values immediately (NO DOM ACCESS LATER)
        const type = el.dataset.type || null;
        const value = el.dataset.value || null;
        const rect = el.getBoundingClientRect();

        tooltipTimer = setTimeout(() => {
            let text = "";

            // MULTIPLICATION TABLES
            if (type === 'mult') {
                text = `Enable multiplication table of ${value} only`;
            }

            // ADVANCED OPS
            else if (type === 'adv') {
                if (value === 'squares') text = "Enable square numbers (x²)";
                if (value === 'cubes') text = "Enable cube numbers (x³)";
                if (value === 'sqrt') text = "Enable square root problems";
            }

            // VOICE OPS
            else if (type === 'voice') {
                if (value === 'shapes') text = "Identify shapes using voice input";
                if (value === 'diff') text = "Solve basic differentiation problems";
                if (value === 'int') text = "Solve basic integration problems";
                if (value === 'trig') text = "Answer trigonometry questions by voice";
            }

            // GEARS
            else if (el.classList.contains('zone-1')) {
                text = "Easy gear: slow speed, single-digit answers";
            }
            else if (el.classList.contains('zone-2')) {
                text = "Medium gear: faster speed, multi-digit answers may appear";
            }
            else if (el.classList.contains('zone-3')) {
                text = "Hard gear: maximum speed and complex questions";
            }

            // MATH MODE ROCKERS
            else if (el.htmlFor === 'math-simple') {
                text = "Basic arithmetic: addition and subtraction only";
            }
            else if (el.htmlFor === 'math-mixed') {
                text = "Advanced arithmetic: +, −, ×, ÷";
            }

            // CONTROL MODE
            else if (el.id === 'btn-mode-key') {
                text = "Keyboard input for numeric answers";
            }
            else if (el.id === 'btn-mode-voice') {
                text = "Voice input for spoken answers";
            }

            if (!text) return;

            cursorTooltip.innerText = text;
            cursorTooltip.style.left = (rect.left + rect.width / 2) + "px";
            cursorTooltip.style.top = (rect.top - 12) + "px";
            cursorTooltip.classList.add('visible');

        }, 1000); // 1 second delay
    });

    el.addEventListener('mouseleave', () => {
        clearTimeout(tooltipTimer);
        cursorTooltip.classList.remove('visible');
    });
});

/* --- EVENT LISTENERS --- */
btnStart.addEventListener('click', startGame);
btnStop.addEventListener('click', abortRace);
document.addEventListener('keydown', (e) => {
    if (!gameState.isPlaying) return;
    if (playerConfig.controlMode === 'keyboard') {
        if (e.key >= '0' && e.key <= '9') { checkAnswer(parseInt(e.key)); }
    }
});

// Modal Logic
btnSysConfig.addEventListener('click', () => { configModal.classList.add('active'); });
closeModal.addEventListener('click', () => { configModal.classList.remove('active'); });

// Tooltip Logic
function showTooltip(x, y, text) {
    cursorTooltip.innerText = text;
    cursorTooltip.style.left = (x + 15) + 'px';
    cursorTooltip.style.top = (y + 15) + 'px';
    cursorTooltip.classList.add('visible');
    setTimeout(() => { cursorTooltip.classList.remove('visible'); }, 2000);
}

// FEATURE TOGGLES (Classy Tile Logic)
document.querySelectorAll('.feature-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const type = btn.dataset.type;
        const value = btn.dataset.value;
        let isActive = btn.classList.contains('active');

        // WARNING 1: Voice Only Check
        if (type === 'voice' && !isActive) {
            if (playerConfig.controlMode !== 'voice') { // Fixed typo Configplayer -> playerConfig
                showTooltip(e.clientX, e.clientY, "REQ: VOICE MODE");
                return;
            }
        }

        // Toggle Visual State
        isActive = !isActive;
        btn.classList.toggle('active');

        // Apply Logic
        if (type === 'mult') {
            const num = parseInt(value);
            if (isActive) { if (!playerConfig.multipliers.includes(num)) playerConfig.multipliers.push(num); }
            else { playerConfig.multipliers = playerConfig.multipliers.filter(n => n !== num); }
        } else if (type === 'adv') {
            playerConfig.advancedOps[value] = isActive;
        } else if (type === 'voice') {
            playerConfig.voiceOps[value] = isActive;
        }
        
        // CHECK MASTER CUSTOM STATE
        const hasMult = playerConfig.multipliers.length > 0;
        const hasAdv = Object.values(playerConfig.advancedOps).some(x => x);
        const hasVoice = Object.values(playerConfig.voiceOps).some(x => x);
        playerConfig.customActive = (hasMult || hasAdv || hasVoice);
        
        // DISABLE STANDARD NAV COMPUTER
        if (playerConfig.customActive) stdNavControls.classList.add('controls-disabled');
        else stdNavControls.classList.remove('controls-disabled');

        // WARNING 2: Gear Suggestion
        // WARNING 2: Gear Suggestion (Only for numeric operations)
        if (isActive && playerConfig.customActive && playerConfig.difficulty === 'easy' && type !== 'voice') {
            showTooltip(e.clientX, e.clientY, "SUGGESTION: SHIFT UP (Answers > 9)");
        }   

        savePlayerConfig(); // Save after toggle change
        if (gameState.isPlaying) generateTwoProblems();
    });
});

/* --- MATH GENERATION --- */
function generateTwoProblems() {
    let leftObj = createMathProblem();
    let rightObj = createMathProblem();
    
    let safe = 0;
    while (JSON.stringify(rightObj.answer) === JSON.stringify(leftObj.answer) && safe < 50) { rightObj = createMathProblem(); safe++; }
    
    expectedLeft = leftObj.answer;
    expectedRight = rightObj.answer;
    
    currentQuestion = {
        leftDigit: (typeof expectedLeft === 'number') ? expectedLeft % 10 : null,
        rightDigit: (typeof expectedRight === 'number') ? expectedRight % 10 : null
    };

    leftMathValue.innerHTML  = leftObj.html || leftObj.text;
    rightMathValue.innerHTML = rightObj.html || rightObj.text;
}

function createMathProblem() {
    // STANDARD LOGIC
    if (!playerConfig.customActive) {
        let n1, n2, op, ans, text, isValid=false, safety=0;
        while (!isValid && safety < 50) {
            safety++;
            let operators = ['+', '-'];
            if (playerConfig.mathMode === 'mixed') operators.push('*', '/');
            op = operators[Math.floor(Math.random() * operators.length)];
            n1 = Math.floor(Math.random()*12)+1; n2 = Math.floor(Math.random()*12)+1;
            
            if (op==='+') { ans=n1+n2; text=`${n1}+${n2}`; }
            else if (op==='-') { ans=Math.max(n1,n2)-Math.min(n1,n2); text=`${Math.max(n1,n2)}-${Math.min(n1,n2)}`; }
            else if (op==='*') { ans=n1*n2; text=`${n1}x${n2}`; }
            else { n1=Math.floor(Math.random()*9)+2; ans=Math.floor(Math.random()*10)+1; text=`${n1*ans}/${n1}`; }
            
            isValid = checkDifficulty(ans, op);
        }
        return { text: text, answer: ans };
    }

    // CUSTOM LOGIC
    let pool = [];
    if (playerConfig.controlMode === 'voice') {
        for (const [key, active] of Object.entries(playerConfig.voiceOps)) {
            if (active) pool.push(...VOICE_DATA[key].map(i => ({text: i.t, html: i.html, answer: i.a, type:'voice'})));
        }
    }
    if (playerConfig.advancedOps.squares) pool.push({type: 'square'});
    if (playerConfig.advancedOps.cubes) pool.push({type: 'cube'});
    if (playerConfig.advancedOps.sqrt) pool.push({type: 'sqrt'});
    if (playerConfig.multipliers.length > 0) pool.push({type: 'mult'});

    if (pool.length === 0) pool.push({type: 'standard'});

    let choice = pool[Math.floor(Math.random() * pool.length)];
    if (choice.type === 'voice') return choice;

    let n1, n2, ans, text, isValid=false, safety=0;
    while (!isValid && safety < 50) {
        safety++; isValid = false;
        if (choice.type === 'square') { n1 = Math.floor(Math.random()*12)+1; ans = n1*n1; text = `${n1}²`; }
        else if (choice.type === 'cube') { n1 = Math.floor(Math.random()*6)+1; ans = n1*n1*n1; text = `${n1}³`; }
        else if (choice.type === 'sqrt') { n1 = Math.floor(Math.random()*12)+1; ans = n1; text = `√${n1*n1}`; }
        else if (choice.type === 'mult') {
            n1 = playerConfig.multipliers[Math.floor(Math.random()*playerConfig.multipliers.length)];
            n2 = Math.floor(Math.random()*12)+1; ans = n1*n2; text = `${n1}x${n2}`;
        }
        else { 
             n1=Math.floor(Math.random()*9)+1; n2=Math.floor(Math.random()*9)+1; ans=n1+n2; text=`${n1}+${n2}`;
        }
        isValid = checkDifficulty(ans, 'custom');
    }
    return { text: text, answer: ans };
}

function checkDifficulty(ans, op) {
    if (playerConfig.difficulty === 'easy' && ans < 10 && ans >= 0) return true;
    if (playerConfig.difficulty === 'medium' && ans >= 0 && ans < 100) return true;
    if (playerConfig.difficulty === 'hard' && (ans >= 10 || op === '*' || op === '/' || op === 'custom')) return true;
    return false;
}

function checkAnswer(input) {
    let correct = false;
    // Number Check
    if (typeof input === 'number' && currentQuestion.leftDigit !== null) {
        if (input === currentQuestion.leftDigit) { if (gameState.lane > 0) gameState.lane--; correct = true; }
        else if (input === currentQuestion.rightDigit) { if (gameState.lane < CONFIG.laneCount - 1) gameState.lane++; correct = true; }
    } 
    // String Check (Voice)
    else if (typeof input === 'string') {
        input = input.toLowerCase().replace('equals', '').trim();
        const checkMatch = (expected) => {
            if (Array.isArray(expected)) return expected.some(val => input.includes(val.toLowerCase()));
            return String(expected).toLowerCase().includes(input);
        };
        if (checkMatch(expectedLeft)) { if (gameState.lane > 0) gameState.lane--; correct = true; }
        else if (checkMatch(expectedRight)) { if (gameState.lane < CONFIG.laneCount - 1) gameState.lane++; correct = true; }
    }
    if (correct) generateTwoProblems();
}

/* --- VOICE INPUT --- */
const wordMap = { 
    'zero':0, 'one':1, 'two':2, 'three':3, 'four':4, 'five':5, 'six':6, 'seven':7, 'eight':8, 'nine':9, 
    'for':4, 'to':2, 'too':2, 'ate':8,
    'sign':'sin', 'sine':'sin', 'cost':'cos', 'course':'cos', 'cause':'cos', 'tan':'tan', 'sec':'sec'
};

function initSpeech() {
    const SpeechChoice = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechChoice) { alert("Voice not supported. Use Chrome."); return; }
    
    recognition = new SpeechChoice();
    recognition.continuous = true;
    recognition.interimResults = true; 
    recognition.lang = 'en-US';

    recognition.onresult = (event) => {
        if (isProcessingSpeech) return;
        const last = event.results.length - 1;
        let transcript = event.results[last][0].transcript.trim().toLowerCase();
        
        for (const [key, val] of Object.entries(wordMap)) { if (transcript === key) transcript = val.toString(); }
        micText.innerText = `HEARD: "${transcript}"`;

        const check = (expected) => {
            if (Array.isArray(expected)) return expected.some(val => transcript.includes(val.toLowerCase()));
            return transcript.includes(String(expected).toLowerCase());
        };

        if (check(expectedLeft)) { processVoice(transcript); return; }
        if (check(expectedRight)) { processVoice(transcript); return; }

        let num = null;
        if (!isNaN(parseInt(transcript))) num = parseInt(transcript);
        else { let match = transcript.match(/\d+/); if (match) num = parseInt(match[0]); }

        if (num !== null) {
            let digit = parseInt(String(num).slice(-1));
            processVoice(digit);
        }
    };

    recognition.onend = () => {
        if (gameState.isPlaying && gameState.controlMode === 'voice') { try { recognition.start(); } catch(e){} } 
        else { micIndicator.classList.remove('listening'); micText.innerText = "STANDBY"; }
    };
}

function processVoice(input) {
    checkAnswer(input);
    isProcessingSpeech = true; micText.innerText = "PROCESSING...";
    setTimeout(() => { isProcessingSpeech = false; if(gameState.isPlaying) micText.innerText = "LISTENING..."; }, 1200);
}

window.setControlMode = function(mode) {
    playerConfig.controlMode = mode;
    savePlayerConfig(); // Save after control change

    if (mode === 'keyboard') {
        btnModeKey.classList.add('active-mode'); btnModeVoice.classList.remove('active-mode');
        micIndicator.classList.remove('visible'); 
        if (recognition) recognition.stop();
    } else {
        btnModeVoice.classList.add('active-mode'); btnModeKey.classList.remove('active-mode');
        micIndicator.classList.add('visible'); 
        if (!recognition) initSpeech();
        if (gameState.isPlaying) { try { recognition.start(); } catch(e){} micIndicator.classList.add('listening'); micText.innerText = "LISTENING..."; }
    }
    if (gameState.isPlaying) {
        applyCurrentPhysics();
        if(spawnTimer) clearInterval(spawnTimer);
        let interval = (mode === 'voice') ? VOICE_STATS.spawnInterval : SPEEDS[playerConfig.difficulty].spawnInterval;
        spawnTimer = setInterval(() => { if (gameState.isPlaying) spawnEnemy(); }, interval);
    }
}

function getSelectedRadio(name) {
    const radios = document.getElementsByName(name);
    for (let radio of radios) { if (radio.checked) return radio.value; }
    return 'simple';
}

function updateMathMode() {
    playerConfig.mathMode = getSelectedRadio('math');
    savePlayerConfig(); // Save after math mode change
    if (gameState.isPlaying) generateTwoProblems();
}

function shiftGear(level) {
    playerConfig.difficulty = level;
    savePlayerConfig(); // Save after gear shift

    if (gameState.isPlaying) applyCurrentPhysics();
    [labelEasy, labelMedium, labelHard].forEach(label => { label.classList.remove('active-label'); label.style.color = ""; label.style.textShadow = ""; });
    if (level === 'hard') {
        shifterAssembly.style.top = "30px"; knobNumber.innerText = "3"; knobNumber.style.color = "#dc3545"; knobNumber.style.textShadow = "0 0 15px #dc3545"; labelHard.classList.add('active-label'); labelHard.style.color = "#dc3545";
    } else if (level === 'medium') {
        shifterAssembly.style.top = "95px"; knobNumber.innerText = "2"; knobNumber.style.color = "#ffc107"; knobNumber.style.textShadow = "0 0 15px #ffc107"; labelMedium.classList.add('active-label'); labelMedium.style.color = "#ffc107";
    } else { 
        shifterAssembly.style.top = "165px"; knobNumber.innerText = "1"; knobNumber.style.color = "#00d2ff"; knobNumber.style.textShadow = "0 0 15px #00d2ff"; labelEasy.classList.add('active-label'); labelEasy.style.color = "#00d2ff";
    }
}

function applyCurrentPhysics() {
    gameState.maxSpeed = (playerConfig.controlMode === 'voice') ? VOICE_STATS.max : SPEEDS[playerConfig.difficulty].max;
}

/* --- GAME ENGINE --- */
function startGame() {
    if (gameState.isPlaying) return;
    btnStart.classList.add('btn-disabled'); btnStop.classList.remove('btn-disabled');
    
    // Ensure math mode is synced with UI/Config before start
    playerConfig.mathMode = getSelectedRadio('math');
    savePlayerConfig();

    applyCurrentPhysics();
    gameState.speed = 0.5; gameState.isPlaying = true; gameState.lane = 2; gameState.score = 0; gameState.distance = 0; enemies = [];
    if (playerConfig.controlMode === 'voice') {
        if (!recognition) initSpeech();
        try { recognition.start(); } catch(e){}
        micIndicator.classList.add('listening'); micText.innerText = "LISTENING...";
    }
    generateTwoProblems();
    requestAnimationFrame(gameLoop);
    if(spawnTimer) clearInterval(spawnTimer);
    let interval = (playerConfig.controlMode === 'voice') ? VOICE_STATS.spawnInterval : SPEEDS[playerConfig.difficulty].spawnInterval;
    spawnTimer = setInterval(() => { if (gameState.isPlaying) spawnEnemy(); }, interval);
}
function abortRace() {
    if (!gameState.isPlaying) return;
    gameState.isPlaying = false;
    if (recognition) recognition.stop();
    micIndicator.classList.remove('listening'); micText.innerText = "STANDBY";
    gameOverTitle.innerText = "RACE ABORTED"; gameOverTitle.style.color = "#ffc107"; 
    finalScoreEl.innerText = gameState.score;
    gameOverScreen.style.display = 'flex';
    btnStop.classList.add('btn-disabled');
}
function spawnEnemy() {
    const lane = Math.floor(Math.random() * CONFIG.laneCount);
    const totalWeight = TRAFFIC_TYPES.reduce((sum, t) => sum + t.spawnWeight, 0);
    let rand = Math.random() * totalWeight;
    let chosenType = TRAFFIC_TYPES[0];
    for (let t of TRAFFIC_TYPES) { rand -= t.spawnWeight; if (rand <= 0) { chosenType = t; break; } }
    enemies.push({ lane: lane, y: -150, type: chosenType, speedOffset: Math.random() * 0.5 });
}
function updatePhysics() {
    if (gameState.speed < gameState.maxSpeed) gameState.speed += 0.01;
    if (gameState.speed > gameState.maxSpeed) gameState.speed -= 0.02;
    gameState.distance += gameState.speed;
    gameState.score = Math.floor(gameState.distance / 10);
    liveDistanceEl.innerText = gameState.score;
}
function updateSpeedometer() {
    const maxS = 20; let pct = gameState.speed / maxS; if(pct > 1) pct = 1;
    speedNeedle.style.transform = `rotate(${225 + (pct * 270)}deg)`;
    speedValueEl.innerText = Math.floor(gameState.speed * 10); 
}
function drawCar(img, x, y, w, h, color) {
    if (img.complete && img.naturalHeight !== 0) ctx.drawImage(img, x, y, w, h);
    else { ctx.fillStyle = color; ctx.fillRect(x, y, w, h); }
}
function gameLoop() {
    if (!gameState.isPlaying) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    updatePhysics(); updateSpeedometer();
    ctx.fillStyle = "#222"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.3)"; ctx.lineWidth = 4;
    ctx.setLineDash([30, 30]);
    const lineOffset = gameState.distance % 60;
    ctx.beginPath();
    for (let i = 1; i < CONFIG.laneCount; i++) { let x = i * CONFIG.laneWidth; ctx.moveTo(x, -60 + lineOffset); ctx.lineTo(x, canvas.height + lineOffset); }
    ctx.stroke();
    const playerX = (gameState.lane * CONFIG.laneWidth) + (CONFIG.laneWidth/2) - (CONFIG.playerWidth/2);
    const playerY = canvas.height - 150;
    drawCar(playerImg, playerX, playerY, CONFIG.playerWidth, CONFIG.playerHeight, "cyan");
    for (let i = 0; i < enemies.length; i++) {
        let e = enemies[i];
        const trafficMultiplier = (playerConfig.controlMode === 'voice') ? 0.5 : 0.8;
        e.y += (gameState.speed * trafficMultiplier * e.type.speedMultiplier) + e.speedOffset;
        const ex = (e.lane * CONFIG.laneWidth) + (CONFIG.laneWidth / 2) - (e.type.width / 2);
        drawCar(enemyImages[e.type.name], ex, e.y, e.type.width, e.type.height, "red");
        const p = 10; 
        if (playerX + p < ex + e.type.width - p && playerX + CONFIG.playerWidth - p > ex + p && playerY + p < e.y + e.type.height - p && playerY + CONFIG.playerHeight - p > e.y + p) { gameOver(); }
        if (e.y > canvas.height) { enemies.splice(i, 1); i--; }
    }
    requestAnimationFrame(gameLoop);
}
function gameOver() {
    // --- GARAGE UPDATE: SAVE HIGH SCORE FOR UNLOCKS ---
    const currentHigh = parseInt(localStorage.getItem('formulaRush_highScore') || '0');
    if (gameState.score > currentHigh) {
        localStorage.setItem('formulaRush_highScore', gameState.score);
    }

    // --- SUBMIT SINGLE PLAYER SCORE ---
    fetch("/submit_score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            score: gameState.score,
            mode: "single"
        })
    });

    gameState.isPlaying = false;
    if (recognition) recognition.stop();
    micIndicator.classList.remove('listening'); micText.innerText = "OFFLINE";
    gameOverTitle.innerText = "CRITICAL FAILURE"; gameOverTitle.style.color = "#ff4b2b";
    finalScoreEl.innerText = gameState.score;
    gameOverScreen.style.display = 'flex';
    btnStop.classList.add('btn-disabled');
}

// Load saved config and update UI elements immediately
loadPlayerConfig();