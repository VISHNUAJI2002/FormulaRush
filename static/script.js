const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// --- ASSETS ---
const imgP1 = new Image(); imgP1.src = "/static/car1.png";
const imgP2 = new Image(); imgP2.src = "/static/car2.png";
const imgObs = new Image(); imgObs.src = "/static/obstacle.png";

// --- SETTINGS ---
const WIDTH = 800;
const HEIGHT = 600;
const ROAD_W = WIDTH / 2;
const LANE_W = (ROAD_W - 40) / 3; // 3 Lanes
const LANE_DASH_HEIGHT = 30; // Height of the white line
const LANE_GAP = 30;         // Gap between lines
const TOTAL_DASH = LANE_DASH_HEIGHT + LANE_GAP; // 60px total cycle

// --- STATE ---
let active = false;
let timeLeft = 60;
let timerInt;
let obstacles = [];

// Players: lane 0=Left, 1=Center, 2=Right
let p1 = { lane: 1, x: 0, speed: 0, dist: 0, stun: 0, laneOffset: 0 };
let p2 = { lane: 1, x: 0, speed: 0, dist: 0, stun: 0, laneOffset: 0 };

// Math Data { text: "2+2", ans: 4 }
let p1Math = { left: {}, right: {} };
let p2Math = { left: {}, right: {} };

// --- DOM ---
const elP1L = document.getElementById('p1-txt-left');
const elP1R = document.getElementById('p1-txt-right');
const elP2L = document.getElementById('p2-txt-left');
const elP2R = document.getElementById('p2-txt-right');
const uiLayer = document.getElementById('uiLayer');

// --- INPUT HANDLING ---
window.addEventListener('keydown', (e) => {
    if (!active) return;
    
    let isLinear = e.code.startsWith('Digit');
    let isNumpad = e.code.startsWith('Numpad');
    let val = parseInt(e.key);

    if (isNaN(val)) return;

    if (isLinear) {
        if (val === p1Math.left.ans) {
            movePlayer(p1, -1);
            refreshMath(p1Math, 1);
        } 
        else if (val === p1Math.right.ans) {
            movePlayer(p1, 1);
            refreshMath(p1Math, 1);
        }
    }

    if (isNumpad) {
        if (val === p2Math.left.ans) {
            movePlayer(p2, -1);
            refreshMath(p2Math, 2);
        } 
        else if (val === p2Math.right.ans) {
            movePlayer(p2, 1);
            refreshMath(p2Math, 2);
        }
    }
});

function movePlayer(p, dir) {
    // dir: -1 (left), 1 (right)

    let newLane = p.lane + dir;
    if (newLane >= 0 && newLane <= 2) {
        p.lane = newLane;
        p.speed = Math.min(p.speed + 0, 10);
    }
}

// --- MATH LOGIC ---
function genProblem() {
    while(true) {
        let a = Math.floor(Math.random() * 10);
        let b = Math.floor(Math.random() * 10);
        let plus = Math.random() > 0.5;
        let ans = plus ? a + b : a - b;

        if (ans >= 0 && ans <= 9) {
            return { text: `${a} ${plus?'+':'-'} ${b}`, ans: ans };
        }
    }
}

function refreshMath(pMath, playerNum) {
    pMath.left = genProblem();
    pMath.right = genProblem();
    
    if (playerNum === 1) {
        elP1L.innerText = pMath.left.text;
        elP1R.innerText = pMath.right.text;
    } else {
        elP2L.innerText = pMath.left.text;
        elP2R.innerText = pMath.right.text;
    }
}

// --- GAME LOOP ---
function spawnObstacle() {
    if(!active) return;
    
    let road = Math.random() > 0.5 ? 0 : 1; 
    let lane = Math.floor(Math.random() * 3);
    
    let offset = road === 0 ? 20 : ROAD_W + 20;
    let x = offset + (lane * LANE_W) + (LANE_W/2) - 25;

    obstacles.push({ x: x, y: -100, w: 50, h: 50, road: road, lane: lane });
    setTimeout(spawnObstacle, 800);
}

