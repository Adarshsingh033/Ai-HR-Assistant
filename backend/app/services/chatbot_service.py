from typing import TypedDict, Literal
from pydantic import Field, BaseModel
from app.services.ai_service import ollama_client
from langchain_core.prompts import ChatPromptTemplate
from langgraph.graph import StateGraph, END
from sqlalchemy import create_engine, text, inspect


# ================================
# LLM (Gemma 2:9B)
# ================================


# ================================
# DATABASE
# ================================

DB_NAME = "hrms"
DB_USER = "postgres"
DB_PASSWORD = "EWW%40123"
DB_HOST = "localhost"
DB_PORT = "5432"

DATABASE_URL = f"postgresql+psycopg2://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
engine = create_engine(DATABASE_URL)

class ClassifyOutput(BaseModel):
    classify_result: Literal["GENERAL", "HRMS"] = Field(
        ...,
        description="Classification result"
    )

class GeneralResponse(BaseModel):
    general_response: str = Field(..., description="Response as per the user query")

class GenerateSQL(BaseModel):
    sql_query: str = Field(..., description="Valid PostgreSQL query")

class ReframeResponse(BaseModel):
    reframe_response: str = Field(...)



llm_classify = ollama_client.with_structured_output(schema=ClassifyOutput)
llm_general = ollama_client.with_structured_output(schema=GeneralResponse)
llm_query_generate = ollama_client.with_structured_output(schema=GenerateSQL)
llm_reframe = ollama_client.with_structured_output(schema=ReframeResponse)

# ================================
# SCHEMA
# ================================
def get_schema():
    inspector = inspect(engine)
    schema_lines = []

    target_tables = ["candidates", "jd_description", "jd_details"]

    for table in target_tables:
        if table not in inspector.get_table_names():
            continue

        schema_lines.append(f"\nTable: {table}")

        # Columns with types
        columns = inspector.get_columns(table)
        for col in columns:
            col_name = col["name"]
            col_type = str(col["type"])
            nullable = "NULL" if col["nullable"] else "NOT NULL"
            schema_lines.append(f"- {col_name} ({col_type}, {nullable})")

        # Primary Key
        pk = inspector.get_pk_constraint(table)
        if pk and pk.get("constrained_columns"):
            schema_lines.append(
                f"Primary Key: {', '.join(pk['constrained_columns'])}"
            )

        # Foreign Keys
        fks = inspector.get_foreign_keys(table)
        for fk in fks:
            local_cols = ", ".join(fk["constrained_columns"])
            ref_table = fk["referred_table"]
            ref_cols = ", ".join(fk["referred_columns"])
            schema_lines.append(
                f"Foreign Key: {local_cols} → {ref_table}({ref_cols})"
            )

    # Add explicit relationship explanation (CRUCIAL for LLM)
    schema_lines.append("\nRELATIONSHIPS:")
    schema_lines.append("- candidates.job_id → jd_description.id")
    schema_lines.append("- jd_details.description_id → jd_description.id")
    schema_lines.append("")
    schema_lines.append("JOIN RULE:")
    schema_lines.append(
        "- To join candidates with jd_details: candidates.job_id = jd_details.description_id"
    )
    schema_lines.append(
        "- NEVER use candidates.job_id = jd_details.id (WRONG)"
    )

    return "\n".join(schema_lines)


schema = get_schema()

# ================================
# STATE
# ================================

class ChatState(TypedDict):
    question: str   
    hr_id: str
    category: Literal["GENERAL", "HRMS"]
    db_result: list
    final_answer: str

# ================================
# NODE 1: CLASSIFIER
# ================================

def classify_node(state: ChatState):
    prompt = ChatPromptTemplate.from_template("""
Classify the user query into one category:

GENERAL → greetings or general knowledge
HRMS → HR-related queries

Query: {question}

Rules:
- Output must be GENERAL or HRMS
""")

    chain = prompt | llm_classify

    result = chain.invoke({
        "question": state["question"]
    })

    category = result.classify_result

    return {"category": category}



# ================================
# NODE 2: GENERAL RESPONSE
# ================================

