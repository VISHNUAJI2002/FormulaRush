/* =========================================
   MATH RACER: DUAL COCKPIT ENGINE (FINAL W/ COMBAT)
   ========================================= */

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');


// --- AUDIO MANAGER ---
const sfx = {
    click: new Audio('/static/sounds/click.mp3'),
    crash: new Audio('/static/sounds/crash.mp3'),
    correct: new Audio('/static/sounds/correct.mp3'),
    wrong: new Audio('/static/sounds/wrong.mp3'),
    engine: new Audio('/static/sounds/engine.mp3'),
    rev: new Audio('/static/sounds/rev.mp3'),       
    shift: new Audio('/static/sounds/shift.mp3'),
    shoot: new Audio('/static/sounds/fire.mp3'),  
    shield: new Audio('/static/sounds/shield.mp3'), 
    
    play: function(soundName) {
        if (!this[soundName]) return; 
        let sound = new Audio(this[soundName].src); 
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

/* =========================================
   GLOBAL UI AUDIO MANAGER (BULLETPROOF)
   ========================================= */
document.body.addEventListener('click', (e) => {
    // List of all your multiplayer UI elements
    const clickableElements = 'button, .click-zone, .rocker-label, .input-icon-btn, .ctrl-btn, .modal-btn, .mode-btn';
    if (e.target.closest(clickableElements)) {
        if (typeof sfx !== 'undefined' && sfx.play) {
            sfx.play('click');
        }
    }
});

// --- ASSETS ---
const imgP1 = new Image(); imgP1.src = "/static/car1.png";
const imgP2 = new Image(); imgP2.src = "/static/car2.png";
const imgObs = new Image(); imgObs.src = "/static/obstacle.png";

// --- CONFIGURATION ---
const ROAD_WIDTH = 800;
const ROAD_HEIGHT = 600;
const HALF_WIDTH = ROAD_WIDTH / 2;
const LANE_WIDTH = (HALF_WIDTH - 40) / 3;

// Difficulty Tuning
const DIFFICULTY = {
    easy: { baseSpeed: 1.5, maxSpeed: 3, accel: 0.0005, trafficFreq: 2500 },
    medium: { baseSpeed: 2.0, maxSpeed: 4, accel: 0.005, trafficFreq: 2000 },
    hard: { baseSpeed: 2.5, maxSpeed: 5, accel: 0.005, trafficFreq: 1500 }
};

// --- GAME STATE ---
let active = false;
let timeLeft = 60;
let timerInt;
let obstacles = [];
let projectiles = []; // Combat: Active Fireballs
let particles = [];   // Combat: Visual FX

// Player Objects
// Added: ammo (0 or 1), streak (0-5), shieldActive (bool), controlMode
let p1 = {
    id: 1, x: 0, lane: 1, speed: 0, dist: 0, invuln: 0,
    gear: 'easy', mathMode: 'simple', laneOffset: 0,
    streak: 0, ammo: 0, shieldActive: false,
    controlMode: 'keyboard'
};
let p2 = {
    id: 2, x: 0, lane: 1, speed: 0, dist: 0, invuln: 0,
    gear: 'easy', mathMode: 'simple', laneOffset: 0,
    streak: 0, ammo: 0, shieldActive: false,
    controlMode: 'keyboard'
};

// --- MULTI-MODAL INPUT STATE ---
let recognition = null;
let isProcessingSpeech = false;
let voiceOwner = null;  // playerId (1 or 2) or null

let hands = null;
let gestureCamera = null;
let gestureOwner = null; // playerId (1 or 2) or null
let lastDetectedFingerCount = -1;
let gestureDebounceTimer = null;

const gestureVideo = document.getElementById('gestureVideo');
const gestureCanvas = document.getElementById('gestureCanvas');
const gestureCtx = gestureCanvas ? gestureCanvas.getContext('2d') : null;

// Side Deck DOM refs
const p1SideDeck = document.getElementById('p1-side-deck');
const p2SideDeck = document.getElementById('p2-side-deck');
const p1DeckContent = document.getElementById('p1-deck-content');
const p2DeckContent = document.getElementById('p2-deck-content');

// Voice word-to-number map — expanded for accuracy
const wordMap = {
    'zero': 0, 'one': 1, 'won': 1, 'two': 2, 'to': 2, 'too': 2, 'tu': 2,
    'three': 3, 'tree': 3, 'free': 3,
    'four': 4, 'for': 4, 'fore': 4, 'floor': 4,
    'five': 5, 'hive': 5, 'fife': 5,
    'six': 6, 'sex': 6, 'sics': 6, 'seeks': 6,
    'seven': 7, 'heaven': 7,
    'eight': 8, 'ate': 8, 'ait': 8, 'hate': 8,
    'nine': 9, 'wine': 9, 'mine': 9, 'nein': 9, 'line': 9, 'fine': 9,
};

// Voice combat keyword sets
const FIRE_WORDS = ['fire', 'shoot', 'attack', 'emp', 'blast', 'launch'];
const SHIELD_WORDS = ['shield', 'defend', 'block', 'guard', 'protect'];

// Gesture combat state (separate debounce from number input)
let gestureCombatDebounce = null;

// Math Data
let p1Math = { left: {}, right: {} };
let p2Math = { left: {}, right: {} };

// --- UI REFS ---
const uiRefs = {
    p1Needle: document.getElementById('p1-needle'),
    p2Needle: document.getElementById('p2-needle'),
    p1SpeedVal: document.getElementById('p1-speed-val'),
    p2SpeedVal: document.getElementById('p2-speed-val'),

    // Combat UI Refs
    p1AmmoBar: document.getElementById('p1-ammo-bar'),
    p2AmmoBar: document.getElementById('p2-ammo-bar'),
    p1IconFire: document.getElementById('p1-icon-fire'),
    p1IconShield: document.getElementById('p1-icon-shield'),
    p2IconFire: document.getElementById('p2-icon-fire'),
    p2IconShield: document.getElementById('p2-icon-shield'),

    btnStart: document.getElementById('btnStart'),
    btnAbort: document.getElementById('btnAbort'),

    // Math Text
    p1L: document.getElementById('p1-txt-left'),
    p1R: document.getElementById('p1-txt-right'),
    p2L: document.getElementById('p2-txt-left'),
    p2R: document.getElementById('p2-txt-right'),

    timerDisplay: document.getElementById('timerDisplay'),
    gameOverScreen: document.getElementById('uiLayer'),
    winnerText: document.getElementById('winnerText'),
    finalScores: document.getElementById('finalScores')
};


/* =========================================
   PART 1: UI & COMBAT LOGIC
   ========================================= */

window.updateGameGear = function (playerNum, level) {
    sfx.play('shift');
    if (playerNum === 1) p1.gear = level;
    else p2.gear = level;
};

window.setMath = function (playerNum, mode) {
    if (playerNum === 1) {
        p1.mathMode = mode;
        if (active) refreshMath(p1Math, p1);
    } else {
        p2.mathMode = mode;
        if (active) refreshMath(p2Math, p2);
    }
};

// --- HUD UPDATE ---
function updateCombatHUD() {
    [p1, p2].forEach(p => {
        const bar = p.id === 1 ? uiRefs.p1AmmoBar : uiRefs.p2AmmoBar;
        const iconFire = p.id === 1 ? uiRefs.p1IconFire : uiRefs.p2IconFire;
        const iconShield = p.id === 1 ? uiRefs.p1IconShield : uiRefs.p2IconShield;
        const activeClass = p.id === 1 ? 'active-p1' : 'active-p2';

        // Update Pips
        const pips = bar.children;
        for (let i = 0; i < 5; i++) {
            if (i < p.streak) pips[i].classList.add(activeClass);
            else pips[i].classList.remove(activeClass);
        }

        // Reset Icons
        iconFire.className = "status-icon";
        iconShield.className = "status-icon";

        if (p.shieldActive) {
            // Shield Mode
            iconShield.classList.add('shielded');
        } else if (p.ammo > 0) {
            // Ready to Fire/Shield
            iconFire.classList.add('ready');
            iconShield.classList.add('ready');
            // Fill bar to show 'Charged'
            for (let pip of pips) pip.classList.add(activeClass);
        }
    });
}

// Start / Abort Listeners
uiRefs.btnStart.addEventListener('click', () => {
    if (!active) initGame();
});

uiRefs.btnAbort.addEventListener('click', () => {
    if (active) endGame(true);
});


/* =========================================
   PART 2: GAME ENGINE & INPUT
   ========================================= */

window.addEventListener('keydown', (e) => {
    if (!active) return;

    // --- PLAYER 1 INPUTS (only if keyboard mode) ---
    if (p1.controlMode === 'keyboard' && e.code.startsWith('Digit')) {
        const val = parseInt(e.key);
        if (!isNaN(val)) handleInput(1, val);
    }
    // Combat: Fire (W), Shield (S) — always available
    if (e.code === 'KeyW') useCombatAbility(p1, 'fire');
    if (e.code === 'KeyS') useCombatAbility(p1, 'shield');

    // --- PLAYER 2 INPUTS (only if keyboard mode) ---
    if (p2.controlMode === 'keyboard' && e.code.startsWith('Numpad')) {
        const val = parseInt(e.key);
        if (!isNaN(val)) handleInput(2, val);
    }
    // Combat: Fire (ArrowUp), Shield (ArrowDown) — always available
    if (e.code === 'ArrowUp') useCombatAbility(p2, 'fire');
    if (e.code === 'ArrowDown') useCombatAbility(p2, 'shield');
});

// --- COMBAT ACTIONS ---
function useCombatAbility(p, type) {
    if (p.shieldActive) {
        // If shield is active, can we manually drop it? 
        // Logic: Shield drops only on hit or reset. But if desired, allow toggle.
        // Current design: Shield stays until hit. No manual drop to reload.
        return;
    }

    if (p.ammo > 0) {
        if (type === 'fire') {
            sfx.play('fire');
            p.ammo = 0;
            p.streak = 0; // Consumption
            spawnProjectile(p);
        } else if (type === 'shield') {
            sfx.play('shield');
            p.ammo = 0;
            p.streak = 0;
            p.shieldActive = true;
            createShieldEffect(p); // Visual pop
        }
        updateCombatHUD();
    }
}

// --- CENTRAL INPUT ROUTER ---
function handleInput(playerId, value) {
    const p = (playerId === 1) ? p1 : p2;
    const math = (playerId === 1) ? p1Math : p2Math;
    checkAnswer(p, math, value);
}

function checkAnswer(playerObj, mathData, inputVal) {
    let correct = false;

    // Numeric input (keyboard / gesture)
    if (typeof inputVal === 'number') {
        if (inputVal === mathData.left.lastDigit) {
            movePlayer(playerObj, -1);
            refreshMath(mathData, playerObj);
            correct = true;
        }
        else if (inputVal === mathData.right.lastDigit) {
            movePlayer(playerObj, 1);
            refreshMath(mathData, playerObj);
            correct = true;
        }
    }
    // String input (voice — match answer text or last digit)
    else if (typeof inputVal === 'string') {
        const spoken = inputVal.toLowerCase().trim();
        // Try matching the full answer text
        const lAns = String(mathData.left.ans).toLowerCase();
        const rAns = String(mathData.right.ans).toLowerCase();
        if (spoken.includes(lAns) || spoken === lAns) {
            movePlayer(playerObj, -1);
            refreshMath(mathData, playerObj);
            correct = true;
        } else if (spoken.includes(rAns) || spoken === rAns) {
            movePlayer(playerObj, 1);
            refreshMath(mathData, playerObj);
            correct = true;
        } else {
            // Try extracting a number and matching last digit
            let num = parseInt(spoken);
            if (isNaN(num)) { const m = spoken.match(/\d+/); if (m) num = parseInt(m[0]); }
            if (!isNaN(num)) {
                const digit = parseInt(String(num).slice(-1));
                if (digit === mathData.left.lastDigit) {
                    movePlayer(playerObj, -1);
                    refreshMath(mathData, playerObj);
                    correct = true;
                } else if (digit === mathData.right.lastDigit) {
                    movePlayer(playerObj, 1);
                    refreshMath(mathData, playerObj);
                    correct = true;
                }
            }
        }
    }

    // --- STREAK LOGIC ---
    if (correct) {
        if (!playerObj.shieldActive && playerObj.ammo === 0) {
            playerObj.streak++;
            if (playerObj.streak >= 5) {
                playerObj.streak = 5;
                playerObj.ammo = 1;
            }
        }
    } else {
        // Wrong answer resets streak unless ammo is fully banked
        if (playerObj.ammo === 0) playerObj.streak = 0;
    }
    updateCombatHUD();
}

function movePlayer(p, dir) {
    let newLane = p.lane + dir;
    if (newLane >= 0 && newLane <= 2) {
        p.lane = newLane;
    }
}


/* =========================================
   PART 3: MATH GENERATION (Unchanged)
   ========================================= */

function rand(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function genProblem(playerObj) {
    let n1, n2, op, ans, text;
    let isValid = false;
    let safety = 0;
    let targetDigits = 1;
    const r = Math.random();

    if (playerObj.gear === 'easy') targetDigits = 1;
    else if (playerObj.gear === 'medium') targetDigits = (r < 0.5) ? 1 : 2;
    else {
        if (r < 0.4) targetDigits = 1;
        else if (r < 0.9) targetDigits = 2;
        else targetDigits = 3;
    }

    let minAns = (targetDigits === 1) ? 0 : (targetDigits === 2) ? 10 : 100;
    let maxAns = (targetDigits === 1) ? 9 : (targetDigits === 2) ? 99 : 999;

    while (!isValid && safety < 100) {
        safety++;
        isValid = true;
        let operators = ['+', '-'];
        if (playerObj.mathMode === 'mixed') operators.push('*', '/');
        op = operators[Math.floor(Math.random() * operators.length)];

        if (op === '+') {
            ans = rand(minAns, maxAns);
            n1 = rand(0, ans); n2 = ans - n1;
            text = `${n1}+${n2}`;
        } else if (op === '-') {
            ans = rand(minAns, maxAns);
            let subMax = (playerObj.gear === 'hard') ? 50 : 20;
            n2 = rand(1, subMax); n1 = ans + n2;
            text = `${n1}-${n2}`;
        } else if (op === '*') {
            let limit = Math.floor(Math.sqrt(maxAns));
            let start = (targetDigits === 1) ? 1 : 2;
            n1 = rand(start, limit + 2);
            let n2Min = Math.ceil(minAns / n1), n2Max = Math.floor(maxAns / n1);
            if (n2Max < n2Min) { isValid = false; continue; }
            n2 = rand(n2Min, n2Max); ans = n1 * n2;
            text = `${n1}x${n2}`;
        } else if (op === '/') {
            ans = rand(minAns, maxAns);
            n2 = rand(2, 9); n1 = ans * n2;
            text = `${n1}/${n2}`;
        }

        if (playerObj.gear === 'easy' && (n1 > 9 || n2 > 9)) isValid = false;
        if (op === '/' && (n1 % n2 !== 0 || n1 > 999)) isValid = false;
        if (n1 < 0 || n2 < 0 || ans < 0) isValid = false;
    }
    return { text: text, ans: ans, lastDigit: parseInt(String(ans).slice(-1)) };
}

function refreshMath(mathData, playerObj) {
    // Store previous answers to prevent double-steering from stale voice input
    const prevLeftAns = mathData.left.ans;
    const prevRightAns = mathData.right.ans;
    const prevLeftDigit = mathData.left.lastDigit;
    const prevRightDigit = mathData.right.lastDigit;

    // Generate LEFT: must not share lastDigit with either previous answer
    let l = genProblem(playerObj);
    let safe = 0;
    while (safe < 50 && (
        l.lastDigit === prevLeftDigit ||
        l.lastDigit === prevRightDigit
    )) {
        l = genProblem(playerObj); safe++;
    }

    // Generate RIGHT: must not match left, and must not match either previous answer
    let r = genProblem(playerObj);
    safe = 0;
    while (safe < 50 && (
        r.lastDigit === l.lastDigit ||
        r.lastDigit === prevLeftDigit ||
        r.lastDigit === prevRightDigit
    )) {
        r = genProblem(playerObj); safe++;
    }

    mathData.left = l; mathData.right = r;
    if (playerObj.id === 1) { uiRefs.p1L.innerText = l.text; uiRefs.p1R.innerText = r.text; }
    else { uiRefs.p2L.innerText = l.text; uiRefs.p2R.innerText = r.text; }
}


/* =========================================
   PART 4: PHYSICS & COMBAT ENGINE
   ========================================= */

// --- SPAWNERS ---
function spawnProjectile(attacker) {
    // Projectile travels from Attacker -> Victim
    // P1 (Left) shoots Right. P2 (Right) shoots Left.
    let startX = attacker.x + 25;
    let startY = 450;
    let targetP = (attacker.id === 1) ? p2 : p1;
    let targetX = targetP.x + 25;

    // Slow speed: Distance ~400px. Time 2.5s. Speed ~160px/s => ~2.6px/frame
    let speed = (attacker.id === 1) ? 2.8 : -2.8;

    projectiles.push({
        x: startX, y: startY,
        vx: speed,
        ownerId: attacker.id,
        color: (attacker.id === 1) ? '#00d2ff' : '#d966ff',
        trailTimer: 0
    });
}

function createExplosion(x, y, color) {
    for (let i = 0; i < 20; i++) {
        particles.push({
            x: x, y: y,
            vx: (Math.random() - 0.5) * 4,
            vy: (Math.random() - 0.5) * 4,
            life: 1.0,
            color: color,
            type: 'spark'
        });
    }
}

function createShieldEffect(player) {
    // Visual pop when shield activates
    for (let i = 0; i < 15; i++) {
        particles.push({
            x: player.x + 25, y: 450,
            vx: (Math.random() - 0.5) * 2,
            vy: (Math.random() - 0.5) * 2 - 2, // Upward drift
            life: 1.5,
            color: (player.id === 1) ? '#00f260' : '#00f260',
            type: 'shield_pop'
        });
    }
}

// --- UPDATERS ---
function updatePhysics(p) {
    const stats = DIFFICULTY[p.gear];

    if (p.speed < stats.baseSpeed) { p.speed += stats.accel * 10; }
    else if (p.speed < stats.maxSpeed) { p.speed += stats.accel; }
    if (p.speed > stats.maxSpeed) { p.speed *= 0.98; }

    let roadOffset = (p.id === 1) ? 20 : HALF_WIDTH + 20;
    let targetX = roadOffset + (p.lane * LANE_WIDTH) + (LANE_WIDTH / 2) - 25;
    p.x += (targetX - p.x) * 0.2;

    p.dist += p.speed / 10;
    p.laneOffset = (p.laneOffset + p.speed) % 60;
    if (p.invuln > 0) p.invuln--;
}

function updateProjectilesAndParticles() {
    // 1. Update Projectiles
    for (let i = 0; i < projectiles.length; i++) {
        let proj = projectiles[i];
        proj.x += proj.vx;

        // Homing Logic (Vertical adjust only)
        let target = (proj.ownerId === 1) ? p2 : p1;
        let dy = (450) - proj.y; // Car Y is 450
        proj.y += dy * 0.05; // Gentle seeking

        // Trail Generation
        proj.trailTimer++;
        if (proj.trailTimer % 4 === 0) {
            particles.push({
                x: proj.x, y: proj.y,
                vx: -proj.vx * 0.2, vy: (Math.random() - 0.5),
                life: 0.8, color: proj.color, type: 'trail'
            });
        }

        // Collision Check
        if (Math.abs(proj.x - (target.x + 25)) < 30) {
            // Hit!
            if (target.shieldActive) {
                // BLOCKED
                sfx.play('shield');
                createExplosion(proj.x, proj.y, '#ffffff'); // Steam effect
                target.shieldActive = false; // Shield Breaks
                updateCombatHUD();
            } else {
                // DAMAGE
                
                if (target.invuln === 0) {
                    sfx.play('crash');
                    target.speed *= 0.5; // 50% Slow
                    target.invuln = 60;
                    createExplosion(proj.x, proj.y, '#ff4b2b'); // Fire effect
                }
            }
            projectiles.splice(i, 1);
            i--;
        } else if (proj.x < 0 || proj.x > ROAD_WIDTH) {
            // Out of bounds
            projectiles.splice(i, 1);
            i--;
        }
    }

    // 2. Update Particles
    for (let i = 0; i < particles.length; i++) {
        let p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life -= 0.02;
        if (p.life <= 0) {
            particles.splice(i, 1);
            i--;
        }
    }
}

function spawnObstacle() {
    if (!active) return;
    let targetP = Math.random() > 0.5 ? p1 : p2;
    let roadOffset = (targetP.id === 1) ? 20 : HALF_WIDTH + 20;
    let lane = Math.floor(Math.random() * 3);
    let x = roadOffset + (lane * LANE_WIDTH) + (LANE_WIDTH / 2) - 25;
    obstacles.push({ x: x, y: -100, w: 50, h: 50, lane: lane, roadId: targetP.id, hit: false });

    let delay1 = DIFFICULTY[p1.gear].trafficFreq;
    let delay2 = DIFFICULTY[p2.gear].trafficFreq;
    let delay = ((delay1 + delay2) / 2) * (0.8 + Math.random() * 0.4);
    setTimeout(spawnObstacle, delay);
}

function updateGame() {
    updatePhysics(p1);
    updatePhysics(p2);
    updateProjectilesAndParticles();

    // Speedometers
    [p1, p2].forEach(p => {
        let pct = p.speed / 15; if (pct > 1) pct = 1;
        let angle = 225 + (pct * 270);
        let needle = (p.id === 1) ? uiRefs.p1Needle : uiRefs.p2Needle;
        let valText = (p.id === 1) ? uiRefs.p1SpeedVal : uiRefs.p2SpeedVal;
        needle.style.transform = `rotate(${angle}deg)`;
        valText.innerText = Math.floor(p.speed * 20);
    });

    // Obstacles
    for (let i = 0; i < obstacles.length; i++) {
        let o = obstacles[i];
        let speed = (o.roadId === 1) ? p1.speed : p2.speed;
        o.y += speed;
        let p = (o.roadId === 1) ? p1 : p2;

        if (!o.hit && p.invuln === 0) {
            if (p.x < o.x + o.w && p.x + 50 > o.x && 450 < o.y + o.h && 450 + 90 > o.y) {
                sfx.play('crash');
                p.speed = 1; p.invuln = 60; o.hit = true;
            }
        }
        if (o.y > ROAD_HEIGHT) { obstacles.splice(i, 1); i--; }
    }
}

function drawGame() {
    // BG
    ctx.fillStyle = '#111'; ctx.fillRect(0, 0, ROAD_WIDTH, ROAD_HEIGHT);
    // Roads
    ctx.fillStyle = '#23232e';
    ctx.fillRect(20, 0, HALF_WIDTH - 40, ROAD_HEIGHT);
    ctx.fillRect(HALF_WIDTH + 20, 0, HALF_WIDTH - 40, ROAD_HEIGHT);
    // Lanes
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    const drawLanes = (p, off) => {
        for (let i = -60; i < ROAD_HEIGHT; i += 60) {
            let y = i + p.laneOffset;
            ctx.fillRect(off + LANE_WIDTH, y, 4, 30);
            ctx.fillRect(off + LANE_WIDTH * 2, y, 4, 30);
        }
    };
    drawLanes(p1, 20); drawLanes(p2, HALF_WIDTH + 20);

    // Obstacles
    obstacles.forEach(o => {
        if (imgObs.complete && imgObs.naturalWidth !== 0) ctx.drawImage(imgObs, o.x, o.y, o.w, o.h);
        else { ctx.fillStyle = 'red'; ctx.fillRect(o.x, o.y, o.w, o.h); }
    });

    // Players
    [p1, p2].forEach(p => {
        // Draw Shield
        if (p.shieldActive) {
            ctx.beginPath();
            ctx.arc(p.x + 25, 450 + 45, 60, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(0, 242, 96, 0.2)'; // Green tint shield
            ctx.fill();
            ctx.strokeStyle = '#00f260';
            ctx.lineWidth = 2;
            ctx.stroke();
        }
        // Draw Car (Blink if invuln)
        if (!(p.invuln > 0 && Math.floor(Date.now() / 50) % 2 === 0)) {
            let img = (p.id === 1) ? imgP1 : imgP2;
            ctx.drawImage(img, p.x, 450, 50, 90);
        }
    });

    // Projectiles
    projectiles.forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
        ctx.fillStyle = '#fff'; ctx.fill();
        ctx.shadowBlur = 10; ctx.shadowColor = p.color;
        ctx.fill(); ctx.shadowBlur = 0;
    });

    // Particles
    particles.forEach(p => {
        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, (p.type === 'spark' ? 3 : 5), 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1.0;
    });
}

function gameLoop() {
    if (!active) return;
    updateGame();
    drawGame();
    requestAnimationFrame(gameLoop);
}

function gameTimer() {
    if (!active) return;
    timeLeft--;
    uiRefs.timerDisplay.innerText = timeLeft + "s";
    if (timeLeft <= 0) endGame(false);
}


/* =========================================
   PART 5: INIT & END (Unchanged)
   ========================================= */

function getQueryParam(param) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(param);
}

function initGame() {
    // Reset Logic
    p1.x = 20 + LANE_WIDTH + LANE_WIDTH / 2 - 25;
    p2.x = HALF_WIDTH + 20 + LANE_WIDTH + LANE_WIDTH / 2 - 25;
    p1.lane = 1; p2.lane = 1;
    p1.speed = DIFFICULTY[p1.gear].baseSpeed;
    p2.speed = DIFFICULTY[p2.gear].baseSpeed;
    p1.dist = 0; p2.dist = 0;
    p1.invuln = 0; p2.invuln = 0;

    // Reset Combat
    p1.streak = 0; p1.ammo = 0; p1.shieldActive = false;
    p2.streak = 0; p2.ammo = 0; p2.shieldActive = false;
    obstacles = []; projectiles = []; particles = [];
    updateCombatHUD(); // Reset UI bars

    active = true;
    sfx.play('rev');
    sfx.startEngine();
    const durationParam = getQueryParam('duration');
    timeLeft = durationParam ? parseInt(durationParam) : 60;

    uiRefs.gameOverScreen.classList.add('hidden');
    uiRefs.btnStart.classList.add('disabled');
    uiRefs.btnAbort.classList.remove('disabled');
    uiRefs.timerDisplay.innerText = timeLeft + "s";

    refreshMath(p1Math, p1); refreshMath(p2Math, p2);
    clearInterval(timerInt);
    timerInt = setInterval(gameTimer, 1000);
    setTimeout(spawnObstacle, 1000);

    // Start voice/gesture if selected
    if (voiceOwner) {
        populateVoiceDeck(voiceOwner);
        initMultiSpeech();
    }
    if (gestureOwner) {
        populateGestureDeck(gestureOwner);
        initMultiGesture();
    }

    gameLoop();
}


function endGame(aborted) {
    active = false;
    clearInterval(timerInt);

    sfx.stopEngine();
    // Stop voice/gesture on game end
    stopSpeech();
    stopGesture();

    let txt = "DRAW!";
    let winnerColor = "#fff";
    if (p1.dist > p2.dist) { txt = "PILOT 1 WINS!"; winnerColor = "#00d2ff"; }
    else if (p2.dist > p1.dist) { txt = "PILOT 2 WINS!"; winnerColor = "#d966ff"; }

    if (aborted) {
        uiRefs.winnerText.innerText = "RACE ABORTED";
        uiRefs.winnerText.style.color = "#ffc107"; winnerColor = "#ffed4eff";
    } else {
        uiRefs.winnerText.innerText = txt;
        uiRefs.winnerText.style.color = "#fff";
    }
    uiRefs.finalScores.innerText = `P1: ${Math.floor(p1.dist)}m  vs  P2: ${Math.floor(p2.dist)}m`;
    const panel = document.querySelector('.glass-panel');
    if (panel) { panel.style.borderColor = winnerColor; panel.style.boxShadow = `0 0 50px ${winnerColor}`; }

    uiRefs.gameOverScreen.classList.remove('hidden');
    uiRefs.btnStart.classList.remove('disabled');
    uiRefs.btnAbort.classList.add('disabled');
}


/* =========================================
   PART 6: MULTI-MODAL INPUT SYSTEM
   ========================================= */

// --- VOICE ADAPTER (Web Speech API) ---
let lastActedResultIndex = -1;  // Track which result index we already acted on

function initMultiSpeech() {
    const SpeechChoice = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechChoice) { alert("Voice not supported. Use Chrome."); return; }

    recognition = new SpeechChoice();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 3;
    recognition.lang = 'en-US';
    lastActedResultIndex = -1;

    recognition.onresult = (event) => {
        if (!voiceOwner || !active) return;
        const last = event.results.length - 1;
        const result = event.results[last];
        const isFinal = result.isFinal;

        // CRITICAL: skip if we already acted on this result index
        // This prevents "3" from echoing into the next question
        if (last <= lastActedResultIndex) return;

        // Try all alternatives for best match
        let bestTranscript = '';
        let matchedNumber = null;
        let matchedCombat = null;

        for (let a = 0; a < result.length; a++) {
            const t = result[a].transcript.trim().toLowerCase();
            if (!t) continue;

            const singleWords = t.split(/\s+/);
            for (const w of singleWords) {
                if (!matchedCombat) {
                    if (FIRE_WORDS.includes(w)) matchedCombat = 'fire';
                    else if (SHIELD_WORDS.includes(w)) matchedCombat = 'shield';
                }
                if (matchedNumber === null && wordMap[w] !== undefined) {
                    matchedNumber = wordMap[w];
                }
            }

            if (matchedNumber === null) {
                const digitMatch = t.match(/\d/);
                if (digitMatch) matchedNumber = parseInt(digitMatch[0]);
            }

            if (!bestTranscript) bestTranscript = t;
        }

        updateVoiceDeck(voiceOwner, isFinal ? 'HEARD' : 'HEARING...', `"${bestTranscript}"`);

        // --- COMBAT ---
        if (matchedCombat) {
            lastActedResultIndex = last;  // Mark as acted
            const p = (voiceOwner === 1) ? p1 : p2;
            useCombatAbility(p, matchedCombat);
            const icon = matchedCombat === 'fire' ? '🔥 FIRE!' : '🛡️ SHIELD!';
            updateVoiceDeck(voiceOwner, icon, `"${bestTranscript}"`);
            return;
        }

        // --- NUMBER INPUT ---
        if (matchedNumber !== null) {
            lastActedResultIndex = last;  // Mark as acted — prevents echo
            handleInput(voiceOwner, matchedNumber);
            updateVoiceDeck(voiceOwner, `= ${matchedNumber}`, `"${bestTranscript}"`);
            setTimeout(() => {
                if (active && voiceOwner) updateVoiceDeck(voiceOwner, 'LISTENING...');
            }, 400);
            return;
        }

        // No match — try full transcript as string input (final only)
        if (isFinal && bestTranscript) {
            lastActedResultIndex = last;
            handleInput(voiceOwner, bestTranscript);
        }
    };

    recognition.onend = () => {
        lastActedResultIndex = -1; // Reset for fresh recognition session
        if (active && voiceOwner) {
            try { recognition.start(); } catch (e) { }
        }
    };

    try { recognition.start(); } catch (e) { }
    updateVoiceDeck(voiceOwner, 'LISTENING...');
}