function update() {
    if (!active) return;

    let p1TargetX = 20 + (p1.lane * LANE_W) + (LANE_W/2) - 25;
    p1.x += (p1TargetX - p1.x) * 0.2;
    
    let p2TargetX = (ROAD_W + 20) + (p2.lane * LANE_W) + (LANE_W/2) - 25;
    p2.x += (p2TargetX - p2.x) * 0.2;

    if (p1.stun > 0) { p1.stun--; p1.speed = 2; } 
    else if (p1.speed < 4) p1.speed += 0.01;

    if (p2.stun > 0) { p2.stun--; p2.speed = 2; } 
    else if (p2.speed < 4) p2.speed += 0.01;

    p1.dist += p1.speed / 10;
    p2.dist += p2.speed / 10;

    p1.laneOffset = (p1.laneOffset + p1.speed) % TOTAL_DASH;
    p2.laneOffset = (p2.laneOffset + p2.speed) % TOTAL_DASH;

    for (let i = 0; i < obstacles.length; i++) {
        let o = obstacles[i];
        
        let roadSpeed = o.road === 0 ? p1.speed : p2.speed;
        o.y += roadSpeed; 

        if (checkCol(p1.x, 450, 50, 90, o)) {
            p1.stun = 60;
            o.hit = true;
        }
        if (checkCol(p2.x, 450, 50, 90, o)) {
            p2.stun = 60;
            o.hit = true;
        }
    }
    obstacles = obstacles.filter(o => o.y < HEIGHT && !o.hit);

    document.getElementById('p1Score').innerText = `P1: ${Math.floor(p1.dist)}m`;
    document.getElementById('p2Score').innerText = `P2: ${Math.floor(p2.dist)}m`;
}

function checkCol(px, py, pw, ph, o) {
    if (o.hit) return false;
    return (px < o.x + o.w && px + pw > o.x && py < o.y + o.h && py + ph > o.y);
}

// --- DRAW ---
function draw() {
    ctx.fillStyle = '#111'; 
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    ctx.fillStyle = '#23232e';
    ctx.fillRect(20, 0, ROAD_W - 40, HEIGHT);
    ctx.fillRect(ROAD_W + 20, 0, ROAD_W - 40, HEIGHT);

    ctx.fillStyle = 'rgba(255,255,255,0.2)';

    for(let i = -TOTAL_DASH; i < HEIGHT; i += TOTAL_DASH) {
        let y = i + p1.laneOffset; 
        ctx.fillRect(20 + LANE_W, y, 4, LANE_DASH_HEIGHT);
        ctx.fillRect(20 + LANE_W*2, y, 4, LANE_DASH_HEIGHT);
    }

    for(let i = -TOTAL_DASH; i < HEIGHT; i += TOTAL_DASH) {
        let y = i + p2.laneOffset; 
        ctx.fillRect(ROAD_W + 20 + LANE_W, y, 4, LANE_DASH_HEIGHT);
        ctx.fillRect(ROAD_W + 20 + LANE_W*2, y, 4, LANE_DASH_HEIGHT);
    }

    obstacles.forEach(o => {
        if(imgObs.complete && imgObs.naturalWidth!==0)
            ctx.drawImage(imgObs, o.x, o.y, o.w, o.h);
        else {
            ctx.fillStyle = 'red';
            ctx.fillRect(o.x, o.y, o.w, o.h);
        }
    });

    if(p1.stun <= 0 || Math.floor(Date.now()/100)%2!==0)
        ctx.drawImage(imgP1, p1.x, 450, 50, 90);

    if(p2.stun <= 0 || Math.floor(Date.now()/100)%2!==0)
        ctx.drawImage(imgP2, p2.x, 450, 50, 90);
}

// --- SYSTEM ---
function gameTimer() {
    if(!active) return;
    timeLeft--;
    document.getElementById('timerDisplay').innerText = timeLeft + "s";
    if (timeLeft <= 0) endGame();
}

function endGame() {
    active = false;
    clearInterval(timerInt);
    let txt = p1.dist > p2.dist ? "PLAYER 1 WINS!" :
              p2.dist > p1.dist ? "PLAYER 2 WINS!" : "DRAW!";
    document.getElementById('winnerText').innerText = "TIME UP!";
    document.getElementById('finalScores').innerText =
        `${txt}\nP1: ${Math.floor(p1.dist)}m  vs  P2: ${Math.floor(p2.dist)}m`;
    uiLayer.classList.remove('hidden');
}

function resetGame() {
    p1 = { lane: 1, x: 0, speed: 0, dist: 0, stun: 0, laneOffset: 0 };
    p2 = { lane: 1, x: 0, speed: 0, dist: 0, stun: 0, laneOffset: 0 };

    p1.x = 20 + (1 * LANE_W) + (LANE_W/2) - 25;
    p2.x = (ROAD_W + 20) + (1 * LANE_W) + (LANE_W/2) - 25;

    obstacles = [];
    timeLeft = 60;
    active = true;
    
    refreshMath(p1Math, 1);
    refreshMath(p2Math, 2);
    
    uiLayer.classList.add('hidden');
    document.getElementById('timerDisplay').innerText = "60s";
    
    clearInterval(timerInt);
    timerInt = setInterval(gameTimer, 1000);
    
    setTimeout(spawnObstacle, 500);
    loop();
}

function loop() {
    if(active) { update(); draw(); requestAnimationFrame(loop); }
}

document.getElementById('btnRetry').addEventListener('click', resetGame);
document.getElementById('btnExit').addEventListener('click', () => window.location.href = "/");

resetGame();
