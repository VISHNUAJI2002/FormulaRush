/* =========================================
   MATH RACER: DUAL COCKPIT ENGINE (FINAL W/ COMBAT)
   ========================================= */

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

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
    easy:   { baseSpeed: 1.5, maxSpeed: 3,  accel: 0.0005, trafficFreq: 2500 },
    medium: { baseSpeed: 2.0, maxSpeed: 4,  accel: 0.005, trafficFreq: 2000 },
    hard:   { baseSpeed: 2.5, maxSpeed: 5,  accel: 0.005, trafficFreq: 1500 }
};

// --- GAME STATE ---
let active = false;
let timeLeft = 60;
let timerInt;
let obstacles = [];
let projectiles = []; // Combat: Active Fireballs
let particles = [];   // Combat: Visual FX

// Player Objects
// Added: ammo (0 or 1), streak (0-5), shieldActive (bool)
let p1 = { 
    id: 1, x: 0, lane: 1, speed: 0, dist: 0, invuln: 0, 
    gear: 'easy', mathMode: 'simple', laneOffset: 0,
    streak: 0, ammo: 0, shieldActive: false 
};
let p2 = { 
    id: 2, x: 0, lane: 1, speed: 0, dist: 0, invuln: 0, 
    gear: 'easy', mathMode: 'simple', laneOffset: 0,
    streak: 0, ammo: 0, shieldActive: false 
};

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

window.updateGameGear = function(playerNum, level) {
    if (playerNum === 1) p1.gear = level;
    else p2.gear = level;
};

window.setMath = function(playerNum, mode) {
    if (playerNum === 1) {
        p1.mathMode = mode;
        if(active) refreshMath(p1Math, p1);
    } else {
        p2.mathMode = mode;
        if(active) refreshMath(p2Math, p2);
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

    // --- PLAYER 1 INPUTS ---
    if (e.code.startsWith('Digit')) {
        const val = parseInt(e.key);
        if (!isNaN(val)) checkAnswer(p1, p1Math, val);
    }
    // Combat: Fire (W), Shield (S)
    if (e.code === 'KeyW') useCombatAbility(p1, 'fire');
    if (e.code === 'KeyS') useCombatAbility(p1, 'shield');

    // --- PLAYER 2 INPUTS ---
    if (e.code.startsWith('Numpad')) {
        const val = parseInt(e.key);
        if (!isNaN(val)) checkAnswer(p2, p2Math, val);
    }
    // Combat: Fire (ArrowUp), Shield (ArrowDown)
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
            p.ammo = 0; 
            p.streak = 0; // Consumption
            spawnProjectile(p);
        } else if (type === 'shield') {
            p.ammo = 0;
            p.streak = 0;
            p.shieldActive = true;
            createShieldEffect(p); // Visual pop
        }
        updateCombatHUD();
    }
}

function checkAnswer(playerObj, mathData, inputVal) {
    let correct = false;
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
    let l = genProblem(playerObj);
    let r = genProblem(playerObj);
    let safe = 0;
    while (r.lastDigit === l.lastDigit && safe < 50) {
        r = genProblem(playerObj);
        safe++;
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
    let targetX = roadOffset + (p.lane * LANE_WIDTH) + (LANE_WIDTH/2) - 25;
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
                vx: -proj.vx * 0.2, vy: (Math.random()-0.5),
                life: 0.8, color: proj.color, type: 'trail'
            });
        }

        // Collision Check
        if (Math.abs(proj.x - (target.x + 25)) < 30) {
            // Hit!
            if (target.shieldActive) {
                // BLOCKED
                createExplosion(proj.x, proj.y, '#ffffff'); // Steam effect
                target.shieldActive = false; // Shield Breaks
                updateCombatHUD();
            } else {
                // DAMAGE
                if (target.invuln === 0) {
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
    let x = roadOffset + (lane * LANE_WIDTH) + (LANE_WIDTH/2) - 25;
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
        let pct = p.speed / 15; if(pct > 1) pct = 1;
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
        if (!(p.invuln > 0 && Math.floor(Date.now()/50)%2===0)) {
            let img = (p.id === 1) ? imgP1 : imgP2;
            ctx.drawImage(img, p.x, 450, 50, 90);
        }
    });

    // Projectiles
    projectiles.forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 8, 0, Math.PI*2);
        ctx.fillStyle = '#fff'; ctx.fill();
        ctx.shadowBlur = 10; ctx.shadowColor = p.color;
        ctx.fill(); ctx.shadowBlur = 0;
    });

    // Particles
    particles.forEach(p => {
        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, (p.type==='spark'?3:5), 0, Math.PI*2);
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
    p1.x = 20 + LANE_WIDTH + LANE_WIDTH/2 - 25;
    p2.x = HALF_WIDTH + 20 + LANE_WIDTH + LANE_WIDTH/2 - 25;
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
    gameLoop();
}

function endGame(aborted) {
    active = false;
    clearInterval(timerInt);
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
    if(panel) { panel.style.borderColor = winnerColor; panel.style.boxShadow = `0 0 50px ${winnerColor}`; }

    uiRefs.gameOverScreen.classList.remove('hidden');
    uiRefs.btnStart.classList.remove('disabled');
    uiRefs.btnAbort.classList.add('disabled');
}

// Initial Draw & URL Check
const initialDuration = getQueryParam('duration');
if(initialDuration) uiRefs.timerDisplay.innerText = initialDuration + "s";
drawGame();