function stopSpeech() {
    if (recognition) {
        try { recognition.stop(); } catch (e) { }
        recognition = null;
    }
    isProcessingSpeech = false;
}


// --- GESTURE ADAPTER (MediaPipe Hands) ---
function countFingers(landmarks, handedness) {
    let count = 0;
    const label = handedness.label;

    // Thumb (side-dependent)
    if (label === 'Right') {
        if (landmarks[4].x < landmarks[3].x - 0.03) count++;
    } else {
        if (landmarks[4].x > landmarks[3].x + 0.03) count++;
    }

    // Fingers (distance method)
    const wrist = landmarks[0];
    const fingerTips = [8, 12, 16, 20];
    const fingerPIPs = [6, 10, 14, 18];
    for (let i = 0; i < 4; i++) {
        const tip = landmarks[fingerTips[i]];
        const pip = landmarks[fingerPIPs[i]];
        const distTip = Math.pow(tip.x - wrist.x, 2) + Math.pow(tip.y - wrist.y, 2);
        const distPip = Math.pow(pip.x - wrist.x, 2) + Math.pow(pip.y - wrist.y, 2);
        if (distTip > distPip) count++;
    }
    return count;
}

function initMultiGesture() {
    if (hands) return;

    hands = new Hands({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
    });

    hands.setOptions({
        maxNumHands: 2,
        modelComplexity: 0,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
    });

    hands.onResults(onMultiHandsResults);

    let lastProcessTime = 0;
    const processInterval = 200;  // PERF: increased from 150ms (~5 FPS)

    gestureCamera = new Camera(gestureVideo, {
        onFrame: async () => {
            if (gestureOwner && active) {
                const now = Date.now();
                if (now - lastProcessTime > processInterval) {
                    lastProcessTime = now;
                    await hands.send({ image: gestureVideo });
                }
            }
        },
        width: 320,
        height: 240
    });

    gestureCamera.start();
}

