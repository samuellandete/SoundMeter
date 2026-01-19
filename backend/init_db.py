from database import init_db
import os
from dotenv import load_dotenv

load_dotenv()

if __name__ == '__main__':
    db_path = os.getenv('DATABASE_PATH', 'soundmeter.db')
    init_db(db_path)
    print(f"Database initialized at {db_path}")
