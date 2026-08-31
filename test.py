from crewai import Agent, Task, Crew, LLM
from crewai.tools import BaseTool
from sqlalchemy import create_engine, text, inspect

# ================================
# DATABASE CONFIG
# ================================

DB_NAME = "hrms"
DB_USER = "postgres"
DB_PASSWORD = "EWW%40123"
DB_HOST = "localhost"
DB_PORT = "5432"

DATABASE_URL = f"postgresql+psycopg2://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"

engine = create_engine(DATABASE_URL)

# ================================
# GET DATABASE SCHEMA AUTOMATICALLY
# ================================

def get_schema():
    inspector = inspect(engine)
    schema_text = ""

    for table in inspector.get_table_names():
        columns = inspector.get_columns(table)
        column_names = [col["name"] for col in columns]

        schema_text += f"\n{table}({', '.join(column_names)})"

    return schema_text


schema = get_schema()

# ================================
# OLLAMA LLM
# ================================

llm = LLM(
    model="ollama/gemma2:9b",  # Ollama server URL
)

# ================================
# DATABASE TOOL
# ================================

class DatabaseTool(BaseTool):
    name: str = "PostgreSQL Database Tool"
    description: str = "Executes SQL queries on the HRMS PostgreSQL database"

    def _run(self, query: str):
        try:
            with engine.connect() as connection:
                result = connection.execute(text(query))
                rows = result.fetchall()

                if not rows:
                    return "No data found."

                return str(rows)

        except Exception as e:
            return f"Database error: {str(e)}"


db_tool = DatabaseTool()

# ================================
# AGENT
# ================================

database_agent = Agent(
    role="HRMS Database Expert",
    goal="Answer user questions by generating SQL queries and retrieving HRMS database data",
    backstory="""
You are a professional database analyst.
You convert natural language questions into PostgreSQL queries.
Use the database tool to execute queries and return correct answers.
""",
    tools=[db_tool],
    llm=llm,
    verbose=True
)

# ================================
# CHATBOT LOOP
# ================================

print("\nHRMS AI Chatbot Started (type 'exit' to quit)\n")

while True:

    question = input("User: ")

    if question.lower() == "exit":
        break

    task = Task(
        description=f"""
Database Schema:
{schema}

User Question:
{question}

Instructions:
1. Understand the question carefully
2. Generate a correct PostgreSQL SQL query
3. Use % for partial matching
4. Convert the result into a clear human readable answer
""",
        expected_output="Clear natural language answer based on database data",
        agent=database_agent
    )

    crew = Crew(
        agents=[database_agent],
        tasks=[task],
        verbose=True
    )

    result = crew.kickoff()

    print("\nBot:", result)
    print()