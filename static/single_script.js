/* --- CONFIGURATION & STATE --- */
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const CONFIG = {
    laneCount: 5,
    roadWidth: 800,
    
    // --- DIMENSIONS ---
    playerWidth: 130, 
    playerHeight: 110,
    
    enemyWidth: 45, 
    enemyHeight: 85,
    
    laneWidth: 800 / 5
};

// FIXED: Reduced Max speeds for better playability
// Adjusted spawn intervals slightly
const SPEEDS = {
    easy:   { base: 0.5, max: 2.0, acceleration: 0.00005, spawnInterval: 2500 },
    medium: { base: 0.5, max: 2.5, acceleration: 0.00005, spawnInterval: 2000 },
    hard:   { base: 0.5, max: 3.0, acceleration: 0.00005, spawnInterval: 1800 }
};

let gameState = {
    isPlaying: false,
    score: 0,
    speed: 0,
    maxSpeed: 0,
    lane: 2, 
    mathMode: 'simple',
    difficulty: 'easy', 
    distance: 0
};

// IMAGES
const playerImg = new Image();
playerImg.src = "/static/car_player.png"; 
const enemyImg = new Image();
enemyImg.src = "/static/car_enemy.png"; 

let enemies = [];
let currentQuestion = null;
let spawnTimer = null;

/* --- UI ELEMENTS --- */
const questionLeftEl = document.getElementById('question-left');
const questionRightEl = document.getElementById('question-right');
const gameOverScreen = document.getElementById('game-over-screen');
const gameOverTitle = document.getElementById('game-over-title');
const finalScoreEl = document.getElementById('final-score');
const liveDistanceEl = document.getElementById('live-distance');
const speedNeedle = document.getElementById('speed-needle');
const speedValueEl = document.getElementById('speed-value');

// CONTROLS
const btnStart = document.getElementById('btn-start');
const btnStop = document.getElementById('btn-stop');
const settingsArea = document.getElementById('settings-area');

// SHIFTER
const shifterAssembly = document.getElementById('shifter-assembly');
const knobNumber = document.getElementById('knob-number');
const labelEasy = document.getElementById('label-easy');
const labelMedium = document.getElementById('label-medium');
const labelHard = document.getElementById('label-hard');

/* --- EVENT LISTENERS --- */
btnStart.addEventListener('click', startGame);
btnStop.addEventListener('click', abortRace);

document.addEventListener('keydown', (e) => {
    if (!gameState.isPlaying) return;
    if (e.key >= '0' && e.key <= '9') {
        checkAnswer(parseInt(e.key));
    }
});

function getSelectedRadio(name) {
    const radios = document.getElementsByName(name);
    for (let radio of radios) {
        if (radio.checked) return radio.value;
    }
    return 'simple';
}

// NEW: Function to update math mode immediately
function updateMathMode() {
    gameState.mathMode = getSelectedRadio('math');
    // If playing, regenerate questions immediately so new logic applies
    if (gameState.isPlaying) {
        generateTwoProblems();
    }
}

/* --- UI LOGIC (GEAR SHIFT) --- */
function shiftGear(level) {
    // REMOVED: if (gameState.isPlaying) return; 
    // Now allowing gear shift during gameplay

    gameState.difficulty = level;

    // Update Physics in real-time
    const physics = SPEEDS[gameState.difficulty];
    gameState.maxSpeed = physics.max;
    // Note: We don't reset current speed, we just let it cap or grow to new max

    // 1. CLEANUP: Reset ALL labels
    [labelEasy, labelMedium, labelHard].forEach(label => {
        label.classList.remove('active-label');
        label.style.color = "";
        label.style.textShadow = "";
    });

    // 2. APPLY NEW STYLE
    if (level === 'hard') {
        shifterAssembly.style.top = "30px";
        knobNumber.innerText = "3";
        knobNumber.style.color = "#dc3545"; 
        knobNumber.style.textShadow = "0 0 15px #dc3545";
        
        labelHard.classList.add('active-label');
        labelHard.style.color = "#dc3545";
    } 
    else if (level === 'medium') {
        shifterAssembly.style.top = "90px";
        knobNumber.innerText = "2";
        knobNumber.style.color = "#ffc107";
        knobNumber.style.textShadow = "0 0 15px #ffc107";
        
        labelMedium.classList.add('active-label');
        labelMedium.style.color = "#ffc107";
    } 
    else { // easy
        shifterAssembly.style.top = "150px";
        knobNumber.innerText = "1";
        knobNumber.style.color = "#00d2ff"; 
        knobNumber.style.textShadow = "0 0 15px #00d2ff";
        
        labelEasy.classList.add('active-label');
        labelEasy.style.color = "#00d2ff";
    }
}


