import sys; sys.path.append('c:/Users/adars/Desktop/Ai-HR-Assistant/backend'); from app.services.email_service import get_emails; import json;
try:
    emails = get_emails('c3c2989f-62f8-4e55-b959-fe361e6a10e3', 'drafts')
    print(json.dumps(emails))
except Exception as e:
    import traceback
    traceback.print_exc()

