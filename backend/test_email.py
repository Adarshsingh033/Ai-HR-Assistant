import sys; sys.path.append('c:/Users/adars/Desktop/Ai-HR-Assistant/backend'); from app.services.email_service import send_and_save_email;
success = send_and_save_email(hr_id='c3c2989f-62f8-4e55-b959-fe361e6a10e3', to_email='test@example.com', subject='Test', body='Body')
print('Sent:', success)

