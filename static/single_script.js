/* --- CONFIGURATION & STATE --- */
// ================================
// PERSISTENT PLAYER CONFIG
// (DOES NOT RESET ON GAME OVER)
// ================================
// --- NEW: MISSION LOADOUT (Read from URL) ---
/* --- CONFIGURATION & STATE --- */

// 1. GLOBAL ECONOMY VARIABLES (Must be here to avoid crashes)
let activeLoadout = { shield: false, nitro: false, copilot: false };
let sessionStats = { correct: 0, wrong: 0 };
let loadoutCost = 0;
let telemetryLog = [];
let autoPilotActive = false;
let currentOperands = [];

// Helper: Extract numeric operands (1-12) from question text
function extractOperands(text) {
    const nums = text.match(/\d+/g);
    if (!nums) return [];
    return nums.map(Number).filter(n => n >= 1 && n <= 12);
}

// ============================================
// AUTO-PILOT ENGINE — Client-Side DDA System
// Uses rolling-window telemetry analysis for
// dynamic difficulty adjustment.
// ============================================
class AutoPilotEngine {
    constructor() {
        this.WINDOW_SIZE = 4;      // Small window for fast responsiveness
        this.COOLDOWN_MS = 5000;   // 5s cooldown (kid-friendly, less waiting)
        this.CONFIRM_COUNT = 2;    // Only 2 consecutive confirmations needed
        this.window = [];
        this.strugglingMap = {};
        this.lastShiftTime = 0;
        this.consecutiveRecommendation = null;
        this.consecutiveCount = 0;
        this.recentTimestamps = [];
        this.thresholds = {
            up: {
                easy:   { accuracy: 0.85, maxRT: 6.0, struggleErrorRate: 0.40 },
                medium: { accuracy: 0.85, maxRT: 4.0, struggleErrorRate: 0.30 }
            },
            down: {
                hard:   { accuracy: 0.60, maxRT: 8.0 },
                medium: { accuracy: 0.60, maxRT: 6.0 }
            }
        };
    }

    record(entry) {
        this.window.push(entry);
        if (this.window.length > this.WINDOW_SIZE) this.window.shift();
        this.recentTimestamps.push(entry.timestamp);
        const cutoff = entry.timestamp - 30000;
        this.recentTimestamps = this.recentTimestamps.filter(t => t > cutoff);
        if (entry.operands) {
            for (const op of entry.operands) {
                if (op < 1 || op > 12) continue;
                if (!this.strugglingMap[op]) {
                    this.strugglingMap[op] = { attempts: 0, errors: 0, totalRT: 0 };
                }
                this.strugglingMap[op].attempts++;
                if (!entry.correct) this.strugglingMap[op].errors++;
                this.strugglingMap[op].totalRT += entry.reactionTime;
            }
        }
    }

    evaluate(currentGear) {
        if (this.window.length < this.WINDOW_SIZE) return 'hold';
        const correctCount = this.window.filter(e => e.correct).length;
        const accuracy = correctCount / this.window.length;
        const avgRT = this.window.reduce((s, e) => s + e.reactionTime, 0) / this.window.length;
        const inputRate = this.recentTimestamps.length / 30;
        if (inputRate < 0.1) return 'hold';
        const hasHeavyStruggling = this._checkStruggling(currentGear, avgRT);
        if (currentGear === 'hard' || currentGear === 'medium') {
            const dt = this.thresholds.down[currentGear];
            if (dt && (accuracy < dt.accuracy || avgRT > dt.maxRT)) return 'down';
        }
        if (currentGear === 'easy' || currentGear === 'medium') {
            const ut = this.thresholds.up[currentGear];
            if (ut && accuracy >= ut.accuracy && avgRT < ut.maxRT && !hasHeavyStruggling) return 'up';
        }
        return 'hold';
    }

    _checkStruggling(currentGear, overallAvgRT) {
        const threshold = (currentGear === 'easy') ? 0.40 : 0.30;
        for (const [op, data] of Object.entries(this.strugglingMap)) {
            if (data.attempts < 3) continue;
            const errRate = data.errors / data.attempts;
            const opAvgRT = data.totalRT / data.attempts;
            if (errRate > threshold || opAvgRT > overallAvgRT * 2) return true;
        }
        return false;
    }

    tryShift(currentGear) {
        const recommendation = this.evaluate(currentGear);
        if (recommendation === 'hold') {
            this.consecutiveCount = 0;
            this.consecutiveRecommendation = null;
            return null;
        }
        if (recommendation === this.consecutiveRecommendation) {
            this.consecutiveCount++;
        } else {
            this.consecutiveRecommendation = recommendation;
            this.consecutiveCount = 1;
        }
        if (this.consecutiveCount < this.CONFIRM_COUNT) return null;
        const now = Date.now();
        if (now - this.lastShiftTime < this.COOLDOWN_MS) return null;
        let nextGear = currentGear;
        if (recommendation === 'up') {
            if (currentGear === 'easy') nextGear = 'medium';
            else if (currentGear === 'medium') nextGear = 'hard';
        } else if (recommendation === 'down') {
            if (currentGear === 'hard') nextGear = 'medium';
            else if (currentGear === 'medium') nextGear = 'easy';
        }
        if (nextGear !== currentGear) {
            this.lastShiftTime = now;
            this.consecutiveCount = 0;
            this.consecutiveRecommendation = null;
            return nextGear;
        }
        return null;
    }

    getMetrics() {
        if (this.window.length === 0) {
            return { accuracy: 0, avgRT: '0.0', inputRate: '0.00', windowFill: 0, windowSize: this.WINDOW_SIZE, struggling: [] };
        }
        const correctCount = this.window.filter(e => e.correct).length;
        const accuracy = Math.round((correctCount / this.window.length) * 100);
        const avgRT = (this.window.reduce((s, e) => s + e.reactionTime, 0) / this.window.length).toFixed(1);
        const inputRate = (this.recentTimestamps.length / 30).toFixed(2);
        const struggling = [];
        const overallAvgRT = parseFloat(avgRT);
        for (const [op, data] of Object.entries(this.strugglingMap)) {
            if (data.attempts < 3) continue;
            const errRate = data.errors / data.attempts;
            const opAvgRT = data.totalRT / data.attempts;
            if (errRate > 0.30 || opAvgRT > overallAvgRT * 2) struggling.push(parseInt(op));
        }
        return { accuracy, avgRT, inputRate, windowFill: this.window.length, windowSize: this.WINDOW_SIZE, struggling };
    }

    reset() {
        this.window = [];
        this.strugglingMap = {};
        this.lastShiftTime = 0;
        this.consecutiveRecommendation = null;
        this.consecutiveCount = 0;
        this.recentTimestamps = [];
    }
}

const autoPilotEngine = new AutoPilotEngine();

// Update the Auto-Pilot HUD elements (confidence bar + status text)
function updateAutoPilotUI() {
    if (!autoPilotActive) return;
    const statusText = document.getElementById('ai-status-text');
    const confidenceBar = document.getElementById('ai-confidence-bar');
    if (!statusText || !confidenceBar) return;
    const metrics = autoPilotEngine.getMetrics();
    confidenceBar.style.width = metrics.accuracy + '%';
    if (metrics.accuracy >= 85) {
        confidenceBar.style.background = '#2ecc71';
        confidenceBar.style.boxShadow = '0 0 8px #2ecc71';
    } else if (metrics.accuracy >= 60) {
        confidenceBar.style.background = '#f39c12';
        confidenceBar.style.boxShadow = '0 0 8px #f39c12';
    } else {
        confidenceBar.style.background = '#e74c3c';
        confidenceBar.style.boxShadow = '0 0 8px #e74c3c';
    }
    if (metrics.windowFill < metrics.windowSize) {
        statusText.innerText = `CALIBRATING ${metrics.windowFill}/${metrics.windowSize}`;
        statusText.style.color = '#9b59b6';
    } else if (metrics.struggling.length > 0) {
        statusText.innerText = `STRUGGLING: ${metrics.struggling.join(', ')}`;
        statusText.style.color = '#e74c3c';
    } else {
        statusText.innerText = `ACC: ${metrics.accuracy}% | RT: ${metrics.avgRT}s`;
        statusText.style.color = '#9b59b6';
    }
}