/* --- MATH LOGIC --- */
function generateTwoProblems() {
    let leftObj = createMathProblem();
    let rightObj = createMathProblem();

    // Ensure distinct last digits
    while (rightObj.lastDigit === leftObj.lastDigit) {
        rightObj = createMathProblem();
    }

    currentQuestion = {
        leftDigit: leftObj.lastDigit,
        rightDigit: rightObj.lastDigit
    };

    questionLeftEl.textContent = `L: ${leftObj.text}`;   
    questionRightEl.textContent = `R: ${rightObj.text}`; 
}

function createMathProblem() {
    let n1, n2, op, ans, text;
    let isValid = false;

    // Safety counter to prevent infinite loops (rare case)
    let safety = 0;

    while (!isValid && safety < 100) {
        safety++;
        
        let operators = ['+', '-'];
        // FIXED: Added Division '/'
        if (gameState.mathMode === 'mixed') operators.push('*', '/');
        
        op = operators[Math.floor(Math.random() * operators.length)];

        // Random numbers setup
        // We use slightly smaller numbers for division multiplication base
        n1 = Math.floor(Math.random() * 12) + 1; 
        n2 = Math.floor(Math.random() * 12) + 1;

        if (op === '+') { 
            ans = n1 + n2; 
            text = `${n1}+${n2}`; 
        }
        else if (op === '-') { 
            let big = Math.max(n1, n2);
            let small = Math.min(n1, n2);
            ans = big - small; 
            text = `${big}-${small}`; 
        }
        else if (op === '*') { 
            ans = n1 * n2; 
            text = `${n1}x${n2}`; 
        }
        else if (op === '/') {
            // Division Logic: 
            // Generate answer and divisor, then calculate dividend.
            // This ensures the result is a whole number.
            let divisor = Math.floor(Math.random() * 9) + 2; // Divisor between 2 and 10
            let quotient = Math.floor(Math.random() * 10) + 1; // Answer
            let dividend = quotient * divisor;
            
            ans = quotient;
            text = `${dividend}/${divisor}`;
        }

        // Difficulty Checks (Answer Magnitude)
        isValid = false; 
        if (gameState.difficulty === 'easy') {
            if (ans < 10 && ans >= 0) isValid = true;
        } 
        else if (gameState.difficulty === 'medium') {
            // Medium can be single or double digit, but prefers slightly harder math
            if (ans >= 0 && ans < 100) isValid = true;
        } 
        else if (gameState.difficulty === 'hard') {
            if (ans >= 10 || (op === '*' || op === '/')) isValid = true; 
        }
    }

    return {
        text: text,
        lastDigit: parseInt(String(ans).slice(-1))
    };
}

function checkAnswer(inputDigit) {
    if (inputDigit === currentQuestion.leftDigit) {
        if (gameState.lane > 0) gameState.lane--;
        generateTwoProblems();
    } 
    else if (inputDigit === currentQuestion.rightDigit) {
        if (gameState.lane < CONFIG.laneCount - 1) gameState.lane++;
        generateTwoProblems();
    }
}


/* --- GAME ENGINE --- */

function startGame() {
    if (gameState.isPlaying) return;

    // REMOVED: settingsArea.classList.add('controls-locked');
    
    // Toggle Buttons
    btnStart.classList.add('btn-disabled');
    btnStop.classList.remove('btn-disabled');

    gameState.mathMode = getSelectedRadio('math');
    
    // Init physics based on current gear
    const physics = SPEEDS[gameState.difficulty];
    gameState.speed = physics.base;
    gameState.maxSpeed = physics.max;
    
    gameState.isPlaying = true;
    gameState.lane = 2; 
    gameState.score = 0;
    gameState.distance = 0;
    enemies = [];

    generateTwoProblems();
    requestAnimationFrame(gameLoop);
    
    // Clear old interval if exists
    if(spawnTimer) clearInterval(spawnTimer);
    
    spawnTimer = setInterval(() => {
        if (gameState.isPlaying) spawnEnemy();
    }, physics.spawnInterval);
}

