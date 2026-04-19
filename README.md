# AI Data Analyst Chatbot 🚀📊

A full-stack, end-to-end Data Analysis agent that allows users to upload any CSV or Excel file and chat intelligently with their data using Natural Language. Zero technical knowledge required. Ask a question -> Get the metric, or get a visually generated plot instantly!

Built natively with **Flask**, **Pandas**, and the ultra-fast **Groq AI (Llama 3)** engine. UI features a fully responsive, modern Glassmorphism SaaS aesthetic.

## Features ✨
- **Natural Language to Code:** Translates normal questions like *"What is the total revenue?"* into real, hallucination-free mathematical calculations via an embedded AI Agent.
- **Dynamic Chart Generation:** Ask the bot to *"Plot a monthly sales trend"* and it will generate the matplotlib figure directly inside your chat.
- **Robust Error Handling:** Smoothly bounces back from bad data uploads, handles non-UTF8 Encoded databases natively (e.g., Windows ISO-8859-1 formats), and tracks missing dependencies seamlessly.
- **Premium UI:** Dark-mode Glassmorphism dashboard running entirely on HTML/JS/CSS without heavy frontend frameworks.

## Tech Stack 🛠️
- **Backend Frame:** Flask (Python)
- **Data Engine:** Pandas / Matplotlib
- **AI Brain:** `groq` SDK powered by `Llama-3.3-70b-versatile`
- **Frontend:** Vanilla JS / HTML / CSS Variables

## Getting Started 💻
### 1. Clone & Install
```bash
git clone https://github.com/yourusername/DataAnalystChatbot.git
cd DataAnalystChatbot

# Install requirements
pip install -r requirements.txt
```

### 2. Configure Environment
Create an environment file:
```bash
mv .env.example .env
```
Inside `.env`, insert your **free** Groq API Key retrieved from [console.groq.com](https://console.groq.com/keys):
```
GROQ_API_KEY=gsk_your_actual_key_here
```

### 3. Run Application
```bash
python app.py
```
Open your browser to `http://localhost:5000` to start chatting with your datasets. 

## Supported Formats
Supports `.csv` and `.xlsx` via standard DataFrame ingestion.

## Contributing
Feel free to open a Pull Request if you'd like to integrate conversational memory buffers or secure containerized sandboxing!