// 2. READ URL PARAMS (To detect purchased items)
const urlParams = new URLSearchParams(window.location.search);
activeLoadout.shield = urlParams.get('shield') === '1';
activeLoadout.nitro = urlParams.get('nitro') === '1';
activeLoadout.copilot = urlParams.get('copilot') === '1';


// --- AUDIO MANAGER ---
const sfx = {
    click: new Audio('/static/sounds/click.mp3'),
    crash: new Audio('/static/sounds/crash.mp3'),
    correct: new Audio('/static/sounds/correct.mp3'),
    wrong: new Audio('/static/sounds/wrong.mp3'),
    engine: new Audio('/static/sounds/engine.mp3'),
    rev: new Audio('/static/sounds/rev.mp3'),       
    shift: new Audio('/static/sounds/shift.mp3'),
    play: function(soundName) {
            if (!this[soundName]) return; // Safety check
            
            // Creating a new Audio object from the source guarantees 
            // it plays immediately without cloneNode buffer issues
            let sound = new Audio(this[soundName].src); 
            sound.volume = 0.6; 
            sound.play().catch(e => console.log("Audio play prevented:", e));
        },   

    play: function(soundName) {
        let sound = this[soundName].cloneNode(); 
        sound.volume = 0.6; 
        sound.play().catch(e => console.log("Audio play prevented:", e));
    },

    startEngine: function() {
        this.engine.loop = true;
        this.engine.volume = 0.3; 
        this.engine.play().catch(e => console.log("Engine play prevented:", e));
    },
    
    stopEngine: function() {
        this.engine.pause();
    }
};

// 3. CREATE HUD CONTAINER
if (!document.getElementById('loadout-hud')) {
    const hud = document.createElement('div');
    hud.id = 'loadout-hud';
    hud.style.position = 'absolute'; hud.style.top = '80px'; hud.style.left = '20px';
    hud.style.display = 'flex'; hud.style.gap = '10px'; hud.style.zIndex = '100';
    document.body.appendChild(hud);
}

function updateLoadoutHUD() {
    const hud = document.getElementById('loadout-hud');
    hud.innerHTML = '';
    // Only show icon if active
    if (activeLoadout.shield) hud.innerHTML += '<div style="font-size:2rem; text-shadow:0 0 10px cyan;">🛡️</div>';
    if (activeLoadout.nitro) hud.innerHTML += '<div style="font-size:2rem; text-shadow:0 0 10px orange;">🚀</div>';
    if (activeLoadout.copilot) hud.innerHTML += '<div style="font-size:2rem; text-shadow:0 0 10px violet;">🧠</div>';
}

function toggleAutoPilot() {
    autoPilotActive = !autoPilotActive;
    const btn = document.getElementById('btn-ai-auto');
    const statusText = document.getElementById('ai-status-text');
    const confidenceBar = document.getElementById('ai-confidence-bar');

    if (autoPilotActive) {
        btn.innerText = "AUTO-PILOT:\nACTIVE";
        btn.classList.add('ai-active');
        autoPilotEngine.reset();
        if (statusText) statusText.innerText = "CALIBRATING...";
        if (confidenceBar) confidenceBar.style.width = "0%";
        console.log("AI AUTO-PILOT ENGAGED — Client-Side DDA Active");
    } else {
        btn.innerText = "PILOT\nSYSTEM";
        btn.classList.remove('ai-active');
        if (statusText) statusText.innerText = "OFFLINE";
        if (confidenceBar) confidenceBar.style.width = "0%";
        console.log("AI AUTO-PILOT DISENGAGED");
    }
}

// ================================
// PERSISTENT PLAYER CONFIG
// --- 0. CAREER TRACKING INIT ---
let raceSession = {
    startTime: Date.now(),
    mistakes: {},
    difficulty: 'easy',     // Will sync with playerConfig
    controlMethod: 'keyboard',
    inputStats: { total: 0 }
};
let questionStartTime = 0;

function logMistake(questionText) {
    if (!raceSession.mistakes[questionText]) {
        raceSession.mistakes[questionText] = 0;
    }
    raceSession.mistakes[questionText]++;
}

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

/* --- PHYSICS CONSTANTS --- */
// 1. KEYBOARD MODE (Standard)
const SPEEDS = {
    easy: { base: 0.8, max: 1.8, acceleration: 0.0009, spawnInterval: 2500 },
    medium: { base: 1.9, max: 2.8, acceleration: 0.0009, spawnInterval: 2000 },
    hard: { base: 2.9, max: 5.0, acceleration: 0.002, spawnInterval: 1200 }
};

// 2. VOICE MODE (Generally Slower - Speaking takes time)
const VOICE_STATS = {
    easy: { base: 0.2, max: 1.2, acceleration: 0.01, spawnInterval: 4000 },
    medium: { base: 0.5, max: 2.0, acceleration: 0.015, spawnInterval: 3500 },
    hard: { base: 1.0, max: 3.0, acceleration: 0.02, spawnInterval: 3000 }
};

// 3. GESTURE MODE (needs high base speed to clear safety gap)
const GESTURE_STATS = {
    easy: { base: 0.5, max: 1.5, acceleration: 0.003, spawnInterval: 2500 },
    medium: { base: 1.7, max: 2.1, acceleration: 0.004, spawnInterval: 2000 }, // Your "Sweet Spot"
    hard: { base: 1.8, max: 3.0, acceleration: 0.005, spawnInterval: 1500 }
};
// --- HELPER: GET CURRENT PHYSICS STATS ---
// --- HELPER: GET CURRENT PHYSICS STATS ---
function getCurrentStats() {
    // 1. Determine which "Profile" to use based on Control Mode
    let profile;
    if (playerConfig.controlMode === 'voice') {
        profile = VOICE_STATS;
    }
    else if (playerConfig.controlMode === 'gesture') {
        profile = GESTURE_STATS;
    }
    else {
        profile = SPEEDS; // Keyboard
    }

    // 2. Return the specific stats for the current Gear
    // (difficulty is 'easy', 'medium', or 'hard')
    return profile[playerConfig.difficulty];
}

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
        if (stdNavControls) {
            if (playerConfig.customActive) stdNavControls.classList.add('controls-disabled');
            else stdNavControls.classList.remove('controls-disabled');
        }

    } catch (e) {
        console.warn("Failed to load saved config", e);
    }
}

const playerImg = new Image(); playerImg.src = "/static/car_player.png";
// GARAGE INTEGRATION: OVERRIDE DEFAULT IF SELECTED
// ADDED: CAR DIMENSION REGISTRY
const CAR_REGISTRY = {
    'car_default': { width: 120, height: 105, src: 'car_default.png' },
    'car_bronze': { width: 72, height: 123, src: 'car_bronze.png' },
    'car_silver': { width: 75, height: 145, src: 'car_silver.png' },
    'car_gold': { width: 120, height: 120, src: 'car_gold.png' }
};
const storedCar = localStorage.getItem('formulaRush_selectedCar');
if (storedCar && CAR_REGISTRY[storedCar]) {
    playerImg.src = "/static/" + CAR_REGISTRY[storedCar].src;
    CONFIG.playerWidth = CAR_REGISTRY[storedCar].width;
    CONFIG.playerHeight = CAR_REGISTRY[storedCar].height;
}

