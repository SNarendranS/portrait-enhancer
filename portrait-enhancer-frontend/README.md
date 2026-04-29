# portrait-enhancer-frontend

React + Vite UI for the Portrait Enhancer pipeline.

## Quick start

```bash
cp .env.example .env   # set VITE_API_URL if backend isn't on localhost:4000
npm install
npm run dev            # starts on http://localhost:5173
```

Make sure `portrait-enhancer-backend` is running first.

## Env vars

| Variable       | Default                  | Purpose               |
| -------------- | ------------------------ | --------------------- |
| `VITE_API_URL` | `http://localhost:4000`  | Backend base URL      |