function abortRace() {
    if (!gameState.isPlaying) return;
    
    gameState.isPlaying = false;
    gameOverTitle.innerText = "RACE ABORTED";
    gameOverTitle.style.color = "#ffc107"; 
    finalScoreEl.innerText = gameState.score;
    gameOverScreen.style.display = 'flex';
    
    btnStop.classList.add('btn-disabled');
    // Start button stays disabled until reload or manual reset logic
    // (Here we follow existing logic: reload page to restart fully)
}

function spawnEnemy() {
    const lane = Math.floor(Math.random() * CONFIG.laneCount);
    
    // FIXED: Reduced random speed offset significantly (from 2 to 0.5)
    // This makes traffic flow more predictable
    enemies.push({
        lane: lane,
        y: -150,
        speedOffset: (Math.random() * 0.5) 
    });
}

function updatePhysics() {
    if (gameState.speed < gameState.maxSpeed) gameState.speed += 0.01;
    // If we shifted down, decelerate smoothly
    if (gameState.speed > gameState.maxSpeed) gameState.speed -= 0.02;

    gameState.distance += gameState.speed;
    gameState.score = Math.floor(gameState.distance / 10);
    liveDistanceEl.innerText = gameState.score;
}

function updateSpeedometer() {
    const maxS = 20; 
    let pct = gameState.speed / maxS;
    if(pct > 1) pct = 1;
    const angle = 225 + (pct * 270);
    speedNeedle.style.transform = `rotate(${angle}deg)`;
    speedValueEl.innerText = Math.floor(gameState.speed * 10); 
}

// Draw Function
function drawCar(img, x, y, w, h, color) {
    if (img.complete && img.naturalHeight !== 0) {
        ctx.drawImage(img, x, y, w, h);
    } else {
        ctx.fillStyle = color;
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = "#fff"; 
        ctx.strokeRect(x, y, w, h);
    }
}

function gameLoop() {
    if (!gameState.isPlaying) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    updatePhysics();
    updateSpeedometer();

    // 1. Draw Road
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

    // 2. Draw Player
    const playerX = (gameState.lane * CONFIG.laneWidth) + (CONFIG.laneWidth/2) - (CONFIG.playerWidth/2);
    const playerY = canvas.height - 150;
    
    drawCar(playerImg, playerX, playerY, CONFIG.playerWidth, CONFIG.playerHeight, "cyan");

    // 3. Draw Enemies
    for (let i = 0; i < enemies.length; i++) {
        let e = enemies[i];
        
        // Update Enemy Y
        // Enemies move based on player speed + their own offset
        e.y += gameState.speed * 0.8 + e.speedOffset;
        
        const ex = (e.lane * CONFIG.laneWidth) + (CONFIG.laneWidth/2) - (CONFIG.enemyWidth/2);
        
        drawCar(enemyImg, ex, e.y, CONFIG.enemyWidth, CONFIG.enemyHeight, "red");

        // Collision Logic
        const p = 10; // Padding
        
        if (
            playerX + p < ex + CONFIG.enemyWidth - p &&       
            playerX + CONFIG.playerWidth - p > ex + p &&      
            playerY + p < e.y + CONFIG.enemyHeight - p &&     
            playerY + CONFIG.playerHeight - p > e.y + p       
        ) {
            gameOver();
        }

        if (e.y > canvas.height) { enemies.splice(i, 1); i--; }
    }

    requestAnimationFrame(gameLoop);
}

function gameOver() {
    gameState.isPlaying = false;
    gameOverTitle.innerText = "CRITICAL FAILURE";
    gameOverTitle.style.color = "#ff4b2b";
    finalScoreEl.innerText = gameState.score;
    gameOverScreen.style.display = 'flex';
    
    btnStop.classList.add('btn-disabled');
}