// Traffic Logic
const TRAFFIC_TYPES = [
    { name: "normal", img: "/static/normal.png", width: 95, height: 105, speedMultiplier: 1.0, spawnWeight: 15 },
    { name: "taxi", img: "/static/car_enemy.png", width: 45, height: 90, speedMultiplier: 0.85, spawnWeight: 45 },
    { name: "bike", img: "/static/bike.png", width: 73, height: 100, speedMultiplier: 0.9, spawnWeight: 10 },
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
let lastActedResultIndex = -1;

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

const leftMathValue = questionLeftEl.querySelector('.math-value');
const rightMathValue = questionRightEl.querySelector('.math-value');

// GESTURE UI ELEMENTS
const btnModeGesture = document.getElementById('btn-mode-gesture');
const cameraContainer = document.getElementById('camera-container');
const videoElement = document.getElementById('gesture-video');
const canvasElement = document.getElementById('gesture-canvas');
const canvasCtx = canvasElement.getContext('2d');

// AI STATE
let hands = null;
let camera = null;
let lastDetectedFingerCount = -1;
let gestureDebounceTimer = null;

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
    if (e.code === 'Space' && activeLoadout.copilot) {
        activateCoPilot();
    }
});

// Modal Logic
if (btnSysConfig) btnSysConfig.addEventListener('click', () => { configModal.classList.add('active'); });
closeModal.addEventListener('click', () => { configModal.classList.remove('active'); });

// Tooltip Logic
function showTooltip(x, y, text) {
    cursorTooltip.innerText = text;
    cursorTooltip.style.left = (x + 15) + 'px';
    cursorTooltip.style.top = (y + 15) + 'px';
    cursorTooltip.classList.add('visible');
    setTimeout(() => { cursorTooltip.classList.remove('visible'); }, 2000);
}

// LOW VARIETY DETECTION — Edge Case Warning
// Detects when easy gear + custom math config produces too few unique
// questions, which causes repetitive or broken gameplay.
//
// Full analysis for easy gear (answer must be < 10):
//   X2: 4 valid  |  X3: 3  |  X4: 2  |  X5–X9: 1 each
//   X10–X11: 0 (game-breaking — no valid question exists!)
//   Squares: 3 (1²,2²,3²)  |  Cubes: 2 (1³,2³)  |  Sqrt: 9
//
// Any single table alone is problematic. Combinations can be too.
function checkLowVariety() {
    // Only relevant when custom mode is active and gear is easy
    if (!playerConfig.customActive || playerConfig.difficulty !== 'easy') return;

    const hasMult = playerConfig.multipliers.length > 0;
    const hasAdv = Object.values(playerConfig.advancedOps).some(x => x);

    // If no numeric custom ops are active, nothing to check
    if (!hasMult && !hasAdv) return;

    // Collect all possible valid answers (unique) to gauge true variety
    const validAnswers = new Set();

    // Count valid multiplication questions
    if (hasMult) {
        for (const table of playerConfig.multipliers) {
            for (let n2 = 1; n2 <= 12; n2++) {
                const ans = table * n2;
                if (ans >= 0 && ans < 10) validAnswers.add(table + 'x' + n2);
            }
        }
    }

    // Count valid advanced op questions
    if (playerConfig.advancedOps.squares) {
        for (let n = 1; n <= 12; n++) { if (n * n >= 0 && n * n < 10) validAnswers.add('sq_' + n); }
    }
    if (playerConfig.advancedOps.cubes) {
        for (let n = 1; n <= 6; n++) { if (n * n * n >= 0 && n * n * n < 10) validAnswers.add('cb_' + n); }
    }
    if (playerConfig.advancedOps.sqrt) {
        for (let n = 1; n <= 12; n++) { if (n >= 0 && n < 10) validAnswers.add('sqrt_' + n); }
    }

    // Threshold: 4 or fewer unique questions = repetitive/broken gameplay
    // (The game needs 2 different questions on screen at once, so ≤4 is critical)
    if (validAnswers.size <= 4) {
        const popup = document.getElementById('low-variety-warning');
        if (popup) popup.classList.add('active');
        return true; // low variety detected
    }
    return false; // variety is fine
}

// Called by CONFIRM button in config modal
function confirmConfig() {
    const isLow = checkLowVariety();
    if (!isLow) {
        // No issue — close modal normally
        document.getElementById('config-modal').classList.remove('active');
    }
    // If low variety detected, checkLowVariety already showed the warning popup
}

// Called by "CONFIRM ANYWAY" button in warning popup
function confirmAnyway() {
    document.getElementById('low-variety-warning').classList.remove('active');
    document.getElementById('config-modal').classList.remove('active');
}

// Called by "RECONFIGURE" button in warning popup
function reconfigFromWarning() {
    document.getElementById('low-variety-warning').classList.remove('active');
    // Config modal stays open so user can adjust settings
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
        if (stdNavControls) {
            if (playerConfig.customActive) stdNavControls.classList.add('controls-disabled');
            else stdNavControls.classList.remove('controls-disabled');
        }

        // WARNING 2: Gear Suggestion
        // WARNING 2: Gear Suggestion (Only for numeric operations)
        if (isActive && playerConfig.customActive && playerConfig.difficulty === 'easy' && type !== 'voice') {
            showTooltip(e.clientX, e.clientY, "SUGGESTION: SHIFT UP (Answers > 9)");
        }

        savePlayerConfig(); // Save after toggle change
        if (gameState.isPlaying) generateTwoProblems();
    });
});

// CLEAR ALL FEATURES (Called from modal Clear All button)
function clearAllFeatures() {
    // 1. Remove visual active state from all feature buttons
    document.querySelectorAll('.feature-btn.active').forEach(b => b.classList.remove('active'));

    // 2. Reset playerConfig state
    playerConfig.multipliers = [];
    playerConfig.advancedOps = { squares: false, cubes: false, sqrt: false };
    playerConfig.voiceOps = { shapes: false, diff: false, int: false, trig: false };
    playerConfig.customActive = false;

    // 3. Re-enable Nav Computer
    if (stdNavControls) {
        stdNavControls.classList.remove('controls-disabled');
    }

    // 4. Persist the reset
    savePlayerConfig();

    // 5. Regenerate problems if game is running
    if (gameState.isPlaying) generateTwoProblems();
}

/* --- MATH GENERATION --- */
function generateTwoProblems() {
    // Store previous answers to prevent double-steering from stale voice input
    const prevLeft = expectedLeft;
    const prevRight = expectedRight;

    const answersMatch = (a, b) => {
        if (a === undefined || a === null || b === undefined || b === null) return false;
        return JSON.stringify(a) === JSON.stringify(b);
    };

    // Generate LEFT: must not match either previous answer
    let leftObj = createMathProblem();
    let safe = 0;
    while (safe < 50 && (answersMatch(leftObj.answer, prevLeft) || answersMatch(leftObj.answer, prevRight))) {
        leftObj = createMathProblem(); safe++;
    }

    // Generate RIGHT: must not match left, and must not match either previous answer
    let rightObj = createMathProblem();
    safe = 0;
    while (safe < 50 && (
        answersMatch(rightObj.answer, leftObj.answer) ||
        answersMatch(rightObj.answer, prevLeft) ||
        answersMatch(rightObj.answer, prevRight)
    )) {
        rightObj = createMathProblem(); safe++;
    }

    expectedLeft = leftObj.answer;
    expectedRight = rightObj.answer;

    currentQuestion = {
        leftDigit: (typeof expectedLeft === 'number') ? expectedLeft % 10 : null,
        rightDigit: (typeof expectedRight === 'number') ? expectedRight % 10 : null
    };

    leftMathValue.innerHTML = leftObj.html || leftObj.text;
    rightMathValue.innerHTML = rightObj.html || rightObj.text;
    questionStartTime = Date.now(); // Mark the exact millisecond the question appeared
    // Extract operands for Auto-Pilot struggling numbers tracking
    currentOperands = extractOperands((leftObj.text || '') + ' ' + (rightObj.text || ''));
}

