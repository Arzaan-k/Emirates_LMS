
import logging
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional, List, Any

from app.config.settings import settings

logger = logging.getLogger(__name__)

class EmailService:
    """
    Service for sending emails via SMTP.
    """

    def __init__(self):
        self.server = settings.SMTP_SERVER
        self.port = settings.SMTP_PORT
        self.username = settings.SMTP_USERNAME
        self.password = settings.SMTP_PASSWORD
        self.from_email = settings.EMAIL_FROM
        self.from_name = settings.EMAIL_FROM_NAME
        self.use_tls = settings.USE_TLS

    def _get_connection(self):
        """Estimate SMTP connection."""
        if not self.server or not self.port:
            logger.warning("SMTP server not configured")
            return None

        try:
            connection = smtplib.SMTP(self.server, self.port)
            connection.set_debuglevel(0)
            
            if self.use_tls:
                connection.starttls()
            
            if self.username and self.password:
                connection.login(self.username, self.password)
                
            return connection
        except Exception as e:
            logger.error(f"Failed to connect to SMTP server: {e}")
            return None

    def send_email(
        self, 
        to_email: str, 
        subject: str, 
        html_content: str,
        text_content: Optional[str] = None
    ) -> bool:
        """
        Send an email to a single recipient.
        
        Args:
            to_email: Recipient email
            subject: Email subject
            html_content: HTML body content
            text_content: Plain text body content (optional, acts as fallback)
            
        Returns:
            True if successful, False otherwise
        """
        # If no SMTP creds, log and return generic success to avoid blocking unless strictly required
        # But for 'functional' request, we should try.
        if not self.username or not self.password:
            logger.warning("SMTP credentials missing. Email will NOT be sent.")
            logger.info("================ EMAIL CONTENT ================")
            logger.info(f"To: {to_email}")
            logger.info(f"Subject: {subject}")
            logger.info(f"Body: {text_content or html_content}")
            logger.info("===============================================")
            return False

        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = f"{self.from_name} <{self.from_email}>"
        msg["To"] = to_email

        # Attach text part
        if text_content:
            part1 = MIMEText(text_content, "plain")
            msg.attach(part1)

        # Attach HTML part
        part2 = MIMEText(html_content, "html")
        msg.attach(part2)

        try:
            server = self._get_connection()
            if not server:
                return False
                
            server.sendmail(self.from_email, to_email, msg.as_string())
            server.quit()
            logger.info(f"Email sent successfully to {to_email}")
            return True
        except Exception as e:
            logger.error(f"Failed to send email to {to_email}: {e}")
            return False

    def send_reset_password_email(self, to_email: str, token: str):
        """
        Send password reset email with OTP.
        """
        subject = "Password Reset Request - Emirates LMS"
        
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
                .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
                .header {{ background-color: #F59E0B; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }}
                .header h1 {{ color: white; margin: 0; }}
                .content {{ background-color: #ffffff; padding: 30px; border: 1px solid #ddd; border-top: none; border-radius: 0 0 8px 8px; }}
                .code {{ font-size: 32px; font-weight: bold; color: #D97706; text-align: center; margin: 20px 0; letter-spacing: 5px; }}
                .footer {{ text-align: center; margin-top: 20px; font-size: 12px; color: #888; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>Password Reset</h1>
                </div>
                <div class="content">
                    <p>Hello,</p>
                    <p>We received a request to reset your password for the Emirates LMS.</p>
                    <p>Use the following code to reset your password. This code is valid for 15 minutes.</p>
                    
                    <div class="code">{token}</div>
                    
                    <p>If you did not request a password reset, please ignore this email or contact support if you have concerns.</p>
                    <p>Best regards,<br>BWC LMS Team</p>
                </div>
                <div class="footer">
                    &copy; {2026} Emirates Airlines All rights reserved.
                </div>
            </div>
        </body>
        </html>
        """
        
        text_content = f"""
        Password Reset Request
        
        Hello,
        
        We received a request to reset your password for the Emirates LMS.
        
        Your verification code is: {token}
        
        This code is valid for 15 minutes.
        
        If you did not request a password reset, please ignore this email.
        """
        
        return self.send_email(to_email, subject, html_content, text_content)

email_service = EmailService()
