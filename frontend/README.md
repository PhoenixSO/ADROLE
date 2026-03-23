# Frontend Dashboard

This folder contains a real-time dashboard UI for the tracking backend.

## Files

- `index.html`: Main dashboard page
- `styles.css`: Visual theme and responsive layout
- `app.js`: Live polling from `/positions` and rendering

## Run Locally

1. Start backend:

```powershell
cd ../backend
..\.venv\Scripts\python.exe -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

2. Start frontend static server:

```powershell
cd ../frontend
..\.venv\Scripts\python.exe -m http.server 5500
```

3. Open in browser:

```text
http://localhost:5500
```

4. If needed, change API Base URL in the top-right box (default is `http://localhost:8000`).
