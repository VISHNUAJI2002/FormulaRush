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
    
    rank_title = "ROOKIE"
    if total_distance > 50000: rank_title = "LEGEND"
    elif total_distance > 15000: rank_title = "PRO RACER"
    elif total_distance > 5000: rank_title = "AMATEUR"

    # 2. Pass these to the template
    return render_template('dashboard.html', 
                           name=current_user.username, 
                           score=current_user.high_score, # This is the High Score
                           rank=rank_title)               # This is the Real Rank

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
    
    # 2. Stats
    total_races = len(races)
    total_distance = sum(r.score for r in races) if races else 0
    total_seconds = sum(r.duration for r in races) if races else 0
    flight_hours = round(total_seconds / 3600, 2)
    avg_distance = int(total_distance / total_races) if total_races > 0 else 0
    
    # 3. Rank System (Updated for 0-50k Scale)
    rank_title = "ROOKIE"
    next_rank = "AMATEUR"
    
    if total_distance > 50000:
        rank_title = "LEGEND"
        next_rank = "MAX RANK"
    elif total_distance > 15000:
        rank_title = "PRO RACER"
        next_rank = "LEGEND"
    elif total_distance > 5000:
        rank_title = "AMATEUR"
        next_rank = "PRO RACER"
        
    # LOGIC FIX: Bar now fills from 0 to 50,000 (The Ultimate Goal)
    # If you have 5,000m, the bar is 10% full.
    target_goal = 50000 
    progress_percent = (total_distance / target_goal) * 100
    progress_percent = min(100, max(0, progress_percent))

    # 4. Favorite Car
    favorite_car = "None"
    if races:
        all_cars = [r.car_used for r in races]
        favorite_car = max(set(all_cars), key=all_cars.count).replace('car_', '').upper()

    # 5. Graph & Heatmap Data
    mistake_counts = {i: 0 for i in range(2, 13)}
    usage_counts = {i: 0 for i in range(2, 13)}

    for r in races:
        # Usage
        try:
            topics = json.loads(r.active_topics)
            for t in topics:
                if t.startswith("Mult:"):
                    for n in t.replace("Mult: ", "").split(","):
                        if n.isdigit(): usage_counts[int(n)] += 1
        except: pass
        # Mistakes
        try:
            mistakes = json.loads(r.mistakes)
            for prob, count in mistakes.items():
                if 'x' in prob:
                    for p in prob.split('x'):
                        if p.isdigit() and int(p) in mistake_counts:
                            mistake_counts[int(p)] += count
        except: pass

    # Prepare return data
    chart_labels = list(range(2, 13))
    chart_mistakes = [mistake_counts[i] for i in chart_labels]
    chart_usage = [usage_counts[i] for i in chart_labels]
    
    weakest_num = max(mistake_counts, key=mistake_counts.get)
    if mistake_counts[weakest_num] == 0: weakest_num = "NONE"
    
    most_used_num = max(usage_counts, key=usage_counts.get)
    if usage_counts[most_used_num] == 0: most_used_num = "NONE"

    return render_template('career.html', 
                           races=races, 
                           total_races=total_races,
                           avg_distance=avg_distance,
                           total_distance=total_distance,
                           flight_hours=flight_hours,
                           rank_title=rank_title,
                           next_rank=next_rank,
                           progress_percent=progress_percent, # Now scaled 0-50k
                           favorite_car=favorite_car,
                           chart_labels=chart_labels,
                           chart_mistakes=chart_mistakes,
                           chart_usage=chart_usage,
                           weakest_num=weakest_num,
                           most_used_num=most_used_num)
# --- GAME ROUTES ---

@app.route('/play')
@login_required
def play():
    return render_template('game.html')

@app.route('/single_player')
@login_required
def single_player():
    return render_template('single_game.html')

@app.route('/submit_score', methods=['POST'])
@login_required
def submit_score():
    data = request.get_json()
    
    # 1. EXTRACT DATA
    score = data.get('score', 0)
    mode = data.get('mode', 'single')
    duration = data.get('duration', 0)
    car = data.get('car', 'car_default')
    
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
        'total_coins': current_user.coins
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
    app.run(debug=True)