function onMultiHandsResults(results) {
    if (!gestureOwner || !active) return;

    // Draw to the deck canvas for the gesture owner
    const deckCanvas = document.getElementById(`p${gestureOwner}-gesture-canvas`);
    const deckCtx = deckCanvas ? deckCanvas.getContext('2d') : null;

    // Draw camera feed + skeleton to deck canvas only (skip backend for PERF)
    if (deckCtx) {
        deckCtx.clearRect(0, 0, deckCanvas.width, deckCanvas.height);
        deckCtx.drawImage(results.image, 0, 0, deckCanvas.width, deckCanvas.height);
    }

    let totalFingers = 0;
    let handCount = 0;

    if (results.multiHandLandmarks && results.multiHandedness) {
        handCount = results.multiHandLandmarks.length;
        for (let i = 0; i < handCount; i++) {
            const landmarks = results.multiHandLandmarks[i];
            const handedness = results.multiHandedness[i];

            // Draw skeleton on deck canvas
            if (deckCtx) {
                drawConnectors(deckCtx, landmarks, HAND_CONNECTIONS, { color: '#00d2ff', lineWidth: 2 });
                drawLandmarks(deckCtx, landmarks, { color: '#ff0000', lineWidth: 1 });
            }

            totalFingers += countFingers(landmarks, handedness);
        }

        // --- GESTURE COMBAT CHECK ---
        // Double fists (0 fingers, 2 hands) = FIRE EMP ✊✊→🔥
        // Both hands fully open (10 fingers) = ACTIVATE SHIELD
        // Single fist (0 fingers, 1 hand) = Number 0
        const p = (gestureOwner === 1) ? p1 : p2;

        if (totalFingers === 0 && handCount === 2) {
            // FIRE — double fists, debounced separately
            if (!gestureCombatDebounce) {
                gestureCombatDebounce = setTimeout(() => {
                    if (gestureOwner && active) {
                        useCombatAbility(p, 'fire');
                        updateGestureDeck(gestureOwner, '🔥', 'FIRE!');
                    }
                    gestureCombatDebounce = null;
                }, 600);
            }
            updateGestureDeck(gestureOwner, '✊✊', 'HOLD TO FIRE...');
            return;
        }
        else if (totalFingers === 10 && handCount === 2) {
            // SHIELD — debounced separately
            if (!gestureCombatDebounce) {
                gestureCombatDebounce = setTimeout(() => {
                    if (gestureOwner && active) {
                        useCombatAbility(p, 'shield');
                        updateGestureDeck(gestureOwner, '🛡️', 'SHIELDED!');
                    }
                    gestureCombatDebounce = null;
                }, 600);  // Hold open palms for 600ms to shield
            }
            updateGestureDeck(gestureOwner, '🖐🖐', 'HOLD TO SHIELD...');
            return;  // Don't process as number input
        }
        else {
            // Not a combat gesture — clear combat debounce if finger count changed
            if (gestureCombatDebounce) {
                clearTimeout(gestureCombatDebounce);
                gestureCombatDebounce = null;
            }
        }

        // --- STANDARD NUMBER INPUT (1-9) ---
        if (totalFingers !== lastDetectedFingerCount) {
            lastDetectedFingerCount = totalFingers;
            updateGestureDeck(gestureOwner, totalFingers, 'SCANNING...');

            clearTimeout(gestureDebounceTimer);
            gestureDebounceTimer = setTimeout(() => {
                if (gestureOwner && active) {
                    updateGestureDeck(gestureOwner, totalFingers, 'LOCKED ✓');
                    handleInput(gestureOwner, totalFingers);
                }
            }, 500);
        }
    }
}