function createMathProblem() {
    // STANDARD LOGIC
    if (!playerConfig.customActive) {
        let n1, n2, op, ans, text, isValid = false, safety = 0;
        while (!isValid && safety < 50) {
            safety++;

            // CAMPAIGN MODE: Check LEVEL_CONTEXT.ops for allowed operations
            let operators = ['+', '-'];
            let tableRange = null; // For specific multiplication tables

            if (typeof LEVEL_CONTEXT !== 'undefined' && LEVEL_CONTEXT.mode === 'campaign' && LEVEL_CONTEXT.ops && LEVEL_CONTEXT.ops.length > 0) {
                operators = [];

                // Map campaign op keys → their table ranges
                const RANGE_MAP = {
                    'mult_1_2': [1, 2],
                    'mult_3_4': [3, 4],
                    'mult_5_6': [5, 6],
                    'mult_7_8': [7, 8],
                    'mult_9_10': [9, 10]
                };

                // Basic operations
                if (LEVEL_CONTEXT.ops.includes('addition')) operators.push('+');
                if (LEVEL_CONTEXT.ops.includes('subtraction')) operators.push('-');
                if (LEVEL_CONTEXT.ops.includes('division')) operators.push('/');

                // Specific multiplication table ranges
                for (const [key, range] of Object.entries(RANGE_MAP)) {
                    if (LEVEL_CONTEXT.ops.includes(key)) {
                        operators.push('*');
                        tableRange = range; // Last matched range wins (only one active per level)
                    }
                }

                // Legacy / generic multiplication support
                if (LEVEL_CONTEXT.ops.includes('mult_easy')) operators.push('*');

                // All operations (final level)
                if (LEVEL_CONTEXT.ops.includes('all_ops') || LEVEL_CONTEXT.ops.includes('mixed')) {
                    operators = ['+', '-', '*', '/'];
                    tableRange = null; // No restriction for mixed level
                }

                // Fallback if no operators matched
                if (operators.length === 0) operators = ['+'];
            } else if (playerConfig.mathMode === 'mixed') {
                operators.push('*', '/');
            }

            op = operators[Math.floor(Math.random() * operators.length)];

            // Generate numbers based on operation type
            if (op === '*' && tableRange) {
                // Use specific table range for multiplication
                n1 = tableRange[Math.floor(Math.random() * tableRange.length)];
                n2 = Math.floor(Math.random() * 12) + 1;
            } else {
                n1 = Math.floor(Math.random() * 12) + 1;
                n2 = Math.floor(Math.random() * 12) + 1;
            }

            if (op === '+') { ans = n1 + n2; text = `${n1}+${n2}`; }
            else if (op === '-') { ans = Math.max(n1, n2) - Math.min(n1, n2); text = `${Math.max(n1, n2)}-${Math.min(n1, n2)}`; }
            else if (op === '*') { ans = n1 * n2; text = `${n1}x${n2}`; }
            else { n1 = Math.floor(Math.random() * 9) + 2; ans = Math.floor(Math.random() * 10) + 1; text = `${n1 * ans}/${n1}`; }

            isValid = checkDifficulty(ans, op);
        }
        return { text: text, answer: ans };
    }

    // CUSTOM LOGIC
    let pool = [];
    if (playerConfig.controlMode === 'voice') {
        for (const [key, active] of Object.entries(playerConfig.voiceOps)) {
            if (active) pool.push(...VOICE_DATA[key].map(i => ({ text: i.t, html: i.html, answer: i.a, type: 'voice' })));
        }
    }
    if (playerConfig.advancedOps.squares) pool.push({ type: 'square' });
    if (playerConfig.advancedOps.cubes) pool.push({ type: 'cube' });
    if (playerConfig.advancedOps.sqrt) pool.push({ type: 'sqrt' });
    if (playerConfig.multipliers.length > 0) pool.push({ type: 'mult' });

    if (pool.length === 0) pool.push({ type: 'standard' });

    let choice = pool[Math.floor(Math.random() * pool.length)];
    if (choice.type === 'voice') return choice;

    let n1, n2, ans, text, isValid = false, safety = 0;
    while (!isValid && safety < 50) {
        safety++; isValid = false;
        if (choice.type === 'square') { n1 = Math.floor(Math.random() * 12) + 1; ans = n1 * n1; text = `${n1}²`; }
        else if (choice.type === 'cube') { n1 = Math.floor(Math.random() * 6) + 1; ans = n1 * n1 * n1; text = `${n1}³`; }
        else if (choice.type === 'sqrt') { n1 = Math.floor(Math.random() * 12) + 1; ans = n1; text = `√${n1 * n1}`; }
        else if (choice.type === 'mult') {
            n1 = playerConfig.multipliers[Math.floor(Math.random() * playerConfig.multipliers.length)];
            n2 = Math.floor(Math.random() * 12) + 1; ans = n1 * n2; text = `${n1}x${n2}`;
        }
        else {
            n1 = Math.floor(Math.random() * 9) + 1; n2 = Math.floor(Math.random() * 9) + 1; ans = n1 + n2; text = `${n1}+${n2}`;
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
    if (!gameState.isPlaying) return;

    const now = Date.now();
    const reactionTime = (now - questionStartTime) / 1000;
    raceSession.inputStats.total++;

    let correct = false;

    // Logic for checking input (Keyboard/Voice)
    if (typeof input === 'number' && currentQuestion.leftDigit !== null) {
        if (input === currentQuestion.leftDigit) { if (gameState.lane > 0) gameState.lane--; correct = true; }
        else if (input === currentQuestion.rightDigit) { if (gameState.lane < CONFIG.laneCount - 1) gameState.lane++; correct = true; }
    } else if (typeof input === 'string') {
        const inputVal = input.toLowerCase().replace('equals', '').trim();
        const checkMatch = (expected) => {
            if (Array.isArray(expected)) return expected.some(val => inputVal.includes(val.toLowerCase()));
            return String(expected).toLowerCase().includes(inputVal);
        };
        if (checkMatch(expectedLeft)) { if (gameState.lane > 0) gameState.lane--; correct = true; }
        else if (checkMatch(expectedRight)) { if (gameState.lane < CONFIG.laneCount - 1) gameState.lane++; correct = true; }
    }

    // --- TELEMETRY LOGGING ---
    telemetryLog.push({
        speed: gameState.speed,
        difficulty: playerConfig.difficulty,
        rt: reactionTime,
        correct: correct
    });

    // --- CLIENT-SIDE AUTO-PILOT DDA ENGINE ---
    if (autoPilotActive) {
        autoPilotEngine.record({
            correct: correct,
            reactionTime: reactionTime,
            operands: currentOperands,
            difficulty: playerConfig.difficulty,
            timestamp: now
        });

        const nextGear = autoPilotEngine.tryShift(playerConfig.difficulty);
        if (nextGear) {
            const metrics = autoPilotEngine.getMetrics();
            console.log(`[Auto-Pilot] Shifting: ${playerConfig.difficulty} → ${nextGear}`);
            console.log(`[Auto-Pilot] Metrics — ACC: ${metrics.accuracy}% | RT: ${metrics.avgRT}s | Struggling: [${metrics.struggling}]`);
            shiftGear(nextGear);
            visualizeAIShift(nextGear);
        }
        updateAutoPilotUI();
    }

    questionStartTime = Date.now();

    // --- ECONOMY & ANIMATION ---
    const playerX = (gameState.lane * CONFIG.laneWidth) + (CONFIG.laneWidth / 2);
    const playerY = canvas.height - 150;

    if (correct) {
        sfx.play('correct');
        sessionStats.correct++;
        if (typeof spawnCoinEffect === 'function') spawnCoinEffect(playerX, playerY, 10, true);
        generateTwoProblems();
    } else {
        sfx.play('wrong');
        sessionStats.wrong++;
        if (typeof spawnCoinEffect === 'function') spawnCoinEffect(playerX, playerY, 2, false);
        logMistake(`${leftMathValue.innerText} | ${rightMathValue.innerText}`);
    }
}

// Helper for UI Feedback
function visualizeAIShift(gear) {
    const aiButton = document.getElementById('btn-ai-auto');
    const statusText = document.getElementById('ai-status-text');
    const colors = { 'easy': '#00d2ff', 'medium': '#ffc107', 'hard': '#dc3545' };
    const labels = { 'easy': 'GEAR 1', 'medium': 'GEAR 2', 'hard': 'GEAR 3' };

    aiButton.style.boxShadow = `0 0 25px ${colors[gear]}`;
    aiButton.style.borderColor = colors[gear];
    if (statusText) {
        statusText.innerText = `SHIFTED → ${labels[gear]}`;
        statusText.style.color = colors[gear];
    }
    setTimeout(() => {
        aiButton.style.boxShadow = "0 0 10px #9b59b6";
        aiButton.style.borderColor = "#9b59b6";
    }, 1200);
}

/* --- VOICE INPUT --- */
const wordMap = {
    'zero': 0, 'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5, 'six': 6, 'seven': 7, 'eight': 8, 'nine': 9,
    'for': 4, 'to': 2, 'too': 2, 'ate': 8,
    'sign': 'sin', 'sine': 'sin', 'cost': 'cos', 'course': 'cos', 'cause': 'cos', 'tan': 'tan', 'sec': 'sec'
};

function initSpeech() {
    const SpeechChoice = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechChoice) { alert("Voice not supported. Use Chrome."); return; }

    recognition = new SpeechChoice();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event) => {
        const last = event.results.length - 1;
        // Skip results we already acted on (prevents stale speech re-matching)
        if (last <= lastActedResultIndex) return;
        if (isProcessingSpeech) return;
        let transcript = event.results[last][0].transcript.trim().toLowerCase();

        for (const [key, val] of Object.entries(wordMap)) { if (transcript === key) transcript = val.toString(); }
        micText.innerText = `HEARD: "${transcript}"`;

        const check = (expected) => {
            if (Array.isArray(expected)) return expected.some(val => transcript.includes(val.toLowerCase()));
            return transcript.includes(String(expected).toLowerCase());
        };

        if (check(expectedLeft)) { lastActedResultIndex = last; processVoice(transcript); return; }
        if (check(expectedRight)) { lastActedResultIndex = last; processVoice(transcript); return; }

        let num = null;
        if (!isNaN(parseInt(transcript))) num = parseInt(transcript);
        else { let match = transcript.match(/\d+/); if (match) num = parseInt(match[0]); }

        if (num !== null) {
            let digit = parseInt(String(num).slice(-1));
            lastActedResultIndex = last;
            processVoice(digit);
        }
    };

    recognition.onend = () => {
        lastActedResultIndex = -1; // Reset for fresh recognition session
        if (gameState.isPlaying && gameState.controlMode === 'voice') { try { recognition.start(); } catch (e) { } }
        else { micIndicator.classList.remove('listening'); micText.innerText = "STANDBY"; }
    };
}

