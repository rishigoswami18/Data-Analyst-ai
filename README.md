# Data Analysis Assistant

This project is a web-based data analysis assistant built with Flask, Pandas, Groq, React, and Tailwind CSS. Users can upload CSV or Excel files, ask questions in natural language, and get answers based on the uploaded dataset. The app can also generate charts when a visual summary is more useful than plain text.

The goal of the project is to show practical use of LLMs in a data workflow, not just a basic chatbot interface. It combines file upload, dataset understanding, prompt-based code generation, pandas execution, and result presentation in a production-style multi-page application.

## Features

- Upload `.csv` and `.xlsx` datasets
- Ask analytical questions in natural language
- Generate summaries, comparisons, rankings, and trends
- Create charts for visual analysis
- Handle common CSV encoding issues
- Use a separate login, dashboard, and analysis workflow
- Persist auth users with SQLite locally and Render PostgreSQL in production

## Tech Stack

- Python
- Flask
- Pandas
- Matplotlib
- Groq API
- React
- Tailwind CSS
- SQLite for local development
- Render PostgreSQL for deployed auth storage

## Project Structure

- `app.py` handles API routes, uploads, auth, chart responses, and serving the built frontend
- `agent.py` prepares dataset context, sends prompts to the model, and executes generated analysis code
- `frontend/` contains the React + Tailwind multi-page UI
- `render.yaml` provisions the web service and Render PostgreSQL database

## How It Works

1. The user signs in.
2. The user uploads a dataset from the dashboard.
3. The backend reads the file and prepares schema information.
4. A prompt is sent to the language model with dataset context.
5. The model returns pandas code to answer the question.
6. The code is executed and the result is shown in the analysis interface.
7. If needed, a chart is generated and displayed in the chat.

## Local Setup

Install dependencies:

```bash
pip install -r requirements.txt
```

Create the environment file:

```bash
copy .env.example .env
```

Add your environment variables in `.env`:

```env
GROQ_API_KEY=your_api_key_here
FLASK_SECRET_KEY=your_secret_key_here
```

Build the frontend:

```bash
cd frontend
npm install
npm run build
cd ..
```

Run the application:

```bash
python app.py
```

Then open `http://localhost:5000`.

## Database Behavior

- If `DATABASE_URL` is not set, the app uses local SQLite (`users.db`) for auth.
- If `DATABASE_URL` is set, the app automatically switches to PostgreSQL.

## Render Deployment

This repo includes a `render.yaml` Blueprint that provisions:

- a Python web service
- a Render PostgreSQL database
- a `DATABASE_URL` environment variable wired from the database connection string

Render Blueprint syntax for Postgres uses a top-level `databases` section and `fromDatabase.property: connectionString`, as documented by Render:

- https://render.com/docs/blueprint-spec
- https://render.com/docs/databases

## Example Questions

- `What is the total revenue?`
- `Which category has the highest sales?`
- `Show the top 5 products by profit`
- `Plot a monthly sales trend`
- `Compare discount and profit margin`

## Use Case

This project can be used as a portfolio project for roles related to data science, machine learning, analytics, and AI engineering because it demonstrates how LLMs can be integrated into a real analysis workflow.
