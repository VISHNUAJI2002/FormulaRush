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

const VOICE_STATS = {
    base: 0.5, max: 1.5, acceleration: 0.000025, spawnInterval: 3900 
};

let gameState = {
    isPlaying: false, score: 0, speed: 0, maxSpeed: 0,
    lane: 2, mathMode: 'simple', difficulty: 'easy', 
    controlMode: 'keyboard', distance: 0
};

const playerImg = new Image(); playerImg.src = "/static/car_player.png"; 
const enemyImg = new Image(); enemyImg.src = "/static/car_enemy.png"; 

let enemies = [];
let currentQuestion = null;
let spawnTimer = null;
let recognition = null; 
// NEW: Lock variable to prevent double-steering
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

// CONTROLS
const btnStart = document.getElementById('btn-start');
const btnStop = document.getElementById('btn-stop');

// INPUT MODES
const btnModeKey = document.getElementById('btn-mode-key');
const btnModeVoice = document.getElementById('btn-mode-voice');
const micIndicator = document.getElementById('mic-indicator');
const micText = document.getElementById('mic-text');

// SHIFTER
const shifterAssembly = document.getElementById('shifter-assembly');
const knobNumber = document.getElementById('knob-number');
const labelEasy = document.getElementById('label-easy');
const labelMedium = document.getElementById('label-medium');
const labelHard = document.getElementById('label-hard');

/* --- EVENT LISTENERS --- */
btnStart.addEventListener('click', startGame);
btnStop.addEventListener('click', abortRace);

// KEYBOARD LISTENER
document.addEventListener('keydown', (e) => {
    if (!gameState.isPlaying) return;
    if (gameState.controlMode === 'keyboard') {
        if (e.key >= '0' && e.key <= '9') {
            checkAnswer(parseInt(e.key));
        }
    }
});

/* --- VOICE LOGIC --- */
const wordMap = { 'zero':0, 'one':1, 'two':2, 'three':3, 'four':4, 'five':5, 'six':6, 'seven':7, 'eight':8, 'nine':9, 'for':4, 'to':2, 'too':2, 'ate':8 };

function initSpeech() {
    const SpeechChoice = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechChoice) { alert("Voice not supported. Use Chrome."); return; }
    
    recognition = new SpeechChoice();
    recognition.continuous = true;
    
    // CHANGED: Set to TRUE to get results immediately while speaking
    recognition.interimResults = true; 
    
    recognition.lang = 'en-US';

    recognition.onresult = (event) => {
        // CHANGED: If we just moved the car, ignore inputs for 1.2 seconds
        if (isProcessingSpeech) return;

        const last = event.results.length - 1;
        const transcript = event.results[last][0].transcript.trim().toLowerCase();
        micText.innerText = `HEARD: "${transcript}"`;
        
        let num = null;
        if (!isNaN(parseInt(transcript))) num = parseInt(transcript);
        else if (wordMap[transcript] !== undefined) num = wordMap[transcript];
        else {
            let match = transcript.match(/\d+/);
            if (match) num = parseInt(match[0]);
        }

        if (num !== null) {
            let lastDigit = parseInt(String(num).slice(-1));
            
            // CHANGED: Move car, then LOCK input briefly
            checkAnswer(lastDigit);
            
            isProcessingSpeech = true; // Lock
            micText.innerText = "PROCESSING..."; // Visual feedback
            
            // Unlock after 1.2 seconds (prevents double moves from same word)
            setTimeout(() => { 
                isProcessingSpeech = false;
                if(gameState.isPlaying) micText.innerText = "LISTENING..."; 
            }, 1200);
        }
    };

    recognition.onend = () => {
        if (gameState.isPlaying && gameState.controlMode === 'voice') {
            try { recognition.start(); } catch(e){}
        } else {
            micIndicator.classList.remove('listening');
            micText.innerText = "STANDBY";
        }
    };
}