function processVoice(input) {
    checkAnswer(input);
    isProcessingSpeech = true; micText.innerText = "PROCESSING...";
    setTimeout(() => { isProcessingSpeech = false; if (gameState.isPlaying) micText.innerText = "LISTENING..."; }, 1200);
}

function countFingers(landmarks, handedness) {
    let count = 0;
    const label = handedness.label; // "Left" or "Right"

    // --- 1. THUMB LOGIC (Side-dependent) ---
    // Landmark 4 = Thumb Tip, 3 = Thumb IP (Knuckle)
    // For Right Hand: Thumb opens to the Left (smaller X)
    // For Left Hand: Thumb opens to the Right (larger X)
    if (label === 'Right') {
        // If Tip is to the left of the knuckle, it's open
        if (landmarks[4].x < landmarks[3].x - 0.03) count++;
    } else {
        // If Tip is to the right of the knuckle, it's open
        if (landmarks[4].x > landmarks[3].x + 0.03) count++;
    }

    // --- 2. FINGER LOGIC (Distance Method) ---
    // Instead of checking Y-coordinates (which fails if hand is tilted),
    // we check distance from the WRIST (Landmark 0).
    // If (Distance Wrist->Tip) > (Distance Wrist->PIP_Joint), finger is open.

    const wrist = landmarks[0];

    // Indices: [Index, Middle, Ring, Pinky]
    // Tips: [8, 12, 16, 20]
    // PIP Joints (Lower Knuckle): [6, 10, 14, 18]
    const fingerTips = [8, 12, 16, 20];
    const fingerPIPs = [6, 10, 14, 18];

    for (let i = 0; i < 4; i++) {
        const tip = landmarks[fingerTips[i]];
        const pip = landmarks[fingerPIPs[i]];

        // Calculate Distance Squared (a² + b²) to Wrist
        // (We don't need square root for comparison, keeps it fast)
        const distTip = Math.pow(tip.x - wrist.x, 2) + Math.pow(tip.y - wrist.y, 2);
        const distPip = Math.pow(pip.x - wrist.x, 2) + Math.pow(pip.y - wrist.y, 2);

        // If tip is further from wrist than the knuckle is, it's open
        if (distTip > distPip) {
            count++;
        }
    }

    return count;
}
// --- OPTIMIZED AI INITIALIZATION ---
function initMediaPipe() {
    if (hands) return;

    hands = new Hands({
        locateFile: (file) => {
            return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
        }
    });

    hands.setOptions({
        maxNumHands: 2,
        // CHANGED: 0 = Lite (Fastest), 1 = Full (Default). 
        // 0 is much better for gaming performance!
        modelComplexity: 0,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
    });

    hands.onResults(onHandsResults);

    // CHANGED: Throttling Logic
    let lastProcessTime = 0;
    const processInterval = 150; // Only check hands every 150ms (approx 6-7 FPS)

    camera = new Camera(videoElement, {
        onFrame: async () => {
            if (playerConfig.controlMode === 'gesture') {
                const now = Date.now();
                // Only send to AI if enough time has passed
                if (now - lastProcessTime > processInterval) {
                    lastProcessTime = now;
                    await hands.send({ image: videoElement });
                }
            }
        },
        width: 320,
        height: 240
    });

    console.log("AI Vision System Loaded (Lite Mode)");
    camera.start();
}