function stopGesture() {
    if (gestureCamera) {
        try { gestureCamera.stop(); } catch (e) { }
        gestureCamera = null;
    }
    if (hands) {
        try { hands.close(); } catch (e) { }
        hands = null;
    }
    lastDetectedFingerCount = -1;
    clearTimeout(gestureDebounceTimer);
    clearTimeout(gestureCombatDebounce);
    gestureCombatDebounce = null;
}


// --- SIDE DECK MANAGEMENT ---
function getDeckElements(playerId) {
    return {
        deck: (playerId === 1) ? p1SideDeck : p2SideDeck,
        content: (playerId === 1) ? p1DeckContent : p2DeckContent
    };
}

function populateVoiceDeck(playerId) {
    const { deck, content } = getDeckElements(playerId);
    content.innerHTML = `
        <div class="deck-voice-log">
            <div class="voice-status-icon">🎙️</div>
            <div class="voice-status-text" id="p${playerId}-voice-status">STANDBY</div>
            <div class="voice-heard-text" id="p${playerId}-voice-heard">---</div>
        </div>
    `;
    deck.classList.add('visible');
}

function populateGestureDeck(playerId) {
    const { deck, content } = getDeckElements(playerId);
    // Create a dedicated canvas for this deck
    content.innerHTML = `
        <div class="deck-gesture-view">
            <canvas id="p${playerId}-gesture-canvas" width="320" height="240"></canvas>
            <div class="gesture-finger-count" id="p${playerId}-finger-count">-</div>
            <div class="gesture-status-label" id="p${playerId}-gesture-status">SCANNING</div>
        </div>
    `;
    deck.classList.add('visible');
}