window.setControlMode = function(mode) {
    gameState.controlMode = mode;
    
    // UI Update
    if (mode === 'keyboard') {
        btnModeKey.classList.add('active-mode'); btnModeVoice.classList.remove('active-mode');
        micIndicator.classList.remove('visible');
        if (recognition) recognition.stop();
    } else {
        btnModeVoice.classList.add('active-mode'); btnModeKey.classList.remove('active-mode');
        micIndicator.classList.add('visible');
        if (!recognition) initSpeech();
        if (gameState.isPlaying) {
            try { recognition.start(); } catch(e){}
            micIndicator.classList.add('listening'); micText.innerText = "LISTENING...";
        }
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

    [labelEasy, labelMedium, labelHard].forEach(label => {
        label.classList.remove('active-label'); label.style.color = ""; label.style.textShadow = "";
    });

    if (level === 'hard') {
        shifterAssembly.style.top = "30px";
        knobNumber.innerText = "3"; knobNumber.style.color = "#dc3545"; knobNumber.style.textShadow = "0 0 15px #dc3545";
        labelHard.classList.add('active-label'); labelHard.style.color = "#dc3545";
    } else if (level === 'medium') {
        shifterAssembly.style.top = "95px";
        knobNumber.innerText = "2"; knobNumber.style.color = "#ffc107"; knobNumber.style.textShadow = "0 0 15px #ffc107";
        labelMedium.classList.add('active-label'); labelMedium.style.color = "#ffc107";
    } else { 
        shifterAssembly.style.top = "165px"; 
        knobNumber.innerText = "1"; knobNumber.style.color = "#00d2ff"; knobNumber.style.textShadow = "0 0 15px #00d2ff";
        labelEasy.classList.add('active-label'); labelEasy.style.color = "#00d2ff";
    }
}

function applyCurrentPhysics() {
    if (gameState.controlMode === 'voice') {
        gameState.maxSpeed = VOICE_STATS.max;
    } else {
        gameState.maxSpeed = SPEEDS[gameState.difficulty].max;
    }
}

/* --- MATH GENERATION --- */
function generateTwoProblems() {
    let leftObj = createMathProblem();
    let rightObj = createMathProblem();
    while (rightObj.lastDigit === leftObj.lastDigit) { rightObj = createMathProblem(); }
    currentQuestion = { leftDigit: leftObj.lastDigit, rightDigit: rightObj.lastDigit };
    questionLeftEl.textContent = `L: ${leftObj.text}`; questionRightEl.textContent = `R: ${rightObj.text}`; 
}

function createMathProblem() {
    let n1, n2, op, ans, text, isValid = false, safety = 0;
    while (!isValid && safety < 100) {
        safety++;
        let operators = ['+', '-'];
        if (gameState.mathMode === 'mixed') operators.push('*', '/');
        op = operators[Math.floor(Math.random() * operators.length)];
        n1 = Math.floor(Math.random() * 12) + 1; n2 = Math.floor(Math.random() * 12) + 1;

        if (op === '+') { ans = n1 + n2; text = `${n1}+${n2}`; }
        else if (op === '-') { let big = Math.max(n1, n2); let small = Math.min(n1, n2); ans = big - small; text = `${big}-${small}`; }
        else if (op === '*') { ans = n1 * n2; text = `${n1}x${n2}`; }
        else if (op === '/') { let div = Math.floor(Math.random() * 9) + 2; let quo = Math.floor(Math.random() * 10) + 1; ans = quo; text = `${div*quo}/${div}`; }

        isValid = false; 
        if (gameState.difficulty === 'easy' && ans < 10 && ans >= 0) isValid = true;
        else if (gameState.difficulty === 'medium' && ans >= 0 && ans < 100) isValid = true;
        else if (gameState.difficulty === 'hard' && (ans >= 10 || op === '*' || op === '/')) isValid = true;
    }
    return { text: text, lastDigit: parseInt(String(ans).slice(-1)) };
}

function checkAnswer(inputDigit) {
    if (inputDigit === currentQuestion.leftDigit) { if (gameState.lane > 0) gameState.lane--; generateTwoProblems(); } 
    else if (inputDigit === currentQuestion.rightDigit) { if (gameState.lane < CONFIG.laneCount - 1) gameState.lane++; generateTwoProblems(); }
}

/* --- GAME ENGINE --- */
function startGame() {
    if (gameState.isPlaying) return;
    btnStart.classList.add('btn-disabled'); btnStop.classList.remove('btn-disabled');
    gameState.mathMode = getSelectedRadio('math');
    
    applyCurrentPhysics();
    gameState.speed = 0.5; 
    
    gameState.isPlaying = true; gameState.lane = 2; gameState.score = 0; gameState.distance = 0; enemies = [];

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
    enemies.push({ lane: lane, y: -150, speedOffset: (Math.random() * 0.5) });
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
        e.y += gameState.speed * trafficMultiplier + e.speedOffset;
        const ex = (e.lane * CONFIG.laneWidth) + (CONFIG.laneWidth/2) - (CONFIG.enemyWidth/2);
        drawCar(enemyImg, ex, e.y, CONFIG.enemyWidth, CONFIG.enemyHeight, "red");
        const p = 10; 
        if (playerX + p < ex + CONFIG.enemyWidth - p && playerX + CONFIG.playerWidth - p > ex + p && playerY + p < e.y + CONFIG.enemyHeight - p && playerY + CONFIG.playerHeight - p > e.y + p) { gameOver(); }
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