function onHandsResults(results) {
    // 1. Clear previous drawings
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);

    // Draw the video frame
    canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);

    let totalFingers = 0;

    // 2. Process Hands
    if (results.multiHandLandmarks && results.multiHandedness) {
        // Loop through all detected hands
        for (let i = 0; i < results.multiHandLandmarks.length; i++) {
            const landmarks = results.multiHandLandmarks[i];
            const handedness = results.multiHandedness[i]; // Get "Left" or "Right" logic

            // Draw Skeleton
            drawConnectors(canvasCtx, landmarks, HAND_CONNECTIONS, { color: '#00d2ff', lineWidth: 2 });
            drawLandmarks(canvasCtx, landmarks, { color: '#ff0000', lineWidth: 1 });

            // Count using the new smart logic
            totalFingers += countFingers(landmarks, handedness);
        }

        // 3. Debounce Logic (Wait for stability)
        if (totalFingers !== lastDetectedFingerCount) {
            lastDetectedFingerCount = totalFingers;

            // Visual Feedback instantly
            micText.innerText = `SCANNING: ${totalFingers}`;
            micText.style.color = "#f39c12"; // Orange while scanning

            // Wait 0.5s for the hand to stay still before locking in the answer
            clearTimeout(gestureDebounceTimer);
            gestureDebounceTimer = setTimeout(() => {
                if (playerConfig.controlMode === 'gesture' && gameState.isPlaying) {
                    micText.innerText = `LOCKED: ${totalFingers}`;
                    micText.style.color = "#2ecc71"; // Green when locked
                    checkAnswer(totalFingers);
                }
            }, 500); // Reduced delay to 500ms for snappier feel
        }
    }
    canvasCtx.restore();
}

