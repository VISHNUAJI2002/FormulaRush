/* --- CONFIGURATION & STATE --- */
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

let gameState = {
    isPlaying: false, score: 0, speed: 0, maxSpeed: 0,
    lane: 2, mathMode: 'simple', difficulty: 'easy', 
    controlMode: 'keyboard', distance: 0,
    // Custom Configs
    multipliers: [],
    advancedOps: { squares: false, cubes: false, sqrt: false },
    voiceOps: { shapes: false, diff: false, int: false, trig: false },
    customActive: false
};

const playerImg = new Image(); playerImg.src = "/static/car_player.png"; 

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

// Modal & Tooltip Elements
const btnSysConfig = document.getElementById('btn-sys-config');
const configModal = document.getElementById('config-modal');
const closeModal = document.getElementById('close-modal');
const cursorTooltip = document.getElementById('cursor-tooltip');

/* --- EVENT LISTENERS --- */
btnStart.addEventListener('click', startGame);
btnStop.addEventListener('click', abortRace);
document.addEventListener('keydown', (e) => {
    if (!gameState.isPlaying) return;
    if (gameState.controlMode === 'keyboard') {
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
            if (gameState.controlMode !== 'voice') {
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
            if (isActive) { if (!gameState.multipliers.includes(num)) gameState.multipliers.push(num); }
            else { gameState.multipliers = gameState.multipliers.filter(n => n !== num); }
        } else if (type === 'adv') {
            gameState.advancedOps[value] = isActive;
        } else if (type === 'voice') {
            gameState.voiceOps[value] = isActive;
        }
        
        // CHECK MASTER CUSTOM STATE
        const hasMult = gameState.multipliers.length > 0;
        const hasAdv = Object.values(gameState.advancedOps).some(x => x);
        const hasVoice = Object.values(gameState.voiceOps).some(x => x);
        gameState.customActive = (hasMult || hasAdv || hasVoice);
        
        // DISABLE STANDARD NAV COMPUTER
        if (gameState.customActive) stdNavControls.classList.add('controls-disabled');
        else stdNavControls.classList.remove('controls-disabled');

        // WARNING 2: Gear Suggestion
        // WARNING 2: Gear Suggestion (Only for numeric operations)
        if (isActive && gameState.customActive && gameState.difficulty === 'easy' && type !== 'voice') {
            showTooltip(e.clientX, e.clientY, "SUGGESTION: SHIFT UP (Answers > 9)");
        }   

        if (gameState.isPlaying) generateTwoProblems();
    });
});

/* --- SHAPE SVGs --- */
const SHAPES = {
    triangle: `<svg class="shape-svg" viewBox="0 0 100 100"><polygon points="50,15 90,85 10,85" stroke="cyan" fill="none" stroke-width="5"/></svg>`,
    square: `<svg class="shape-svg" viewBox="0 0 100 100"><rect x="15" y="15" width="70" height="70" stroke="cyan" fill="none" stroke-width="5"/></svg>`,
    circle: `<svg class="shape-svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="35" stroke="cyan" fill="none" stroke-width="5"/></svg>`,
    rectangle: `<svg class="shape-svg" viewBox="0 0 100 100"><rect x="10" y="30" width="80" height="40" stroke="cyan" fill="none" stroke-width="5"/></svg>`,
    pentagon: `<svg class="shape-svg" viewBox="0 0 100 100"><polygon points="50,10 90,40 75,90 25,90 10,40" stroke="cyan" fill="none" stroke-width="5"/></svg>`,
    hexagon: `<svg class="shape-svg" viewBox="0 0 100 100"><polygon points="50,10 85,30 85,70 50,90 15,70 15,30" stroke="cyan" fill="none" stroke-width="5"/></svg>`,
    line: `<svg class="shape-svg" viewBox="0 0 100 100"><line x1="10" y1="90" x2="90" y2="10" stroke="cyan" stroke-width="5"/></svg>`,
    arc: `<svg class="shape-svg" viewBox="0 0 100 100"><path d="M 10 50 Q 50 10 90 50" stroke="cyan" fill="none" stroke-width="5"/></svg>`,
    cube: `<svg class="shape-svg" viewBox="0 0 100 100"><rect x="10" y="30" width="50" height="50" stroke="cyan" fill="none" stroke-width="3"/><rect x="40" y="10" width="50" height="50" stroke="cyan" fill="none" stroke-width="3"/><line x1="10" y1="30" x2="40" y2="10" stroke="cyan" stroke-width="3"/><line x1="60" y1="30" x2="90" y2="10" stroke="cyan" stroke-width="3"/><line x1="10" y1="80" x2="40" y2="60" stroke="cyan" stroke-width="3"/><line x1="60" y1="80" x2="90" y2="60" stroke="cyan" stroke-width="3"/></svg>`,
    semicircle: `<svg class="shape-svg" viewBox="0 0 100 100"><path d="M 10 50 A 40 40 0 0 1 90 50 Z" stroke="cyan" fill="none" stroke-width="5"/></svg>`,
    parallelogram: `<svg class="shape-svg" viewBox="0 0 100 100"><polygon points="25,20 85,20 75,80 15,80" stroke="cyan" fill="none" stroke-width="5"/></svg>`,
    hemisphere: `<svg class="shape-svg" viewBox="0 0 100 100"><path d="M 10 60 A 40 40 0 0 1 90 60 L 90 60 Z" stroke="cyan" fill="none" stroke-width="5"/><ellipse cx="50" cy="60" rx="40" ry="10" stroke="cyan" fill="none" stroke-width="3"/></svg>`
};

