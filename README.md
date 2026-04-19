# Data Analysis Assistant

This project is a web-based data analysis assistant built with Flask, Pandas, and the Groq API. Users can upload CSV or Excel files, ask questions in natural language, and get answers based on the uploaded dataset. The app can also generate charts when a visual summary is more useful than plain text.

The goal of the project is to show practical use of LLMs in a data workflow, not just a basic chatbot interface. It combines file upload, dataset understanding, prompt-based code generation, pandas execution, and result presentation in a single application.

## Features

- Upload `.csv` and `.xlsx` datasets
- Ask analytical questions in natural language
- Generate summaries, comparisons, rankings, and trends
- Create charts for visual analysis
- Handle common CSV encoding issues
- Present results in a clean web interface

## Tech Stack

- Python
- Flask
- Pandas
- Matplotlib
- Groq API
- HTML, CSS, JavaScript

## Project Structure

- `app.py` handles routing, uploads, chat requests, and chart responses
- `agent.py` prepares dataset context, sends prompts to the model, and executes generated analysis code
- `templates/index.html` contains the main interface
- `static/style.css` contains the styling
- `static/script.js` manages uploads and chat interactions

## How It Works

1. The user uploads a dataset.
2. The backend reads the file and prepares schema information.
3. A prompt is sent to the language model with dataset context.
4. The model returns pandas code to answer the question.
5. The code is executed and the result is shown in the interface.
6. If needed, a chart is generated and displayed in the chat.

## Setup

Install dependencies:

```bash
pip install -r requirements.txt
```

Create the environment file:

```bash
copy .env.example .env
```

Add your Groq API key in `.env`:

```env
GROQ_API_KEY=your_api_key_here
```

Run the application:

```bash
python app.py
```

Then open `http://localhost:5000`.

## Example Questions

- `What is the total revenue?`
- `Which category has the highest sales?`
- `Show the top 5 products by profit`
- `Plot a monthly sales trend`
- `Compare discount and profit margin`

## Use Case

This project can be used as a portfolio project for roles related to data science, machine learning, analytics, and AI engineering because it demonstrates how LLMs can be integrated into a real analysis workflow.