window.setControlMode = function (mode) {
    playerConfig.controlMode = mode;
    savePlayerConfig();

    // Reset UI
    btnModeKey.classList.remove('active-mode');
    btnModeVoice.classList.remove('active-mode');
    btnModeGesture.classList.remove('active-mode');
    micIndicator.classList.remove('visible');
    cameraContainer.classList.remove('active');

    // Stop Systems (Clean up)
    if (recognition) try { recognition.stop(); } catch (e) { }

    // Activate New Mode
    if (mode === 'keyboard') {
        btnModeKey.classList.add('active-mode');
    }
    else if (mode === 'voice') {
        btnModeVoice.classList.add('active-mode');
        micIndicator.classList.add('visible');
        if (!recognition) initSpeech();
        if (gameState.isPlaying) try { recognition.start(); } catch (e) { }
    }
    else if (mode === 'gesture') {
        btnModeGesture.classList.add('active-mode');
        cameraContainer.classList.add('active');
        micIndicator.classList.add('visible');
        micText.innerText = "CAMERA ACTIVE";
        initMediaPipe();
    }

    // --- CRITICAL: UPDATE PHYSICS & SPAWNER INSTANTLY ---
    if (gameState.isPlaying) {
        // 1. Get new stats
        const stats = getCurrentStats();

        // 2. Update Max Speed immediately (Acceleration will follow in updatePhysics)
        gameState.maxSpeed = stats.max;

        // 3. Reset Spawn Timer to new interval
        if (spawnTimer) clearInterval(spawnTimer);
        spawnTimer = setInterval(() => {
            if (gameState.isPlaying) spawnEnemy();
        }, stats.spawnInterval);
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
    sfx.play('shift');
    playerConfig.difficulty = level;
    savePlayerConfig();

    // 1. VISUALS
    [labelEasy, labelMedium, labelHard].forEach(label => {
        label.classList.remove('active-label');
        label.style.color = "";
        label.style.textShadow = "";
    });

    if (level === 'hard') {
        shifterAssembly.style.top = "30px"; knobNumber.innerText = "3";
        knobNumber.style.color = "#dc3545"; knobNumber.style.textShadow = "0 0 15px #dc3545";
        labelHard.classList.add('active-label'); labelHard.style.color = "#dc3545";
    } else if (level === 'medium') {
        shifterAssembly.style.top = "95px"; knobNumber.innerText = "2";
        knobNumber.style.color = "#ffc107"; knobNumber.style.textShadow = "0 0 15px #ffc107";
        labelMedium.classList.add('active-label'); labelMedium.style.color = "#ffc107";
    } else {
        shifterAssembly.style.top = "165px"; knobNumber.innerText = "1";
        knobNumber.style.color = "#00d2ff"; knobNumber.style.textShadow = "0 0 15px #00d2ff";
        labelEasy.classList.add('active-label'); labelEasy.style.color = "#00d2ff";
    }

    // 2. PHYSICS UPDATE
    if (gameState.isPlaying) {
        const stats = getCurrentStats();

        // Update Limits
        gameState.maxSpeed = stats.max;

        // --- THE FIX: INSTANT BOOST ---
        // If current speed is lower than the new gear's base speed, jump to base.
        if (gameState.speed < stats.base) {
            gameState.speed = stats.base;
        }

        // Restart Spawner
        if (spawnTimer) clearInterval(spawnTimer);
        spawnTimer = setInterval(() => {
            if (gameState.isPlaying) spawnEnemy();
        }, stats.spawnInterval);
    }
}

function applyCurrentPhysics() {
    if (playerConfig.controlMode === 'voice') {
        gameState.maxSpeed = VOICE_STATS.max;
        // You can also apply specific acceleration here if you want
    } else if (playerConfig.controlMode === 'gesture') {
        gameState.maxSpeed = GESTURE_STATS.max;
    } else {
        // Keyboard Mode (Uses Gears)
        gameState.maxSpeed = SPEEDS[playerConfig.difficulty].max;
    }
}
function startGame() {
    if (gameState.isPlaying) return;

    // --- 1. RESET ECONOMY (Critical Fix) ---
    loadoutCost = 0;
    if (activeLoadout.shield) loadoutCost += 150;
    if (activeLoadout.nitro) loadoutCost += 100;
    if (activeLoadout.copilot) loadoutCost += 100;

    // Reset counters
    sessionStats = { correct: 0, wrong: 0 };

    // Refresh Icons
    updateLoadoutHUD();
    // ---------------------------------------

    // --- RESET CAREER TRACKER ---
    raceSession = {
        startTime: Date.now(),
        mistakes: {},
        difficulty: playerConfig.difficulty,
        controlMethod: playerConfig.controlMode,
        inputStats: { total: 0 }
    };

    // Reset Auto-Pilot engine for fresh game session
    autoPilotEngine.reset();
    telemetryLog = [];

    // UI Setup
    btnStart.classList.add('btn-disabled');
    btnStop.classList.remove('btn-disabled');

    // Sync Math Mode
    playerConfig.mathMode = getSelectedRadio('math');
    savePlayerConfig();

    // Physics Setup
    const stats = getCurrentStats();
    gameState.maxSpeed = stats.max;

    // --- NITRO PHYSICS INJECTION ---
    if (activeLoadout.nitro) {
        gameState.distance = 5000; // Jumps score to 500 instantly (5000 / 10)
        gameState.speed = 6.5;      // High burst speed

        // Visual "Blast Off" effect
        document.body.style.backgroundColor = "#ff8c00";
        setTimeout(() => document.body.style.backgroundColor = "#050505", 200);
        console.log("NITRO INITIATED: BLASTING TO 500m");
    } else {
        gameState.distance = 0;
        gameState.speed = stats.base;
    }
    // -------------------------------

    // Reset Game State
    gameState.isPlaying = true;
    gameState.lane = 2;
    gameState.score = Math.floor(gameState.distance / 10);
    enemies = [];

    sfx.play('rev');
    sfx.startEngine();
    // Initialize Inputs
    if (playerConfig.controlMode === 'voice') {
        if (!recognition) initSpeech();
        try { recognition.start(); } catch (e) { }
        micIndicator.classList.add('listening'); micText.innerText = "LISTENING...";
    } else if (playerConfig.controlMode === 'gesture') {
        initMediaPipe();
    }

    generateTwoProblems();
    requestAnimationFrame(gameLoop);

    // Spawn Timer
    if (spawnTimer) clearInterval(spawnTimer);
    spawnTimer = setInterval(() => {
        if (gameState.isPlaying) spawnEnemy();
    }, stats.spawnInterval);
}

function abortRace() {
    if (!gameState.isPlaying) return;
    gameState.isPlaying = false;
    sfx.stopEngine();
    if (recognition) recognition.stop();
    micIndicator.classList.remove('listening'); micText.innerText = "STANDBY";
    gameOverTitle.innerText = "RACE ABORTED"; gameOverTitle.style.color = "#ffc107";
    finalScoreEl.innerText = gameState.score;
    gameOverScreen.style.display = 'flex';
    btnStop.classList.add('btn-disabled');
}
function spawnEnemy() {
    // --- CHANGED: MINIMAL SAFETY CHECK ---
    // only check 90px (just the height of a car) 
    if (enemies.length > 0) {
        const lastEnemy = enemies[enemies.length - 1];
        if (lastEnemy.y < 90) {
            return; // Wait just a split second so sprites don't overlap
        }
    }
    // Standard Spawn Logic
    const lane = Math.floor(Math.random() * CONFIG.laneCount);
    const totalWeight = TRAFFIC_TYPES.reduce((sum, t) => sum + t.spawnWeight, 0);
    let rand = Math.random() * totalWeight;
    let chosenType = TRAFFIC_TYPES[0];
    for (let t of TRAFFIC_TYPES) {
        rand -= t.spawnWeight;
        if (rand <= 0) { chosenType = t; break; }
    }
    enemies.push({ lane: lane, y: -150, type: chosenType, speedOffset: Math.random() * 0.5 });
}
function updatePhysics() {
    // 1. Get the correct stats for the current moment
    const stats = getCurrentStats();

    // 2. Apply Acceleration
    // If we haven't reached the mode's Max Speed yet, speed up!
    if (gameState.speed < stats.max) {
        gameState.speed += stats.acceleration;
    }

    // 3. Decelerate if we are too fast 
    // (e.g. Switched from Gesture [Max 4.0] to Voice [Max 1.2])
    if (gameState.speed > stats.max) {
        gameState.speed -= 0.01; // Smooth braking
    }

    // 4. Move the car
    gameState.distance += gameState.speed;
    gameState.score = Math.floor(gameState.distance / 10);
    liveDistanceEl.innerText = gameState.score;
    // If we were using Nitro, once the speed settles down to maxSpeed, 
    // we consider the 'blast' over and remove the icon.
    if (activeLoadout.nitro && gameState.speed <= gameState.maxSpeed + 0.5) {
        activeLoadout.nitro = false;
        updateLoadoutHUD();
    }

}
function updateSpeedometer() {
    const maxS = 20; let pct = gameState.speed / maxS; if (pct > 1) pct = 1;
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

    updatePhysics();
    updateSpeedometer();

    // --- NITRO HUD AUTO-CLEANUP ---
    // If nitro was active, once the blast speed settles, remove the icon
    if (activeLoadout.nitro && gameState.speed <= gameState.maxSpeed + 0.2) {
        activeLoadout.nitro = false;
        updateLoadoutHUD();
    }

    // --- AI CO-PILOT VISUAL HIGHLIGHTER ---
    const leftHintEl = questionLeftEl.querySelector('.ai-hint');
    const rightHintEl = questionRightEl.querySelector('.ai-hint');

    if (coPilotActive && currentQuestion) {
        const glowAlpha = 0.4 + Math.abs(Math.sin(Date.now() / 200)) * 0.5;
        const glowStyle = `0 0 25px rgba(255, 215, 0, ${glowAlpha})`;

        questionLeftEl.style.boxShadow = glowStyle;
        questionRightEl.style.boxShadow = glowStyle;
        questionLeftEl.style.borderColor = "#ffd700";
        questionRightEl.style.borderColor = "#ffd700";

        // SHOW THE ANSWERS
        // We display the single digit the player needs to press
        if (leftHintEl) leftHintEl.innerText = `PRESS: ${currentQuestion.leftDigit}`;
        if (rightHintEl) rightHintEl.innerText = `PRESS: ${currentQuestion.rightDigit}`;
    } else {
        // Reset Visuals
        questionLeftEl.style.boxShadow = "";
        questionRightEl.style.boxShadow = "";
        questionLeftEl.style.borderColor = "";
        questionRightEl.style.borderColor = "";

        // Hide Hints
        if (leftHintEl) leftHintEl.innerText = "";
        if (rightHintEl) rightHintEl.innerText = "";
    }

    // --- DRAWING THE ROAD ---
    ctx.fillStyle = "#222";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
    ctx.lineWidth = 4;
    ctx.setLineDash([30, 30]);
    const lineOffset = gameState.distance % 60;
    ctx.beginPath();
    for (let i = 1; i < CONFIG.laneCount; i++) {
        let x = i * CONFIG.laneWidth;
        ctx.moveTo(x, -60 + lineOffset);
        ctx.lineTo(x, canvas.height + lineOffset);
    }
    ctx.stroke();

    // --- DRAWING PLAYER ---
    const playerX = (gameState.lane * CONFIG.laneWidth) + (CONFIG.laneWidth / 2) - (CONFIG.playerWidth / 2);
    const playerY = canvas.height - 150;
    drawCar(playerImg, playerX, playerY, CONFIG.playerWidth, CONFIG.playerHeight, "cyan");

    // --- PROCESSING TRAFFIC & COLLISIONS ---
    for (let i = 0; i < enemies.length; i++) {
        let e = enemies[i];
        const isSlowMode = (playerConfig.controlMode === 'voice' || playerConfig.controlMode === 'gesture');
        const trafficMultiplier = isSlowMode ? 0.5 : 0.8;

        e.y += (gameState.speed * trafficMultiplier * e.type.speedMultiplier) + e.speedOffset;
        const ex = (e.lane * CONFIG.laneWidth) + (CONFIG.laneWidth / 2) - (e.type.width / 2);

        drawCar(enemyImages[e.type.name], ex, e.y, e.type.width, e.type.height, "red");

        const p = 10;
        // COLLISION CHECK
        if (playerX + p < ex + e.type.width - p &&
            playerX + CONFIG.playerWidth - p > ex + p &&
            playerY + p < e.y + e.type.height - p &&
            playerY + CONFIG.playerHeight - p > e.y + p) {

            if (activeLoadout.shield) {
                activeLoadout.shield = false;
                updateLoadoutHUD();
                enemies.splice(i, 1);
                i--;
                document.body.style.backgroundColor = "cyan";
                setTimeout(() => document.body.style.backgroundColor = "#050505", 100);
                console.log("SHIELD DEPLOYED");
            } else {
                console.log("CRASH! Calling GameOver...");
                sfx.play('crash');
                gameOver();
                return; // Stop the loop immediately
            }
        }

        if (e.y > canvas.height) {
            enemies.splice(i, 1);
            i--;
        }
    }

    requestAnimationFrame(gameLoop);
}
function gameOver() {
    sfx.stopEngine();
    // 1. SAVE HIGH SCORE (Local Storage)
    const currentHigh = parseInt(localStorage.getItem('formulaRush_highScore') || '0');
    if (gameState.score > currentHigh) {
        localStorage.setItem('formulaRush_highScore', gameState.score);
    }

    // 2. PREPARE SESSION DATA
    const duration = (Date.now() - raceSession.startTime) / 1000;

    let activeTopics = [];
    if (playerConfig.multipliers.length > 0) activeTopics.push(`Mult: ${playerConfig.multipliers.join(',')}`);
    for (let [k, v] of Object.entries(playerConfig.advancedOps)) { if (v) activeTopics.push(k); }
    for (let [k, v] of Object.entries(playerConfig.voiceOps)) { if (v) activeTopics.push(k); }

    // --- CAMPAIGN MODE DETECTION ---
    const isCampaign = (typeof LEVEL_CONTEXT !== 'undefined' && LEVEL_CONTEXT.mode === 'campaign');
    const gameMode = isCampaign ? 'campaign' : 'single';
    const levelId = isCampaign ? LEVEL_CONTEXT.id : null;

    // 3. SUBMIT FULL SCORE & TELEMETRY
    fetch("/submit_score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            score: gameState.score,
            mode: gameMode,
            levelId: levelId,
            duration: Math.floor(duration),
            car: localStorage.getItem('formulaRush_selectedCar') || 'car_default',
            correctCount: sessionStats.correct,
            wrongCount: sessionStats.wrong,
            loadoutCost: loadoutCost,
            difficulty: playerConfig.difficulty,
            controlMethod: playerConfig.controlMode,
            activeTopics: activeTopics,
            mistakes: raceSession.mistakes,
            inputStats: raceSession.inputStats,

            // --- AI INTEGRATION: SEND THE LOG ---
            telemetry: telemetryLog
        })
    })
        .then(response => response.json())
        .then(data => {
            console.log("Telemetry Sync Complete. AI Data Saved.");
            // Clear the log so we don't double-save if the user reboots without refreshing
            telemetryLog = [];

            // --- CAMPAIGN LEVEL UNLOCK NOTIFICATION ---
            if (data.level_unlocked) {
                gameOverTitle.innerText = "LEVEL COMPLETE!";
                gameOverTitle.style.color = "#ffd700";

                // Show unlock message
                const unlockMsg = document.createElement('div');
                unlockMsg.innerHTML = `<div style="color:#00d2ff; font-family:Orbitron; font-size:1.2rem; margin-top:15px; text-shadow:0 0 10px #00d2ff;">
                    🔓 LEVEL ${data.next_level} UNLOCKED!
                </div>`;
                finalScoreEl.parentNode.insertBefore(unlockMsg, finalScoreEl.nextSibling);
            }
        })
        .catch(err => console.error("Sync Failure:", err));

    // 4. RESET UI & STOP SYSTEMS
    gameState.isPlaying = false;
    if (recognition) recognition.stop();
    micIndicator.classList.remove('listening');
    micText.innerText = "OFFLINE";

    gameOverTitle.innerText = "CRITICAL FAILURE";
    gameOverTitle.style.color = "#ff4b2b";
    finalScoreEl.innerText = gameState.score;
    gameOverScreen.style.display = 'flex';
    btnStop.classList.add('btn-disabled');
}

