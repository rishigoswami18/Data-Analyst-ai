import os
import re
import pandas as pd
import matplotlib.pyplot as plt
from groq import Groq
from dotenv import load_dotenv

load_dotenv()

# Initialize Groq Client
api_key = os.environ.get("GROQ_API_KEY")
if not api_key:
    # Allows the flask server to start without crashing
    api_key = "dummy_replace_me"
client = Groq(api_key=api_key)

def _build_dataset_profile(df):
    """Create a compact schema profile for grounded prompt construction."""
    numeric_columns = df.select_dtypes(include='number').columns.tolist()
    date_columns = [
        col for col in df.columns
        if pd.api.types.is_datetime64_any_dtype(df[col])
    ]
    categorical_columns = [
        col for col in df.columns
        if col not in numeric_columns and col not in date_columns
    ]

    null_counts = df.isna().sum()
    return {
        "row_count": int(len(df)),
        "column_count": int(len(df.columns)),
        "numeric_columns": numeric_columns,
        "date_columns": date_columns,
        "categorical_columns": categorical_columns,
        "null_counts": {
            col: int(count) for col, count in null_counts[null_counts > 0].items()
        },
    }

def _extract_python_code(raw_response):
    """Normalize LLM output into executable Python code."""
    code = raw_response.strip()
    if code.startswith("```python"):
        code = code.replace("```python", "", 1).rsplit("```", 1)[0].strip()
    elif code.startswith("```"):
        code = code.replace("```", "", 1).rsplit("```", 1)[0].strip()
    return code

def _validate_generated_code(code):
    """Reject unsafe operations before execution."""
    blocked_patterns = [
        r"\bimport\s+os\b",
        r"\bimport\s+sys\b",
        r"\bimport\s+subprocess\b",
        r"\bfrom\s+os\b",
        r"\bfrom\s+sys\b",
        r"\bfrom\s+subprocess\b",
        r"\bopen\s*\(",
        r"\beval\s*\(",
        r"\bexec\s*\(",
        r"__import__",
    ]
    return not any(re.search(pattern, code) for pattern in blocked_patterns)

def get_dataframe_summary(file_path):
    """Loads CSV/Excel and returns basic info to inject into prompt."""
    try:
        # Support both CSV and Excel based on generic extensions
        if str(file_path).endswith('.xlsx'):
            df = pd.read_excel(file_path)
        else:
            try:
                df = pd.read_csv(file_path, encoding='utf-8')
            except UnicodeDecodeError:
                # Fallback encoding if utf-8 fails (very common with Windows datasets)
                df = pd.read_csv(file_path, encoding='ISO-8859-1')
            
        columns = df.columns.tolist()
        head = df.head(3).to_markdown()
        dtypes = df.dtypes.astype(str).to_dict()
        profile = _build_dataset_profile(df)

        return df, columns, head, dtypes, profile
    except Exception as e:
        return None, str(e), None, None, None

def query_dataset(user_query, file_path, history=None):
    """
    Core function that translates user query -> pandas code -> executes it -> returns final answer.
    Supports conversation history for follow-up questions.
    """
    df, columns, head, dtypes, profile = get_dataframe_summary(file_path)
    if df is None:
        return "Error loading file: " + columns

    # Build conversation context from history
    history_context = ""
    if history:
        recent = history[-6:]  # last 3 exchanges
        lines = []
        for msg in recent:
            role = "User" if msg.get("role") == "user" else "Assistant"
            lines.append(f"{role}: {msg.get('content', '')[:200]}")
        history_context = "\n".join(lines)

    system_prompt = f"""
    You are an experienced data analyst.
    You have a pandas DataFrame named `df`.

    Dataset profile:
    - Rows: {profile["row_count"]}
    - Columns: {profile["column_count"]}
    - Numeric columns: {profile["numeric_columns"]}
    - Date columns: {profile["date_columns"]}
    - Categorical columns: {profile["categorical_columns"]}
    - Null counts: {profile["null_counts"]}

    Data types:
    {dtypes}

    Sample data (first 3 rows):
    {head}

    {f"Recent conversation context (use this to understand follow-up questions):" + chr(10) + history_context if history_context else ""}

    User request:
    "{user_query}"

    Instructions:
    1. Write a python code snippet that uses pandas to answer the user's question.
    2. To return the final answer, use python's 'print()' function. The printed output is what the user will see.
    3. Make the printed output conversational and friendly (e.g., "The total revenue is $X").
    4. If the question asks for a chart or trend, write code using matplotlib to save the chart absolutely EXACTLY to the path 'static/charts/trend.png', and then print "CHART_GENERATED: trend.png".
    5. Do NOT include ANY text outside of the python code block. Only return the executable code.
    6. Ensure you handle missing values or basic string conversions if needed.
    7. CRITICAL: If you use pandas `.dt.to_period()` for dates, you MUST convert that column to strings (e.g., `.astype(str)`) BEFORE plotting with matplotlib. Matplotlib cannot plot 'Period' objects and will crash.
    8. CRITICAL: For ALL matplotlib charts, use a dark theme: call plt.style.use('dark_background') and set facecolor='#1e293b' on both figure and axes for seamless integration with the dark UI.
    9. Do not fabricate metrics, assumptions, or columns.
    10. Do not import restricted modules or access files, networks, or the OS.
    11. Return executable Python only. No markdown and no explanation outside the code.
    """

    try:
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": system_prompt},
            ],
            temperature=0.0
        )
        
        code = _extract_python_code(response.choices[0].message.content)
        if not _validate_generated_code(code):
            return "The generated analysis plan included an unsafe operation, so the request was blocked. Please try rephrasing the question."

        # Capture print outputs safely
        import io
        import sys
        
        old_stdout = sys.stdout
        redirected_output = sys.stdout = io.StringIO()
        
        try:
            # Provide only the analysis tools required for grounded execution.
            exec_globals = {"df": df.copy(), "plt": plt, "pd": pd}
            exec(code, exec_globals)
        except Exception as e:
            sys.stdout = old_stdout
            return f"Error executing calculation: {str(e)}\n\n(AI suggested: {code})"
            
        sys.stdout = old_stdout
        result = redirected_output.getvalue().strip()
        
        if not result:
            result = "No output generated. Try rephrasing your question."
            
        return result

    except Exception as e:
        return f"AI Error: {str(e)}"

