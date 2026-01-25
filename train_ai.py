import pandas as pd
import sqlite3
import pickle
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import LabelEncoder
import os

def train_model():
    # 1. Improved Path Logic
    # This finds the folder where train_ai.py lives
    base_dir = os.path.dirname(os.path.abspath(__file__))
    # This points to the database inside the instance folder
    db_path = os.path.join(base_dir, 'instance', 'database.db')
    
    print(f"Checking for database at: {db_path}") # This helps us debug
    
    if not os.path.exists(db_path):
        print(f"Error: Database file not found at {db_path}")
        # Let's check if it's just in the main folder instead
        db_path = os.path.join(base_dir, 'formula_rush.db')
        if not os.path.exists(db_path):
            return

    conn = sqlite3.connect(db_path)
    # 2. Load the data into a Pandas Table
    query = "SELECT speed, difficulty, reaction_time, is_correct, confidence_label FROM telemetry_data"
    df = pd.read_sql_query(query, conn)
    conn.close()

    if len(df) < 5:
        print(f"Error: Only {len(df)} samples found. You need at least 10-20 to train properly!")
        return

    print(f"Training on {len(df)} samples...")

    # 3. Encoding: AI only understands numbers. 
    # This turns "easy" into 0, "medium" into 1, etc.
    le_diff = LabelEncoder()
    df['difficulty'] = le_diff.fit_transform(df['difficulty'].astype(str))

    # 4. Separate Inputs (X) from the Target (y)
    X = df[['speed', 'difficulty', 'reaction_time', 'is_correct']]
    y = df['confidence_label']

    # 5. Create the Model (The Random Forest Classifier)
    # We use 100 trees to make decisions
    model = RandomForestClassifier(n_estimators=100, random_state=42)
    model.fit(X, y)

    # 6. Save the Brain (model) and the Encoder (translator)
    with open('pilot_model.pkl', 'wb') as f:
        pickle.dump(model, f)
    
    with open('le_diff.pkl', 'wb') as f:
        pickle.dump(le_diff, f)

    print("Success: 'pilot_model.pkl' created! The AI is now trained.")

if __name__ == "__main__":
    train_model()