/* --- VISUAL FX: FLOATING COINS --- */
function spawnCoinEffect(x, y, amount, isGood) {
    // 1. Create Container
    const el = document.createElement('div');
    el.style.position = 'absolute';
    el.style.left = (x + 30) + 'px'; // Offset slightly from car
    el.style.top = (y) + 'px';
    el.style.pointerEvents = 'none';
    el.style.fontWeight = 'bold';
    el.style.fontSize = '1.5rem';
    el.style.fontFamily = 'Orbitron';
    el.style.zIndex = '50';
    el.style.transition = 'all 0.8s ease-out';
    el.style.opacity = '1';

    // 2. Content (Coin Icon + Number)
    // We rotate the coin using a span
    const symbol = isGood ? '🟡' : '🔴';
    const color = isGood ? '#ffd700' : '#ff4b2b';
    const sign = isGood ? '+' : '';

    el.innerHTML = `
        <span style="display:inline-block; animation: spin 0.5s linear;">${symbol}</span> 
        <span style="color:${color}; text-shadow:0 0 5px ${color};">${sign}${amount}</span>
    `;

    document.body.appendChild(el);

    // 3. Animate (Float Up and Fade)
    requestAnimationFrame(() => {
        el.style.transform = 'translateY(-100px) scale(1.2)';
        el.style.opacity = '0';
    });

    // 4. Cleanup
    setTimeout(() => { document.body.removeChild(el); }, 800);
}

// Add CSS animation for the spin if not exists
if (!document.getElementById('anim-style')) {
    const style = document.createElement('style');
    style.id = 'anim-style';
    style.innerHTML = `@keyframes spin { 0% { transform: rotateY(0deg); } 100% { transform: rotateY(360deg); } }`;
    document.head.appendChild(style);
}
// --- AI CO-PILOT SYSTEM ---
let coPilotActive = false;

function activateCoPilot() {
    if (coPilotActive || !activeLoadout.copilot) return;

    coPilotActive = true;
    console.log("AI CO-PILOT: ACTIVE");

    // Start 10-second countdown
    setTimeout(() => {
        coPilotActive = false;
        activeLoadout.copilot = false; // Item is consumed
        updateLoadoutHUD(); // Remove icon
        console.log("AI CO-PILOT: OFFLINE");
    }, 10000);
}

// Load saved config and update UI elements immediately
loadPlayerConfig();

// ============================================================
// CAMPAIGN MODE OVERRIDE
// Runs AFTER loadPlayerConfig() so it always wins.
// Prevents quick-race/practice saved settings from leaking
// into campaign levels and corrupting question generation.
// ============================================================
if (typeof LEVEL_CONTEXT !== 'undefined' && LEVEL_CONTEXT.mode === 'campaign') {
    // 1. Disable all custom overrides — campaign uses LEVEL_CONTEXT.ops exclusively
    playerConfig.customActive = false;
    playerConfig.multipliers = [];
    playerConfig.advancedOps = { squares: false, cubes: false, sqrt: false };
    playerConfig.voiceOps = { shapes: false, diff: false, int: false, trig: false };

    // 2. Remove any 'active' highlight from feature toggle buttons
    document.querySelectorAll('.feature-btn').forEach(btn => btn.classList.remove('active'));

    // 3. Re-enable the standard nav computer (gear + math mode) in case it was disabled
    if (stdNavControls) stdNavControls.classList.remove('controls-disabled');

    console.log('[Campaign] Config overridden for Level', LEVEL_CONTEXT.id, '| ops:', LEVEL_CONTEXT.ops);
}

// Ensure default control mode is visually active (keyboard) if no saved config set it
if (!btnModeKey.classList.contains('active-mode') &&
    !btnModeVoice.classList.contains('active-mode') &&
    !btnModeGesture.classList.contains('active-mode')) {
    btnModeKey.classList.add('active-mode');
}
/* =========================================
   GLOBAL UI AUDIO MANAGER (BULLETPROOF)
   ========================================= */
/* =========================================
   GLOBAL UI AUDIO MANAGER (BULLETPROOF)
   ========================================= */
document.body.addEventListener('click', (e) => {
    // Added .input-mode-btn, .input-btn, and the specific IDs to guarantee they are caught
    const clickableElements = 'button, .click-zone, .feature-btn, .rocker-label, .input-icon-btn, .input-mode-btn, .input-btn, #btn-mode-key, #btn-mode-voice, #btn-mode-gesture, .close-btn, .ctrl-btn, .action-btn, .modal-btn';
    
    if (e.target.closest(clickableElements)) {
        if (typeof sfx !== 'undefined' && sfx.play) {
            sfx.play('click');
        }
    }
});