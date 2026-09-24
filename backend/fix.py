import os
filepath = 'd:/ai Hr assistant/Ai-HR-Assistant/backend/app/services/ai_service.py'
with open(filepath, 'r') as f:
    content = f.read()

content = content.replace('from langchain_gemini import ChatGemini', 'from langchain_google_genai import ChatGoogleGenerativeAI')
content = content.replace('ChatGemini = None', 'ChatGoogleGenerativeAI = None')
content = content.replace('Optional["ChatGemini"]', 'Optional["ChatGoogleGenerativeAI"]')
content = content.replace('def _build_gemini_client() -> "ChatGemini":', 'def _build_gemini_client() -> "ChatGoogleGenerativeAI":')
content = content.replace('if ChatGemini is None:', 'if ChatGoogleGenerativeAI is None:')
content = content.replace('ChatGemini(', 'ChatGoogleGenerativeAI(')
content = content.replace('gemini_api_key=api_key', 'api_key=api_key')
content = content.replace('langchain_gemini is not installed', 'langchain-google-genai is not installed')
content = content.replace('pip install langchain-gemini', 'pip install langchain-google-genai')
# model_name -> model for google genai
content = content.replace('model_name=GEMINI_MODEL', 'model=GEMINI_MODEL')

with open(filepath, 'w') as f:
    f.write(content)
print("done")
