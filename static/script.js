/* =========================================
   MATH RACER: DUAL COCKPIT ENGINE (FINAL)
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
// FIXED: Added 'baseSpeed' to each mode.
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

// Player Objects
// 'invuln' used for visual flickering after hit so speed doesn't drop to 0 instantly
let p1 = { 
    id: 1, x: 0, lane: 1, speed: 0, dist: 0, invuln: 0, 
    gear: 'easy', mathMode: 'simple', laneOffset: 0 
};
let p2 = { 
    id: 2, x: 0, lane: 1, speed: 0, dist: 0, invuln: 0, 
    gear: 'easy', mathMode: 'simple', laneOffset: 0 
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
   PART 1: UI INTERACTION (Gears & Buttons)
   ========================================= */

// Called by HTML inline script for visual + logic update
window.updateGameGear = function(playerNum, level) {
    if (playerNum === 1) p1.gear = level;
    else p2.gear = level;
};

// Updated: changing math mode now immediately refreshes the question
window.setMath = function(playerNum, mode) {
    if (playerNum === 1) {
        p1.mathMode = mode;
        if(active) refreshMath(p1Math, p1);
    } else {
        p2.mathMode = mode;
        if(active) refreshMath(p2Math, p2);
    }
};

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

    // PLAYER 1: Linear Keys
    if (e.code.startsWith('Digit')) {
        const val = parseInt(e.key);
        if (!isNaN(val)) checkAnswer(p1, p1Math, val);
    }

    // PLAYER 2: Numpad Keys
    if (e.code.startsWith('Numpad')) {
        const val = parseInt(e.key);
        if (!isNaN(val)) checkAnswer(p2, p2Math, val);
    }
});

function checkAnswer(playerObj, mathData, inputVal) {
    // Compare input against the LAST DIGIT of the answer
    if (inputVal === mathData.left.lastDigit) {
        movePlayer(playerObj, -1);
        refreshMath(mathData, playerObj);
    } 
    else if (inputVal === mathData.right.lastDigit) {
        movePlayer(playerObj, 1);
        refreshMath(mathData, playerObj);
    }
}

function movePlayer(p, dir) {
    let newLane = p.lane + dir;
    if (newLane >= 0 && newLane <= 2) {
        p.lane = newLane;
    }
}


/* =========================================
   PART 3: STRICT PROBABILITY MATH GENERATION
   ========================================= */

