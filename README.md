# Chai App

AI roleplay & social chat app built with vanilla HTML/JS + Supabase + Groq API via Vercel serverless.

## Setup

### 1. Run SQL in Supabase
Create tables by running the SQL from `sql_schema.md` in your Supabase SQL editor.

### 2. Deploy to Vercel
Add environment variable:
- `GROQ_KEYS` = comma-separated list of your Groq API keys

### 3. Run Locally
```bash
node server.js
```
Then open http://localhost:3000