function hideDeck(playerId) {
    const { deck, content } = getDeckElements(playerId);
    deck.classList.remove('visible');
    content.innerHTML = '';
}

function updateVoiceDeck(playerId, statusText, heardText) {
    const statusEl = document.getElementById(`p${playerId}-voice-status`);
    const heardEl = document.getElementById(`p${playerId}-voice-heard`);
    if (statusEl && statusText) statusEl.innerText = statusText;
    if (heardEl && heardText) heardEl.innerText = heardText;
}

function updateGestureDeck(playerId, fingerCount, statusText) {
    const countEl = document.getElementById(`p${playerId}-finger-count`);
    const statusEl = document.getElementById(`p${playerId}-gesture-status`);
    if (countEl && fingerCount !== undefined) countEl.innerText = fingerCount;
    if (statusEl && statusText) statusEl.innerText = statusText;
}


// --- MODE SELECTION ---
window.selectMode = function (playerId, mode) {
    const p = (playerId === 1) ? p1 : p2;
    const other = (playerId === 1) ? p2 : p1;
    const otherId = (playerId === 1) ? 2 : 1;

    // Check exclusivity
    if (mode === 'voice' && voiceOwner === otherId) return;
    if (mode === 'gesture' && gestureOwner === otherId) return;

    // If same mode already selected, do nothing
    if (p.controlMode === mode) return;

    // Clean up previous mode
    if (p.controlMode === 'voice' && voiceOwner === playerId) {
        stopSpeech();
        voiceOwner = null;
    }
    if (p.controlMode === 'gesture' && gestureOwner === playerId) {
        stopGesture();
        gestureOwner = null;
    }
    // Hide deck from old mode
    hideDeck(playerId);

    // Set new mode
    p.controlMode = mode;

    if (mode === 'voice') {
        voiceOwner = playerId;
        populateVoiceDeck(playerId);
        if (active) initMultiSpeech();
    } else if (mode === 'gesture') {
        gestureOwner = playerId;
        populateGestureDeck(playerId);
        if (active) initMultiGesture();
    }
    // keyboard: deck stays hidden

    // Update UI buttons
    updateModeButtons();

    // Update input hint text
    const hintEl = document.querySelector(`.p${playerId}-panel .input-hint`);
    if (hintEl) {
        if (mode === 'keyboard') hintEl.innerText = playerId === 1 ? 'Linear Keypad (1-9)' : 'Calculator Numpad';
        else if (mode === 'voice') hintEl.innerText = '🎙️ Voice Control';
        else if (mode === 'gesture') hintEl.innerText = '🖐️ Gesture Control';
    }
};

function updateModeButtons() {
    // Clear all active/taken states
    document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.classList.remove('active', 'taken');
    });

    // Set active for each player
    [p1, p2].forEach(p => {
        const activeBtn = document.querySelector(`.mode-btn[data-player="${p.id}"][data-mode="${p.controlMode}"]`);
        if (activeBtn) activeBtn.classList.add('active');
    });

    // Set taken: if voice is owned, disable voice for the other player
    if (voiceOwner) {
        const otherId = (voiceOwner === 1) ? 2 : 1;
        const takenBtn = document.querySelector(`.mode-btn[data-player="${otherId}"][data-mode="voice"]`);
        if (takenBtn) takenBtn.classList.add('taken');
    }
    // Same for gesture
    if (gestureOwner) {
        const otherId = (gestureOwner === 1) ? 2 : 1;
        const takenBtn = document.querySelector(`.mode-btn[data-player="${otherId}"][data-mode="gesture"]`);
        if (takenBtn) takenBtn.classList.add('taken');
    }
}


// Initial Draw & URL Check
const initialDuration = getQueryParam('duration');
if (initialDuration) uiRefs.timerDisplay.innerText = initialDuration + "s";
drawGame();