def general_node(state: ChatState):
    prompt = ChatPromptTemplate.from_template("""
User: {question}

Respond politely in 1-2 sentences.
If general question, answer briefly.

Add:
"I can also help with HRMS tasks like candidates or job details."
""")
    chain = prompt | llm_general
    result = chain.invoke({
        "question": state["question"]
    })
    response = result.general_response
    return {"final_answer": response}


# ================================
# NODE 3: DATABASE QUERY
# ================================


def db_node(state: ChatState):
    database_schema = schema
    hr_id = state.get("hr_id", "Unknown")
    prompt = ChatPromptTemplate.from_template("""
You are an expert PostgreSQL query generator for a recruitment AI assistant.

Your job: Generate ONE correct, executable SELECT query.

=====================
DATABASE RULES:
=====================
- ONLY generate SELECT queries (READ-ONLY).
- ALWAYS include: hr_id = '{hr_id}' in WHERE clause.
- Use ILIKE '%value%' for case-insensitive text search (PostgreSQL).
- Prefer fuzzy matching over exact matches.
- Use JOIN between the tables if needed.
- IMPORTANT: Generate ONLY ONE SQL query (no multiple queries).

=====================
DATABASE SCHEMA:
=====================
{schema}

=====================
USER QUERY:
=====================
{question}

=====================
OUTPUT RULES:
=====================
- Return ONLY SQL query.
- No explanation, no markdown, no comments.
- Ensure valid PostgreSQL syntax.
- Always enforce hr_id filtering.

Hr id to use:
{hr_id}
""")
    chain =  prompt | llm_query_generate
    response = chain.invoke({
        "schema": database_schema,
        "question": state["question"],
        "hr_id": hr_id
    })
    print(database_schema)
    query = response.sql_query
    forbidden = ["DROP", "DELETE", "UPDATE", "INSERT", "ALTER"]
    if any(word in query.upper() for word in forbidden):
        return {"db_result": []}

    try:
        # Clean up markdown formatting if present
        if query.startswith("```"):
            lines = query.strip().split("\n")
            if lines[0].startswith("```"):
                lines = lines[1:]
            if lines[-1].startswith("```"):
                lines = lines[:-1]
            query = "\n".join(lines).strip()
            
        print(f"Executing SQL: {query}", flush=True)
        with engine.connect() as conn:
            result = conn.execute(text(query))
            rows = result.fetchall()
            columns = result.keys()

            data = [dict(zip(columns, row)) for row in rows]
            print(f"Rows fetched: {len(data)}", flush=True)

            return {"db_result": data}

    except Exception as e:
        print(f"DB Error: {e}", flush=True)
        return {"db_result": []}

# ================================
# NODE 4: REFRAMER
# ================================

def reframe_node(state: ChatState):

    if not state["db_result"]:
        return {"final_answer": "No records found."}

    prompt = ChatPromptTemplate.from_template("""
    You are helpful assistant. Your job is to answer user queries based on the information available, but never reveal or mention where the information came from (eg: database).
    Answer the following user query clearly, concisely.  
    Do NOT mention the source of any information.
    
    -   User query: {user_input}
    -   Database Results: {db_result}
    
    Rules:
    - Use bullet points
    - Be professional
""")
    chain = prompt | llm_reframe
    response = chain.invoke({"user_input": state["question"],"db_result":state["db_result"]})
    return {"final_answer": response.reframe_response}

# ================================
# ROUTER
# ================================

def router(state: ChatState):
    if state["category"] == "GENERAL":
        return "general"
    return "hrms"

# ================================
# GRAPH
# ================================

graph = StateGraph(ChatState)

# Nodes
graph.add_node("classify", classify_node)
graph.add_node("general", general_node)
graph.add_node("db", db_node)
graph.add_node("reframe", reframe_node)

# Flow
graph.set_entry_point("classify")

graph.add_conditional_edges(
    "classify",
    router,
    {
        "general": "general",
        "hrms": "db"
    }
)

graph.add_edge("db", "reframe")
graph.add_edge("general", END)
graph.add_edge("reframe", END)

app = graph.compile()

# ================================
# MAIN FUNCTION
# ================================

def process_chat_query(question: str, hr_id: str):
    print(hr_id)
    result = app.invoke({
        "question": question,
        "hr_id": hr_id
    })
    return result["final_answer"]