function rand(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function genProblem(playerObj) {
    let n1, n2, op, ans, text;
    let isValid = false;
    let safety = 0;

    // 1. DETERMINE TARGET ANSWER DIGITS
    let targetDigits = 1;
    const r = Math.random();

    if (playerObj.gear === 'easy') {
        // Easy: Always 1-digit
        targetDigits = 1; 
    } 
    else if (playerObj.gear === 'medium') {
        // Medium: 50% 1-digit, 50% 2-digit
        targetDigits = (r < 0.5) ? 1 : 2;
    } 
    else {
        // Hard: 40% 1-digit, 50% 2-digit, 10% 3-digit
        if (r < 0.4) targetDigits = 1;
        else if (r < 0.9) targetDigits = 2;
        else targetDigits = 3;
    }

    // 2. SET ANSWER RANGES
    let minAns, maxAns;
    if (targetDigits === 1) { minAns = 0; maxAns = 9; }
    else if (targetDigits === 2) { minAns = 10; maxAns = 99; }
    else { minAns = 100; maxAns = 999; }

    // 3. GENERATION LOOP
    // We keep retrying until we find numbers that fit the rules
    while (!isValid && safety < 100) {
        safety++;
        isValid = true;
        
        // Pick Operator
        let operators = ['+', '-'];
        // FIXED: Added '/' to operators if mixed mode is selected
        if (playerObj.mathMode === 'mixed') operators.push('*', '/');
        
        op = operators[Math.floor(Math.random() * operators.length)];

        // --- ADDITION ---
        if (op === '+') {
            ans = rand(minAns, maxAns);
            n1 = rand(0, ans); 
            n2 = ans - n1;
            text = `${n1}+${n2}`;
        } 
        // --- SUBTRACTION ---
        else if (op === '-') {
            ans = rand(minAns, maxAns);
            // If Hard mode, use larger subtractors so it looks harder
            let subtractorMax = (playerObj.gear === 'hard') ? 50 : 20;
            n2 = rand(1, subtractorMax);
            n1 = ans + n2;
            text = `${n1}-${n2}`;
        } 
        // --- MULTIPLICATION ---
        else if (op === '*') {
            // Logic: Pick n1 and n2 such that n1*n2 is within minAns/maxAns
            // Simplified: Pick n1, check limits for n2
            let limit = Math.floor(Math.sqrt(maxAns));
            let start = (targetDigits === 1) ? 1 : 2; 
            n1 = rand(start, limit + 2); 
            
            // Calculate valid range for n2
            let n2Min = Math.ceil(minAns / n1);
            let n2Max = Math.floor(maxAns / n1);
            
            if (n2Max < n2Min) { isValid = false; continue; } // Retry if no valid n2 exists
            
            n2 = rand(n2Min, n2Max);
            ans = n1 * n2;
            text = `${n1}x${n2}`;
        }
        // --- DIVISION ---
        else if (op === '/') {
            // Logic: Generate multiplication in reverse
            // ans = n1 / n2  --> n1 = ans * n2
            ans = rand(minAns, maxAns);
            n2 = rand(2, 9); // Keep divisor single digit for mental math
            n1 = ans * n2;
            text = `${n1}/${n2}`;
        }

        // --- VALIDATION STEPS ---

        // 1. Strict Easy Mode Check
        // Easy Mode inputs must be single digit (0-9)
        if (playerObj.gear === 'easy') {
            if (n1 > 9 || n2 > 9) isValid = false;
        }

        // 2. Division Cleanliness Check (Just in case)
        if (op === '/') {
            if (n1 % n2 !== 0) isValid = false;
            if (n1 > 999) isValid = false; // Cap massive division inputs
        }
        
        // 3. Negative check
        if (n1 < 0 || n2 < 0 || ans < 0) isValid = false;
    }

    return { 
        text: text, 
        ans: ans,
        lastDigit: parseInt(String(ans).slice(-1)) 
    };
}

function refreshMath(mathData, playerObj) {
    let l = genProblem(playerObj);
    let r = genProblem(playerObj);
    
    // Ensure answers are different (checking Last Digit uniqueness)
    // We don't want both answers ending in '7' (e.g. 17 and 37)
    let safe = 0;
    while (r.lastDigit === l.lastDigit && safe < 50) {
        r = genProblem(playerObj);
        safe++;
    }

    mathData.left = l;
    mathData.right = r;

    // Update UI text
    if (playerObj.id === 1) {
        uiRefs.p1L.innerText = l.text;
        uiRefs.p1R.innerText = r.text;
    } else {
        uiRefs.p2L.innerText = l.text;
        uiRefs.p2R.innerText = r.text;
    }
}


/* =========================================
   PART 4: PHYSICS & LOOP
   ========================================= */

function updatePhysics(p) {
    // 1. Get stats based on Gear
    const stats = DIFFICULTY[p.gear];
    
    // 2. Base Speed Logic (NEW)
    // If speed is below baseSpeed (e.g. start or crash recovery), accelerate FAST.
    if (p.speed < stats.baseSpeed) {
        p.speed += stats.accel * 10; 
    }
    // 3. Normal Acceleration (approaching Max)
    else if (p.speed < stats.maxSpeed) {
        p.speed += stats.accel;
    }
    
    // 4. Cap Speed (e.g. if player downshifted gears while going fast)
    if (p.speed > stats.maxSpeed) {
        p.speed *= 0.98; // Smooth deceleration
    }

    // 5. Lane Movement (Smooth Interpolation)
    let roadOffset = (p.id === 1) ? 20 : HALF_WIDTH + 20;
    let targetX = roadOffset + (p.lane * LANE_WIDTH) + (LANE_WIDTH/2) - 25;
    
    p.x += (targetX - p.x) * 0.2;

    // 6. Distance & Animation
    p.dist += p.speed / 10;
    p.laneOffset = (p.laneOffset + p.speed) % 60;
    
    // 7. Invulnerability Timer (Visual Flicker only)
    if (p.invuln > 0) p.invuln--;
}

function updateSpeedometers() {
    [p1, p2].forEach(p => {
        let pct = p.speed / 15; // 15 is visual max
        if(pct > 1) pct = 1;
        let angle = 225 + (pct * 270);
        
        let needle = (p.id === 1) ? uiRefs.p1Needle : uiRefs.p2Needle;
        let valText = (p.id === 1) ? uiRefs.p1SpeedVal : uiRefs.p2SpeedVal;
        
        needle.style.transform = `rotate(${angle}deg)`;
        valText.innerText = Math.floor(p.speed * 20); // Scale to nicer number
    });
}

function spawnObstacle() {
    if (!active) return;

    let targetP = Math.random() > 0.5 ? p1 : p2;
    let roadOffset = (targetP.id === 1) ? 20 : HALF_WIDTH + 20;
    let lane = Math.floor(Math.random() * 3);
    let x = roadOffset + (lane * LANE_WIDTH) + (LANE_WIDTH/2) - 25;

    obstacles.push({
        x: x, y: -100, w: 50, h: 50,
        lane: lane, roadId: targetP.id, hit: false
    });
    
    // Average delay between P1 and P2 settings
    let delay1 = DIFFICULTY[p1.gear].trafficFreq;
    let delay2 = DIFFICULTY[p2.gear].trafficFreq;
    let delay = (delay1 + delay2) / 2;
    
    // Randomize slightly
    delay = delay * (0.8 + Math.random() * 0.4); 
    
    setTimeout(spawnObstacle, delay);
}

function updateGame() {
    updatePhysics(p1);
    updatePhysics(p2);
    updateSpeedometers();

    for (let i = 0; i < obstacles.length; i++) {
        let o = obstacles[i];
        
        // Move obstacle based on player speed on that road
        let speed = (o.roadId === 1) ? p1.speed : p2.speed;
        o.y += speed;

        let p = (o.roadId === 1) ? p1 : p2;
        
        // Collision Logic
        if (!o.hit && p.invuln === 0) { // Check invulnerability
            if (
                p.x < o.x + o.w &&
                p.x + 50 > o.x &&
                450 < o.y + o.h &&
                450 + 90 > o.y
            ) {
                // COLLISION EVENT
                p.speed = 1; // Drop speed to 1, physics will ramp it back to baseSpeed
                p.invuln = 60; // 60 frames of invulnerability (approx 1 sec)
                o.hit = true;  // Mark obstacle as hit
            }
        }

        if (o.y > ROAD_HEIGHT) {
            obstacles.splice(i, 1);
            i--;
        }
    }
}

function drawGame() {
    // BG
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, ROAD_WIDTH, ROAD_HEIGHT);

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
    drawLanes(p1, 20);
    drawLanes(p2, HALF_WIDTH + 20);

    // Obstacles
    obstacles.forEach(o => {
        if (imgObs.complete && imgObs.naturalWidth !== 0)
            ctx.drawImage(imgObs, o.x, o.y, o.w, o.h);
        else {
            ctx.fillStyle = 'red';
            ctx.fillRect(o.x, o.y, o.w, o.h);
        }
    });

    // Players (Blink if invulnerable)
    // Checks current time vs invuln frames to create blink effect
    if (!(p1.invuln > 0 && Math.floor(Date.now()/50)%2===0))
        ctx.drawImage(imgP1, p1.x, 450, 50, 90);
    
    if (!(p2.invuln > 0 && Math.floor(Date.now()/50)%2===0))
        ctx.drawImage(imgP2, p2.x, 450, 50, 90);
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
   PART 5: INIT & END
   ========================================= */

function initGame() {
    // Reset Everything
    p1.x = 20 + LANE_WIDTH + LANE_WIDTH/2 - 25;
    p2.x = HALF_WIDTH + 20 + LANE_WIDTH + LANE_WIDTH/2 - 25;
    p1.lane = 1; p2.lane = 1;
    
    // NEW: Initialize with base speed for the current gear
    p1.speed = DIFFICULTY[p1.gear].baseSpeed;
    p2.speed = DIFFICULTY[p2.gear].baseSpeed;
    
    p1.dist = 0; p2.dist = 0;
    p1.invuln = 0; p2.invuln = 0;
    obstacles = [];
    active = true;
    timeLeft = 60;
    
    uiRefs.gameOverScreen.classList.add('hidden');
    uiRefs.btnStart.classList.add('disabled');
    uiRefs.btnAbort.classList.remove('disabled');
    uiRefs.timerDisplay.innerText = "60s";
    
    refreshMath(p1Math, p1);
    refreshMath(p2Math, p2);

    clearInterval(timerInt);
    timerInt = setInterval(gameTimer, 1000);
    setTimeout(spawnObstacle, 1000);
    gameLoop();
}

function endGame(aborted) {
    active = false;
    clearInterval(timerInt);
    
    let txt = "DRAW!";
    if (p1.dist > p2.dist) txt = "PILOT 1 WINS!";
    else if (p2.dist > p1.dist) txt = "PILOT 2 WINS!";
    
    if (aborted) {
        uiRefs.winnerText.innerText = "RACE ABORTED";
        uiRefs.winnerText.style.color = "#ffc107";
    } else {
        uiRefs.winnerText.innerText = txt;
        uiRefs.winnerText.style.color = "#fff";
    }

    uiRefs.finalScores.innerText = `P1: ${Math.floor(p1.dist)}m  vs  P2: ${Math.floor(p2.dist)}m`;
    uiRefs.gameOverScreen.classList.remove('hidden');
    
    uiRefs.btnStart.classList.remove('disabled');
    uiRefs.btnAbort.classList.add('disabled');
}

// Initial Draw
drawGame();