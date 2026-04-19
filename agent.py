import os
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
        
        return df, columns, head, dtypes
    except Exception as e:
        return None, str(e), None, None

def query_dataset(user_query, file_path):
    """
    Core function that translates user query -> pandas code -> executes it -> returns final answer.
    """
    df, columns, head, dtypes = get_dataframe_summary(file_path)
    if df is None:
        return "Error loading file: " + columns

    # PROMPT ENGINEERING
    # We ask the AI to write a Python script that calculates the answer and prints it.
    system_prompt = f"""
    You are an expert Data Analyst AI. 
    You have a pandas DataFrame named `df`.
    
    Data Schema:
    {dtypes}
    
    Sample Data (first 3 rows):
    {head}
    
    User Question: "{user_query}"
    
    INSTRUCTIONS:
    1. Write a python code snippet that uses pandas to answer the user's question.
    2. To return the final answer, use python's 'print()' function. The printed output is what the user will see.
    3. Make the printed output conversational and friendly (e.g., "The total revenue is $X").
    4. If the question asks for a chart or trend, write code using matplotlib to save the chart absolutely EXACTLY to the path 'static/charts/trend.png', and then print "CHART_GENERATED: trend.png".
    5. Do NOT include ANY text outside of the python code block. Only return the executable code.
    6. Ensure you handle missing values or basic string conversions if needed.
    """

    try:
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile", # Groq model
            messages=[
                {"role": "system", "content": system_prompt},
            ],
            temperature=0.0
        )
        
        # Extract code from response
        code = response.choices[0].message.content
        # Clean markdown formatting if present
        if code.startswith("```python"):
            code = code.replace("```python", "").replace("```", "").strip()
        elif code.startswith("```"):
            code = code.replace("```", "").strip()

        # Capture print outputs safely
        import io
        import sys
        
        old_stdout = sys.stdout
        redirected_output = sys.stdout = io.StringIO()
        
        try:
            # We provide 'df' and 'plt' to the exec environment
            exec_globals = {"df": df, "plt": plt, "pd": pd}
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
