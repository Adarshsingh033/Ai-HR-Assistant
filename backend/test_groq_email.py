import sys; sys.path.append('c:/Users/adars/Desktop/Ai-HR-Assistant/backend'); from app.services.email_service import draft_email_content;
hr_id='c3c2989f-62f8-4e55-b959-fe361e6a10e3'
prompt='Write a short professional email inviting the candidate to round 2 interview.'
content = draft_email_content(hr_id, prompt)
print('\n\n--- GENERATED CONTENT ---\n', content)

