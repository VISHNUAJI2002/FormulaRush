/* --- CONFIGURATION & STATE --- */
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Game Settings
const CONFIG = {
    laneCount: 5,
    roadWidth: 800,
    carWidth: 60,       // Enemy car width (UNCHANGED)
    carHeight: 100,
    laneWidth: 800 / 5
};

// --- PLAYER-ONLY SIZE ---
const PLAYER_CAR_WIDTH = 90;    // 👈 Increased player width
const PLAYER_CAR_HEIGHT = 100;

// Difficulty Presets
const SPEEDS = {
    easy:   { base: 3, max: 10, acceleration: 0.001 },
    medium: { base: 6, max: 15, acceleration: 0.003 },
    hard:   { base: 9, max: 25, acceleration: 0.005 }
};

// Game State
let gameState = {
    isPlaying: false,
    score: 0,
    speed: 0,
    maxSpeed: 0,
    lane: 2,
    mathMode: 'simple',
    distance: 0
};

// --- IMAGES ---
const playerImg = new Image();
playerImg.src = "/static/car_player.png";

const enemyImg = new Image();
enemyImg.src = "/static/car_enemy.png";

// Objects
let enemies = [];
let currentQuestion = null;

/* --- HTML ELEMENTS --- */
const questionLeftEl = document.getElementById('question-left');
const questionRightEl = document.getElementById('question-right');
const gameOverScreen = document.getElementById('game-over-screen');
const finalScoreEl = document.getElementById('final-score');
const speedNeedle = document.getElementById('speed-needle');
const speedValueEl = document.getElementById('speed-value');
const startBtn = document.getElementById('start-engine-btn');
const cockpitControls = document.getElementById('cockpit-controls');

/* --- INPUT HANDLING --- */
startBtn.addEventListener('click', startGame);

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
    return 'easy';
}

/* --- MATH LOGIC --- */
function generateTwoProblems() {
    let leftObj = createMathProblem();
    let rightObj = createMathProblem();

    while (rightObj.lastDigit === leftObj.lastDigit) {
        rightObj = createMathProblem();
    }

    currentQuestion = {
        leftDigit: leftObj.lastDigit,
        rightDigit: rightObj.lastDigit
    };

    questionLeftEl.textContent = `Left: ${leftObj.text}`;
    questionRightEl.textContent = `Right: ${rightObj.text}`;
}

function createMathProblem() {
    const n1 = Math.floor(Math.random() * 9) + 1;
    const n2 = Math.floor(Math.random() * 9) + 1;

    let operators = ['+', '-'];
    if (gameState.mathMode === 'mixed') operators.push('*');
    const op = operators[Math.floor(Math.random() * operators.length)];

    let ans, text;
    if (op === '+') { ans = n1 + n2; text = `${n1}+${n2}`; }
    else if (op === '*') { ans = n1 * n2; text = `${n1}x${n2}`; }
    else {
        let big = Math.max(n1, n2);
        let small = Math.min(n1, n2);
        ans = big - small;
        text = `${big}-${small}`;
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
    } else if (inputDigit === currentQuestion.rightDigit) {
        if (gameState.lane < CONFIG.laneCount - 1) gameState.lane++;
        generateTwoProblems();
    }
}

/* --- GAME ENGINE --- */

function startGame() {
    cockpitControls.classList.add('controls-locked');
    startBtn.style.display = 'none';

    const speedSetting = getSelectedRadio('speed');
    gameState.mathMode = getSelectedRadio('math');

    const physics = SPEEDS[speedSetting];
    gameState.speed = physics.base;
    gameState.maxSpeed = physics.max;

    gameState.isPlaying = true;
    gameState.lane = 2;
    gameState.score = 0;
    gameState.distance = 0;
    enemies = [];

    generateTwoProblems();
    requestAnimationFrame(gameLoop);

    setInterval(() => {
        if (gameState.isPlaying) spawnEnemy();
    }, 2000 / (gameState.speed / 5));
}

function spawnEnemy() {
    const lane = Math.floor(Math.random() * CONFIG.laneCount);
    enemies.push({
        lane: lane,
        y: -150,
        speedOffset: (Math.random() * 2)
    });
}

function updatePhysics() {
    if (gameState.speed < gameState.maxSpeed) gameState.speed += 0.01;
    gameState.distance += gameState.speed;
    gameState.score = Math.floor(gameState.distance / 10);
}

function updateSpeedometer() {
    const maxS = 25;
    let pct = gameState.speed / maxS;
    if (pct > 1) pct = 1;
    const angle = 225 + (pct * 270);
    speedNeedle.style.transform = `rotate(${angle}deg)`;
    speedValueEl.innerText = Math.floor(gameState.speed * 10);
}

/* --- RENDERING HELPER --- */
function drawCar(img, x, y, color, w = CONFIG.carWidth, h = CONFIG.carHeight) {
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

    // Road
    ctx.fillStyle = "#222";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = "rgba(255,255,255,0.3)";
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

    // Player
    const playerX = (gameState.lane * CONFIG.laneWidth) +
                    (CONFIG.laneWidth / 2) -
                    (PLAYER_CAR_WIDTH / 2);
    const playerY = canvas.height - 150;

    drawCar(playerImg, playerX, playerY, "cyan",
            PLAYER_CAR_WIDTH, PLAYER_CAR_HEIGHT);

    // Enemies
    for (let i = 0; i < enemies.length; i++) {
        let e = enemies[i];
        e.y += gameState.speed * 0.8 + e.speedOffset;
        const ex = (e.lane * CONFIG.laneWidth) +
                   (CONFIG.laneWidth / 2) -
                   (CONFIG.carWidth / 2);

        drawCar(enemyImg, ex, e.y, "red");

        const p = 15;
        if (
            playerX + p < ex + CONFIG.carWidth - p &&
            playerX + PLAYER_CAR_WIDTH - p > ex + p &&
            playerY + p < e.y + CONFIG.carHeight - p &&
            playerY + PLAYER_CAR_HEIGHT - p > e.y + p
        ) {
            gameOver();
        }

        if (e.y > canvas.height) {
            enemies.splice(i, 1);
            i--;
        }
    }

    requestAnimationFrame(gameLoop);
}

function gameOver() {
    gameState.isPlaying = false;
    finalScoreEl.innerText = gameState.score;
    gameOverScreen.style.display = 'flex';
}
