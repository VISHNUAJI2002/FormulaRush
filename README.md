# 🏎️ FormulaRush
### AI-Powered Math Racing Game with Multi-Modal Controls

FormulaRush is an interactive educational racing game that combines high-speed gameplay with mental mathematics challenges. The system integrates gamification, artificial intelligence, and multi-modal input methods to transform traditional math practice into an engaging learning experience.

Players navigate a racing track by solving math problems in real time. Correct answers steer the vehicle across lanes to avoid traffic and obstacles while adaptive AI dynamically adjusts difficulty based on player performance.

---

## 🎮 Key Features

### 🧠 Gamified Math Learning
- Real-time math problem solving integrated with racing gameplay
- Progressive campaign mode with structured learning levels
- Academy section for practicing mathematical concepts

### 🎤 Multi-Modal Input System
FormulaRush supports multiple interaction methods:

- ⌨️ Keyboard input
- 🎤 Voice control using **Web Speech API**
- ✋ Gesture control using **MediaPipe Hands**

All input methods are processed through a unified validation system.

---

### 🤖 AI-Based Difficulty Adjustment
FormulaRush includes a **Neural Auto-Pilot system** that dynamically adapts gameplay difficulty.

The AI model analyzes:

- Player reaction time
- Answer accuracy
- Current difficulty level
- Gameplay speed

A **Random Forest classifier** predicts player confidence and adjusts difficulty levels automatically.

---

### 🏆 Campaign Progression
- Structured campaign map with progressive learning stages
- Operation-specific levels:
  - Addition
  - Subtraction
  - Multiplication tables
  - Division
  - Mixed operations
- Unlockable levels and achievements

---

### 💰 Coin Economy System
Players earn coins based on performance:

- **+10 coins** for correct answers  
- **−2 coins** for incorrect answers  

Coins can be used to:

- Purchase vehicles in the Garage
- Unlock gaming equipments (Hull shield, Nitro boost, Co-pilot assistance)

---

### 📊 Career Analytics
The **Career Dashboard** tracks player performance using statistics such as:

- Accuracy percentage
- Questions per minute (QPM)
- Average race distance
- Weakest and strongest multiplication tables
- Gameplay history logs

---

### 🏁 Multiplayer Mode
FormulaRush features a **Dual Cockpit multiplayer mode**.

Players compete by solving math problems faster while using:

- EMP fireball attacks
- Shield defense
- Streak-based power mechanics

---

## 🏗️ System Architecture

FormulaRush follows a modular web application architecture.

```
User
 │
 ▼
Frontend UI (HTML/CSS/JS + Canvas Engine)
 │
 ▼
Multi-Modal Input Layer
 ├─ Keyboard
 ├─ Voice (Web Speech API)
 └─ Gesture (MediaPipe Hands)
 │
 ▼
Math Validation Engine
 │
 ▼
Game Engine
 │
 ▼
Backend (Flask)
 │
 ▼
Database (SQLite)
 │
 ▼
AI Telemetry & Difficulty Model
```

---

## 🧰 Technology Stack

### Backend
- Python
- Flask
- SQLAlchemy
- Flask-Login

### Database
- SQLite

### AI & Data Processing
- Scikit-Learn
- Random Forest Classifier
- Pandas

### Frontend
- HTML5
- CSS3
- JavaScript
- Canvas API

### Multi-Modal Interaction
- Web Speech API (Voice Recognition)
- MediaPipe Hands (Gesture Recognition)

---

## 📁 Project Structure

```
FormulaRush
│
├── app.py
├── train_ai.py
├── pilot_model.pkl
├── le_diff.pkl
│
├── instance/
│   └── database.db
│
├── static/
│   ├── single_script.js
│   ├── script.js
│   ├── math_data.js
│   ├── style.css
│   ├── car_*.png
│   └── obstacle.png
│
└── templates/
    ├── base.html
    ├── dashboard.html
    ├── campaign_hub.html
    ├── career.html
    ├── missions.html
    ├── academy.html
    ├── single_game.html
    ├── game.html
    ├── login.html
    └── register.html
```

---

## ⚙️ Installation

### 1. Clone the repository

```
git clone https://github.com/yourusername/formularush.git
cd formularush
```

### 2. Install dependencies

```
pip install flask flask-login flask-sqlalchemy pandas scikit-learn
```

### 3. Run the application

```
python app.py
```

### 4. Open the game in your browser

```
http://localhost:5000
```

---

## 🧪 AI Model Training

The AI difficulty model can be retrained using telemetry data.

```
python train_ai.py
```

This script extracts gameplay telemetry, retrains the Random Forest model, and updates the difficulty prediction system.

---

## 🎯 Educational Goals

FormulaRush aims to:

- Improve arithmetic fluency
- Increase learner engagement through gamification
- Provide adaptive learning using AI
- Track player performance and learning patterns

---

## 🔮 Future Enhancements

- Online multiplayer support
- Advanced AI personalization
- Additional math topics (algebra, geometry, calculus)
- Mobile platform deployment

---

## 👨‍💻 Author

Developed as part of an MCA project focusing on **interactive educational technologies and AI-driven learning systems**.

---

## 📄 License

This project is intended for **educational and research purposes**.