/* --- DATA POOLS --- */
const VOICE_DATA = {
    shapes: [
        {html: SHAPES.triangle, a:"triangle"}, {html: SHAPES.square, a:"square"}, 
        {html: SHAPES.circle, a:"circle"}, {html: SHAPES.rectangle, a:"rectangle"},
        {html: SHAPES.pentagon, a:"pentagon"}, {html: SHAPES.hexagon, a:"hexagon"},
        {html: SHAPES.line, a:"line"}, {html: SHAPES.arc, a:"arc"},
        {html: SHAPES.cube, a:"cube"}, {html: SHAPES.semicircle, a:"semicircle"},
        {html: SHAPES.parallelogram, a:"parallelogram"}, {html: SHAPES.hemisphere, a:"hemisphere"}
    ],
    diff: [{t:"d/dx (x²)", a:["2x", "two x"]}, {t:"d/dx (sin x)", a:["cos x", "cost x", "cause x"]}, {t:"d/dx (e^x)", a:["e power x", "e^x", "exponential"]}, {t:"d/dx (ln x)", a:["one by x", "1/x", "one over x"]}],
    int: [{t:"∫ 2x dx", a:["x squared", "x^2", "x square"]}, {t:"∫ cos x dx", a:["sin x", "sign x", "sine x"]}, {t:"∫ 1/x dx", a:["ln x", "log x", "natural log"]}, {t:"∫ e^x dx", a:["e^x", "e power x"]}],
    trig: [{t:"sin(0)", a:"0"}, {t:"cos(0)", a:"1"}, {t:"tan(45°)", a:"1"}, {t:"sin(90°)", a:"1"}]
};

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

    questionLeftEl.innerHTML = leftObj.html || leftObj.text; 
    questionRightEl.innerHTML = rightObj.html || rightObj.text; 
}

function createMathProblem() {
    // STANDARD LOGIC
    if (!gameState.customActive) {
        let n1, n2, op, ans, text, isValid=false, safety=0;
        while (!isValid && safety < 50) {
            safety++;
            let operators = ['+', '-'];
            if (gameState.mathMode === 'mixed') operators.push('*', '/');
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
    if (gameState.controlMode === 'voice') {
        for (const [key, active] of Object.entries(gameState.voiceOps)) {
            if (active) pool.push(...VOICE_DATA[key].map(i => ({text: i.t, html: i.html, answer: i.a, type:'voice'})));
        }
    }
    if (gameState.advancedOps.squares) pool.push({type: 'square'});
    if (gameState.advancedOps.cubes) pool.push({type: 'cube'});
    if (gameState.advancedOps.sqrt) pool.push({type: 'sqrt'});
    if (gameState.multipliers.length > 0) pool.push({type: 'mult'});

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
            n1 = gameState.multipliers[Math.floor(Math.random()*gameState.multipliers.length)];
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
    if (gameState.difficulty === 'easy' && ans < 10 && ans >= 0) return true;
    if (gameState.difficulty === 'medium' && ans >= 0 && ans < 100) return true;
    if (gameState.difficulty === 'hard' && (ans >= 10 || op === '*' || op === '/' || op === 'custom')) return true;
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
    gameState.controlMode = mode;
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
        let interval = (mode === 'voice') ? VOICE_STATS.spawnInterval : SPEEDS[gameState.difficulty].spawnInterval;
        spawnTimer = setInterval(() => { if (gameState.isPlaying) spawnEnemy(); }, interval);
    }
}

function getSelectedRadio(name) {
    const radios = document.getElementsByName(name);
    for (let radio of radios) { if (radio.checked) return radio.value; }
    return 'simple';
}

function updateMathMode() {
    gameState.mathMode = getSelectedRadio('math');
    if (gameState.isPlaying) generateTwoProblems();
}

function shiftGear(level) {
    gameState.difficulty = level;
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
    gameState.maxSpeed = (gameState.controlMode === 'voice') ? VOICE_STATS.max : SPEEDS[gameState.difficulty].max;
}

/* --- GAME ENGINE --- */
function startGame() {
    if (gameState.isPlaying) return;
    btnStart.classList.add('btn-disabled'); btnStop.classList.remove('btn-disabled');
    gameState.mathMode = getSelectedRadio('math');
    applyCurrentPhysics();
    gameState.speed = 0.5; gameState.isPlaying = true; gameState.lane = 2; gameState.score = 0; gameState.distance = 0; enemies = [];
    if (gameState.controlMode === 'voice') {
        if (!recognition) initSpeech();
        try { recognition.start(); } catch(e){}
        micIndicator.classList.add('listening'); micText.innerText = "LISTENING...";
    }
    generateTwoProblems();
    requestAnimationFrame(gameLoop);
    if(spawnTimer) clearInterval(spawnTimer);
    let interval = (gameState.controlMode === 'voice') ? VOICE_STATS.spawnInterval : SPEEDS[gameState.difficulty].spawnInterval;
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
        const trafficMultiplier = (gameState.controlMode === 'voice') ? 0.5 : 0.8;
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
    gameState.isPlaying = false;
    if (recognition) recognition.stop();
    micIndicator.classList.remove('listening'); micText.innerText = "OFFLINE";
    gameOverTitle.innerText = "CRITICAL FAILURE"; gameOverTitle.style.color = "#ff4b2b";
    finalScoreEl.innerText = gameState.score;
    gameOverScreen.style.display = 'flex';
    btnStop.classList.add('btn-disabled');
}