import sys; sys.path.append('c:/Users/adars/Desktop/Ai-HR-Assistant/backend'); from app.services.email_service import get_emails;
hr_id='c3c2989f-62f8-4e55-b959-fe361e6a10e3'
emails = get_emails(hr_id, folder='inbox')
print('Inbox count:', len(emails))
for e in emails[:2]:
    print('-', e['folder'], e['subject'])

