import os
import logging
import requests
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger("NotificationService")

class NotificationService:
    def __init__(self):
        self.telegram_token = os.getenv("TELEGRAM_BOT_TOKEN")
        self.telegram_chat_id = os.getenv("TELEGRAM_CHAT_ID")
        self.resend_api_key = os.getenv("RESEND_API_KEY")
        self.admin_email = os.getenv("ADMIN_EMAIL", "admin@example.com")

    def send_telegram(self, message: str):
        if not self.telegram_token or not self.telegram_chat_id or "your_" in self.telegram_token:
            logger.warning("Telegram notification skipped: configuration missing or placeholder found.")
            return False
        
        url = f"https://api.telegram.org/bot{self.telegram_token}/sendMessage"
        try:
            response = requests.post(url, json={
                "chat_id": self.telegram_chat_id,
                "text": message,
                "parse_mode": "Markdown"
            })
            if response.status_code == 200:
                logger.info("Telegram alert sent successfully.")
                return True
            else:
                logger.error(f"Telegram API error: {response.text}")
                return False
        except Exception as e:
            logger.error(f"Telegram error: {e}")
            return False

    def send_email(self, subject: str, html_content: str, to_email: str = None):
        if not self.resend_api_key or "your_" in self.resend_api_key:
            logger.warning("Resend notification skipped: configuration missing or placeholder found.")
            return False
        
        recipient = to_email or self.admin_email
        
        try:
            response = requests.post(
                "https://api.resend.com/emails",
                headers={
                    "Authorization": f"Bearer {self.resend_api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "from": "SentinelMesh <onboarding@resend.dev>",
                    "to": recipient,
                    "subject": subject,
                    "html": html_content,
                }
            )
            if response.status_code in [200, 201]:
                logger.info("Resend email sent successfully.")
                return True
            else:
                logger.error(f"Resend API error: {response.text}")
                return False
        except Exception as e:
            logger.error(f"Resend error: {e}")
            return False
