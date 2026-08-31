from langchain_community.embeddings import HuggingFaceEmbeddings
def get_embedding(text: str) -> list[float]:
    model = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
    if not model:
        raise RuntimeError("Embedding model is not initialized.")
    
    # Correct method for a single query
    embedding = model.embed_query(text)
    
    return embedding
