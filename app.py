from flask import Flask, render_template, redirect, url_for, request, flash, jsonify
from flask_sqlalchemy import SQLAlchemy
from flask_login import UserMixin, login_user, LoginManager, login_required, logout_user, current_user
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime # NEW: To track when a game was played
import json # NEW: To store mistakes as text
import pickle
import pandas as pd

# --- LOAD AI BRAIN ---
try:
    with open('pilot_model.pkl', 'rb') as f:
        ai_model = pickle.load(f)
    with open('le_diff.pkl', 'rb') as f:
        le_diff = pickle.load(f)
    print("AI BRAIN: LOADED SUCCESSFULLY")
except FileNotFoundError:
    ai_model = None
    le_diff = None
    print("AI BRAIN: NOT FOUND - AUTO-PILOT DISABLED")

app = Flask(__name__)
app.config['SECRET_KEY'] = 'formularush_secure_key_2026'
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///database.db'

db = SQLAlchemy(app)

LEVEL_CONFIG = {
    1: {
        "id": 1, 
        "name": "ADDITION ACADEMY", 
        "desc": "Master the basics. Addition only.",
        "ops": ["addition"],
        "target_score": 500,
        "reward": 200,
        "difficulty": "easy"
    },
    2: {
        "id": 2, 
        "name": "SUBTRACTION ZONE", 
        "desc": "Survival required. Subtraction enabled.",
        "ops": ["subtraction"],
        "target_score": 600,
        "reward": 250,
        "difficulty": "easy"
    },
    3: {
        "id": 3, 
        "name": "TABLES 1 & 2", 
        "desc": "Multiplication basics. Tables of 1 and 2.",
        "ops": ["mult_1_2"],
        "target_score": 700,
        "reward": 300,
        "difficulty": "easy"
    },
    4: {
        "id": 4, 
        "name": "TABLES 3 & 4", 
        "desc": "Building momentum. Tables of 3 and 4.",
        "ops": ["mult_3_4"],
        "target_score": 800,
        "reward": 350,
        "difficulty": "medium"
    },
    5: {
        "id": 5, 
        "name": "TABLES 5 & 6", 
        "desc": "Mid-range challenge. Tables of 5 and 6.",
        "ops": ["mult_5_6"],
        "target_score": 900,
        "reward": 400,
        "difficulty": "medium"
    },
    6: {
        "id": 6, 
        "name": "TABLES 7 & 8", 
        "desc": "Getting harder. Tables of 7 and 8.",
        "ops": ["mult_7_8"],
        "target_score": 1000,
        "reward": 450,
        "difficulty": "medium"
    },
    7: {
        "id": 7, 
        "name": "TABLES 9 & 10", 
        "desc": "Advanced multiplication. Tables of 9 and 10.",
        "ops": ["mult_9_10"],
        "target_score": 1100,
        "reward": 500,
        "difficulty": "hard"
    },
    8: {
        "id": 8, 
        "name": "DIVISION DISTRICT", 
        "desc": "Reverse the process. Division only.",
        "ops": ["division"],
        "target_score": 1200,
        "reward": 600,
        "difficulty": "hard"
    },
    9: {
        "id": 9, 
        "name": "THE GAUNTLET", 
        "desc": "Master all operations. Final challenge!",
        "ops": ["all_ops"],
        "target_score": 1500,
        "reward": 1000,
        "difficulty": "hard"
    }
}

# --- DATABASE MODELS ---

class User(db.Model, UserMixin):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(150), nullable=False, unique=True)
    password = db.Column(db.String(150), nullable=False)
    high_score = db.Column(db.Integer, default=0)
    # NEW: Wallet & Inventory
    coins = db.Column(db.Integer, default=1000) # Start with 1000 credits
    inventory = db.Column(db.String(500), default='["car_default"]') # Tracks owned cars
    # Relationship to access all races
    races = db.relationship('RaceSession', backref='player', lazy=True)
    max_level_unlocked = db.Column(db.Integer, default=1)
    claimed_rewards = db.Column(db.Text, default='[]')  # JSON list of claimed reward IDs

