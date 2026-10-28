import sqlite3, os

p = os.path.expanduser('~/AppData/Roaming/mycinema/mycinema.db')
if not os.path.exists(p):
    p = os.path.expanduser('~/AppData/Roaming/MyCinema/mycinema.db')

conn = sqlite3.connect(p)
c = conn.cursor()
c.execute("SELECT name FROM sqlite_master WHERE type='table'")
print('tables:', c.fetchall())

try:
    c.execute("SELECT title, backdrop_path, poster_path FROM stream_history")
    print('stream_history rows:', c.fetchall())
except Exception as e:
    print('stream_history err:', e)

try:
    c.execute("SELECT title, backdrop_path, poster_path FROM videos")
    print('videos count:', len(c.fetchall()))
except Exception as e:
    print('videos err:', e)