# NEW: The Table for Pilot Career Data
# THE UPGRADED TABLE
class RaceSession(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    date_played = db.Column(db.DateTime, default=datetime.utcnow)
    
    # --- PERFORMANCE METRICS ---
    score = db.Column(db.Integer)        # Distance (meters)
    duration = db.Column(db.Integer)     # Time survived (seconds)
    
    # --- CONFIGURATION (CONTEXT) ---
    mode = db.Column(db.String(20))      # 'single' or 'multi'
    car_used = db.Column(db.String(50))  # 'car_gold', 'car_default'
    difficulty = db.Column(db.String(20)) # 'easy', 'medium', 'hard' (The Gear)
    control_method = db.Column(db.String(20)) # 'keyboard', 'voice', 'gesture'
    
    # --- MATH SETTINGS ---
    # Stores what was enabled: e.g. "['2x', '3x', 'squares', 'shapes']"
    active_topics = db.Column(db.Text, default="[]") 
    
    # --- TELEMETRY ---
    # Stores specific errors: '{"7x8": 2, "square_root_16": 1}'
    mistakes = db.Column(db.Text, default="{}") 
    
    # Stores input telemetry: '{"avg_reaction": 1.4, "panic_brakes": 3}'
    input_stats = db.Column(db.Text, default="{}")

class TelemetryData(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'))
    
    # AI INPUTS (The "Features")
    speed = db.Column(db.Float)           # Car speed at that moment
    difficulty = db.Column(db.String(20)) # Easy, Medium, Hard
    reaction_time = db.Column(db.Float)   # How long it took to answer
    is_correct = db.Column(db.Boolean)    # Did they get it right?
    
    # THE LABEL (The "Answer Key" for the AI)
    # This helps the AI understand if the result was "Good" or "Bad"
    confidence_label = db.Column(db.String(20)) 
    
    timestamp = db.Column(db.DateTime, default=db.func.current_timestamp())

    def __repr__(self):
        return f'<Telemetry {self.user_id}: RT={self.reaction_time} Correct={self.is_correct}>'

# --- LOGIN MANAGER SETUP ---
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login'

@login_manager.user_loader
def load_user(user_id):
    return db.session.get(User, int(user_id)) # Modern way 

# --- WEBSITE ROUTES ---

@app.route('/')
def home():
    return render_template('home.html')

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')
        user = User.query.filter_by(username=username).first()
        
        if user and check_password_hash(user.password, password):
            login_user(user)
            return redirect(url_for('dashboard'))
        else:
            flash('Login Failed. Check username and password.')
            
    return render_template('login.html')

@app.route('/register', methods=['GET', 'POST'])
def register():
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')
        
        user_exists = User.query.filter_by(username=username).first()
        if user_exists:
            flash('Username already exists.')
        else:
            hashed_pw = generate_password_hash(password, method='pbkdf2:sha256')
            new_user = User(username=username, password=hashed_pw)
            db.session.add(new_user)
            db.session.commit()
            return redirect(url_for('login'))
            
    return render_template('register.html')

# --- UPDATED DASHBOARD ROUTE ---
@app.route('/dashboard')
@login_required
def dashboard():
    # 1. Calculate Rank Logic (Same as Career)
    races = RaceSession.query.filter_by(user_id=current_user.id).all()
    total_distance = sum(r.score for r in races) if races else 0
    total_races = len(races)
    
    rank_title = "ROOKIE"
    if total_distance > 50000: rank_title = "LEGEND"
    elif total_distance > 15000: rank_title = "PRO RACER"
    elif total_distance > 5000: rank_title = "AMATEUR"

    # 2. Check for unclaimed mission rewards
    try:
        claimed = json.loads(current_user.claimed_rewards or '[]')
    except:
        claimed = []

    has_unclaimed = False

    # Daily Grind: 5+ races today
    from datetime import datetime
    today = datetime.utcnow().date()
    today_races = len([r for r in races if r.date_played.date() == today])
    daily_id = f'daily_grind_{today.isoformat()}'
    if today_races >= 5 and daily_id not in claimed:
        has_unclaimed = True

    # Precision Pilot: accuracy >= target
    if not has_unclaimed and total_races >= 5:
        total_telemetry = TelemetryData.query.filter_by(user_id=current_user.id).count()
        correct_telemetry = TelemetryData.query.filter_by(user_id=current_user.id, is_correct=True).count()
        accuracy_rate = int((correct_telemetry / total_telemetry) * 100) if total_telemetry > 0 else 0
        acc_target = 50 if accuracy_rate < 50 else (70 if accuracy_rate < 70 else (80 if accuracy_rate < 80 else 90))
        precision_id = f'precision_{acc_target}'
        if accuracy_rate >= acc_target and precision_id not in claimed:
            has_unclaimed = True

    # Promotion: rank achieved
    if not has_unclaimed:
        rank_goal = 'AMATEUR' if rank_title == 'ROOKIE' else ('PRO' if rank_title == 'AMATEUR' else ('LEGEND' if rank_title == 'PRO' else 'MAXED'))
        promo_id = f'promo_{rank_goal}'
        if rank_goal == 'MAXED' and promo_id not in claimed:
            has_unclaimed = True

    # Campaign level rewards: completed but unclaimed
    if not has_unclaimed:
        for level_id in LEVEL_CONFIG:
            if level_id < current_user.max_level_unlocked:
                camp_id = f'campaign_{level_id}'
                if camp_id not in claimed:
                    has_unclaimed = True
                    break

    # 3. Pass these to the template
    return render_template('dashboard.html', 
                           name=current_user.username, 
                           score=current_user.high_score,
                           rank=rank_title,
                           coins=current_user.coins,
                           max_level=current_user.max_level_unlocked,
                           inventory=current_user.inventory,
                           has_unclaimed_rewards=has_unclaimed)

# --- NEW ACADEMY ROUTE ---
@app.route('/academy')
@login_required
def academy():
    # We can pass an optional parameter to open a specific tab (e.g., if coming from weakness)
    focus_area = request.args.get('focus', 'tables') 
    return render_template('academy.html', focus=focus_area)

@app.route('/logout')
@login_required
def logout():
    logout_user()
    return redirect(url_for('home'))
# --- CAREER ROUTE ---
@app.route('/career')
@login_required
def career():
    # 1. Fetch Data
    races = RaceSession.query.filter_by(user_id=current_user.id).order_by(RaceSession.date_played.desc()).all()
    
    # 2. Basic Stats
    total_races = len(races)
    total_distance = sum(r.score for r in races) if races else 0
    total_seconds = sum(r.duration for r in races) if races else 0
    avg_distance = int(total_distance / total_races) if total_races > 0 else 0
    
    # 3. Rank System (0-50k Scale)
    rank_title = "ROOKIE"
    next_rank = "AMATEUR"
    if total_distance >= 50000:
        rank_title = "LEGEND"
        next_rank = "MAX RANK"
    elif total_distance >= 15000:
        rank_title = "PRO RACER"
        next_rank = "LEGEND"
    elif total_distance >= 5000:
        rank_title = "AMATEUR"
        next_rank = "PRO RACER"
        
    target_goal = 50000 
    progress_percent = min(100, (total_distance / target_goal) * 100) if target_goal > 0 else 0

    # 4. Favorite Car (Formatted Name)
    favorite_car = "None"
    if races:
        all_cars = [r.car_used for r in races if r.car_used]
        if all_cars:
            favorite_car = max(set(all_cars), key=all_cars.count).replace('car_', '').replace('_', ' ').upper()

    # 5. Graph & Heatmap Data (Mistakes and Usage)
    mistake_counts = {i: 0 for i in range(2, 13)}
    usage_counts = {i: 0 for i in range(2, 13)}

    for r in races:
        # Process Usage
        try:
            topics = json.loads(r.active_topics) if r.active_topics else []
            for t in topics:
                if t.startswith("Mult:"):
                    nums = t.replace("Mult:", "").strip().split(",")
                    for n in nums:
                        val = int(n.strip())
                        if val in usage_counts: usage_counts[val] += 1
        except: pass

        # Process Mistakes
        try:
            mistakes = json.loads(r.mistakes) if r.mistakes else {}
            for prob, count in mistakes.items():
                if 'x' in prob:
                    parts = prob.split('x')
                    for p in parts:
                        p_val = int(''.join(filter(str.isdigit, p)))
                        if p_val in mistake_counts: mistake_counts[p_val] += count
        except: pass

    chart_labels = list(range(2, 13))
    chart_mistakes = [mistake_counts[i] for i in chart_labels]
    chart_usage = [usage_counts[i] for i in chart_labels]
    
    # Determine Weakest/Strongest
    weakest_num = max(mistake_counts, key=mistake_counts.get) if any(mistake_counts.values()) else "NONE"
    most_used_num = max(usage_counts, key=usage_counts.get) if any(usage_counts.values()) else "NONE"

    # 6. Accuracy Calculation
    total_telemetry = TelemetryData.query.filter_by(user_id=current_user.id).count()
    correct_telemetry = TelemetryData.query.filter_by(user_id=current_user.id, is_correct=True).count()
    accuracy_rate = int((correct_telemetry / total_telemetry) * 100) if total_telemetry > 0 else 0
    neural_load = 0
    if total_seconds > 0:
        total_minutes = total_seconds / 60
        # Round to 1 decimal place (e.g., "12.5" QPM)
        neural_load = round(total_telemetry / total_minutes, 1)
    # 7. Today's Flight Time Logic
    from datetime import datetime
    today = datetime.utcnow().date()
    today_races = [r for r in races if r.date_played.date() == today]
    today_seconds = sum(r.duration for r in today_races)

    if today_seconds == 0:
        today_flight_time = "0s"
    elif today_seconds < 60:
        today_flight_time = f"{today_seconds}s"
    elif today_seconds < 3600:
        today_flight_time = f"{today_seconds // 60}m {today_seconds % 60}s"
    else:
        today_flight_time = f"{today_seconds // 3600}h {(today_seconds % 3600) // 60}m"

    # 8. Return data (Ensure today_flight_time is passed!)
    return render_template('career.html', 
                            races=races, 
                            total_races=total_races,
                            avg_distance=avg_distance,
                            total_distance=total_distance,
                            rank_title=rank_title,
                            next_rank=next_rank,
                            progress_percent=progress_percent,
                            favorite_car=favorite_car,
                            chart_labels=chart_labels,
                            chart_mistakes=chart_mistakes,
                            chart_usage=chart_usage,
                            weakest_num=weakest_num,
                            most_used_num=most_used_num,
                            accuracy_rate=accuracy_rate,
                            neural_load=neural_load,
                            today_flight_time=today_flight_time)

# --- MISSIONS ROUTE ---
@app.route('/missions')
@login_required
def missions():
    races = RaceSession.query.filter_by(user_id=current_user.id).order_by(RaceSession.date_played.desc()).all()
    total_races = len(races)
    total_distance = sum(r.score for r in races) if races else 0

    # Today's race count
    from datetime import datetime
    today = datetime.utcnow().date()
    today_races = len([r for r in races if r.date_played.date() == today])

    # Rank
    rank_title = "ROOKIE"
    if total_distance >= 50000: rank_title = "LEGEND"
    elif total_distance >= 15000: rank_title = "PRO RACER"
    elif total_distance >= 5000: rank_title = "AMATEUR"

    # Accuracy
    total_telemetry = TelemetryData.query.filter_by(user_id=current_user.id).count()
    correct_telemetry = TelemetryData.query.filter_by(user_id=current_user.id, is_correct=True).count()
    accuracy_rate = int((correct_telemetry / total_telemetry) * 100) if total_telemetry > 0 else 0

    # Parse claimed rewards
    try:
        claimed = json.loads(current_user.claimed_rewards or '[]')
    except:
        claimed = []

    return render_template('missions.html',
                           total_races=total_races,
                           today_races=today_races,
                           accuracy_rate=accuracy_rate,
                           rank_title=rank_title,
                           levels=LEVEL_CONFIG,
                           max_level_unlocked=current_user.max_level_unlocked,
                           claimed_rewards=claimed,
                           now_date=today.isoformat())

# --- CLAIM REWARD ROUTE ---
@app.route('/claim_reward', methods=['POST'])
@login_required
def claim_reward():
    data = request.get_json()
    reward_id = data.get('reward_id', '')

    # Parse existing claims
    try:
        claimed = json.loads(current_user.claimed_rewards or '[]')
    except:
        claimed = []

    # Prevent double-claiming
    if reward_id in claimed:
        return jsonify({'success': False, 'message': 'Already claimed'}), 400

    # --- VALIDATE & DETERMINE REWARD ---
    coins_to_add = 0
    races = RaceSession.query.filter_by(user_id=current_user.id).all()
    total_races = len(races)
    total_distance = sum(r.score for r in races) if races else 0

    if reward_id.startswith('daily_grind_'):
        # Validate: 5+ races today
        from datetime import datetime
        today_str = datetime.utcnow().date().isoformat()
        if reward_id != f'daily_grind_{today_str}':
            return jsonify({'success': False, 'message': 'Invalid daily reward'}), 400
        today_races = len([r for r in races if r.date_played.date().isoformat() == today_str])
        if today_races < 5:
            return jsonify({'success': False, 'message': 'Mission not completed'}), 400
        coins_to_add = 50

    elif reward_id.startswith('precision_'):
        # Validate: accuracy >= target
        target = int(reward_id.split('_')[1])
        total_telemetry = TelemetryData.query.filter_by(user_id=current_user.id).count()
        correct_telemetry = TelemetryData.query.filter_by(user_id=current_user.id, is_correct=True).count()
        accuracy_rate = int((correct_telemetry / total_telemetry) * 100) if total_telemetry > 0 else 0
        if accuracy_rate < target or total_races < 5:
            return jsonify({'success': False, 'message': 'Mission not completed'}), 400
        coins_to_add = 100

    elif reward_id.startswith('promo_'):
        # Validate: rank matches
        rank_title = "ROOKIE"
        if total_distance >= 50000: rank_title = "LEGEND"
        elif total_distance >= 15000: rank_title = "PRO RACER"
        elif total_distance >= 5000: rank_title = "AMATEUR"
        # promo_MAXED means they reached LEGEND (final rank)
        target_rank = reward_id.replace('promo_', '')
        if target_rank == 'MAXED' and rank_title != 'LEGEND':
            return jsonify({'success': False, 'message': 'Mission not completed'}), 400
        coins_to_add = 200

    elif reward_id.startswith('campaign_'):
        # Validate: level completed (id < max_level_unlocked)
        level_id = int(reward_id.split('_')[1])
        if level_id >= current_user.max_level_unlocked:
            return jsonify({'success': False, 'message': 'Level not completed'}), 400
        if level_id not in LEVEL_CONFIG:
            return jsonify({'success': False, 'message': 'Invalid level'}), 400
        coins_to_add = LEVEL_CONFIG[level_id]['reward']

    else:
        return jsonify({'success': False, 'message': 'Unknown reward'}), 400

    # Award coins
    current_user.coins += coins_to_add
    claimed.append(reward_id)
    current_user.claimed_rewards = json.dumps(claimed)
    db.session.commit()

    return jsonify({
        'success': True,
        'coins_added': coins_to_add,
        'total_coins': current_user.coins
    })

# --- GAME ROUTES ---

# --- CAMPAIGN HUB (Map) ---
@app.route('/campaign')
@login_required
def campaign_hub():
    return render_template('campaign_hub.html', 
                           max_level=current_user.max_level_unlocked,
                           levels=LEVEL_CONFIG)                           


@app.route('/play/level/<int:level_id>')
@login_required
def play_level(level_id):
    # Security: Prevent skipping levels
    if level_id > current_user.max_level_unlocked:
        flash("Level Locked! Complete previous missions first.")
        return redirect(url_for('campaign_hub'))
    
    # Load specific rules
    config = LEVEL_CONFIG.get(level_id)
    config['mode'] = 'campaign' # Tag it as campaign
    
    return render_template('single_game.html', level_config=config)

@app.route('/play/practice')
@login_required
def play_practice():
    # "Practice Config" enables the sandbox UI
    config = {
        "mode": "practice",
        "name": "FREE FLIGHT",
        "ops": [] # Empty list = Allow user to toggle everything
    }
    return render_template('single_game.html', level_config=config)    

@app.route('/play')
@login_required
def play():
    return render_template('game.html')

@app.route('/submit_score', methods=['POST'])
@login_required
def submit_score():
    data = request.get_json()
    
    # 1. EXTRACT DATA
    score = data.get('score', 0)
    mode = data.get('mode', 'single')
    duration = data.get('duration', 0)
    car = data.get('car', 'car_default')
    level_id = data.get('levelId')  # NEW: For campaign mode
    
    # Context Data
    difficulty_gear = data.get('difficulty', 'medium') 
    control_type = data.get('controlMethod', 'keyboard')
    topics_list = json.dumps(data.get('activeTopics', [])) 
    mistakes_dict = json.dumps(data.get('mistakes', {}))
    telemetry_dict = json.dumps(data.get('inputStats', {}))

    # --- 2. ECONOMY CALCULATION ---
    correct_count = int(data.get('correctCount', 0))
    wrong_count = int(data.get('wrongCount', 0))
    loadout_cost = int(data.get('loadoutCost', 0))

    # Calculate net earnings from this specific run
    earnings = (correct_count * 10) - (wrong_count * 2)
    
    # Total change to the wallet (Earnings - Shop Costs)
    final_profit = earnings - loadout_cost
    
    # Update the user's coins ONCE
    current_user.coins += final_profit
    
    # DEBT PREVENTER: Ensure coins never drop below 0
    if current_user.coins < 0:
        current_user.coins = 0
    
    # ------------------------------
    
    # 3. CREATE RACE RECORD
    new_race = RaceSession(
        user_id=current_user.id,
        mode=mode,
        score=score,
        duration=duration,
        car_used=car,
        difficulty=difficulty_gear,
        control_method=control_type,
        active_topics=topics_list,
        mistakes=mistakes_dict,
        input_stats=telemetry_dict
    )
    db.session.add(new_race)

    # 4. UPDATE HIGH SCORE
    if mode == 'single':
        if score > current_user.high_score:
            current_user.high_score = score

    # --- 5. CAMPAIGN LEVEL UNLOCK LOGIC ---
    level_unlocked = False
    next_level = None
    
    if mode == 'campaign' and level_id is not None:
        # Player must reach 1000m to unlock the next level
        if score >= 200:
            next_level = level_id + 1
            # Only unlock if it's actually a new level for the player
            if next_level > current_user.max_level_unlocked:
                current_user.max_level_unlocked = next_level
                level_unlocked = True
                print(f"CAMPAIGN: Player unlocked Level {next_level}!")

    # Inside submit_score after extracting other data
    telemetry_list = data.get('telemetry', [])

    for entry in telemetry_list:
        # Determine the "Confidence Label" automatically
        # Logic: Correct + Quick (< 1.5s) = Confident
        label = "unstable"
        if entry['correct']:
            if entry['rt'] < 1.5:
                label = "confident"
            else:
                label = "stable"
        
        new_entry = TelemetryData(
            user_id=current_user.id,
            speed=entry['speed'],
            difficulty=entry['difficulty'],
            reaction_time=entry['rt'],
            is_correct=entry['correct'],
            confidence_label=label
        )
        db.session.add(new_entry)            
            
    # Final Commit to Database
    db.session.commit()
    
    return jsonify({
        'status': 'ok',
        'high_score': current_user.high_score,
        'coins_earned': earnings,
        'items_cost': loadout_cost,
        'total_coins': current_user.coins,
        'level_unlocked': level_unlocked,
        'next_level': next_level
    }), 200

# --- CAR PURCHASE ROUTE ---
@app.route('/buy_car', methods=['POST'])
@login_required
def buy_car():
    data = request.get_json()
    car_id = data.get('carId')
    
    # Define car unlock requirements
    CAR_UNLOCK_REQUIREMENTS = {
        'car_default': {'unlock_level': 1, 'price': 0},
        'car_bronze': {'unlock_level': 2, 'price': 300},
        'car_silver': {'unlock_level': 4, 'price': 400},
        'car_gold': {'unlock_level': 6, 'price': 500}
    }
    
    # Validate car exists
    if car_id not in CAR_UNLOCK_REQUIREMENTS:
        return jsonify({'status': 'error', 'message': 'Invalid car ID'}), 400
    
    car_req = CAR_UNLOCK_REQUIREMENTS[car_id]
    
    # Check if player has unlocked this car (campaign progress)
    if current_user.max_level_unlocked < car_req['unlock_level']:
        return jsonify({
            'status': 'error', 
            'message': f'Complete level {car_req["unlock_level"] - 1} first!'
        }), 403
    
    # Check if already owned
    try:
        inventory = json.loads(current_user.inventory)
    except:
        inventory = ['car_default']
    
    if car_id in inventory:
        return jsonify({'status': 'error', 'message': 'Car already owned'}), 400
    
    # Check if player has enough coins
    if current_user.coins < car_req['price']:
        return jsonify({
            'status': 'error', 
            'message': f'Insufficient coins. Need {car_req["price"]}, have {current_user.coins}'
        }), 400
    
    # Process purchase
    current_user.coins -= car_req['price']
    inventory.append(car_id)
    current_user.inventory = json.dumps(inventory)
    
    db.session.commit()
    
    return jsonify({
        'status': 'success',
        'message': f'Car purchased for {car_req["price"]} coins!',
        'coins': current_user.coins,
        'inventory': inventory
    }), 200

# --- Place this AFTER your submit_score function ---

@app.route('/ai_predict', methods=['POST'])
@login_required
def ai_predict():
    # 1. Check if we have enough data (Requirement: 50 records)
    data_count = TelemetryData.query.filter_by(user_id=current_user.id).count()
    MIN_REQUIRED = 50 
    
    if data_count < MIN_REQUIRED:
        return jsonify({
            'status': 'insufficient_data',
            'current': data_count,
            'needed': MIN_REQUIRED - data_count
        })

    if ai_model is None:
        return jsonify({'error': 'AI Model not initialized on server'}), 500

    # 2. Proceed with Prediction
    data = request.get_json()
    try:
        features = pd.DataFrame([{
            'speed': data.get('speed'),
            'difficulty': le_diff.transform([data.get('difficulty')])[0],
            'reaction_time': data.get('rt'),
            'is_correct': data.get('correct')
        }])
        
        prediction = ai_model.predict(features)[0]
        return jsonify({
            'status': 'success',
            'prediction': prediction
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 400

# --- CREATE DATABASE ---
if __name__ == '__main__':
    with app.app_context():
        db.create_all()
        # Migrate: add claimed_rewards column if missing
        import sqlite3
        try:
            conn = sqlite3.connect('instance/database.db')
            cursor = conn.cursor()
            cursor.execute("ALTER TABLE user ADD COLUMN claimed_rewards TEXT DEFAULT '[]'")
            conn.commit()
            conn.close()
            print("MIGRATION: Added claimed_rewards column")
        except:
            pass  # Column already exists
    app.run(debug=True)